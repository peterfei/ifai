use reqwest::Client;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter}; 
use eventsource_stream::Eventsource;
use futures::StreamExt;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum AIProtocol {
    #[serde(rename = "openai")]
    OpenAI,
    #[serde(rename = "anthropic")]
    Anthropic,
    #[serde(rename = "gemini")]
    Gemini,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AIProviderConfig {
    pub id: String,
    pub name: String,
    pub protocol: AIProtocol,
    #[serde(rename = "baseUrl")]
    pub base_url: String,
    #[serde(rename = "apiKey")]
    pub api_key: String,
    pub models: Vec<String>,
    pub enabled: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ImageUrl {
    pub url: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(untagged)]
pub enum ContentPart {
    Text {
        #[serde(rename = "type")]
        part_type: String,
        text: String,
    },
    ImageUrl {
        #[serde(rename = "type")]
        part_type: String,
        image_url: ImageUrl,
    },
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Message {
    pub role: String,
    pub content: Vec<ContentPart>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ThinkingConfig {
    #[serde(rename = "type")]
    pub thinking_type: String, 
}

#[derive(Serialize, Debug)]
struct ChatRequest {
    model: String,
    messages: Vec<Message>,
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    thinking: Option<ThinkingConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    stop: Option<Vec<String>>,
}

#[derive(Deserialize, Debug)]
struct DeepSeekResponse {
    choices: Vec<Choice>,
}

#[derive(Deserialize, Debug)]
struct Choice {
    delta: Delta,
    finish_reason: Option<String>,
}

#[derive(Deserialize, Debug)]
struct Delta {
    content: Option<String>,
}

#[derive(Deserialize, Debug)]
struct NonStreamChoice {
    message: Message,
}

#[derive(Deserialize, Debug)]
struct NonStreamResponse {
    choices: Vec<NonStreamChoice>,
}

#[derive(Serialize, Debug)]
struct CompletionRequest {
    model: String,
    messages: Vec<Message>,
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    thinking: Option<ThinkingConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    stop: Option<Vec<String>>,
}

pub async fn stream_chat(
    app: AppHandle,
    provider_config: AIProviderConfig, 
    messages: Vec<Message>,
    event_id: String,
) -> Result<(), String> {
    println!("Starting chat request with {} messages", messages.len());
    let client = Client::new();
    
    let mut current_messages = messages;
    let mut full_response_content = String::new();
    let mut continuation_count = 0;
    const MAX_CONTINUATIONS: i32 = 5;

    let (completions_url, api_key, model_name) = match provider_config.protocol {
        AIProtocol::OpenAI => {
            (provider_config.base_url, provider_config.api_key, provider_config.models[0].clone()) 
        },
        _ => return Err("Unsupported AI protocol".to_string()),
    };

    loop {
        if continuation_count > MAX_CONTINUATIONS {
            println!("Max continuations reached.");
            break;
        }

        let request = ChatRequest {
            model: model_name.clone(), 
            messages: current_messages.clone(),
            stream: true,
            thinking: None,
            stop: Some(vec!["User:".to_string(), "Model:".to_string(), "用户:".to_string(), "模型:".to_string()]),
        };

        println!("Sending request to {} (Step {})...", completions_url, continuation_count + 1);
        let response = client
            .post(&completions_url) 
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await
            .map_err(|e| {
                println!("Request failed: {}", e);
                e.to_string()
            })?;

        let status = response.status();
        if !status.is_success() {
            let text = response.text().await.unwrap_or_default();
            println!("API Error: Status={}, Body={}", status, text);
            app.emit(&format!("{}_error", event_id), format!("API Error: {}", text)).unwrap_or(());
            return Err(format!("API Error: {}", text));
        }

        let mut stream = response.bytes_stream().eventsource();
        let mut step_finish_reason: Option<String> = None;

        println!("Stream processing step {}...", continuation_count + 1);

        while let Some(event) = stream.next().await {
            match event {
                Ok(event) => {
                    if event.data == "[DONE]" {
                        break;
                    }
                    if let Ok(response) = serde_json::from_str::<DeepSeekResponse>(&event.data) {
                        if let Some(choice) = response.choices.first() {
                            if let Some(content) = &choice.delta.content {
                                app.emit(&event_id, content).unwrap_or(());
                                full_response_content.push_str(content);
                            }
                            if let Some(reason) = &choice.finish_reason {
                                step_finish_reason = Some(reason.clone());
                            }
                        }
                    } else {
                        println!("Failed to parse JSON: {}", event.data);
                    }
                }
                Err(e) => {
                    println!("Error reading stream: {}", e);
                    app.emit(&format!("{}_error", event_id), e.to_string()).unwrap_or(());
                    return Err(e.to_string());
                }
            }
        }

        if let Some(reason) = step_finish_reason {
            if reason == "length" {
                println!("Generation truncated (length). Continuing...");
                
                if continuation_count == 0 {
                    current_messages.push(Message {
                        role: "assistant".to_string(),
                        content: vec![ContentPart::Text {
                            part_type: "text".to_string(),
                            text: full_response_content.clone(),
                        }],
                    });
                } else {
                    if let Some(last_msg) = current_messages.last_mut() {
                        last_msg.content = vec![ContentPart::Text {
                            part_type: "text".to_string(),
                            text: full_response_content.clone(),
                        }];
                    }
                }
                
                continuation_count += 1;
                continue;
            }
        }

        break;
    }
    
    app.emit(&format!("{}_finish", event_id), "DONE").unwrap_or(());
    println!("Chat request finished.");

    Ok(())
}

pub async fn complete_code(
    provider_config: AIProviderConfig,
    messages: Vec<Message>,
) -> Result<String, String> {
    let client = Client::new();
    
    let (completions_url, api_key, model_name) = match provider_config.protocol {
        AIProtocol::OpenAI => {
            (provider_config.base_url, provider_config.api_key, provider_config.models[0].clone())
        },
        _ => return Err("Unsupported AI protocol".to_string()),
    };

    let request = CompletionRequest {
        model: model_name, 
        messages,
        stream: false, 
        thinking: None,
        stop: Some(vec!["User:".to_string(), "Model:".to_string(), "用户:".to_string(), "模型:".to_string()]),
    };

    let response = client
        .post(&completions_url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&request)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = response.status();
    if !status.is_success() {
        let text = response.text().await.unwrap_or_default();
        println!("API Error: Status={}, Body={}", status, text);
        return Err(format!("API Error: {} - {}", status, text));
    }

    let body = response.json::<NonStreamResponse>().await.map_err(|e| e.to_string())?;
    
    if let Some(choice) = body.choices.first() {
        let text_content = choice.message.content.iter()
            .filter_map(|part| match part {
                ContentPart::Text { text, .. } => Some(text.clone()),
                _ => None,
            })
            .collect::<Vec<String>>()
            .join("");
        Ok(text_content)
    } else {
        Err("No choices returned".to_string())
    }
}