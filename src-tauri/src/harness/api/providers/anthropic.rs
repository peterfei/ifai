//! Anthropic API 客户端实现

use async_stream::stream;
use futures_core::Stream;
use futures_util::StreamExt;
use reqwest::Client as HttpClient;
use std::pin::Pin;

use super::super::client::ApiClient;
use super::super::sse::SseParser;
use super::super::types::{ApiError, ModelInfo, StreamEvent, StreamRequest};

pub struct AnthropicClient {
    http: HttpClient,
    api_key: String,
    base_url: String,
}

impl AnthropicClient {
    const ANTHROPIC_VERSION: &'static str = "2023-06-01";

    pub fn new(config: &super::super::types::ProviderConfig) -> Self {
        Self {
            http: HttpClient::new(),
            api_key: config.api_key.clone(),
            base_url: config
                .base_url
                .clone()
                .unwrap_or_else(|| "https://api.anthropic.com".to_string()),
        }
    }
}

#[async_trait::async_trait]
impl ApiClient for AnthropicClient {
    async fn stream(
        &self,
        request: StreamRequest,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<StreamEvent, ApiError>> + Send>>, ApiError> {
        let response = self
            .http
            .post(format!("{}/v1/messages", self.base_url))
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", Self::ANTHROPIC_VERSION)
            .header("content-type", "application/json")
            .json(&request)
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
        let parser = SseParser::new();

        Ok(Box::pin(stream! {
            let mut parser = parser;

            for await chunk_result in byte_stream {
                match chunk_result {
                    Ok(chunk) => {
                        match parser.push(&chunk) {
                            Ok(events) => {
                                for event in events {
                                    yield Ok(convert_sse_event(&event));
                                }
                            }
                            Err(e) => yield Err(ApiError::Sse(e.to_string())),
                        }
                    }
                    Err(e) => yield Err(ApiError::Network(e.to_string())),
                }
            }

            // 处理剩余数据
            if let Ok(events) = parser.finish() {
                for event in events {
                    yield Ok(convert_sse_event(&event));
                }
            }
        }))
    }

    async fn list_models(&self) -> Result<Vec<ModelInfo>, ApiError> {
        // Anthropic 不提供模型列表端点，返回内置列表
        Ok(vec![
            ModelInfo {
                id: "claude-sonnet-4-20250514".to_string(),
                name: "Claude Sonnet 4".to_string(),
                context_tokens: 200000,
            },
            ModelInfo {
                id: "claude-opus-4-20250514".to_string(),
                name: "Claude Opus 4".to_string(),
                context_tokens: 200000,
            },
            ModelInfo {
                id: "claude-3-5-sonnet-20241022".to_string(),
                name: "Claude 3.5 Sonnet".to_string(),
                context_tokens: 200000,
            },
        ])
    }

    fn estimate_tokens(&self, content: &str) -> usize {
        // 粗略估算：英文约 4 字符/token，中文约 2 字符/token
        let chinese_chars = content.chars().filter(|c| is_chinese(*c)).count();
        let other_chars = content.len() - chinese_chars;
        chinese_chars / 2 + other_chars / 4
    }
}

fn is_chinese(c: char) -> bool {
    matches!(c as u32, 0x4E00..=0x9FFF)
}

/// 🔥 转换 SSE 事件为统一的 StreamEvent（支持 usage 追踪）
///
/// **元编程**：从 `MessageDelta` 事件提取 token 使用量
fn convert_sse_event(event: &super::super::sse::SseEvent) -> StreamEvent {
    match event {
        super::super::sse::SseEvent::ContentBlockDelta { delta, .. } => StreamEvent::TextDelta {
            text: delta.text.clone(),
        },
        super::super::sse::SseEvent::MessageDelta { usage, .. } => {
            // 🔥 提取 token 使用量
            let (input_tokens, output_tokens) = if let Some(usage) = usage {
                (usage.input_tokens, usage.output_tokens)
            } else {
                (0, 0)
            };
            StreamEvent::MessageDone {
                input_tokens,
                output_tokens,
            }
        }
        super::super::sse::SseEvent::MessageStop => {
            // 兼容旧格式：如果没有 MessageDelta，返回 0
            StreamEvent::MessageDone {
                input_tokens: 0,
                output_tokens: 0,
            }
        }
        _ => StreamEvent::TextDelta {
            text: String::new(),
        },
    }
}
