//! API 提供商实现

pub mod anthropic;
pub mod custom;
pub mod deepseek;
pub mod kimi;
pub mod openai;
pub mod openai_format;
pub mod zhipu;

#[cfg(test)]
mod tests;

pub use anthropic::AnthropicClient;
pub use custom::CustomClient;
pub use deepseek::DeepSeekClient;
pub use kimi::KimiClient;
pub use openai::OpenAIClient;
pub use zhipu::ZhipuClient;

/// 所有提供商支持的模型
pub fn get_all_supported_models() -> Vec<crate::harness::api::types::ModelInfo> {
    vec![
        // Anthropic 模型
        crate::harness::api::types::ModelInfo {
            id: "claude-sonnet-4-20250514".to_string(),
            name: "Claude Sonnet 4".to_string(),
            context_tokens: 200000,
        },
        crate::harness::api::types::ModelInfo {
            id: "claude-opus-4-20250514".to_string(),
            name: "Claude Opus 4".to_string(),
            context_tokens: 200000,
        },
        // DeepSeek 模型
        crate::harness::api::types::ModelInfo {
            id: "deepseek-chat".to_string(),
            name: "DeepSeek Chat".to_string(),
            context_tokens: 128000,
        },
        // OpenAI 模型
        crate::harness::api::types::ModelInfo {
            id: "gpt-4o".to_string(),
            name: "GPT-4o".to_string(),
            context_tokens: 128000,
        },
        crate::harness::api::types::ModelInfo {
            id: "gpt-4o-mini".to_string(),
            name: "GPT-4o Mini".to_string(),
            context_tokens: 128000,
        },
        // 智谱 AI 模型
        crate::harness::api::types::ModelInfo {
            id: "glm-4.7".to_string(),
            name: "GLM-4.7".to_string(),
            context_tokens: 128000,
        },
        crate::harness::api::types::ModelInfo {
            id: "glm-4.7-flash".to_string(),
            name: "GLM-4.7 Flash".to_string(),
            context_tokens: 128000,
        },
        crate::harness::api::types::ModelInfo {
            id: "glm-4.6".to_string(),
            name: "GLM-4.6".to_string(),
            context_tokens: 128000,
        },
        crate::harness::api::types::ModelInfo {
            id: "glm-4-plus".to_string(),
            name: "GLM-4 Plus".to_string(),
            context_tokens: 128000,
        },
    ]
}
