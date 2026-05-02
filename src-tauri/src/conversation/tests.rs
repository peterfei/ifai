#[cfg(test)]
mod tests {
    use super::super::*;
    use crate::core_traits::ai::{Content, Message};

    /**
     * 测试 token 计数功能
     */
    #[test]
    fn test_count_messages_tokens() {
        let messages = vec![
            Message {
                role: "system".to_string(),
                content: Content::Text("You are a helpful assistant.".to_string()),
                tool_calls: None,
                tool_call_id: None,
            },
            Message {
                role: "user".to_string(),
                content: Content::Text("Hello, how are you?".to_string()),
                tool_calls: None,
                tool_call_id: None,
            },
            Message {
                role: "assistant".to_string(),
                content: Content::Text("I am doing well, thank you!".to_string()),
                tool_calls: None,
                tool_call_id: None,
            },
        ];

        let token_count = token_counter::count_messages_tokens(&messages);

        // 验证返回值
        assert!(token_count > 0, "Token count should be greater than 0");
        assert!(
            token_count < 100,
            "Token count should be less than 100 for short messages"
        );
    }

    /**
     * 测试总结触发条件 - 短对话
     */
    #[tokio::test]
    async fn test_should_summarize_short_conversation() {
        let short_conversation = vec![
            Message {
                role: "system".to_string(),
                content: Content::Text("You are a helpful assistant.".to_string()),
                tool_calls: None,
                tool_call_id: None,
            },
            Message {
                role: "user".to_string(),
                content: Content::Text("Hello!".to_string()),
                tool_calls: None,
                tool_call_id: None,
            },
            Message {
                role: "assistant".to_string(),
                content: Content::Text("Hi there!".to_string()),
                tool_calls: None,
                tool_call_id: None,
            },
        ];

        let should_summarize = should_summarize(&short_conversation).await;
        assert!(
            !should_summarize,
            "Short conversations should not trigger summarization"
        );
    }

    /**
     * 测试总结触发条件 - 消息数量阈值
     */
    #[tokio::test]
    async fn test_should_summarize_message_count_threshold() {
        let mut long_conversation = Vec::new();
        long_conversation.push(Message {
            role: "system".to_string(),
            content: Content::Text("You are a helpful assistant.".to_string()),
            tool_calls: None,
            tool_call_id: None,
        });

        // 创建 101 条消息
        for i in 0..100 {
            long_conversation.push(Message {
                role: if i % 2 == 0 { "user" } else { "assistant" }.to_string(),
                content: Content::Text(format!("Message {}: Some content here.", i)),
                tool_calls: None,
                tool_call_id: None,
            });
        }

        let should_summarize = should_summarize(&long_conversation).await;
        assert!(
            should_summarize,
            "Conversations with >100 messages should trigger summarization"
        );
    }

    /**
     * 测试消息压缩功能
     */
    #[tokio::test]
    async fn test_compact_conversation() {
        let mut messages = Vec::new();
        messages.push(Message {
            role: "system".to_string(),
            content: Content::Text("You are a helpful assistant.".to_string()),
            tool_calls: None,
            tool_call_id: None,
        });

        // 添加 20 条消息
        for i in 0..20 {
            messages.push(Message {
                role: if i % 2 == 0 { "user" } else { "assistant" }.to_string(),
                content: Content::Text(format!("Message {}", i)),
                tool_calls: None,
                tool_call_id: None,
            });
        }

        let summary = "This is a test summary.";
        let keep_last_n = 5;

        let compacted = compact_conversation(messages, summary.to_string(), keep_last_n)
            .await
            .unwrap();

        // 验证压缩后的消息数量
        assert!(
            compacted.len() < 20,
            "Compacted conversation should have fewer messages"
        );

        // 验证保留了系统提示词
        assert_eq!(compacted[0].role, "system");

        // 验证包含总结消息
        let has_summary = compacted.iter().any(|msg| {
            if let Content::Text(text) = &msg.content {
                text.contains("test summary")
            } else {
                false
            }
        });
        assert!(
            has_summary,
            "Compacted conversation should contain the summary"
        );
    }
}
