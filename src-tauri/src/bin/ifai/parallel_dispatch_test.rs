// 🔥 并行派发通知单元测试

#[cfg(test)]
mod tests {
    use crate::workflow_cmd::format_progress_event;
    use ifainew_lib::agent_system::workflow::runner::{ProgressEvent, ToolCallDetails};

    #[test]
    fn test_parallel_dispatch_notification() {
        // 模拟并行派发通知
        let event = ProgressEvent {
            event_type: "tool_call".to_string(),
            workflow_id: Some("test-workflow".to_string()),
            node_id: Some("node-1".to_string()),
            message: Some("3 个工具并行执行".to_string()),
            timestamp: 0,
            tool_details: Some(ToolCallDetails {
                tool_name: String::new(), // 空字符串表示并行派发
                tool_input: String::new(),
                tool_output: "parallel:read_file,grep,list_dir".to_string(),
                output_length: 0,
                execution_time_ms: None,
                is_error: false,
            }),
            nodes: None,
            content_delta: None,
            content_finished: None,
            completion_stats: None,
        };

        let output = format_progress_event(&event);
        let combined = output.join("\n");

        println!("并行派发通知输出：");
        println!("{}", combined);

        // 验证输出包含预期内容
        assert!(combined.contains("个工具并行执行"),
            "期望看到 '个工具并行执行'，实际: {}", combined);

        assert!(combined.contains("▸"),
            "期望看到 ▸ 符号，实际: {}", combined);
    }
}
