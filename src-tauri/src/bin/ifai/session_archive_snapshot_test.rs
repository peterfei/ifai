// 🔥 Phase 4: 会话归档快照测试
//
// 使用 insta crate 进行快照测试，验证会话摘要格式
//
// 运行方式：
//   cd src-tauri && cargo test --bin ifai session_archive_snapshot -- --nocapture
//   第一次运行时使用: cargo insta accept（接受快照）
//
// 审查快照：
//   cargo insta review

#[cfg(test)]
mod tests {
    use crate::persistence::SessionPersistence;
    use ifainew_lib::harness::api::types::{
        Message, MessageContent, MessageRole, ToolCall, ToolCallFunction,
    };
    use std::fs;

    /// 设置测试环境
    fn setup() {
        let test_dir =
            std::env::temp_dir().join(format!("ifai_snapshot_test_{}", std::process::id()));
        fs::create_dir_all(&test_dir).ok();
        std::env::set_var("HOME", test_dir.to_str().unwrap());
    }

    /// 清理测试环境
    fn teardown() {
        let test_dir =
            std::env::temp_dir().join(format!("ifai_snapshot_test_{}", std::process::id()));
        fs::remove_dir_all(test_dir).ok();
    }

    // ========================================================================
    // 快照测试：基本会话摘要格式
    // ========================================================================

    #[test]
    fn snapshot_session_summary_basic() {
        setup();

        let persistence = SessionPersistence::new().expect("无法创建 SessionPersistence");

        let messages = vec![
            Message {
                role: MessageRole::User,
                content: MessageContent::Text("你好，请帮我写一个函数".to_string()),
                tool_calls: None,
                tool_call_id: None,
            },
            Message {
                role: MessageRole::Assistant,
                content: MessageContent::Text(
                    "好的，我可以帮你写函数。你想要什么功能的函数？".to_string(),
                ),
                tool_calls: None,
                tool_call_id: None,
            },
            Message {
                role: MessageRole::User,
                content: MessageContent::Text("一个加法函数，使用 Python".to_string()),
                tool_calls: None,
                tool_call_id: None,
            },
            Message {
                role: MessageRole::Assistant,
                content: MessageContent::Text(
                    "这是一个 Python 加法函数的示例：\n\ndef add(a, b):\n    return a + b\n\n# 使用示例\nresult = add(3, 5)\nprint(result)  # 输出: 8".to_string(),
                ),
                tool_calls: None,
                tool_call_id: None,
            },
        ];

        let filepath = persistence
            .save_session_summary(&messages, "openai-official", "gpt-4", 500, 800)
            .expect("归档失败");

        let content = fs::read_to_string(&filepath).expect("无法读取文件");

        // 使用 insta 进行快照测试，过滤动态时间戳
        let filtered_content = regex::Regex::new(r"\*\*Date\*\*:.*")
            .unwrap()
            .replace(&content, "**Date**: [DYNAMIC_TIMESTAMP]")
            .to_string();
        insta::assert_snapshot!(filtered_content);

        teardown();
    }

    // ========================================================================
    // 快照测试：空会话
    // ========================================================================

    #[test]
    fn snapshot_session_summary_empty() {
        setup();

        let persistence = SessionPersistence::new().expect("无法创建 SessionPersistence");

        let messages: Vec<Message> = vec![];

        let filepath = persistence
            .save_session_summary(&messages, "deepseek-official", "deepseek-chat", 0, 0)
            .expect("归档失败");

        let content = fs::read_to_string(&filepath).expect("无法读取文件");

        // 使用 insta 进行快照测试，过滤动态时间戳
        let filtered_content = regex::Regex::new(r"\*\*Date\*\*:.*")
            .unwrap()
            .replace(&content, "**Date**: [DYNAMIC_TIMESTAMP]")
            .to_string();
        insta::assert_snapshot!(filtered_content);

        teardown();
    }

    // ========================================================================
    // 快照测试：长消息截断
    // ========================================================================

    #[test]
    fn snapshot_session_summary_long_message() {
        setup();

        let persistence = SessionPersistence::new().expect("无法创建 SessionPersistence");

        // 创建一条超过 500 字符的长消息
        let long_message = "A".repeat(600);
        let messages = vec![Message {
            role: MessageRole::User,
            content: MessageContent::Text(long_message.clone()),
            tool_calls: None,
            tool_call_id: None,
        }];

        let filepath = persistence
            .save_session_summary(&messages, "openai-official", "gpt-4", 1000, 500)
            .expect("归档失败");

        let content = fs::read_to_string(&filepath).expect("无法读取文件");

        // 使用 insta 进行快照测试，过滤动态时间戳
        let filtered_content = regex::Regex::new(r"\*\*Date\*\*:.*")
            .unwrap()
            .replace(&content, "**Date**: [DYNAMIC_TIMESTAMP]")
            .to_string();
        insta::assert_snapshot!(filtered_content);

        teardown();
    }

    // ========================================================================
    // 快照测试：多个工具调用
    // ========================================================================

    #[test]
    fn snapshot_session_summary_with_tools() {
        setup();

        let persistence = SessionPersistence::new().expect("无法创建 SessionPersistence");

        let messages = vec![
            Message {
                role: MessageRole::User,
                content: MessageContent::Text("请帮我读取当前目录的文件".to_string()),
                tool_calls: None,
                tool_call_id: None,
            },
            Message {
                role: MessageRole::Assistant,
                content: MessageContent::Text("我来帮你读取当前目录的文件。".to_string()),
                tool_calls: Some(vec![ToolCall {
                    id: "call_1".to_string(),
                    call_type: "function".to_string(),
                    function: ToolCallFunction {
                        name: "read_file".to_string(),
                        arguments: r#"{"path":"."}"#.to_string(),
                    },
                }]),
                tool_call_id: None,
            },
        ];

        let filepath = persistence
            .save_session_summary(&messages, "openai-official", "gpt-4", 300, 200)
            .expect("归档失败");

        let content = fs::read_to_string(&filepath).expect("无法读取文件");

        // 使用 insta 进行快照测试，过滤动态时间戳
        let filtered_content = regex::Regex::new(r"\*\*Date\*\*:.*")
            .unwrap()
            .replace(&content, "**Date**: [DYNAMIC_TIMESTAMP]")
            .to_string();
        insta::assert_snapshot!(filtered_content);

        teardown();
    }
}
