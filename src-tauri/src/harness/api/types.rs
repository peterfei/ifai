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
    pub temperature: Option<f32>,
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
    /// 自定义供应商（使用 OpenAI 兼容 API）
    Custom { name: String },
}

// 为 Copy trait 实现特殊处理（Custom 不能是 Copy）
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AiProviderType {
    Anthropic,
    DeepSeek,
    OpenAI,
    Custom,
}

impl From<AiProvider> for AiProviderType {
    fn from(provider: AiProvider) -> Self {
        match provider {
            AiProvider::Anthropic => AiProviderType::Anthropic,
            AiProvider::DeepSeek => AiProviderType::DeepSeek,
            AiProvider::OpenAI => AiProviderType::OpenAI,
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
                    Err(format!("Unknown provider: {}. Supported: anthropic, deepseek, openai, custom[:name]", s))
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
