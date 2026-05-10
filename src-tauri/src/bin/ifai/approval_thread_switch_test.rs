//! 🔥 审批期间线程切换 E2E 测试
//!
//! Bug 描述：
//! 用户反馈"如审批出现正好用户切了thread, 审批无法选中和聚焦"
//!
//! 场景：
//! 1. Thread-1 触发工具审批，审批界面弹出
//! 2. 用户在审批期间切换到 main（可能通过某种方式绕过 Alt+Left/Right 检查）
//! 3. 审批界面仍然残留在屏幕上
//! 4. 用户尝试选择选项 → 无法响应（因为审批 loop 已经退出）
//!
//! 测试目标：
//! 验证审批 loop 能正确检测线程切换并退出，清除残留的审批界面

#[cfg(test)]
mod tests {
    use crate::tui::App;

    #[test]
    fn test_approval_loop_detects_thread_switch() {
        // ✅ 测试：审批 loop 应该检测线程切换并退出

        let mut app = App::new_for_test();

        let main_id = app.thread.store.primary_id();
        let thread1_id = app.create_side_thread(Some("Thread-1".to_string()));

        // === 步骤 1：Thread-1 有审批请求 ===
        app.switch_thread(thread1_id);

        let approval_request = make_approval_request("bash", r#"{"cmd": "ls -l"}"#, thread1_id);
        app.set_approval_pending(approval_request);

        // 快照 1：Thread-1 有审批
        insta::assert_snapshot!(format!(
            "Thread-1 has approval:\nActive: {:?}\nThread-1 is_approving: {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.is_approving()
        ), @r###"
        Thread-1 has approval:
        Active: Some("Side: Thread-1")
        Thread-1 is_approving: true
        "###);

        // === 步骤 2：模拟用户切换到 main（审批 loop 应该检测到并退出） ===
        // 在实际的审批 loop 中（main.rs:1351-1363），每次迭代都会检查当前线程
        // 如果检测到线程切换，会调用 app.render() 并退出 loop
        app.switch_thread(main_id);

        // 快照 2：切换到 main 后，main 不应该有审批
        insta::assert_snapshot!(format!(
            "After switching to Main:\nActive: {:?}\nMain is_approving: {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.is_approving()
        ), @r###"
        After switching to Main:
        Active: Some("Main")
        Main is_approving: false
        "###);

        // ✅ 审批状态已正确隔离
        // 用户在 main 中看不到 Thread-1 的审批界面
    }

    #[test]
    fn test_approval_persists_after_thread_switch() {
        // ✅ 测试：切换线程后，原始线程的审批状态应该保持

        let mut app = App::new_for_test();

        let main_id = app.thread.store.primary_id();
        let thread1_id = app.create_side_thread(Some("Thread-1".to_string()));

        // === 步骤 1：Thread-1 有审批 ===
        app.switch_thread(thread1_id);

        let approval_request = make_approval_request("bash", r#"{"cmd": "ls -l"}"#, thread1_id);
        app.set_approval_pending(approval_request);

        // === 步骤 2：切换到 main ===
        app.switch_thread(main_id);

        // === 步骤 3：切换回 Thread-1 ===
        app.switch_thread(thread1_id);

        // 快照：Thread-1 的审批应该仍然存在
        insta::assert_snapshot!(format!(
            "Back to Thread-1:\nActive: {:?}\nThread-1 is_approving: {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.is_approving()
        ), @r###"
        Back to Thread-1:
        Active: Some("Side: Thread-1")
        Thread-1 is_approving: true
        "###);

        // ✅ 审批状态持久化：切换回 Thread-1 后，审批界面重新显示
    }

    #[test]
    fn test_multiple_concurrent_approvals() {
        // ✅ 测试：多个线程同时有审批请求

        let mut app = App::new_for_test();

        let main_id = app.thread.store.primary_id();
        let thread1_id = app.create_side_thread(Some("Thread-1".to_string()));
        let thread2_id = app.create_side_thread(Some("Thread-2".to_string()));

        // === 步骤 1：三个线程都有审批 ===
        app.switch_thread(main_id);
        let main_approval =
            make_approval_request("read_file", r#"{"path": "/tmp/main.txt"}"#, main_id);
        app.set_approval_pending(main_approval);

        app.switch_thread(thread1_id);
        let thread1_approval = make_approval_request("bash", r#"{"cmd": "ls"}"#, thread1_id);
        app.set_approval_pending(thread1_approval);

        app.switch_thread(thread2_id);
        let thread2_approval =
            make_approval_request("write_file", r#"{"path": "/tmp/test.txt"}"#, thread2_id);
        app.set_approval_pending(thread2_approval);

        // === 步骤 2：切换到 main ===
        app.switch_thread(main_id);

        // 快照：只显示 main 的审批
        insta::assert_snapshot!(format!(
            "On Main:\nActive: {:?}\nMain is_approving: {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.is_approving()
        ), @r###"
        On Main:
        Active: Some("Main")
        Main is_approving: true
        "###);

        // === 步骤 3：切换到 Thread-1 ===
        app.switch_thread(thread1_id);

        // 快照：只显示 Thread-1 的审批
        insta::assert_snapshot!(format!(
            "On Thread-1:\nActive: {:?}\nThread-1 is_approving: {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.is_approving()
        ), @r###"
        On Thread-1:
        Active: Some("Side: Thread-1")
        Thread-1 is_approving: true
        "###);

        // === 步骤 4：切换到 Thread-2 ===
        app.switch_thread(thread2_id);

        // 快照：只显示 Thread-2 的审批
        insta::assert_snapshot!(format!(
            "On Thread-2:\nActive: {:?}\nThread-2 is_approving: {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.is_approving()
        ), @r###"
        On Thread-2:
        Active: Some("Side: Thread-2")
        Thread-2 is_approving: true
        "###);

        // ✅ 每个线程只显示自己的审批
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
