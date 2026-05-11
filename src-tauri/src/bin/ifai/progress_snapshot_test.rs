// 🧪 进度显示快照测试（TDD 方式）
//
// 运行方式：
//   cargo test --bin ifai progress_snapshot -- --nocapture
//   cargo insta test --bin ifai progress_snapshot
//
// 审查快照：
//   cargo insta review
//
// 接受变更：
//   cargo insta accept

#[cfg(test)]
mod tests {
    use crate::workflow_cmd::format_progress_event;
    use ifainew_lib::agent_system::workflow::runner::ProgressEvent;
    use ifainew_lib::agent_system::workflow::runner::ToolCallDetails;
    use serde_json::json;

    /// 📸 快照测试：node_completed 事件带完整统计（无 message）
    #[test]
    fn test_snapshot_node_completed_with_stats() {
        let event = ProgressEvent {
            event_type: "node_completed".to_string(),
            workflow_id: Some("test-workflow".to_string()),
            node_id: Some("node-1".to_string()),
            message: None,
            timestamp: 0,
            tool_details: None,
            nodes: None,
            content_delta: None,
            content_finished: None,
            completion_stats: Some(ifainew_lib::agent_system::workflow::runner::CompletionStats {
                duration_ms: Some(3300),
                tool_count: Some(3),
                token_count: Some(2400),
            }),
        };

        let output = format_progress_event(&event);
        let snapshot = output.join("\n");

        insta::assert_snapshot!(snapshot);
    }

    /// 📸 快照测试：node_completed 事件带完整统计（有 message）
    #[test]
    fn test_snapshot_node_completed_with_stats_and_message() {
        let event = ProgressEvent {
            event_type: "node_completed".to_string(),
            workflow_id: Some("test-workflow".to_string()),
            node_id: Some("node-1".to_string()),
            message: Some("## 项目分析报告\n\n这是一个测试输出".to_string()),
            timestamp: 0,
            tool_details: None,
            nodes: None,
            content_delta: None,
            content_finished: None,
            completion_stats: Some(ifainew_lib::agent_system::workflow::runner::CompletionStats {
                duration_ms: Some(3300),
                tool_count: Some(3),
                token_count: Some(2400),
            }),
        };

        let output = format_progress_event(&event);
        let snapshot = output.join("\n");

        insta::assert_snapshot!(snapshot);
    }

    /// 📸 快照测试：node_completed 事件无统计信息
    #[test]
    fn test_snapshot_node_completed_no_stats() {
        let event = ProgressEvent {
            event_type: "node_completed".to_string(),
            workflow_id: Some("test-workflow".to_string()),
            node_id: Some("node-1".to_string()),
            message: None,
            timestamp: 0,
            tool_details: None,
            nodes: None,
            content_delta: None,
            content_finished: None,
            completion_stats: None,
        };

        let output = format_progress_event(&event);
        let snapshot = output.join("\n");

        insta::assert_snapshot!(snapshot);
    }

    /// 📸 快照测试：node_completed 事件部分统计
    #[test]
    fn test_snapshot_node_completed_partial_stats() {
        let event = ProgressEvent {
            event_type: "node_completed".to_string(),
            workflow_id: Some("test-workflow".to_string()),
            node_id: Some("node-1".to_string()),
            message: None,
            timestamp: 0,
            tool_details: None,
            nodes: None,
            content_delta: None,
            content_finished: None,
            completion_stats: Some(ifainew_lib::agent_system::workflow::runner::CompletionStats {
                duration_ms: Some(1200),
                tool_count: Some(2),
                token_count: None, // 缺少 token 统计
            }),
        };

        let output = format_progress_event(&event);
        let snapshot = output.join("\n");

        insta::assert_snapshot!(snapshot);
    }

    /// 📸 快照测试：workflow:completed 事件带总统计
    #[test]
    fn test_snapshot_workflow_completed_with_stats() {
        let event = ProgressEvent {
            event_type: "workflow:completed".to_string(),
            workflow_id: Some("test-workflow".to_string()),
            node_id: None,
            message: None,
            timestamp: 0,
            tool_details: None,
            nodes: None,
            content_delta: None,
            content_finished: None,
            completion_stats: Some(ifainew_lib::agent_system::workflow::runner::CompletionStats {
                duration_ms: Some(12000),
                tool_count: Some(15),
                token_count: Some(15000),
            }),
        };

        let output = format_progress_event(&event);
        let snapshot = output.join("\n");

        insta::assert_snapshot!(snapshot);
    }

    /// 📸 快照测试：tool_call 事件（带时间统计）
    #[test]
    fn test_snapshot_tool_call_with_time() {
        let event = ProgressEvent {
            event_type: "tool_call".to_string(),
            workflow_id: Some("test-workflow".to_string()),
            node_id: Some("node-1".to_string()),
            message: None,
            timestamp: 0,
            tool_details: Some(ToolCallDetails {
                tool_name: "agent_read_file".to_string(),
                tool_input: json!({"rel_path": "src/main.rs"}).to_string(),
                tool_output: "fn main() { println!(\"Hello\"); }".to_string(),
                is_error: false,
                execution_time_ms: Some(20),
                output_length: 35,
            }),
            nodes: None,
            content_delta: None,
            content_finished: None,
            completion_stats: None,
        };

        let output = format_progress_event(&event);
        let snapshot = output.join("\n");

        insta::assert_snapshot!(snapshot);
    }
}
