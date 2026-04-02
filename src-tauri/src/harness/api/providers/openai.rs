//! OpenAI API 客户端实现

use async_stream::stream;
use futures_core::Stream;
use futures_util::StreamExt;
use reqwest::Client as HttpClient;
use std::pin::Pin;

use super::super::client::ApiClient;
use super::super::types::{ApiError, Message, MessageRole, ModelInfo, StreamEvent, StreamRequest};
use super::openai_format::parse_openai_frame;

pub struct OpenAIClient {
    http: HttpClient,
    api_key: String,
    base_url: String,
}

impl OpenAIClient {
    pub fn new(config: &super::super::types::ProviderConfig) -> Self {
        // 🆕 P2: 规范化 base_url，移除可能存在的路径后缀
        let base_url = if let Some(url) = &config.base_url {
            // 如果用户配置的 base_url 已经包含完整路径（如 /chat/completions），使用它
            // 否则添加标准路径
            if url.contains("/chat/completions") || url.contains("/v1/") {
                url.clone()
            } else {
                format!("{}/v1/chat/completions", url.trim_end_matches('/'))
            }
        } else {
            "https://api.openai.com/v1/chat/completions".to_string()
        };

        // 🔥 FIX: 增加 HTTP 客户端超时时间，支持长 continuation 流
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
impl ApiClient for OpenAIClient {
    async fn stream(
        &self,
        request: StreamRequest,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<StreamEvent, ApiError>> + Send>>, ApiError> {
        // 🔧 CLI: 构建 messages 数组，system prompt 作为第一条消息
        let mut messages = Vec::new();

        // 如果有 system prompt，作为第一条消息添加
        if let Some(system) = &request.system {
            messages.push(Message {
                role: MessageRole::System,
                content: system.clone(),
                tool_calls: None,
                tool_call_id: None,
            });
        }

        // 添加所有原始消息
        messages.extend(request.messages.clone());

        // OpenAI 使用标准的 chat completions 格式
        let mut openai_request = serde_json::json!({
            "model": request.model,
            "messages": messages,
            "max_tokens": request.max_tokens,
            "temperature": request.temperature,
            "stream": true
        });

        // 🆕 P2: 添加 tools 参数（如果存在）
        if let Some(tools) = request.tools {
            if let Some(obj) = openai_request.as_object_mut() {
                obj.insert("tools".to_string(), serde_json::Value::Array(tools));
            }
        }

        let response = self
            .http
            .post(&self.base_url)  // 🆕 P2: 直接使用 base_url，不再添加路径
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&openai_request)
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

        Ok(Box::pin(stream! {
            for await chunk_result in byte_stream {
                match chunk_result {
                    Ok(chunk) => {
                        buffer.extend_from_slice(&chunk);

                        // 按 SSE 帧分隔（\n\n 或 \r\n\r\n）
                        loop {
                            let separator_pos = find_separator(&buffer);
                            if separator_pos == 0 {
                                break;
                            }

                            let frame_bytes = buffer.drain(..separator_pos).collect::<Vec<_>>();
                            // 移除分隔符
                            if buffer.starts_with(b"\n\n") {
                                buffer.drain(..2);
                            } else if buffer.starts_with(b"\r\n\r\n") {
                                buffer.drain(..4);
                            }

                            let frame = String::from_utf8_lossy(&frame_bytes);
                            if let Ok(Some(data)) = parse_openai_frame(&frame) {
                                if let Some(event) = convert_openai_data(&data) {
                                    yield Ok(event);
                                }
                            }
                        }
                    }
                    Err(e) => yield Err(ApiError::Network(e.to_string())),
                }
            }
        }))
    }

    async fn list_models(&self) -> Result<Vec<ModelInfo>, ApiError> {
        // OpenAI 可用模型
        Ok(vec![
            ModelInfo {
                id: "gpt-4o".to_string(),
                name: "GPT-4o".to_string(),
                context_tokens: 128000,
            },
            ModelInfo {
                id: "gpt-4o-mini".to_string(),
                name: "GPT-4o Mini".to_string(),
                context_tokens: 128000,
            },
            ModelInfo {
                id: "gpt-4-turbo".to_string(),
                name: "GPT-4 Turbo".to_string(),
                context_tokens: 128000,
            },
            ModelInfo {
                id: "o1-preview".to_string(),
                name: "o1-preview".to_string(),
                context_tokens: 128000,
            },
        ])
    }

    fn estimate_tokens(&self, content: &str) -> usize {
        // OpenAI 使用 tiktoken
        // 粗略估算：英文约 4 字符/token，中文约 2 字符/token
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
    // 查找 \n\n
    if let Some(pos) = buffer.windows(2).position(|w| w == b"\n\n") {
        return pos + 2;
    }
    // 查找 \r\n\r\n
    if let Some(pos) = buffer.windows(4).position(|w| w == b"\r\n\r\n") {
        return pos + 4;
    }
    0
}

/// 转换 OpenAI 格式的数据为统一事件
fn convert_openai_data(data: &super::openai_format::OpenAiSseData) -> Option<StreamEvent> {
    if let Some(choice) = data.choices.first() {
        // 检查是否有内容
        if let Some(content) = &choice.delta.content {
            if !content.is_empty() {
                return Some(StreamEvent::TextDelta {
                    text: content.clone(),
                });
            }
        }

        // 检查是否完成
        if choice.finish_reason.is_some() {
            return Some(StreamEvent::MessageDone { tokens_used: 0 });
        }
    }

    None
}
