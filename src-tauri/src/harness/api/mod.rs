//! API 客户端模块
//!
//! 统一的 AI API 客户端接口，支持多提供商和流式响应。

pub mod client;
pub mod client_factory;     // 🔥 元编程：HTTP客户端工厂
pub mod message_builder;    // 🔥 元编程：消息构建辅助
pub mod providers;
pub mod provider_metadata;  // 🏛️ 元编程：提供商元数据
pub mod format_adapter;     // 🏛️ 元编程：格式适配器
pub mod code_gen;           // 🏛️ 元编程：代码生成宏
pub mod generated_clients;  // 🏛️ 元编程：自动生成的客户端
pub mod metadata_client;    // 🏛️ 元编程：通用的元数据驱动客户端
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
pub use code_gen::parse_spec_from_yaml;  // 🏛️ 元编程
// 注意：generate_provider_client! 宏已通过 #[macro_export] 导出到 crate 根级别

// 🏛️ 元编程：导出自动生成的客户端
pub use generated_clients::{ZhipuOfficialClient, KimiOfficialClient, GeminiOfficialClient, OpenAIOfficialClient};

// 🏛️ 元编程：导出元数据驱动客户端
pub use metadata_client::{
    MetadataDrivenClient,
    OpenAIOfficialClient as OpenAIOfficialMetadataClient,
    ZhipuOfficialMetadataClient,
    KimiOfficialMetadataClient,
    GeminiOfficialMetadataClient,
    create_openai_client,
    create_zhipu_client,
    create_kimi_client,
    create_gemini_client,
};
pub use sse::{SseEvent, SseParser, SseError};
pub use streaming::{EventStream, StreamWrapper, callback_stream};
pub use event_stream::{StreamToEventStream, BatchEventStream};
pub use types::{AiProvider, ApiError, Message, MessageContent, MessageRole, ModelInfo, ProviderConfig, StreamEvent, StreamRequest};
