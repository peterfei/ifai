//! API 客户端 trait 定义
//!
//! 定义统一的 API 客户端接口，支持多提供商。

use async_stream::stream;
use futures_core::Stream;
use futures_util::StreamExt;
use std::pin::Pin;

use super::sse::SseParser;
use super::types::{ApiError, StreamEvent, StreamRequest};

/// API 客户端 trait
#[async_trait::async_trait]
pub trait ApiClient: Send + Sync {
    /// 发送流式请求
    async fn stream(
        &self,
        request: StreamRequest,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<StreamEvent, ApiError>> + Send>>, ApiError>;

    /// 获取模型列表
    async fn list_models(&self) -> Result<Vec<crate::harness::api::types::ModelInfo>, ApiError>;

    /// 估算 Token 数量
    fn estimate_tokens(&self, content: &str) -> usize;
}

/// API 客户端工厂
pub struct ApiClientFactory;

impl ApiClientFactory {
    /// 创建提供商客户端
    pub fn create_provider(
        provider: crate::harness::api::types::AiProvider,
        config: &crate::harness::api::types::ProviderConfig,
    ) -> Result<Box<dyn ApiClient>, String> {
        match provider {
            crate::harness::api::types::AiProvider::Anthropic => {
                Ok(Box::new(super::providers::anthropic::AnthropicClient::new(config)))
            }
            crate::harness::api::types::AiProvider::DeepSeek => {
                Ok(Box::new(super::providers::deepseek::DeepSeekClient::new(config)))
            }
            crate::harness::api::types::AiProvider::OpenAI => {
                Ok(Box::new(super::providers::openai::OpenAIClient::new(config)))
            }
            crate::harness::api::types::AiProvider::Zhipu => {
                Ok(Box::new(super::providers::zhipu::ZhipuClient::new(config)))
            }
            crate::harness::api::types::AiProvider::Kimi => {
                // 使用元数据驱动的 Kimi 客户端
                Ok(Box::new(super::metadata_client::create_kimi_client(&config.api_key)))
            }
            crate::harness::api::types::AiProvider::Gemini => {
                // 使用元数据驱动的 Gemini 客户端
                Ok(Box::new(super::metadata_client::create_gemini_client(&config.api_key)))
            }
            crate::harness::api::types::AiProvider::Custom { .. } => {
                // 创建自定义供应商客户端
                super::providers::CustomClient::new(&provider, config)
                    .map(|client| Box::new(client) as Box<dyn ApiClient>)
            }
        }
    }
}
