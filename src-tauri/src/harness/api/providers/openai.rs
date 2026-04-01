//! OpenAI API 客户端实现

use async_stream::stream;
use futures_core::Stream;
use futures_util::StreamExt;
use reqwest::Client as HttpClient;
use std::pin::Pin;

use super::super::client::ApiClient;
use super::super::sse::SseParser;
use super::super::types::{ApiError, ModelInfo, StreamEvent, StreamRequest};

pub struct OpenAIClient {
    http: HttpClient,
    api_key: String,
    base_url: String,
}

impl OpenAIClient {
    pub fn new(config: &super::super::types::ProviderConfig) -> Self {
        Self {
            http: HttpClient::new(),
            api_key: config.api_key.clone(),
            base_url: config
                .base_url
                .clone()
                .unwrap_or_else(|| "https://api.openai.com".to_string()),
        }
    }
}

#[async_trait::async_trait]
impl ApiClient for OpenAIClient {
    async fn stream(
        &self,
        request: StreamRequest,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<StreamEvent, ApiError>> + Send>>, ApiError> {
        // OpenAI 使用标准的 chat completions 格式
        let openai_request = serde_json::json!({
            "model": request.model,
            "messages": request.messages,
            "max_tokens": request.max_tokens,
            "temperature": request.temperature,
            "stream": true
        });

        let response = self
            .http
            .post(format!("{}/v1/chat/completions", self.base_url))
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
        let parser = SseParser::new();

        Ok(Box::pin(stream! {
            let mut parser = parser;

            for await chunk_result in byte_stream {
                match chunk_result {
                    Ok(chunk) => {
                        match parser.push(&chunk) {
                            Ok(events) => {
                                for event in events {
                                    yield Ok(convert_openai_event(&event));
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
                    yield Ok(convert_openai_event(&event));
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

/// 转换 OpenAI 格式的 SSE 事件为统一格式
fn convert_openai_event(event: &super::super::sse::SseEvent) -> StreamEvent {
    match event {
        super::super::sse::SseEvent::ContentBlockDelta { delta, .. } => {
            StreamEvent::TextDelta {
                text: delta.text.clone(),
            }
        }
        super::super::sse::SseEvent::MessageStop => StreamEvent::MessageDone {
            tokens_used: 0,
        },
        _ => StreamEvent::TextDelta {
            text: String::new(),
        },
    }
}
