//! API 客户端模块
//!
//! 统一的 AI API 客户端接口，支持多提供商和流式响应。

pub mod client;
pub mod providers;
pub mod provider_metadata;  // 🏛️ 元编程：提供商元数据
pub mod format_adapter;     // 🏛️ 元编程：格式适配器
pub mod sse;
pub mod streaming;
pub mod event_stream;
pub mod types;

#[cfg(test)]
mod tests;

pub use client::{ApiClient, ApiClientFactory};
pub use providers::anthropic::AnthropicClient;
pub use providers::{DeepSeekClient, OpenAIClient};
pub use provider_metadata::{
    ProviderSpec, ProviderMetadata, ApiSpec, AuthSpec, RequestFormat, ResponseFormat, ModelSpec,
    get_all_provider_specs, get_provider_spec, get_all_models_from_specs,  // 🏛️ 元编程
};
pub use format_adapter::{FormatAdapter, OpenAIFormatAdapter, GeminiFormatAdapter};  // 🏛️ 元编程
pub use sse::{SseEvent, SseParser, SseError};
pub use streaming::{EventStream, StreamWrapper, callback_stream};
pub use event_stream::{StreamToEventStream, BatchEventStream};
pub use types::{AiProvider, ApiError, Message, MessageRole, ModelInfo, ProviderConfig, StreamEvent, StreamRequest};
