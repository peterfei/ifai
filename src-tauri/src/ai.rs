use reqwest::Client;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter}; 
use eventsource_stream::Eventsource;
use futures::StreamExt;
use serde_json::json;

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

#[derive(Serialize, Debug, Clone)]
struct Tool {
    r#type: String,
    function: FunctionDesc,
}

#[derive(Serialize, Debug, Clone)]
struct FunctionDesc {
    name: String,
    description: String,
    parameters: serde_json::Value,
}

#[derive(Serialize, Debug)]
struct ChatRequest {
    model: String,
    messages: Vec<Message>,
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<Tool>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_choice: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    thinking: Option<ThinkingConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    stop: Option<Vec<String>>,
}

#[derive(Deserialize, Debug)]
struct OpenAIStreamResponse {
    choices: Vec<StreamChoice>,
}

#[derive(Deserialize, Debug)]
struct StreamChoice {
    delta: StreamDelta,
    finish_reason: Option<String>,
}

#[derive(Deserialize, Debug)]
struct StreamDelta {
    content: Option<String>,
    tool_calls: Option<Vec<ToolCallChunk>>,
    role: Option<String>,
}

#[derive(Deserialize, Debug, Serialize, Clone)]
struct ToolCallChunk {
    index: i32,
    id: Option<String>,
    r#type: Option<String>,
    function: Option<FunctionChunk>,
}

#[derive(Deserialize, Debug, Serialize, Clone)]
struct FunctionChunk {
    name: Option<String>,
    arguments: Option<String>,
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

#[derive(Serialize)]
#[serde(tag = "type")]
enum StreamEvent {
    #[serde(rename = "content")]
    Content { content: String },
    #[serde(rename = "tool_call")]
    ToolCall { tool_call: ToolCallChunk },
}

pub async fn stream_chat(
    app: AppHandle,
    provider_config: AIProviderConfig, 
    messages: Vec<Message>,
    event_id: String,
) -> Result<(), String> {
    println!("Starting chat request with {} messages", messages.len());
    let client = Client::new();
    
    let current_messages = messages;
    
    // Define tools
    let tools = vec![
        Tool {
            r#type: "function".to_string(),
            function: FunctionDesc {
                name: "agent_write_file".to_string(),
                description: "Create or overwrite a file with the specified content.".to_string(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "rel_path": {
                            "type": "string",
                            "description": "Relative path to the file (e.g., src/App.tsx)"
                        },
                        "content": {
                            "type": "string",
                            "description": "The complete content of the file."
                        }
                    },
                    "required": ["rel_path", "content"]
                }),
            },
        },
        Tool {
            r#type: "function".to_string(),
            function: FunctionDesc {
                name: "agent_read_file".to_string(),
                description: "Read the content of a file.".to_string(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "rel_path": {
                            "type": "string",
                            "description": "Relative path to the file"
                        }
                    },
                    "required": ["rel_path"]
                }),
            },
        },
        Tool {
            r#type: "function".to_string(),
            function: FunctionDesc {
                name: "agent_list_dir".to_string(),
                description: "List contents of a directory.".to_string(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "rel_path": {
                            "type": "string",
                            "description": "Relative path to the directory"
                        }
                    },
                    "required": ["rel_path"]
                }),
            },
        },
    ];

    let (completions_url, api_key, model_name) = match provider_config.protocol {
        AIProtocol::OpenAI => {
            (provider_config.base_url, provider_config.api_key, provider_config.models[0].clone()) 
        },
        _ => return Err("Unsupported AI protocol".to_string()),
    };

    let request = ChatRequest {
        model: model_name.clone(), 
        messages: current_messages.clone(),
        stream: true,
        temperature: Some(0.3),
        thinking: None,
        tools: Some(tools),
        tool_choice: Some("auto".to_string()),
        stop: None, // With native tools, explicit stops are usually not needed, model stops after tool call
    };

    println!("Sending request to {}...", completions_url);
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

    println!("Stream processing started...");

    while let Some(event) = stream.next().await {
        match event {
            Ok(event) => {
                if event.data == "[DONE]" {
                    break;
                }
                if let Ok(response) = serde_json::from_str::<OpenAIStreamResponse>(&event.data) {
                    if let Some(choice) = response.choices.first() {
                        // Handle Text Content
                        if let Some(content) = &choice.delta.content {
                            let event_payload = serde_json::to_string(&StreamEvent::Content { 
                                content: content.clone() 
                            }).unwrap();
                            app.emit(&event_id, event_payload).unwrap_or(());
                        }
                        
                        // Handle Tool Calls
                        if let Some(tool_calls) = &choice.delta.tool_calls {
                            for chunk in tool_calls {
                                let event_payload = serde_json::to_string(&StreamEvent::ToolCall { 
                                    tool_call: chunk.clone() 
                                }).unwrap();
                                app.emit(&event_id, event_payload).unwrap_or(());
                            }
                        }
                    }
                                    } else {
                                        println!("Failed to parse JSON: {}", event.data);
                                        // Fallback: emit raw data to frontend for debugging to diagnose Zhipu AI issues
                                        let debug_msg = format!("\n[DEBUG: Parse Failed] {}\n", event.data);
                                        let event_payload = serde_json::to_string(&StreamEvent::Content { 
                                            content: debug_msg 
                                        }).unwrap();
                                        app.emit(&event_id, event_payload).unwrap_or(());
                                    }            }
            Err(e) => {
                println!("Error reading stream: {}", e);
                app.emit(&format!("{}_error", event_id), e.to_string()).unwrap_or(());
                return Err(e.to_string());
            }
        }
    }
    
    app.emit(&format!("{}_finish", event_id), "DONE").unwrap_or(());
    println!("Chat request finished.");

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_tool_call_chunk() {
        let json = r#"{"id":"chatcmpl-123","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_abc","type":"function","function":{"name":"write","arguments":""}}]},"finish_reason":null}]}"#;
        let res: OpenAIStreamResponse = serde_json::from_str(json).unwrap();
        let tools = res.choices[0].delta.tool_calls.as_ref().unwrap();
        assert_eq!(tools[0].function.as_ref().unwrap().name.as_deref(), Some("write"));
    }
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
        stop: None,
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
