//! 🔥 元编程：消息构建辅助方法
//!
//! 消除提供商客户端中重复的消息构建逻辑

use crate::harness::api::types::{Message, MessageContent, MessageRole, StreamRequest};

/// 🔥 消息构建trait - 统一消息组装逻辑
///
/// 消除以下重复代码：
/// - zhipu.rs:60-69
/// - openai.rs:60-73
/// - deepseek.rs:62-76
pub trait MessageBuilder {
    /// 从StreamRequest构建完整的消息列表（包含system prompt）
    ///
    /// 同时执行 validate：
    /// 1. 空 tool_calls 数组 → None（DeepSeek 等不允许空数组）
    /// 2. 连续 assistant 消息合并（API 不允许连续两条 assistant）
    fn build_messages_with_system(&self) -> Vec<Message> {
        let mut raw = Vec::new();

        // 添加system消息（如果存在）
        if let Some(system) = &self.system() {
            raw.push(Message {
                role: MessageRole::System,
                content: system.clone().into(),
                tool_calls: None,
                tool_call_id: None,
            });
        }

        // 收集原始消息
        raw.extend(self.messages().iter().cloned());

        // === Validate: 清洗 + 合并 ===
        let mut messages: Vec<Message> = Vec::with_capacity(raw.len());

        for msg in raw {
            let cleaned = Message {
                // FIX 1: 空 tool_calls 数组 → None
                tool_calls: match &msg.tool_calls {
                    Some(calls) if calls.is_empty() => None,
                    other => other.clone(),
                },
                ..msg
            };

            // FIX 2: 连续 assistant 消息合并
            // 场景：[assistant(纯文本)] + [assistant(tool_calls)] → 合并为一条
            // API 不允许连续两条 assistant 消息
            if cleaned.role == MessageRole::Assistant {
                if let Some(last) = messages.last_mut() {
                    if last.role == MessageRole::Assistant {
                        // 合并：后者的 tool_calls 优先（非空的话）
                        if let Some(tc) = &cleaned.tool_calls {
                            if !tc.is_empty() {
                                last.tool_calls = Some(tc.clone());
                            }
                        }
                        // 合并：后者的 content 追加（如果前者为空）
                        match &last.content {
                            MessageContent::Text(t) if t.is_empty() => {
                                last.content = cleaned.content.clone();
                            }
                            _ => {}
                        }
                        continue; // 跳过这条，已合并到上一条
                    }
                }
            }

            messages.push(cleaned);
        }

        messages
    }

    /// 获取system prompt
    fn system(&self) -> Option<String>;

    /// 获取消息列表
    fn messages(&self) -> &[Message];
}

/// 🔥 为StreamRequest实现MessageBuilder trait
impl MessageBuilder for StreamRequest {
    fn system(&self) -> Option<String> {
        self.system.clone()
    }

    fn messages(&self) -> &[Message] {
        &self.messages
    }
}

/// 🔥 多模态内容检测器
pub trait MultimodalDetector {
    /// 检查消息列表是否包含多模态内容
    fn has_multimodal(&self) -> bool {
        self.messages().iter().any(|m| m.content.is_multimodal())
    }

    fn messages(&self) -> &[Message];
}

/// 🔥 为StreamRequest实现MultimodalDetector trait
impl MultimodalDetector for StreamRequest {
    fn messages(&self) -> &[Message] {
        &self.messages
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_build_messages_with_system() {
        let request = StreamRequest {
            model: "test-model".to_string(),
            messages: vec![Message {
                role: MessageRole::User,
                content: "Hello".to_string().into(),
                tool_calls: None,
                tool_call_id: None,
            }],
            max_tokens: 1000,
            system: Some("You are helpful".to_string()),
            temperature: Some(0.7),
            tools: None,
            stream: true,
        };

        let messages = request.build_messages_with_system();

        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0].role, MessageRole::System);
        assert_eq!(messages[1].role, MessageRole::User);
    }

    #[test]
    fn test_build_messages_without_system() {
        let request = StreamRequest {
            model: "test-model".to_string(),
            messages: vec![Message {
                role: MessageRole::User,
                content: "Hello".to_string().into(),
                tool_calls: None,
                tool_call_id: None,
            }],
            max_tokens: 1000,
            system: None,
            temperature: Some(0.7),
            tools: None,
            stream: true,
        };

        let messages = request.build_messages_with_system();

        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0].role, MessageRole::User);
    }

    #[test]
    fn test_has_multimodal() {
        let request = StreamRequest {
            model: "test-model".to_string(),
            messages: vec![Message {
                role: MessageRole::User,
                content: MessageContent::Text("Hello".to_string()),
                tool_calls: None,
                tool_call_id: None,
            }],
            max_tokens: 1000,
            system: None,
            temperature: Some(0.7),
            tools: None,
            stream: true,
        };

        assert!(!request.has_multimodal());
    }

    #[test]
    fn test_has_multimodal_true() {
        use crate::harness::api::types::{ContentPart, ImageUrl};

        let request = StreamRequest {
            model: "test-model".to_string(),
            messages: vec![Message {
                role: MessageRole::User,
                content: MessageContent::MultiModal(vec![
                    ContentPart {
                        part_type: "text".to_string(),
                        text: Some("Hello".to_string()),
                        image_url: None,
                    },
                    ContentPart {
                        part_type: "image_url".to_string(),
                        text: None,
                        image_url: Some(ImageUrl {
                            url: "data:image/png;base64,abc".to_string(),
                        }),
                    },
                ]),
                tool_calls: None,
                tool_call_id: None,
            }],
            max_tokens: 1000,
            system: None,
            temperature: Some(0.7),
            tools: None,
            stream: true,
        };

        assert!(request.has_multimodal());
    }
}
