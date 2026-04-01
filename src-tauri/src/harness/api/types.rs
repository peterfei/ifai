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
}

/// 消息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub role: MessageRole,
    pub content: String,
}

/// 消息角色
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MessageRole {
    User,
    Assistant,
    System,
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
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AiProvider {
    Anthropic,
    DeepSeek,
    OpenAI,
}

impl std::str::FromStr for AiProvider {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "anthropic" => Ok(AiProvider::Anthropic),
            "deepseek" => Ok(AiProvider::DeepSeek),
            "openai" => Ok(AiProvider::OpenAI),
            _ => Err(format!("Unknown provider: {}", s)),
        }
    }
}

/// 提供商配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderConfig {
    pub api_key: String,
    pub base_url: Option<String>,
    pub organization: Option<String>,
}
