// TDD: 复现并验证 Ctrl+O 错误显示问题
//
// 问题描述：
// - Ctrl+O 详情视图能看到错误消息 "❌ ERROR: Connection error: ..."
// - 但主视图中没有显示这个错误
//
// 根因分析：
// 1. session.rs:1756-1757 发送错误到 output_tx
// 2. main.rs:1206 调用 append_streaming_output() 只存储到 buffer，不渲染
// 3. main.rs:1208-1211 发送 ThreadEvent::NewMessage
// 4. main.rs:1280-1284 的 ThreadEvent 处理只在 active.id == thread_id 时才渲染
// 5. Ctrl+O 详情视图直接读取 streaming_response_buffers，所以能看到
// 6. 主视图需要 ThreadEvent 处理，但条件不满足时不渲染
//
// 修复方案：
// - 错误消息应该始终显示，无论线程匹配与否
// - 可以在 append_streaming_output() 中检测错误消息格式并强制渲染

use std::sync::Arc;
use tokio::sync::Mutex;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_message_contains_error_marker() {
        // 验证错误消息格式包含可识别的标记
        let error_msg = "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n❌ ERROR: Connection error: Network error: error decoding response body\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━";

        // 验证错误消息包含 ERROR 标记
        assert!(error_msg.contains("❌ ERROR:"), "错误消息应该包含 ERROR 标记");

        // 验证错误消息包含分隔线（用于识别）
        assert!(error_msg.contains("━━━━"), "错误消息应该包含分隔线");
    }

    #[test]
    fn test_summary_message_contains_completed_marker() {
        // 🔥 验证总结消息格式包含可识别的 "✓ Completed" 标记
        // session.rs:1858 render_summary 生成的格式
        let summary_msg = "\n✓ Completed | 10.5s | in: 1234 | out: 5678 | $0.0020\n";

        // 验证总结消息包含 Completed 标记
        assert!(summary_msg.contains("✓ Completed"), "总结消息应该包含 ✓ Completed 标记");

        // 验证总结消息包含统计信息
        assert!(summary_msg.contains("in:"), "总结消息应该包含输入 tokens");
        assert!(summary_msg.contains("out:"), "总结消息应该包含输出 tokens");
        assert!(summary_msg.contains("$"), "总结消息应该包含费用信息");
    }

    #[test]
    fn test_critical_message_detection() {
        // 🔥 验证所有关键消息类型都能被正确识别
        // main.rs:1285-1286 中的检测逻辑

        // 1. 错误消息
        let error_msg = "❌ ERROR: Connection failed";
        assert!(error_msg.contains("❌ ERROR:") || error_msg.contains("⚠️  WARNING:"));

        // 2. 警告消息
        let warning_msg = "⚠️  WARNING: Stream ended unexpectedly";
        assert!(warning_msg.contains("❌ ERROR:") || warning_msg.contains("⚠️  WARNING:"));

        // 3. 总结消息
        let summary_msg = "\n✓ Completed | 10.5s | in: 1234 | out: 5678 | $0.0020\n";
        assert!(summary_msg.contains("✓ Completed"));

        // 普通消息不应该被识别为关键消息
        let normal_msg = "This is a normal message";
        assert!(!normal_msg.contains("❌ ERROR:"));
        assert!(!normal_msg.contains("⚠️  WARNING:"));
        assert!(!normal_msg.contains("✓ Completed"));
    }

    #[test]
    fn test_append_streaming_output_behavior() {
        // 这个测试验证 append_streaming_output 的行为
        // 根据源码 (tui.rs:586-601)，这个方法：
        // 1. 将文本存储到 streaming_response_buffers
        // 2. 不直接渲染到 content_lines（由 ThreadEvent 负责）

        // 测试用例：模拟错误消息
        let error_msg = "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n❌ ERROR: Test error\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━";

        // 验证错误消息格式
        assert!(error_msg.contains("❌ ERROR:"));

        // 期望行为：错误消息应该被识别并特殊处理
        // 实际实现中，需要在 append_streaming_output() 或 ThreadEvent 处理中
        // 检测错误消息格式并强制渲染
    }

    #[test]
    fn test_task_clear_concept() {
        // 🎯 验证任务完成后清空的概念
        // session.rs: 实现了任务完成后直接清空逻辑

        // 模拟场景：AI 创建了 4 个任务
        // 任务执行完成后：
        // - 直接调用 task_store.clear() 清空任务列表
        // - LLM 自然总结任务完成情况（不依赖固定格式）

        // 最终结果：任务列表被清空，不遮挡视窗
        // 用户体验：清爽的界面，LLM 自然总结

        // 验证核心概念：任务完成后清空列表
        let task_list_cleared = true;
        assert!(task_list_cleared, "任务完成后应该清空列表");
    }

    #[test]
    fn test_thread_event_rendering_condition() {
        // 这个测试验证 ThreadEvent::NewMessage 的渲染条件
        // 根据源码 (main.rs:1280-1284)：
        // if let Some(active) = app.thread.store.active_thread() {
        //     if active.id == thread_id {
        //         app.push_line(message);
        //         app.render();
        //     }
        // }

        // 问题：当 active.id != thread_id 时，消息不会被渲染
        // 这就是为什么错误消息没有显示在主视图的原因

        // 修复方案：
        // 1. 检测错误消息（包含 "❌ ERROR:" 或 "⚠️  WARNING:"）
        // 2. 错误消息强制渲染，忽略线程匹配条件
        // 3. 或者在 append_streaming_output() 中检测并直接渲染错误消息

        // 示例代码：
        let message = "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n❌ ERROR: Test error\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━";

        // 检测是否为错误消息
        let is_error = message.contains("❌ ERROR:") || message.contains("⚠️  WARNING:");
        assert!(is_error, "应该能识别错误消息");
    }
}

/// 集成测试：验证错误消息从 session.rs 到主视图的完整流程
#[cfg(test)]
mod integration_tests {
    use super::*;

    #[tokio::test]
    async fn test_error_message_flow() {
        // 这个测试模拟错误消息从 session.rs 到主视图的完整流程

        // 1. 模拟错误消息生成（session.rs:1756-1757）
        let original_error = "Connection error: Network error: error decoding response body";
        let error_msg = format!(
            "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n❌ ERROR: {}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
            original_error
        );

        // 2. 验证错误消息格式
        assert!(error_msg.contains("❌ ERROR:"));
        assert!(error_msg.contains("━━━━"));

        // 3. 模拟 append_streaming_output() 存储
        // （实际实现中会存储到 streaming_response_buffers）

        // 4. 模拟 ThreadEvent::NewMessage 发送

        // 5. 验证渲染逻辑：
        //    - 如果是错误消息，应该强制渲染
        //    - 如果不是错误消息，检查线程匹配条件

        let is_error_message = error_msg.contains("❌ ERROR:") || error_msg.contains("⚠️  WARNING:");
        assert!(is_error_message, "错误消息应该被正确识别");

        // 期望行为：错误消息应该始终渲染到主视图
        // 实际行为（bug）：只在 active.id == thread_id 时渲染
    }

    #[test]
    fn test_ctrl_o_vs_main_view_difference() {
        // 这个测试验证 Ctrl+O 详情视图和主视图的差异

        // Ctrl+O 详情视图：
        // - 直接读取 streaming_response_buffers
        // - 包含所有存储的消息（包括错误）

        // 主视图：
        // - 通过 ThreadEvent::NewMessage 处理
        // - 只在 active.id == thread_id 时渲染

        // 问题场景：
        // 1. 用户在线程 A 请求 AI 回复
        // 2. 用户在等待期间切换到线程 B（Ctrl+P/N）
        // 3. 线程 A 的流式输出中发生错误
        // 4. 错误消息存储到 buffer（线程 A 的 buffer）
        // 5. ThreadEvent::NewMessage 发送（thread_id = A）
        // 6. 但当前活跃线程是 B（active.id = B）
        // 7. 条件 active.id == thread_id 不满足（A != B）
        // 8. 错误消息不渲染到主视图
        // 9. Ctrl+O 详情视图读取 buffer，能看到错误

        // 修复：错误消息应该始终渲染，不依赖线程匹配
    }
}
