//! OpenAI API 客户端实现

use async_stream::stream;
use futures_core::Stream;
use futures_util::StreamExt;
use reqwest::Client as HttpClient;
use std::pin::Pin;

use super::super::client::ApiClient;
use super::super::client_factory::{create_standard_client, normalize_base_url};
use super::super::message_builder::{MessageBuilder, MultimodalDetector};
use super::super::provider_metadata; // 🔥 元编程：从元数据获取模型列表
use super::super::types::{ApiError, Message, MessageRole, ModelInfo, StreamEvent, StreamRequest};
use super::openai_format::parse_openai_frame;

pub struct OpenAIClient {
    http: HttpClient,
    api_key: String,
    base_url: String,
}

impl OpenAIClient {
    pub fn new(config: &super::super::types::ProviderConfig) -> Self {
        // 🔥 使用工厂函数替代手动实现
        let base_url = normalize_base_url(
            &config.base_url,
            "https://api.openai.com/v1/chat/completions",
        );
        let http = create_standard_client(None::<super::super::client_factory::HttpClientConfig>)
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
        // 🔥 使用 MessageBuilder trait 消除重复代码
        let messages = request.build_messages_with_system();

        // 🔥 使用 MultimodalDetector trait 检测多模态内容
        let has_multimodal = request.has_multimodal();

        // 🔥 FIX P0: 模型名称自动选择（多模态 → 视觉模型）
        let model_name = if has_multimodal {
            let original_model = request.model.to_lowercase();
            // 检查是否已经是视觉模型
            if is_vision_model(&original_model) {
                request.model.clone()
            } else {
                // 自动切换到 GPT-4o（支持多模态）
                "gpt-4o".to_string()
            }
        } else {
            request.model.clone()
        };

        // OpenAI 使用标准的 chat completions 格式
        let mut openai_request = serde_json::json!({
            "model": model_name,
            "messages": messages,
            "max_tokens": request.max_tokens,
            "temperature": request.temperature,
            "stream": true
        });

        // 添加 tools 参数（如果存在）
        if let Some(tools) = request.tools {
            if let Some(obj) = openai_request.as_object_mut() {
                obj.insert("tools".to_string(), serde_json::Value::Array(tools));
            }
        }

        let response = self
            .http
            .post(&self.base_url)
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
            // 🔍 详细日志：记录 400 等错误时的完整请求信息
            super::log_http_error_detail("OpenAI", &openai_request, status.as_u16(), &message);
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
        // 🔥 元编程：从配置文件读取模型列表，而非硬编码
        provider_metadata::get_models_for_provider("openai-official")
            .ok_or_else(|| ApiError::Network("OpenAI provider metadata not found".to_string()))
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

/// 🔥 转换 OpenAI 格式的数据为统一事件（支持 usage 追踪）
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
            // 🔥 提取 token 使用量
            let (input_tokens, output_tokens) = if let Some(usage) = &data.usage {
                (usage.prompt_tokens, usage.completion_tokens)
            } else {
                (0, 0)
            };
            return Some(StreamEvent::MessageDone {
                input_tokens,
                output_tokens,
                finish_reason: choice.finish_reason.clone(),
            });
        }
    }

    None
}

/// 🔥 检查模型是否支持视觉能力
///
/// OpenAI 支持多模态的模型：
/// - gpt-4o 系列
/// - gpt-4-vision 系列
fn is_vision_model(model: &str) -> bool {
    let model_lower = model.to_lowercase();
    model_lower.contains("gpt-4o") || model_lower.contains("gpt-4-vision")
}
