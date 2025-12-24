use crate::core_traits::ai::{Message, Content, ToolCall, AIProviderConfig, FunctionCall};
use serde_json::{json, Value};
use reqwest::Client;
use std::time::Duration;
use std::collections::HashMap;
use tauri::{AppHandle, Emitter};
use futures::stream::StreamExt;
use eventsource_stream::Eventsource;

pub fn sanitize_messages(messages: &mut Vec<Message>) {
    let mut i = 0;
    while i < messages.len() {
        // Only process assistant messages that have tool_calls
        if messages[i].role == "assistant" && messages[i].tool_calls.as_ref().map_or(false, |tc| !tc.is_empty()) {
            let tool_calls = messages[i].tool_calls.clone().unwrap();
            let mut completed_ids = std::collections::HashSet::new();

            // Scan forward to find all tool response messages
            let mut j = i + 1;
            while j < messages.len() && messages[j].role == "tool" {
                if let Some(id) = &messages[j].tool_call_id {
                    completed_ids.insert(id.clone());
                }
                j += 1;
            }

            // Filter to keep only tool_calls that have responses
            let filtered_calls: Vec<_> = tool_calls.into_iter()
                .filter(|tc| completed_ids.contains(&tc.id))
                .collect();

            if filtered_calls.is_empty() {
                // No completed calls - remove tool_calls field entirely
                messages[i].tool_calls = None;
            } else {
                // Update with only completed calls
                messages[i].tool_calls = Some(filtered_calls);
            }
        }
        i += 1;
    }
}

pub async fn fetch_ai_completion(
    config: &AIProviderConfig,
    mut messages: Vec<Message>, // Change to mutable to allow sanitization
    tools: Option<Vec<Value>>,
) -> Result<Message, String> {
    // Apply sanitization before every internal API call
    sanitize_messages(&mut messages);

    let client = Client::builder()
        .timeout(Duration::from_secs(120)) // Increase timeout to 2 minutes
        .pool_max_idle_per_host(0) // Disable connection pooling
        .http1_only() // Force HTTP/1.1 to avoid HTTP/2 chunking issues
        .http1_title_case_headers() // Better compatibility
        .build()
        .map_err(|e| e.to_string())?;
    
    let mut request_body = json!({
        "model": config.models[0],
        "messages": messages,
        "stream": false
    });

    if let Some(t) = tools {
        request_body["tools"] = json!(t);
    }

    let response = client.post(&config.base_url)
        .header("Authorization", format!("Bearer {}", config.api_key))
        .json(&request_body)
        .send()
        .await
        .map_err(|e| format!("Network/Request error: {}", e))?;

    let status = response.status();
    let headers = response.headers().clone();

    // Log response details
    eprintln!("[AIUtils] Response status: {}", status);
    if let Some(content_type) = headers.get("content-type") {
        eprintln!("[AIUtils] Content-Type: {:?}", content_type);
    }
    if let Some(content_length) = headers.get("content-length") {
        eprintln!("[AIUtils] Content-Length: {:?}", content_length);
    }

    if !status.is_success() {
        let err_body = response.text().await.unwrap_or_default();
        eprintln!("[AIUtils] API HTTP Error {}: {}", status, err_body);
        return Err(format!("AI API Error ({}): {}", status, err_body));
    }

    // Try to read response as bytes first, then convert to string
    eprintln!("[AIUtils] Attempting to read response body...");
    let response_bytes = match response.bytes().await {
        Ok(bytes) => {
            eprintln!("[AIUtils] Successfully read {} bytes", bytes.len());
            bytes
        }
        Err(e) => {
            eprintln!("[AIUtils] Failed to read response bytes: {}", e);
            eprintln!("[AIUtils] Error kind: {:?}", e);
            eprintln!("[AIUtils] Is timeout: {}", e.is_timeout());
            eprintln!("[AIUtils] Is connect: {}", e.is_connect());
            return Err(format!("Failed to read response bytes: {} (timeout: {}, connect: {})",
                e, e.is_timeout(), e.is_connect()));
        }
    };

    let response_text = String::from_utf8(response_bytes.to_vec()).map_err(|e| {
        eprintln!("[AIUtils] Failed to decode response as UTF-8: {}", e);
        eprintln!("[AIUtils] First 100 bytes (as hex): {:02x?}",
            &response_bytes[..response_bytes.len().min(100)]);
        format!("Response is not valid UTF-8: {}", e)
    })?;

    // Try to parse as JSON
    let res_json: Value = serde_json::from_str(&response_text).map_err(|e| {
        eprintln!("[AIUtils] JSON Parse Error: {}", e);
        eprintln!("[AIUtils] Response body (first 500 chars): {}",
            if response_text.len() > 500 {
                format!("{}...", &response_text[..500])
            } else {
                response_text.clone()
            }
        );
        format!("Failed to parse AI response as JSON: {}", e)
    })?;
    
    let choice = &res_json["choices"][0]["message"];
    if choice.is_null() {
        eprintln!("[AIUtils] Error: 'choices[0].message' is missing in response: {}", res_json);
        return Err("Malformed AI response: message field missing".to_string());
    }

    let role = choice["role"].as_str().unwrap_or("assistant").to_string();
    let content_text = choice["content"].as_str().unwrap_or("").to_string();
    
    let mut tool_calls: Option<Vec<ToolCall>> = None;
    if let Some(tc_array) = choice["tool_calls"].as_array() {
        let mut calls = Vec::new();
        for tc_val in tc_array {
            calls.push(ToolCall {
                id: tc_val["id"].as_str().unwrap_or("").to_string(),
                r#type: "function".to_string(),
                function: FunctionCall {
                    name: tc_val["function"]["name"].as_str().unwrap_or("").to_string(),
                    arguments: tc_val["function"]["arguments"].as_str().unwrap_or("{}").to_string(),
                }
            });
        }
        tool_calls = Some(calls);
    }

    Ok(Message {
        role,
        content: Content::Text(content_text),
        tool_calls,
        tool_call_id: None,
    })
}

// Streaming response data structures
#[derive(serde::Deserialize, Debug)]
struct OpenAIStreamResponse {
    choices: Vec<StreamChoice>,
}

#[derive(serde::Deserialize, Debug)]
struct StreamChoice {
    delta: StreamDelta,
}

#[derive(serde::Deserialize, Debug)]
struct StreamDelta {
    content: Option<String>,
    tool_calls: Option<Vec<ToolCallChunk>>,
}

#[derive(serde::Deserialize, Debug, Clone)]
struct ToolCallChunk {
    index: i32,
    id: Option<String>,
    function: Option<FunctionChunk>,
}

#[derive(serde::Deserialize, Debug, Clone)]
struct FunctionChunk {
    name: Option<String>,
    arguments: Option<String>,
}

struct StreamingToolCall {
    id: String,
    name: String,
    arguments: String,
}

fn extract_partial_value(json_str: &str, key: &str) -> Option<String> {
    // Robust regex to find a string value in partial JSON: "key": "value...
    let pattern = format!("\"{}\"\\s*:\\s*\"((?:[^\"\\\\]|\\\\.)*)", key);
    if let Ok(re) = regex::Regex::new(&pattern) {
        if let Some(caps) = re.captures(json_str) {
            let mut val = caps[1].to_string();
            // Basic unescaping for display purposes
            val = val.replace("\\n", "\n").replace("\\\"", "\"").replace("\\t", "\t");
            return Some(val);
        }
    }
    None
}

/// Agent-specific streaming chat that returns a Message (unlike stream_chat which only emits events)
pub async fn agent_stream_chat(
    app: &AppHandle,
    config: &AIProviderConfig,
    messages: Vec<Message>,
    agent_id: &str,
    tools: Option<Vec<Value>>,
) -> Result<Message, String> {
    // ... (rest of implementation)
    // 1. Sanitize messages
    let mut clean_messages = messages.clone();
    sanitize_messages(&mut clean_messages);

    // 2. Build request
    let client = Client::builder()
        .timeout(Duration::from_secs(180))
        .build()
        .map_err(|e| e.to_string())?;

    let mut request_body = json!({
        "model": config.models[0],
        "messages": clean_messages,
        "stream": true  // Enable streaming
    });

    if let Some(t) = tools {
        request_body["tools"] = json!(t);
    }

    eprintln!("[AgentStream] Sending streaming request for agent {}", agent_id);

    // 3. Send HTTP request
    let response = client
        .post(&config.base_url)
        .header("Authorization", format!("Bearer {}", config.api_key))
        .header("Content-Type", "application/json")
        .json(&request_body)
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    let status = response.status();
    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        eprintln!("[AgentStream] API Error: {}: {}", status, error_text);
        return Err(format!("AI API Error ({}): {}", status, error_text));
    }

    // 4. Process SSE stream
    eprintln!("[AgentStream] Creating event stream...");
    let mut stream = response.bytes_stream().eventsource();
    let mut accumulated_content = String::new();
    let mut accumulated_tool_calls: HashMap<i32, StreamingToolCall> = HashMap::new();
    let mut event_count = 0;

    eprintln!("[AgentStream] Starting stream iteration...");

    while let Some(event) = stream.next().await {
        event_count += 1;
        eprintln!("[AgentStream] Event #{}", event_count);
        match event {
            Ok(event) => {
                eprintln!("[AgentStream] Received event, data length: {}", event.data.len());

                if event.data == "[DONE]" {
                    eprintln!("[AgentStream] Received [DONE] signal");
                    break;
                }

                if let Ok(stream_response) = serde_json::from_str::<OpenAIStreamResponse>(&event.data) {
                    if let Some(choice) = stream_response.choices.first() {
                        // Handle text content
                        if let Some(content) = &choice.delta.content {
                            eprintln!("[AgentStream] Got content chunk: {} chars", content.len());
                            accumulated_content.push_str(content);

                            // Send to frontend in real-time as 'thinking' type
                            let _ = app.emit(
                                &format!("agent_{}", agent_id),
                                json!({ "type": "thinking", "content": content })
                            );
                        }

                        // Handle tool call chunks
                        if let Some(tool_chunks) = &choice.delta.tool_calls {
                            for chunk in tool_chunks {
                                let idx = chunk.index;

                                if !accumulated_tool_calls.contains_key(&idx) {
                                    accumulated_tool_calls.insert(idx, StreamingToolCall {
                                        id: String::new(),
                                        name: String::new(),
                                        arguments: String::new(),
                                    });
                                }

                                let st = accumulated_tool_calls.get_mut(&idx).unwrap();
                                if let Some(id) = &chunk.id {
                                    st.id = id.clone();
                                }
                                if let Some(func) = &chunk.function {
                                    if let Some(name) = &func.name {
                                        st.name.push_str(name);
                                    }
                                    if let Some(args) = &func.arguments {
                                        st.arguments.push_str(args);
                                    }
                                }

                                // Emit partial tool call to frontend
                                if !st.name.is_empty() {
                                    // Try full parse first
                                    let mut args_val: Value = serde_json::from_str(&st.arguments).unwrap_or_else(|_| {
                                        // If not valid JSON, try to extract fields manually for better progressive UI
                                        let mut map = serde_json::Map::new();
                                        if let Some(path) = extract_partial_value(&st.arguments, "rel_path") {
                                            map.insert("rel_path".to_string(), json!(path));
                                        }
                                        if let Some(content) = extract_partial_value(&st.arguments, "content") {
                                            map.insert("content".to_string(), json!(content));
                                        }
                                        Value::Object(map)
                                    });

                                    let _ = app.emit(
                                        &format!("agent_{}", agent_id),
                                        json!({
                                            "type": "tool_call",
                                            "toolCall": {
                                                "id": if st.id.is_empty() { format!("{}_{}", agent_id, idx) } else { st.id.clone() },
                                                "tool": st.name,
                                                "args": args_val,
                                                "isPartial": true
                                            }
                                        })
                                    );
                                }
                            }
                        }
                    }
                } else {
                    eprintln!("[AgentStream] Failed to parse JSON. First 200 chars: {}",
                        if event.data.len() > 200 {
                            format!("{}...", &event.data[..200])
                        } else {
                            event.data.clone()
                        }
                    );
                }
            }
            Err(e) => {
                eprintln!("[AgentStream] Stream error: {}", e);
                return Err(format!("Stream error: {}", e));
            }
        }
    }

    eprintln!("[AgentStream] Stream completed. Content length: {}, Tools: {}",
        accumulated_content.len(), accumulated_tool_calls.len());

    // 5. Build final Message
    let tool_calls = if accumulated_tool_calls.is_empty() {
        None
    } else {
        Some(
            accumulated_tool_calls
                .values()
                .map(|st| ToolCall {
                    id: st.id.clone(),
                    r#type: "function".to_string(),
                    function: FunctionCall {
                        name: st.name.clone(),
                        arguments: st.arguments.clone(),
                    },
                })
                .collect()
        )
    };

    Ok(Message {
        role: "assistant".to_string(),
        content: Content::Text(accumulated_content),
        tool_calls,
        tool_call_id: None,
    })
}