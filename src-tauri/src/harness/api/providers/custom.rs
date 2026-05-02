//! 自定义供应商客户端（OpenAI 兼容）
//!
//! 支持任何使用 OpenAI API 格式的自定义端点，如：
//! - 本地部署的模型（Ollama, LocalAI, text-generation-webui）
//! - 第三方 OpenAI 兼容服务
//! - 私有部署的模型服务

use async_stream::stream;
use futures_core::Stream;
use futures_util::StreamExt;
use reqwest::Client as HttpClient;
use std::pin::Pin;

use super::super::client::ApiClient;
use super::super::sse::SseParser;
use super::super::types::{
    AiProvider, ApiError, ModelInfo, ProviderConfig, StreamEvent, StreamRequest,
};

pub struct CustomClient {
    http: HttpClient,
    api_key: String,
    base_url: String,
    provider_name: String,
}

impl CustomClient {
    pub fn new(provider: &AiProvider, config: &ProviderConfig) -> Result<Self, String> {
        let provider_name = provider.name().to_string();

        // 自定义供应商必须提供 base_url
        let base_url = config.base_url.clone().ok_or_else(|| {
            format!(
                "Custom provider '{}' requires base_url to be specified",
                provider_name
            )
        })?;

        // 验证 base_url 格式
        let base_url = if base_url.starts_with("http://") || base_url.starts_with("https://") {
            base_url
        } else {
            return Err(format!(
                "Custom provider '{}' base_url must start with http:// or https://",
                provider_name
            ));
        };

        // 移除尾部斜杠
        let base_url = base_url.trim_end_matches('/');

        Ok(Self {
            http: HttpClient::new(),
            api_key: config.api_key.clone(),
            base_url: base_url.to_string(),
            provider_name,
        })
    }

    /// 获取供应商名称
    pub fn provider_name(&self) -> &str {
        &self.provider_name
    }

    /// 获取基础 URL
    pub fn base_url(&self) -> &str {
        &self.base_url
    }
}

#[async_trait::async_trait]
impl ApiClient for CustomClient {
    async fn stream(
        &self,
        request: StreamRequest,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<StreamEvent, ApiError>> + Send>>, ApiError> {
        // 使用 OpenAI 兼容的请求格式
        let custom_request = serde_json::json!({
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
            .json(&custom_request)
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
                                    yield Ok(convert_custom_event(&event));
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
                    yield Ok(convert_custom_event(&event));
                }
            }
        }))
    }

    async fn list_models(&self) -> Result<Vec<ModelInfo>, ApiError> {
        // 自定义供应商通常不支持模型列表端点
        // 返回一个通用的模型信息
        Ok(vec![ModelInfo {
            id: "custom-model".to_string(),
            name: format!("{} Model", self.provider_name),
            context_tokens: 128000, // 默认值
        }])
    }

    fn estimate_tokens(&self, content: &str) -> usize {
        // 使用通用的 Token 估算
        let chinese_chars = content.chars().filter(|c| is_chinese(*c)).count();
        let other_chars = content.len() - chinese_chars;
        chinese_chars / 2 + other_chars / 4
    }
}

fn is_chinese(c: char) -> bool {
    matches!(c as u32, 0x4E00..=0x9FFF)
}

/// 🔥 转换自定义供应商的 SSE 事件为统一格式（支持 usage 追踪）
fn convert_custom_event(event: &super::super::sse::SseEvent) -> StreamEvent {
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

/// 预定义的常见本地部署配置
impl CustomClient {
    /// Ollama 本地部署
    pub fn ollama(api_key: String) -> Self {
        Self {
            http: HttpClient::new(),
            api_key,
            base_url: "http://localhost:11434".to_string(),
            provider_name: "Ollama".to_string(),
        }
    }

    /// LocalAI 本地部署
    pub fn localai(base_url: String, api_key: String) -> Result<Self, String> {
        let config = ProviderConfig {
            api_key,
            base_url: Some(base_url),
            organization: None,
        };
        Self::new(
            &AiProvider::Custom {
                name: "LocalAI".to_string(),
            },
            &config,
        )
    }

    /// text-generation-webui（Oobabooga）
    pub fn oobabooga(base_url: String, api_key: String) -> Result<Self, String> {
        let config = ProviderConfig {
            api_key,
            base_url: Some(base_url),
            organization: None,
        };
        Self::new(
            &AiProvider::Custom {
                name: "Oobabooga".to_string(),
            },
            &config,
        )
    }
}
