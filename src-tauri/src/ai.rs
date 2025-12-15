use reqwest::Client;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, command};
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
    pub base_url: String,
    pub api_key: String,
    pub models: Vec<String>,
    pub enabled: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Message {
    pub role: String,
    pub content: String,
}

#[derive(Serialize, Debug)]
struct ChatRequest {
    model: String,
    messages: Vec<Message>,
    stream: bool,
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
}

pub async fn stream_chat(
    app: AppHandle,
    provider_config: AIProviderConfig, // New parameter
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
            // For OpenAI compatible APIs, the base_url from config should be the full endpoint
            // e.g., https://api.deepseek.com/chat/completions or https://api.openai.com/v1/chat/completions
            (provider_config.base_url, provider_config.api_key, provider_config.models[0].clone()) // Assuming models[0] is the selected model from frontend
        },
        // Future: Handle other protocols here
        _ => return Err("Unsupported AI protocol".to_string()),
    };

    loop {
        if continuation_count > MAX_CONTINUATIONS {
            println!("Max continuations reached.");
            break;
        }

        let request = ChatRequest {
            model: model_name.clone(), // Use dynamic model_name
            messages: current_messages.clone(),
            stream: true,
        };

        println!("Sending request to {} (Step {})...", completions_url, continuation_count + 1);
        let response = client
            .post(&completions_url) // Use dynamic completions_url
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await
            .map_err(|e| {
                println!("Request failed: {}", e);
                e.to_string()
            })?;

        if !response.status().is_success() {
            let text = response.text().await.unwrap_or_default();
            println!("API Error Body: {}", text);
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
                                // Emit to frontend immediately
                                app.emit(&event_id, content).unwrap_or(());
                                // Accumulate for history
                                full_response_content.push_str(content);
                            }
                            // Capture finish reason
                            if let Some(reason) = &choice.finish_reason {
                                step_finish_reason = Some(reason.clone());
                            }
                        }
                    }
                }
                Err(e) => {
                    println!("Error reading stream: {}", e);
                    app.emit(&format!("{}_error", event_id), e.to_string()).unwrap_or(());
                    return Err(e.to_string());
                }
            }
        }

        // Check if we need to continue
        if let Some(reason) = step_finish_reason {
            if reason == "length" {
                println!("Generation truncated (length). Continuing...");
                
                // Update history with what we have so far
                if continuation_count == 0 {
                    current_messages.push(Message {
                        role: "assistant".to_string(),
                        content: full_response_content.clone(),
                    });
                } else {
                    // Update the last assistant message
                    if let Some(last_msg) = current_messages.last_mut() {
                        last_msg.content = full_response_content.clone();
                    }
                }
                
                continuation_count += 1;
                continue;
            }
        }

        // If we get here, it means finish_reason is not "length" (e.g. "stop" or null), so we are done.
        break;
    }
    
    app.emit(&format!("{}_finish", event_id), "DONE").unwrap_or(());
    println!("Chat request finished.");

    Ok(())
}

#[command]
pub async fn ai_completion(
    provider_config: AIProviderConfig,
    messages: Vec<Message>,
) -> Result<String, String> {
    complete_code(provider_config, messages).await
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
        stream: false, // Non-streaming
    };

    let response = client
        .post(&completions_url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&request)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = response.status(); // Get status before consuming response body
    if !status.is_success() {
        let text = response.text().await.unwrap_or_default();
        return Err(format!("API Error: {} - {}", status, text));
    }

    let body = response.json::<NonStreamResponse>().await.map_err(|e| e.to_string())?;
    
    if let Some(choice) = body.choices.first() {
        Ok(choice.message.content.clone())
    } else {
        Err("No choices returned".to_string())
    }
}
