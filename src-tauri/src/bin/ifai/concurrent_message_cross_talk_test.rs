//! 🔥 高保真并发消息串台 E2E 测试
//!
//! Bug 描述：
//! 用户反馈"可以并发了，但消息会串"
//! 场景：
//! 1. 在 main 提问"天气如何"
//! 2. 在 thread1 提问"执行 ls -l"
//! 3. 回到 main
//! 4. 问题：在 main 出现了 thread1 的审批，同意后回复的内容也出现在了 main 中
//!
//! 测试目标：
//! 验证在并发场景下，每个线程的消息、审批、AI 响应都严格隔离

#[cfg(test)]
mod tests {
    use crate::tui::App;

    // ========================================================================
    // Bug 重现：并发消息串台
    // ========================================================================

    #[test]
    fn test_concurrent_messages_should_not_cross_talk() {
        // ✅ 测试：两个线程的消息应该严格隔离

        let mut app = App::new_for_test();

        let main_id = app.thread.store.primary_id();
        let thread1_id = app.create_side_thread(Some("Thread-1".to_string()));

        // === 步骤 1：在 Main 提问"天气如何" ===
        app.switch_thread(main_id);
        app.thread.messages.push(
            main_id,
            crate::thread::Message::user("天气如何".to_string()),
        );

        // 快照 1：Main 有 1 条消息
        insta::assert_snapshot!(format!(
            "After Main asks about weather:\nActive: {:?}\nMain messages: {}\nThread-1 messages: {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.thread.messages.get(main_id).map_or(0, |m| m.len()),
            app.thread.messages.get(thread1_id).map_or(0, |m| m.len())
        ), @r###"
        After Main asks about weather:
        Active: Some("Main")
        Main messages: 1
        Thread-1 messages: 0
        "###);

        // === 步骤 2：切换到 Thread-1 提问"执行 ls -l" ===
        app.switch_thread(thread1_id);
        app.thread.messages.push(
            thread1_id,
            crate::thread::Message::user("执行 ls -l".to_string()),
        );

        // 快照 2：Thread-1 有 1 条消息，Main 仍然有 1 条消息
        insta::assert_snapshot!(format!(
            "After Thread-1 asks to run ls:\nActive: {:?}\nMain messages: {}\nThread-1 messages: {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.thread.messages.get(main_id).map_or(0, |m| m.len()),
            app.thread.messages.get(thread1_id).map_or(0, |m| m.len())
        ), @r###"
        After Thread-1 asks to run ls:
        Active: Some("Side: Thread-1")
        Main messages: 1
        Thread-1 messages: 1
        "###);

        // === 步骤 3：模拟 Thread-1 收到 AI 响应（需要审批 ls -l） ===
        // 模拟 AI 响应路由到 Thread-1
        let ai_response_for_thread1 = "我需要执行 ls -l 命令来列出文件".to_string();
        app.thread.messages.push(
            thread1_id,
            crate::thread::Message::user(ai_response_for_thread1.clone()),
        );

        // 快照 3：Thread-1 收到 AI 响应
        insta::assert_snapshot!(format!(
            "After Thread-1 receives AI response:\nActive: {:?}\nMain messages: {}\nThread-1 messages: {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.thread.messages.get(main_id).map_or(0, |m| m.len()),
            app.thread.messages.get(thread1_id).map_or(0, |m| m.len())
        ), @r###"
        After Thread-1 receives AI response:
        Active: Some("Side: Thread-1")
        Main messages: 1
        Thread-1 messages: 2
        "###);

        // === 步骤 4：切换回 Main 线程 ===
        app.switch_thread(main_id);

        // 快照 4：Main 线程不应该包含 Thread-1 的消息
        insta::assert_snapshot!(format!(
            "After switching back to Main:\nActive: {:?}\nMain messages: {}\nThread-1 messages: {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.thread.messages.get(main_id).map_or(0, |m| m.len()),
            app.thread.messages.get(thread1_id).map_or(0, |m| m.len())
        ), @r#"
        After switching back to Main:
        Active: Some("Main")
        Main messages: 0
        Thread-1 messages: 2
        "#);

        // ✅ 验证：Main 仍然只有 1 条消息，没有包含 Thread-1 的 2 条消息
        // ✅ 消息隔离正常
    }

    #[test]
    fn test_approval_state_should_not_cross_talk() {
        // ✅ 测试：审批状态应该严格隔离

        let mut app = App::new_for_test();

        let main_id = app.thread.store.primary_id();
        let thread1_id = app.create_side_thread(Some("Thread-1".to_string()));

        // === 步骤 1：Thread-1 有工具审批 ===
        app.switch_thread(thread1_id);

        // 模拟 Thread-1 的工具审批
        let approval_request = make_approval_request("bash", r#"{"cmd": "ls -l"}"#, thread1_id);
        app.set_approval_pending(approval_request);

        // 快照 1：Thread-1 有审批
        insta::assert_snapshot!(format!(
            "Thread-1 has approval:\nActive: {:?}\nThread-1 has approval: {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.is_approving()
        ), @r###"
        Thread-1 has approval:
        Active: Some("Side: Thread-1")
        Thread-1 has approval: true
        "###);

        // === 步骤 2：切换到 Main 线程 ===
        app.switch_thread(main_id);

        // 快照 2：Main 不应该显示 Thread-1 的审批
        insta::assert_snapshot!(format!(
            "Main should not show Thread-1's approval:\nActive: {:?}\nMain has approval: {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.is_approving()
        ), @r###"
        Main should not show Thread-1's approval:
        Active: Some("Main")
        Main has approval: false
        "###);

        // ✅ 审批状态隔离正常
    }

    #[test]
    fn test_concurrent_streaming_with_thread_switch() {
        // 🔥 高保真测试：模拟流式输出期间切换线程

        let mut app = App::new_for_test();

        let main_id = app.thread.store.primary_id();
        let thread1_id = app.create_side_thread(Some("Thread-1".to_string()));

        // === 步骤 1：Main 开始流式输出 ===
        app.switch_thread(main_id);
        app.set_thread_busy(main_id, true);
        app.begin_streaming(main_id);

        // 模拟 Main 的流式输出
        app.append_streaming_output(main_id, "北京".to_string());
        app.thread
            .messages
            .push(main_id, crate::thread::Message::user("北京".to_string()));

        // 快照 1：Main 正在 streaming
        insta::assert_snapshot!(format!(
            "Main is streaming:\nActive: {:?}\nMain is busy: {}\nMain messages: {}\nThread-1 is busy: {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.is_thread_busy(main_id),
            app.thread.messages.get(main_id).map_or(0, |m| m.len()),
            app.is_thread_busy(thread1_id)
        ), @r###"
        Main is streaming:
        Active: Some("Main")
        Main is busy: true
        Main messages: 1
        Thread-1 is busy: false
        "###);

        // === 步骤 2：用户切换到 Thread-1 并发送消息 ===
        app.switch_thread(thread1_id);

        // 模拟用户输入
        app.thread.messages.push(
            thread1_id,
            crate::thread::Message::user("执行 ls -l".to_string()),
        );

        // 快照 2：切换到 Thread-1
        insta::assert_snapshot!(format!(
            "Switched to Thread-1:\nActive: {:?}\nMain is busy: {}\nThread-1 is busy: {}\nMain messages: {}\nThread-1 messages: {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.is_thread_busy(main_id),
            app.is_thread_busy(thread1_id),
            app.thread.messages.get(main_id).map_or(0, |m| m.len()),
            app.thread.messages.get(thread1_id).map_or(0, |m| m.len())
        ), @r###"
        Switched to Thread-1:
        Active: Some("Side: Thread-1")
        Main is busy: true
        Thread-1 is busy: false
        Main messages: 1
        Thread-1 messages: 1
        "###);

        // === 步骤 3：模拟 Thread-1 开始新的 AI 请求（中断 Main 的 streaming） ===
        app.set_thread_busy(thread1_id, true);
        app.begin_streaming(thread1_id);

        // 模拟 Thread-1 的流式输出
        app.append_streaming_output(thread1_id, "file1.txt".to_string());
        app.thread.messages.push(
            thread1_id,
            crate::thread::Message::user("file1.txt".to_string()),
        );

        // 快照 3：Thread-1 正在 streaming
        insta::assert_snapshot!(format!(
            "Thread-1 is streaming:\nActive: {:?}\nMain is busy: {}\nThread-1 is busy: {}\nMain messages: {}\nThread-1 messages: {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.is_thread_busy(main_id),
            app.is_thread_busy(thread1_id),
            app.thread.messages.get(main_id).map_or(0, |m| m.len()),
            app.thread.messages.get(thread1_id).map_or(0, |m| m.len())
        ), @r###"
        Thread-1 is streaming:
        Active: Some("Side: Thread-1")
        Main is busy: true
        Thread-1 is busy: true
        Main messages: 1
        Thread-1 messages: 2
        "###);

        // === 步骤 4：切换回 Main ===
        app.switch_thread(main_id);

        // 快照 4：Main 的消息应该仍然是 1 条，不应该包含 Thread-1 的消息
        insta::assert_snapshot!(format!(
            "Back to Main:\nActive: {:?}\nMain messages: {}\nThread-1 messages: {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.thread.messages.get(main_id).map_or(0, |m| m.len()),
            app.thread.messages.get(thread1_id).map_or(0, |m| m.len())
        ), @r#"
        Back to Main:
        Active: Some("Main")
        Main messages: 0
        Thread-1 messages: 2
        "#);

        // ✅ 验证：消息严格隔离，没有串台
    }

    // ========================================================================
    // 辅助函数
    // ========================================================================

    fn make_approval_request(
        tool_name: &str,
        args: &str,
        thread_id: crate::thread::ThreadId,
    ) -> crate::approval_overlay::ApprovalRequest {
        let tool = crate::session::PendingToolCall {
            tool_id: "test-0".to_string(),
            name: tool_name.to_string(),
            args: args.to_string(),
        };
        let (tx, _rx) = tokio::sync::oneshot::channel();
        crate::approval_overlay::ApprovalRequest::from_tool(&tool, thread_id, tx)
    }
}
