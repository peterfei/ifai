//! 智谱 AI (Zhipu / GLM) API 客户端实现
//!
//! 智谱使用 OpenAI 兼容的 API 格式，默认端点：
//! https://open.bigmodel.cn/api/paas/v4/chat/completions

use async_stream::stream;
use futures_core::Stream;
use futures_util::StreamExt;
use reqwest::Client as HttpClient;
use std::collections::HashMap;
use std::pin::Pin;

use super::super::client::ApiClient;
use super::super::types::{
    ApiError, Message, MessageRole, ModelInfo, StreamEvent, StreamRequest,
};
use super::openai_format::{parse_openai_frame, FunctionDelta, ToolCallDelta};

pub struct ZhipuClient {
    http: HttpClient,
    api_key: String,
    base_url: String,
}

impl ZhipuClient {
    pub fn new(config: &super::super::types::ProviderConfig) -> Self {
        let base_url = if let Some(url) = &config.base_url {
            if url.contains("/chat/completions") || url.contains("/v4/") {
                url.clone()
            } else {
                format!("{}/chat/completions", url.trim_end_matches('/'))
            }
        } else {
            "https://open.bigmodel.cn/api/paas/v4/chat/completions".to_string()
        };

        use std::time::Duration;
        let http = HttpClient::builder()
            .timeout(Duration::from_secs(300))
            .connect_timeout(Duration::from_secs(30))
            .read_timeout(Duration::from_secs(300))
            .build()
            .expect("Failed to create HTTP client");

        Self {
            http,
            api_key: config.api_key.clone(),
            base_url,
        }
    }
}

#[async_trait::async_trait]
impl ApiClient for ZhipuClient {
    async fn stream(
        &self,
        request: StreamRequest,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<StreamEvent, ApiError>> + Send>>, ApiError>
    {
        // 构建 messages 数组
        let mut messages = Vec::new();
        if let Some(system) = &request.system {
            messages.push(Message {
                role: MessageRole::System,
                content: system.clone(),
                tool_calls: None,
                tool_call_id: None,
            });
        }
        messages.extend(request.messages.clone());

        // 智谱使用 OpenAI 兼容的 API 格式
        let mut zhipu_request = serde_json::json!({
            "model": request.model,
            "messages": messages,
            "max_tokens": request.max_tokens,
            "temperature": request.temperature,
            "stream": true
        });

        // 添加 tools 参数（如果存在）
        if let Some(tools) = request.tools {
            println!("[Zhipu] Adding {} tools to request", tools.len());
            if let Some(obj) = zhipu_request.as_object_mut() {
                obj.insert("tools".to_string(), serde_json::Value::Array(tools));
                obj.insert("tool_choice".to_string(), serde_json::json!("auto"));
            }
        }

        println!("[Zhipu] Sending request to: {}", self.base_url);

        let response = self
            .http
            .post(&self.base_url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&zhipu_request)
            .send()
            .await
            .map_err(|e| ApiError::Network(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let message = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            return Err(ApiError::HttpError { status, message });
        }

        let byte_stream = response.bytes_stream();
        let mut buffer = Vec::new();
        let mut tool_args_buffer: HashMap<i32, (String, String)> = HashMap::new();
        let mut tool_started: HashMap<i32, bool> = HashMap::new();
        let mut frame_count: usize = 0;
        let mut last_finish_reason: Option<String> = None;

        Ok(Box::pin(stream! {
            for await chunk_result in byte_stream {
                match chunk_result {
                    Ok(chunk) => {
                        buffer.extend_from_slice(&chunk);

                        loop {
                            let separator_pos = find_separator(&buffer);
                            if separator_pos == 0 {
                                break;
                            }

                            let frame_bytes = buffer.drain(..separator_pos).collect::<Vec<_>>();
                            if buffer.starts_with(b"\n\n") {
                                buffer.drain(..2);
                            } else if buffer.starts_with(b"\r\n\r\n") {
                                buffer.drain(..4);
                            }

                            let frame = String::from_utf8_lossy(&frame_bytes);
                            frame_count += 1;

                            if frame_count <= 3 || frame_count % 50 == 0 {
                                println!("[Zhipu] Frame {}: {} bytes", frame_count, frame_bytes.len());
                            }

                            if let Ok(Some(data)) = parse_openai_frame(&frame) {
                                // 处理工具调用
                                if let Some(choice) = data.choices.first() {
                                    if let Some(tool_calls) = &choice.delta.tool_calls {
                                        for tc in tool_calls {
                                            let index = tc.index;

                                            if !tool_started.get(&index).unwrap_or(&false) {
                                                if let (Some(id), Some(name)) = (
                                                    &tc.id,
                                                    tc.function.as_ref().and_then(|f| f.name.as_ref()),
                                                ) {
                                                    yield Ok(StreamEvent::ToolStart {
                                                        tool_id: id.clone(),
                                                        name: name.clone(),
                                                        input: String::new(),
                                                    });
                                                    tool_started.insert(index, true);
                                                    tool_args_buffer.insert(index, (id.clone(), String::new()));
                                                    println!("[Zhipu] ToolStart: index={}, id={}, name={}", index, id, name);
                                                }
                                            }

                                            if let Some(func) = &tc.function {
                                                if let Some(args) = &func.arguments {
                                                    if let Some((tool_id, current)) = tool_args_buffer.get_mut(&index) {
                                                        current.push_str(args);
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }

                                // 检查 finish_reason，发送 ToolDone
                                if let Some(choice) = data.choices.first() {
                                    if let Some(reason) = &choice.finish_reason {
                                        last_finish_reason = Some(reason.clone());
                                        for (_index, (tool_id, args)) in tool_args_buffer.iter() {
                                            if !args.is_empty() {
                                                yield Ok(StreamEvent::ToolDone {
                                                    tool_id: tool_id.clone(),
                                                    result: args.clone(),
                                                });
                                            }
                                        }
                                        tool_args_buffer.clear();
                                        tool_started.clear();
                                    }
                                }

                                // 处理普通事件
                                if let Some(event) = convert_zhipu_data(&data) {
                                    yield Ok(event);
                                }
                            }
                        }
                    }
                    Err(e) => {
                        println!("[Zhipu] Network error after {} frames: {:?}", frame_count, e);
                        yield Err(ApiError::Network(e.to_string()));
                    }
                }
            }

            if !tool_args_buffer.is_empty() {
                println!("[Zhipu] Stream ended with {} incomplete tool calls", tool_args_buffer.len());
            }
            println!("[Zhipu] Stream completed: frames={}, finish_reason={:?}", frame_count, last_finish_reason);
        }))
    }

    async fn list_models(&self) -> Result<Vec<ModelInfo>, ApiError> {
        Ok(vec![
            ModelInfo {
                id: "glm-4.7".to_string(),
                name: "GLM-4.7".to_string(),
                context_tokens: 128000,
            },
            ModelInfo {
                id: "glm-4.7-flash".to_string(),
                name: "GLM-4.7 Flash".to_string(),
                context_tokens: 128000,
            },
            ModelInfo {
                id: "glm-4.6".to_string(),
                name: "GLM-4.6".to_string(),
                context_tokens: 128000,
            },
            ModelInfo {
                id: "glm-4.5v".to_string(),
                name: "GLM-4.5V".to_string(),
                context_tokens: 128000,
            },
            ModelInfo {
                id: "glm-4-plus".to_string(),
                name: "GLM-4 Plus".to_string(),
                context_tokens: 128000,
            },
            ModelInfo {
                id: "glm-4-air".to_string(),
                name: "GLM-4 Air".to_string(),
                context_tokens: 128000,
            },
            ModelInfo {
                id: "glm-4-flash".to_string(),
                name: "GLM-4 Flash".to_string(),
                context_tokens: 128000,
            },
            ModelInfo {
                id: "glm-4".to_string(),
                name: "GLM-4".to_string(),
                context_tokens: 128000,
            },
            ModelInfo {
                id: "glm-4v".to_string(),
                name: "GLM-4V".to_string(),
                context_tokens: 128000,
            },
            ModelInfo {
                id: "glm-3-turbo".to_string(),
                name: "GLM-3 Turbo".to_string(),
                context_tokens: 32000,
            },
        ])
    }

    fn estimate_tokens(&self, content: &str) -> usize {
        let chinese_chars = content.chars().filter(|c| is_chinese(*c)).count();
        let other_chars = content.len() - chinese_chars;
        chinese_chars / 2 + other_chars / 4
    }
}

fn is_chinese(c: char) -> bool {
    matches!(c as u32, 0x4E00..=0x9FFF)
}

/// 查找 SSE 帧分隔符位置
fn find_separator(buffer: &[u8]) -> usize {
    if let Some(pos) = buffer.windows(2).position(|w| w == b"\n\n") {
        return pos + 2;
    }
    if let Some(pos) = buffer.windows(4).position(|w| w == b"\r\n\r\n") {
        return pos + 4;
    }
    0
}

/// 转换智谱/OpenAI 格式的数据为统一事件
fn convert_zhipu_data(data: &super::openai_format::OpenAiSseData) -> Option<StreamEvent> {
    if let Some(choice) = data.choices.first() {
        if let Some(content) = &choice.delta.content {
            if !content.is_empty() {
                return Some(StreamEvent::TextDelta {
                    text: content.clone(),
                });
            }
        }
        if choice.finish_reason.is_some() {
            return Some(StreamEvent::MessageDone { tokens_used: 0 });
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_config() -> super::super::super::types::ProviderConfig {
        super::super::super::types::ProviderConfig {
            api_key: "test-key".to_string(),
            base_url: None,
            organization: None,
        }
    }

    fn test_config_with_url(url: &str) -> super::super::super::types::ProviderConfig {
        super::super::super::types::ProviderConfig {
            api_key: "test-key".to_string(),
            base_url: Some(url.to_string()),
            organization: None,
        }
    }

    #[test]
    fn test_zhipu_client_default_base_url() {
        let client = ZhipuClient::new(&test_config());
        assert_eq!(
            client.base_url,
            "https://open.bigmodel.cn/api/paas/v4/chat/completions"
        );
    }

    #[test]
    fn test_zhipu_client_custom_base_url_full_path() {
        let client = ZhipuClient::new(&test_config_with_url(
            "https://open.bigmodel.cn/api/paas/v4/chat/completions",
        ));
        assert_eq!(
            client.base_url,
            "https://open.bigmodel.cn/api/paas/v4/chat/completions"
        );
    }

    #[test]
    fn test_zhipu_client_custom_base_url_v4_only() {
        let client = ZhipuClient::new(&test_config_with_url(
            "https://open.bigmodel.cn/api/paas/v4",
        ));
        // /v4 不包含 /v4/ 或 /chat/completions，会追加 /chat/completions
        assert_eq!(client.base_url, "https://open.bigmodel.cn/api/paas/v4/chat/completions");
    }

    #[test]
    fn test_zhipu_client_custom_base_url_domain_only() {
        let client = ZhipuClient::new(&test_config_with_url(
            "https://open.bigmodel.cn/api/paas/v4",
        ));
        assert_eq!(client.base_url, "https://open.bigmodel.cn/api/paas/v4/chat/completions");
    }

    #[test]
    fn test_zhipu_client_custom_base_url_append_path() {
        let client = ZhipuClient::new(&test_config_with_url(
            "https://open.bigmodel.cn/api/paas",
        ));
        assert_eq!(
            client.base_url,
            "https://open.bigmodel.cn/api/paas/chat/completions"
        );
    }

    #[test]
    fn test_zhipu_list_models() {
        let client = ZhipuClient::new(&test_config());
        let rt = tokio::runtime::Runtime::new().unwrap();
        let models = rt.block_on(client.list_models()).unwrap();
        assert!(!models.is_empty());

        // 验证关键模型存在
        let model_ids: Vec<&str> = models.iter().map(|m| m.id.as_str()).collect();
        assert!(model_ids.contains(&"glm-4.7"));
        assert!(model_ids.contains(&"glm-4.6"));
        assert!(model_ids.contains(&"glm-4-plus"));
        assert!(model_ids.contains(&"glm-4-air"));
        assert!(model_ids.contains(&"glm-4-flash"));
        assert!(model_ids.contains(&"glm-4"));
        assert!(model_ids.contains(&"glm-3-turbo"));

        // 验证每个模型都有必需字段
        for model in &models {
            assert!(!model.id.is_empty());
            assert!(!model.name.is_empty());
            assert!(model.context_tokens > 0);
        }
    }

    #[test]
    fn test_zhipu_token_estimation() {
        let client = ZhipuClient::new(&test_config());

        // 纯英文
        let english = "Hello world";
        let tokens = client.estimate_tokens(english);
        assert!(tokens > 0 && tokens <= english.len());

        // 纯中文
        let chinese = "你好世界";
        let tokens = client.estimate_tokens(chinese);
        assert!(tokens > 0 && tokens <= chinese.len());

        // 混合
        let mixed = "Hello 你好";
        let tokens = client.estimate_tokens(mixed);
        assert!(tokens > 0);

        // 空字符串
        let empty = "";
        let tokens = client.estimate_tokens(empty);
        assert_eq!(tokens, 0);
    }

    #[test]
    fn test_zhipu_sse_frame_parsing() {
        // 测试内容增量帧
        let frame = r#"data: {"id":"chatcmpl-123","choices":[{"index":0,"delta":{"content":"你好"}}]}"#;
        let result = parse_openai_frame(frame).unwrap();
        assert!(result.is_some());
        let data = result.unwrap();
        let event = convert_zhipu_data(&data);
        assert!(event.is_some());
        if let Some(StreamEvent::TextDelta { text }) = event {
            assert_eq!(text, "你好");
        } else {
            panic!("Expected TextDelta event");
        }

        // 测试完成帧
        let frame_done = r#"data: {"id":"chatcmpl-123","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}"#;
        let result_done = parse_openai_frame(frame_done).unwrap();
        assert!(result_done.is_some());
        let data_done = result_done.unwrap();
        let event_done = convert_zhipu_data(&data_done);
        assert!(event_done.is_some());
        assert!(matches!(event_done, Some(StreamEvent::MessageDone { .. })));

        // 测试 [DONE] 帧
        let frame_end = "data: [DONE]";
        let result_end = parse_openai_frame(frame_end).unwrap();
        assert!(result_end.is_none());
    }

    #[test]
    fn test_zhipu_tool_call_parsing() {
        // 测试工具调用增量帧
        let frame = r#"data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_123","type":"function","function":{"name":"read_file","arguments":"{\"path\":\""}}]}}]}"#;
        let result = parse_openai_frame(frame).unwrap();
        assert!(result.is_some());
        let data = result.unwrap();
        let choice = data.choices.first().unwrap();
        assert!(choice.delta.tool_calls.is_some());
        let tool_calls = choice.delta.tool_calls.as_ref().unwrap();
        assert_eq!(tool_calls.len(), 1);
        assert_eq!(tool_calls[0].index, 0);
        assert_eq!(tool_calls[0].id.as_ref().unwrap(), "call_123");
        assert_eq!(
            tool_calls[0].function.as_ref().unwrap().name.as_ref().unwrap(),
            "read_file"
        );
        assert_eq!(
            tool_calls[0].function.as_ref().unwrap().arguments.as_ref().unwrap(),
            "{\"path\":\""
        );
    }

    #[test]
    fn test_find_separator() {
        // \n\n 分隔
        assert_eq!(find_separator(b"hello\n\nworld"), 7);
        // \r\n\r\n 分隔
        assert_eq!(find_separator(b"hello\r\n\r\nworld"), 9);
        // 无分隔
        assert_eq!(find_separator(b"hello world"), 0);
    }

    #[tokio::test]
    async fn test_zhipu_client_creation() {
        let config = test_config();
        let _client = ZhipuClient::new(&config);
        // 仅验证创建不 panic
    }
}
