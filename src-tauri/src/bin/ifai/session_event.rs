//! Session Event - 事件驱动持久化的核心数据结构
//!
//! 🎯 设计目标：
//! - 零拷贝序列化（使用 serde）
//! - 类型安全的事件枚举
//! - 自动生成 JSONL 格式

use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

/// 🔥 会话事件类型定义
///
/// 每个事件代表会话中的一个关键操作，用于增量持久化
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum SessionEvent {
    /// 用户发送消息
    UserMessage {
        content: String,
        #[serde(default)]
        metadata: EventMetadata,
    },

    /// AI 响应内容块（流式）
    AIResponseChunk {
        content: String,
        #[serde(default)]
        metadata: EventMetadata,
    },

    /// 工具调用
    ToolCall {
        tool: String,
        args: serde_json::Value,
        #[serde(default)]
        metadata: EventMetadata,
    },

    /// 工具调用结果
    ToolResult {
        tool: String,
        result: serde_json::Value,
        #[serde(default)]
        metadata: EventMetadata,
    },

    /// 线程切换
    ThreadSwitch {
        from_thread_id: String,
        to_thread_id: String,
        #[serde(default)]
        metadata: EventMetadata,
    },

    /// 流式会话完成
    StreamFinished {
        #[serde(default)]
        metadata: EventMetadata,
    },
}

/// 🔥 事件元数据
///
/// 包含时间戳、序列号等通用信息
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EventMetadata {
    /// 事件时间戳（Unix 毫秒）
    pub timestamp: u64,

    /// 事件序列号（单调递增）
    pub sequence: u64,

    /// 线程 ID
    #[serde(default = "default_thread_id")]
    pub thread_id: String,
}

impl Default for EventMetadata {
    fn default() -> Self {
        Self {
            timestamp: now_millis(),
            sequence: 0,
            thread_id: default_thread_id(),
        }
    }
}

impl SessionEvent {
    /// 🔥 将事件转换为 JSONL 格式（单行 JSON）
    pub fn to_jsonl(&self) -> Result<String, serde_json::Error> {
        let json = serde_json::to_string(self)?;
        Ok(json)
    }

    /// 🔥 从 JSONL 格式解析事件
    pub fn from_jsonl(line: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(line)
    }

    /// 🔥 获取事件元数据
    pub fn metadata(&self) -> &EventMetadata {
        match self {
            SessionEvent::UserMessage { metadata, .. }
            | SessionEvent::AIResponseChunk { metadata, .. }
            | SessionEvent::ToolCall { metadata, .. }
            | SessionEvent::ToolResult { metadata, .. }
            | SessionEvent::ThreadSwitch { metadata, .. }
            | SessionEvent::StreamFinished { metadata } => metadata,
        }
    }

    /// 🔥 获取可变元数据
    pub fn metadata_mut(&mut self) -> &mut EventMetadata {
        match self {
            SessionEvent::UserMessage { metadata, .. }
            | SessionEvent::AIResponseChunk { metadata, .. }
            | SessionEvent::ToolCall { metadata, .. }
            | SessionEvent::ToolResult { metadata, .. }
            | SessionEvent::ThreadSwitch { metadata, .. }
            | SessionEvent::StreamFinished { metadata } => metadata,
        }
    }

    /// 🔥 设置事件序列号
    pub fn with_sequence(mut self, sequence: u64) -> Self {
        self.metadata_mut().sequence = sequence;
        self
    }

    /// 🔥 设置线程 ID
    pub fn with_thread_id(mut self, thread_id: String) -> Self {
        self.metadata_mut().thread_id = thread_id;
        self
    }
}

/// 🔥 获取当前时间戳（毫秒）
fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
}

/// 🔥 默认线程 ID
fn default_thread_id() -> String {
    "primary".to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_user_message_serialization() {
        let event = SessionEvent::UserMessage {
            content: "测试消息".to_string(),
            metadata: EventMetadata::default(),
        };

        let jsonl = event.to_jsonl().unwrap();
        assert!(jsonl.contains("测试消息"));
        assert!(jsonl.contains("UserMessage"));
    }

    #[test]
    fn test_event_roundtrip() {
        let original = SessionEvent::AIResponseChunk {
            content: "AI 回复".to_string(),
            metadata: EventMetadata {
                timestamp: 12345,
                sequence: 1,
                thread_id: "thread-1".to_string(),
            },
        };

        let jsonl = original.to_jsonl().unwrap();
        let parsed = SessionEvent::from_jsonl(&jsonl).unwrap();

        assert_eq!(original, parsed);
    }

    #[test]
    fn test_tool_call_serialization() {
        let event = SessionEvent::ToolCall {
            tool: "bash".to_string(),
            args: serde_json::json!({"command": "ls"}),
            metadata: EventMetadata::default(),
        };

        let jsonl = event.to_jsonl().unwrap();
        assert!(jsonl.contains("bash"));
        assert!(jsonl.contains("ls"));
    }

    #[test]
    fn test_with_sequence() {
        let event = SessionEvent::UserMessage {
            content: "消息".to_string(),
            metadata: EventMetadata::default(),
        };

        let event = event.with_sequence(42);
        assert_eq!(event.metadata().sequence, 42);
    }

    #[test]
    fn test_with_thread_id() {
        let event = SessionEvent::UserMessage {
            content: "消息".to_string(),
            metadata: EventMetadata::default(),
        };

        let event = event.with_thread_id("custom-thread".to_string());
        assert_eq!(event.metadata().thread_id, "custom-thread");
    }

    #[test]
    fn test_invalid_jsonl_deserialization() {
        let result = SessionEvent::from_jsonl("invalid json");
        assert!(result.is_err());
    }

    #[test]
    fn test_empty_content_serialization() {
        let event = SessionEvent::UserMessage {
            content: "".to_string(),
            metadata: EventMetadata::default(),
        };

        let jsonl = event.to_jsonl().unwrap();
        let parsed = SessionEvent::from_jsonl(&jsonl).unwrap();
        assert_eq!(parsed, event);
    }
}
