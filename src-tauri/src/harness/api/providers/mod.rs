//! API 提供商实现

pub mod anthropic;
pub mod deepseek;
pub mod openai;

#[cfg(test)]
mod tests;

pub use anthropic::AnthropicClient;
pub use deepseek::DeepSeekClient;
pub use openai::OpenAIClient;

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
    ]
}
