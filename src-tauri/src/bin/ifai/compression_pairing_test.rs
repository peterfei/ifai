//! 🔥 压缩后消息配对完整性测试
//!
//! 验证压缩后的消息序列符合 DeepSeek API 要求：
//! - 每个 tool 消息前面必须有对应的 assistant[tool_calls] 消息

#[cfg(test)]
mod tests {
    use crate::session::{find_complete_conversation_start, perform_compaction_fallback};
    use ifainew_lib::harness::api::types::{Message, MessageContent, MessageRole, ToolCall, ToolCallFunction};

    /// 创建一个包含 tool-result 配对的消息列表
    fn create_test_messages() -> Vec<Message> {
        vec![
            // System 消息
            Message {
                role: MessageRole::System,
                content: MessageContent::Text("You are a helpful assistant.".to_string()),
                tool_calls: None,
                tool_call_id: None,
            },
            // User 消息
            Message {
                role: MessageRole::User,
                content: MessageContent::Text("请读取文件".to_string()),
                tool_calls: None,
                tool_call_id: None,
            },
            // Assistant 消息（带 tool_calls）
            Message {
                role: MessageRole::Assistant,
                content: MessageContent::Text("好的".to_string()),
                tool_calls: Some(vec![ToolCall {
                    id: "call_1".to_string(),
                    call_type: "function".to_string(),
                    function: ToolCallFunction {
                        name: "read_file".to_string(),
                        arguments: r#"{"path": "test.rs"}"#.to_string(),
                    },
                }]),
                tool_call_id: None,
            },
            // Tool 消息
            Message {
                role: MessageRole::Tool,
                content: MessageContent::Text("文件内容".to_string()),
                tool_calls: None,
                tool_call_id: Some("call_1".to_string()),
            },
            // Assistant 消息（带 tool_calls）
            Message {
                role: MessageRole::Assistant,
                content: MessageContent::Text("继续".to_string()),
                tool_calls: Some(vec![ToolCall {
                    id: "call_2".to_string(),
                    call_type: "function".to_string(),
                    function: ToolCallFunction {
                        name: "read_file".to_string(),
                        arguments: r#"{"path": "test2.rs"}"#.to_string(),
                    },
                }]),
                tool_call_id: None,
            },
            // Tool 消息
            Message {
                role: MessageRole::Tool,
                content: MessageContent::Text("文件内容2".to_string()),
                tool_calls: None,
                tool_call_id: Some("call_2".to_string()),
            },
        ]
    }

    #[test]
    fn test_find_complete_conversation_start() {
        let messages = create_test_messages();

        // 保留最后 3 条消息
        let start = find_complete_conversation_start(&messages, 3);

        // 最后 3 条应该是：
        // [3] Assistant[tool_calls]
        // [4] Tool
        // [5] Assistant[tool_calls]（如果保留 3 条）
        //
        // 但由于 [5] 后面没有对应的 tool，start 会往前找
        // 实际应该从 [3] 开始

        println!("start index = {}", start);

        // 验证：第一条不是 tool
        assert!(messages[start].role != MessageRole::Tool,
                "第一条消息不应该是 tool，实际是: {:?}", messages[start].role);
    }

    #[test]
    fn test_compaction_preserves_pairing() {
        let messages = create_test_messages();

        // 压缩到保留最后 3 条
        let result = perform_compaction_fallback(&messages, "", 3);

        println!("\n📊 压缩结果分析：");
        println!("  原始消息数: {}", messages.len());
        println!("  压缩后消息数: {}", result.len());

        // 验证：压缩后每个 tool 前面都有 assistant[tool_calls]
        let mut last_was_assistant_with_tool_calls = false;

        for (i, msg) in result.iter().enumerate() {
            // 跳过 system 消息
            if msg.role == MessageRole::System {
                continue;
            }

            if msg.role == MessageRole::Tool {
                println!("  [{}] Tool: tool_call_id={:?}", i, msg.tool_call_id);
                // Tool 前面必须有 assistant[tool_calls]
                assert!(last_was_assistant_with_tool_calls,
                        "Tool 消息 [{}] 前面必须有 assistant[tool_calls]", i);
                last_was_assistant_with_tool_calls = false;
            } else if msg.role == MessageRole::Assistant {
                let has_tool_calls = msg.tool_calls.is_some() && msg.tool_calls.as_ref().map_or(false, |t| !t.is_empty());
                println!("  [{}] Assistant: has_tool_calls={}", i, has_tool_calls);
                last_was_assistant_with_tool_calls = has_tool_calls;
            } else {
                println!("  [{}] {:?}", i, msg.role);
                last_was_assistant_with_tool_calls = false;
            }
        }

        println!("\n✅ 所有 tool 消息前面都有 assistant[tool_calls]");
    }

    #[test]
    fn test_edge_case_only_tool_messages() {
        // 边界情况：如果最后几条都是 tool 消息
        let messages = vec![
            Message {
                role: MessageRole::System,
                content: MessageContent::Text("System".to_string()),
                tool_calls: None,
                tool_call_id: None,
            },
            Message {
                role: MessageRole::Assistant,
                content: MessageContent::Text("OK".to_string()),
                tool_calls: Some(vec![ToolCall {
                    id: "call_1".to_string(),
                    call_type: "function".to_string(),
                    function: ToolCallFunction {
                        name: "test".to_string(),
                        arguments: "{}".to_string(),
                    },
                }]),
                tool_call_id: None,
            },
            Message {
                role: MessageRole::Tool,
                content: MessageContent::Text("Result 1".to_string()),
                tool_calls: None,
                tool_call_id: Some("call_1".to_string()),
            },
            Message {
                role: MessageRole::Assistant,
                content: MessageContent::Text("OK2".to_string()),
                tool_calls: Some(vec![ToolCall {
                    id: "call_2".to_string(),
                    call_type: "function".to_string(),
                    function: ToolCallFunction {
                        name: "test".to_string(),
                        arguments: "{}".to_string(),
                    },
                }]),
                tool_call_id: None,
            },
            Message {
                role: MessageRole::Tool,
                content: MessageContent::Text("Result 2".to_string()),
                tool_calls: None,
                tool_call_id: Some("call_2".to_string()),
            },
        ];

        let result = perform_compaction_fallback(&messages, "", 2);

        println!("\n📊 边界测试：最后 2 条都是 tool");
        println!("  原始: {} 条", messages.len());
        println!("  压缩后: {} 条", result.len());

        // 验证：第一条不能是 tool
        let first_non_system = result.iter().find(|m| m.role != MessageRole::System).unwrap();
        assert!(first_non_system.role != MessageRole::Tool,
                "第一条非 system 消息不应该是 tool，实际是: {:?}", first_non_system.role);
    }
}
