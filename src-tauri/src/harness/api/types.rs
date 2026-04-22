//! 统一的 API 类型定义
//!
//! 定义 API 客户端和流式响应的通用类型。

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// 流式请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamRequest {
    pub model: String,
    pub messages: Vec<Message>,
    pub max_tokens: u32,
    pub system: Option<String>,
    /// 🔥 FIX P0: 使用 f64 避免 Zhipu API 1210 错误
    /// f32 无法精确表示 0.7，会变成 0.699999988079071
    pub temperature: Option<f64>,
    pub stream: bool,
    /// 🆕 P2: 工具定义列表
    pub tools: Option<Vec<serde_json::Value>>,
}

/// 消息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub role: MessageRole,
    pub content: String,
    /// 🆕 P3: 工具调用（仅用于 Assistant 消息）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCall>>,
    /// 🆕 P3: 工具调用 ID（仅用于 Tool 消息）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
}

/// 🆕 P3: 工具调用（OpenAI 格式）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    #[serde(rename = "type")]
    pub call_type: String,
    pub function: ToolCallFunction,
}

/// 🆕 P3: 工具调用函数
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCallFunction {
    pub name: String,
    pub arguments: String,
}

/// 消息角色
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MessageRole {
    User,
    Assistant,
    System,
    /// 🆕 P3: 工具结果消息
    Tool,
}

/// 流式事件（用于前后端通信）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum StreamEvent {
    MessageStart {
        message_id: String,
    },
    TextDelta {
        text: String,
    },
    ToolStart {
        tool_id: String,
        name: String,
        input: String,
    },
    ToolDone {
        tool_id: String,
        result: String,
    },
    MessageDone {
        tokens_used: u32,
    },
    Error {
        code: String,
        message: String,
    },
}

/// 模型信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub context_tokens: u32,
}

/// API 错误
#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    #[error("HTTP error: {status} - {message}")]
    HttpError {
        status: reqwest::StatusCode,
        message: String,
    },

    #[error("Network error: {0}")]
    Network(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON parsing error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("SSE parsing error: {0}")]
    Sse(String),
}

/// AI 提供商
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AiProvider {
    Anthropic,
    DeepSeek,
    OpenAI,
    /// 智谱 AI (Zhipu / GLM)
    Zhipu,
    /// 月之暗面 (Kimi / Moonshot)
    Kimi,
    /// Google Gemini
    Gemini,
    /// 自定义供应商（使用 OpenAI 兼容 API）
    Custom { name: String },
}

// 为 Copy trait 实现特殊处理（Custom 不能是 Copy）
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AiProviderType {
    Anthropic,
    DeepSeek,
    OpenAI,
    Zhipu,
    Kimi,
    Gemini,
    Custom,
}

impl From<AiProvider> for AiProviderType {
    fn from(provider: AiProvider) -> Self {
        match provider {
            AiProvider::Anthropic => AiProviderType::Anthropic,
            AiProvider::DeepSeek => AiProviderType::DeepSeek,
            AiProvider::OpenAI => AiProviderType::OpenAI,
            AiProvider::Zhipu => AiProviderType::Zhipu,
            AiProvider::Kimi => AiProviderType::Kimi,
            AiProvider::Gemini => AiProviderType::Gemini,
            AiProvider::Custom { .. } => AiProviderType::Custom,
        }
    }
}

impl std::str::FromStr for AiProvider {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let s_lower = s.to_lowercase();
        match s_lower.as_str() {
            "anthropic" => Ok(AiProvider::Anthropic),
            "deepseek" => Ok(AiProvider::DeepSeek),
            "openai" => Ok(AiProvider::OpenAI),
            "zhipu" | "zhipuai" | "glm" => Ok(AiProvider::Zhipu),
            "kimi" | "moonshot" => Ok(AiProvider::Kimi),
            "gemini" | "google" => Ok(AiProvider::Gemini),
            "custom" => Ok(AiProvider::Custom {
                name: "Custom".to_string(),
            }),
            _ => {
                // 尝试解析为自定义供应商 "custom:name"
                if let Some(name) = s.strip_prefix("custom:") {
                    Ok(AiProvider::Custom {
                        name: name.to_string(),
                    })
                } else {
                    Err(format!("Unknown provider: {}. Supported: anthropic, deepseek, openai, zhipu, kimi, gemini, custom[:name]", s))
                }
            }
        }
    }
}

impl AiProvider {
    /// 获取供应商显示名称
    pub fn name(&self) -> &str {
        match self {
            AiProvider::Anthropic => "Anthropic",
            AiProvider::DeepSeek => "DeepSeek",
            AiProvider::OpenAI => "OpenAI",
            AiProvider::Zhipu => "Zhipu AI",
            AiProvider::Kimi => "Kimi (Moonshot AI)",
            AiProvider::Gemini => "Google Gemini",
            AiProvider::Custom { name } => name.as_str(),
        }
    }

    /// 检查是否为自定义供应商
    pub fn is_custom(&self) -> bool {
        matches!(self, AiProvider::Custom { .. })
    }
}

/// 提供商配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderConfig {
    pub api_key: String,
    pub base_url: Option<String>,
    pub organization: Option<String>,
}

#[cfg(test)]
mod factory_integration_tests {
    use super::*;
    use std::str::FromStr;

    #[test]
    fn test_ai_provider_from_str_kimi() {
        // 测试 Kimi 提供商解析
        let kimi = AiProvider::from_str("kimi").unwrap();
        assert!(matches!(kimi, AiProvider::Kimi));
        assert_eq!(kimi.name(), "Kimi (Moonshot AI)");

        let moonshot = AiProvider::from_str("moonshot").unwrap();
        assert!(matches!(moonshot, AiProvider::Kimi));
    }

    #[test]
    fn test_ai_provider_from_str_gemini() {
        // 测试 Gemini 提供商解析
        let gemini = AiProvider::from_str("gemini").unwrap();
        assert!(matches!(gemini, AiProvider::Gemini));
        assert_eq!(gemini.name(), "Google Gemini");

        let google = AiProvider::from_str("google").unwrap();
        assert!(matches!(google, AiProvider::Gemini));
    }

    #[test]
    fn test_ai_provider_name_kimi() {
        let kimi = AiProvider::Kimi;
        assert_eq!(kimi.name(), "Kimi (Moonshot AI)");
    }

    #[test]
    fn test_ai_provider_name_gemini() {
        let gemini = AiProvider::Gemini;
        assert_eq!(gemini.name(), "Google Gemini");
    }

    #[test]
    fn test_ai_provider_from_str_deepseek_unchanged() {
        // 验证 DeepSeek 解析未被影响（向后兼容性测试）
        let deepseek = AiProvider::from_str("deepseek").unwrap();
        assert!(matches!(deepseek, AiProvider::DeepSeek));
        assert_eq!(deepseek.name(), "DeepSeek");
    }

    #[test]
    fn test_ai_provider_type_from_kimi() {
        let kimi = AiProvider::Kimi;
        let kimi_type = AiProviderType::from(kimi);
        assert!(matches!(kimi_type, AiProviderType::Kimi));
    }

    #[test]
    fn test_ai_provider_type_from_gemini() {
        let gemini = AiProvider::Gemini;
        let gemini_type = AiProviderType::from(gemini);
        assert!(matches!(gemini_type, AiProviderType::Gemini));
    }

    #[test]
    fn test_ai_provider_is_custom() {
        // 验证 Kimi 和 Gemini 不是自定义提供商
        let kimi = AiProvider::Kimi;
        assert!(!kimi.is_custom());

        let gemini = AiProvider::Gemini;
        assert!(!gemini.is_custom());

        let custom = AiProvider::Custom { name: "Test".to_string() };
        assert!(custom.is_custom());
    }
}
