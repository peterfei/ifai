//! Session Snapshot - 会话快照管理
//!
//! 🎯 设计目标：
//! - 从 SessionEvent 重构会话状态
//! - 序列化/反序列化会话快照
//! - 快照与增量日志的合并

use crate::session_event::SessionEvent;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// 🔥 会话快照
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionSnapshot {
    pub session_id: String,
    pub timestamp: u64,
    pub message_count: usize,
    pub messages: Vec<SessionMessage>,
}

/// 🔥 会话消息（简化版本）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionMessage {
    pub role: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
}

/// 🔥 工具调用（简化版本）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    #[serde(rename = "type")]
    pub call_type: String,
    pub function: ToolCallFunction,
}

/// 🔥 工具调用函数
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCallFunction {
    pub name: String,
    pub arguments: String,
}

/// 🔥 从事件序列重构会话快照
impl SessionSnapshot {
    /// 🔥 从事件列表构建会话快照
    pub fn from_events(session_id: String, events: &[SessionEvent]) -> Self {
        let mut messages = Vec::new();
        let mut pending_tool_calls: Vec<ToolCall> = Vec::new();

        for event in events {
            match event {
                SessionEvent::UserMessage { content, .. } => {
                    // 用户消息
                    messages.push(SessionMessage {
                        role: "user".to_string(),
                        content: content.clone(),
                        tool_calls: None,
                        tool_call_id: None,
                    });
                }
                SessionEvent::AIResponseChunk { content, .. } => {
                    // AI 响应块（合并为完整消息）
                    if !content.is_empty() {
                        // 检查最后一条消息是否是 assistant，如果是则追加内容
                        if let Some(last_msg) = messages.last_mut() {
                            if last_msg.role == "assistant" && last_msg.tool_calls.is_none() {
                                last_msg.content.push_str(content);
                            } else {
                                // 创建新的 assistant 消息
                                messages.push(SessionMessage {
                                    role: "assistant".to_string(),
                                    content: content.clone(),
                                    tool_calls: None,
                                    tool_call_id: None,
                                });
                            }
                        } else {
                            messages.push(SessionMessage {
                                role: "assistant".to_string(),
                                content: content.clone(),
                                tool_calls: None,
                                tool_call_id: None,
                            });
                        }
                    }
                }
                SessionEvent::ToolCall { tool, args, .. } => {
                    // 工具调用（收集到 pending_tool_calls）
                    if let serde_json::Value::Object(args_obj) = args {
                        let args_str = serde_json::to_string(args_obj).unwrap_or_default();
                        pending_tool_calls.push(ToolCall {
                            id: format!("tool_{}", pending_tool_calls.len()),
                            call_type: "function".to_string(),
                            function: ToolCallFunction {
                                name: tool.clone(),
                                arguments: args_str,
                            },
                        });
                    }
                }
                SessionEvent::ToolResult { tool, result, .. } => {
                    // 工具结果（作为 tool 角色的消息）
                    if let Some(tool_calls) = &pending_tool_calls.last() {
                        let result_str = if let serde_json::Value::String(s) = result {
                            s.clone()
                        } else {
                            serde_json::to_string(result).unwrap_or_default()
                        };

                        messages.push(SessionMessage {
                            role: "tool".to_string(),
                            content: result_str,
                            tool_calls: None,
                            tool_call_id: Some(tool_calls.id.clone()),
                        });
                    }
                    pending_tool_calls.clear();
                }
                SessionEvent::ThreadSwitch { .. } => {
                    // 线程切换（忽略）
                }
                SessionEvent::StreamFinished { .. } => {
                    // 流式完成（如果有待处理的工具调用，添加到最后的 assistant 消息）
                    if !pending_tool_calls.is_empty() {
                        if let Some(last_msg) = messages.last_mut() {
                            if last_msg.role == "assistant" {
                                last_msg.tool_calls = Some(pending_tool_calls.clone());
                            }
                        }
                        pending_tool_calls.clear();
                    }
                }
            }
        }

        use std::time::{SystemTime, UNIX_EPOCH};
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();

        Self {
            session_id,
            timestamp,
            message_count: messages.len(),
            messages,
        }
    }

    /// 🔥 转换为 JSON Value（用于持久化）
    pub fn to_json_value(&self) -> serde_json::Value {
        serde_json::to_value(self).unwrap_or_default()
    }

    /// 🔥 从 JSON Value 恢复
    pub fn from_json_value(value: serde_json::Value) -> Result<Self, String> {
        serde_json::from_value(value)
            .map_err(|e| format!("Failed to parse snapshot: {}", e))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::session_event::EventMetadata;

    #[test]
    fn test_snapshot_from_user_message() {
        let events = vec![
            SessionEvent::UserMessage {
                content: "Hello".to_string(),
                metadata: EventMetadata::default(),
            }
        ];

        let snapshot = SessionSnapshot::from_events("test-session".to_string(), &events);
        assert_eq!(snapshot.messages.len(), 1);
        assert_eq!(snapshot.messages[0].role, "user");
        assert_eq!(snapshot.messages[0].content, "Hello");
    }

    #[test]
    fn test_snapshot_from_ai_response() {
        let events = vec![
            SessionEvent::AIResponseChunk {
                content: "Hello, ".to_string(),
                metadata: EventMetadata::default(),
            },
            SessionEvent::AIResponseChunk {
                content: "world!".to_string(),
                metadata: EventMetadata::default(),
            },
            SessionEvent::StreamFinished {
                metadata: EventMetadata::default(),
            }
        ];

        let snapshot = SessionSnapshot::from_events("test-session".to_string(), &events);
        assert_eq!(snapshot.messages.len(), 1);
        assert_eq!(snapshot.messages[0].role, "assistant");
        assert_eq!(snapshot.messages[0].content, "Hello, world!");
    }

    #[test]
    fn test_snapshot_serialization() {
        let snapshot = SessionSnapshot {
            session_id: "test-session".to_string(),
            timestamp: 1234567890,
            message_count: 1,
            messages: vec![
                SessionMessage {
                    role: "user".to_string(),
                    content: "Hello".to_string(),
                    tool_calls: None,
                    tool_call_id: None,
                }
            ],
        };

        let json = snapshot.to_json_value();
        assert_eq!(json["session_id"], "test-session");
        assert_eq!(json["timestamp"], 1234567890);

        let restored = SessionSnapshot::from_json_value(json).unwrap();
        assert_eq!(restored.session_id, "test-session");
        assert_eq!(restored.timestamp, 1234567890);
        assert_eq!(restored.messages.len(), 1);
    }
}
