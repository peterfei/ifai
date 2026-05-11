// 🔥 单个工具调用单元测试

#[cfg(test)]
mod tests {
    use crate::workflow_cmd::format_progress_event;
    use ifainew_lib::agent_system::workflow::runner::{ProgressEvent, ToolCallDetails};

    #[test]
    fn test_single_tool_call_details() {
        // 模拟单个工具调用（不是并行派发）
        let event = ProgressEvent {
            event_type: "tool_call".to_string(),
            workflow_id: Some("test-workflow".to_string()),
            node_id: Some("node-1".to_string()),
            message: None,
            timestamp: 0,
            tool_details: Some(ToolCallDetails {
                tool_name: "agent_read_file".to_string(),
                tool_input: r#"{"rel_path": "src/main.rs"}"#.to_string(),
                tool_output: "fn main() { println!(\"Hello\"); }".to_string(),
                output_length: 35,
                execution_time_ms: Some(20),
                is_error: false,
            }),
            nodes: None,
            content_delta: None,
            content_finished: None,
            completion_stats: None,
        };

        let output = format_progress_event(&event);
        let combined = output.join("\n");

        println!("单个工具调用输出：");
        println!("{}", combined);

        // 验证输出包含预期内容
        assert!(combined.contains("✔ agent_read_file src/main.rs"),
            "期望看到 '✔ agent_read_file src/main.rs'，实际: {}", combined);

        assert!(combined.contains("(<1s)") || combined.contains("(0.02s)"),
            "期望看到时间信息，实际: {}", combined);
    }
}
