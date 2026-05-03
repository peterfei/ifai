//! 工具审批界面线程泄漏 E2E 快照测试
//!
//! Bug 描述：
//! 用户反馈"thread2在调用工具时，审批界面弹出，用户已经切到了main，
//! 会显示到main中来审批，影响用户体验"
//!
//! 测试场景：
//! 1. 在 Thread-2 发送消息，触发工具调用审批
//! 2. 审批界面弹出
//! 3. 用户切换到 Main 线程
//! 4. 验证审批界面是否泄漏到 Main 线程

#[cfg(test)]
mod tests {
    use crate::tui::App;
    use crate::approval_overlay::ApprovalRequest;
    use crate::session::PendingToolCall;

    // ========================================================================
    // Bug 重现：工具审批界面线程泄漏
    // ========================================================================

    fn make_approval_request(tool_name: &str, args: &str, thread_id: crate::thread::ThreadId) -> ApprovalRequest {
        let tool = PendingToolCall {
            tool_id: "test-0".to_string(),
            name: tool_name.to_string(),
            args: args.to_string(),
        };
        let (tx, _rx) = tokio::sync::oneshot::channel();
        ApprovalRequest::from_tool(&tool, thread_id, tx)
    }

    #[test]
    fn test_approval_ui_leaks_to_main_thread() {
        // 重现 bug：Thread-2 的工具审批界面显示在 Main 线程

        let mut app = App::new_for_test();

        let primary_id = app.thread_store.primary_id();
        let thread2_id = app.create_side_thread(Some("Thread-2".to_string()));

        // === 步骤 1：在 Thread-2 发送消息，触发工具调用 ===
        app.switch_thread(thread2_id);

        // 模拟 Thread-2 的消息
        app.thread_messages.push(thread2_id, crate::thread::Message::user("Check weather".to_string()));

        // 快照 1：Thread-2 用户输入后
        insta::assert_snapshot!(format!(
            "After user input in Thread-2:\nActive: {:?}\nthread_messages[Thread-2].len(): {}",
            app.thread_store.active_thread().map(|t| t.display_name()),
            app.thread_messages.get(thread2_id).map_or(0, |m| m.len())
        ), @r###"
        After user input in Thread-2:
        Active: Some("Side: Thread-2")
        thread_messages[Thread-2].len(): 1
        "###);

        // === 步骤 2：工具调用需要审批 ===
        let approval_request = make_approval_request("bash", r#"{"cmd": "curl -s 'https://wttr.in/Beijing?lang=zh&format=3'"}"#, thread2_id);

        // 模拟设置审批状态
        app.set_approval_pending(approval_request);

        // 快照 2：审批界面在 Thread-2 弹出
        insta::assert_snapshot!(format!(
            "After approval popup in Thread-2:\nActive: {:?}\nHas approval: {}",
            app.thread_store.active_thread().map(|t| t.display_name()),
            app.get_current_approval_state().is_some()
        ), @r###"
        After approval popup in Thread-2:
        Active: Some("Side: Thread-2")
        Has approval: true
        "###);

        // === 步骤 3：用户切换到 Main 线程 ===
        app.switch_thread(primary_id);

        // 快照 3：切换到 Main 线程后
        insta::assert_snapshot!(format!(
            "After switching to Main:\nActive: {:?}\nHas approval: {}\nthread_messages[Main].len(): {}\nthread_messages[Thread-2].len(): {}",
            app.thread_store.active_thread().map(|t| t.display_name()),
            app.get_current_approval_state().is_some(),
            app.thread_messages.get(primary_id).map_or(0, |m| m.len()),
            app.thread_messages.get(thread2_id).map_or(0, |m| m.len())
        ), @r#"
        After switching to Main:
        Active: Some("Main")
        Has approval: false
        thread_messages[Main].len(): 0
        thread_messages[Thread-2].len(): 1
        "#);

        // ❌ BUG：审批界面仍然存在（has_approval = true）
        // 这会导致审批界面渲染在 Main 线程上
        // 用户体验：Main 线程显示 Thread-2 的工具审批

        // === 步骤 4：验证审批状态是否仍然存在 ===
        // ❌ BUG：审批状态仍然存在（is_some = true）
        // 这会导致审批界面渲染在 Main 线程上
        insta::assert_snapshot!(format!(
            "BUG CONFIRMED:\nActive thread changed to Main\nBut approval_state still exists: {}\nExpected: approval should be cleared or thread-specific",
            app.get_current_approval_state().is_some()
        ), @"
        BUG CONFIRMED:
        Active thread changed to Main
        But approval_state still exists: false
        Expected: approval should be cleared or thread-specific
        ");
    }

    #[test]
    fn test_approval_should_be_thread_specific() {
        // 测试：审批界面应该只显示在发起工具调用的线程中

        let mut app = App::new_for_test();

        let primary_id = app.thread_store.primary_id();
        let thread2_id = app.create_side_thread(Some("Thread-2".to_string()));

        // === 场景：Thread-2 有工具审批，Main 线程没有 ===

        // 1. 在 Thread-2 设置审批
        app.switch_thread(thread2_id);
        let approval_request = make_approval_request("bash", r#"{"cmd": "ls"}"#, thread2_id);
        app.set_approval_pending(approval_request);

        // 2. 切换到 Main 线程
        app.switch_thread(primary_id);

        // 3. 验证：Main 线程不应该显示 Thread-2 的审批界面
        insta::assert_snapshot!(format!(
            "Main thread should not show Thread-2's approval:\nActive: {:?}\nHas approval: {}",
            app.thread_store.active_thread().map(|t| t.display_name()),
            app.get_current_approval_state().is_some()
        ), @r###"
        Main thread should not show Thread-2's approval:
        Active: Some("Main")
        Has approval: false
        "###);

        // ✅ 修复后：Main 线程 has_approval 应该返回 false
    }

    #[test]
    fn test_approval_visibility_after_thread_switch() {
        // 测试：切换线程后，审批界面的可见性

        let mut app = App::new_for_test();

        let primary_id = app.thread_store.primary_id();
        let thread2_id = app.create_side_thread(Some("Thread-2".to_string()));

        // === 步骤 1：在 Thread-2 设置审批 ===
        app.switch_thread(thread2_id);
        let approval_request = make_approval_request("read_file", r#"{"path": "/tmp/test.txt"}"#, thread2_id);
        app.set_approval_pending(approval_request);

        insta::assert_snapshot!(format!(
            "Thread-2 with approval:\nActive: {:?}\nHas approval: {}",
            app.thread_store.active_thread().map(|t| t.display_name()),
            app.get_current_approval_state().is_some()
        ), @r###"
        Thread-2 with approval:
        Active: Some("Side: Thread-2")
        Has approval: true
        "###);

        // === 步骤 2：切换到 Main 线程 ===
        app.switch_thread(primary_id);

        insta::assert_snapshot!(format!(
            "Switched to Main (approval should be hidden):\nActive: {:?}\nHas approval: {}",
            app.thread_store.active_thread().map(|t| t.display_name()),
            app.get_current_approval_state().is_some()
        ), @r###"
        Switched to Main (approval should be hidden):
        Active: Some("Main")
        Has approval: false
        "###);

        // ✅ 修复后：切换到 Main 后，审批界面应该隐藏

        // === 步骤 3：切换回 Thread-2 ===
        app.switch_thread(thread2_id);

        insta::assert_snapshot!(format!(
            "Switched back to Thread-2 (approval should be visible again):\nActive: {:?}\nHas approval: {}",
            app.thread_store.active_thread().map(|t| t.display_name()),
            app.get_current_approval_state().is_some()
        ), @r###"
        Switched back to Thread-2 (approval should be visible again):
        Active: Some("Side: Thread-2")
        Has approval: true
        "###);

        // ✅ 修复后：切换回 Thread-2 后，审批界面应该重新显示
    }

    #[test]
    fn test_multiple_threads_with_approvals() {
        // 测试：多个线程同时有工具调用的场景

        let mut app = App::new_for_test();

        let primary_id = app.thread_store.primary_id();
        let thread2_id = app.create_side_thread(Some("Thread-2".to_string()));
        let thread3_id = app.create_side_thread(Some("Thread-3".to_string()));

        // === 场景：每个线程都有自己的工具审批 ===

        // 1. Main 线程有工具审批
        app.switch_thread(primary_id);
        let main_approval = make_approval_request("bash", r#"{"cmd": "echo main"}"#, primary_id);
        app.set_approval_pending(main_approval);

        // 2. Thread-2 有工具审批
        app.switch_thread(thread2_id);
        let thread2_approval = make_approval_request("bash", r#"{"cmd": "echo thread2"}"#, thread2_id);
        app.set_approval_pending(thread2_approval);

        // 3. Thread-3 有工具审批
        app.switch_thread(thread3_id);
        let thread3_approval = make_approval_request("bash", r#"{"cmd": "echo thread3"}"#, thread3_id);
        app.set_approval_pending(thread3_approval);

        // 4. 验证：每个线程应该只显示自己的审批
        // ❌ BUG：审批状态是全局的，后设置的会覆盖先设置的
        // 当前在 Thread-3
        insta::assert_snapshot!(format!(
            "Current thread: Thread-3\nShould show: Thread-3's approval only\nActive: {:?}\napproval_state exists: {}",
            app.thread_store.active_thread().map(|t| t.display_name()),
            app.get_current_approval_state().is_some()
        ), @r#"
        Current thread: Thread-3
        Should show: Thread-3's approval only
        Active: Some("Side: Thread-3")
        approval_state exists: true
        "#);

        // 5. 切换到 Main，应该显示 Main 的审批
        // ❌ BUG：但实际显示的是 Thread-3 的审批（最后设置的）
        app.switch_thread(primary_id);
        insta::assert_snapshot!(format!(
            "Current thread: Main\nShould show: Main's approval only\nActive: {:?}\napproval_state exists: {}",
            app.thread_store.active_thread().map(|t| t.display_name()),
            app.get_current_approval_state().is_some()
        ), @r#"
        Current thread: Main
        Should show: Main's approval only
        Active: Some("Main")
        approval_state exists: true
        "#);

        // ✅ 修复后：每个线程应该只看到自己的工具审批
    }

    #[test]
    fn test_approval_completion_clears_only_current_thread() {
        // 测试：完成审批后，只清除当前线程的审批状态

        let mut app = App::new_for_test();

        let primary_id = app.thread_store.primary_id();
        let thread2_id = app.create_side_thread(Some("Thread-2".to_string()));

        // === 场景：Thread-2 完成审批后，Main 线程不受影响 ===

        // 1. Thread-2 有审批
        app.switch_thread(thread2_id);
        let thread2_approval = make_approval_request("bash", r#"{"cmd": "ls"}"#, thread2_id);
        app.set_approval_pending(thread2_approval);

        // 2. Main 也有审批
        app.switch_thread(primary_id);
        let main_approval = make_approval_request("bash", r#"{"cmd": "pwd"}"#, primary_id);
        app.set_approval_pending(main_approval);

        // 3. 切换到 Thread-2 并完成审批
        app.switch_thread(thread2_id);
        let _ = app.resolve_approval(crate::approval_overlay::ApprovalDecision::ApproveOnce);

        insta::assert_snapshot!(format!(
            "After Thread-2 completes approval:\nActive: {:?}\napproval_state exists: {}",
            app.thread_store.active_thread().map(|t| t.display_name()),
            app.get_current_approval_state().is_some()
        ), @r#"
        After Thread-2 completes approval:
        Active: Some("Side: Thread-2")
        approval_state exists: false
        "#);

        // 4. 切换到 Main，Main 的审批应该仍然存在
        app.switch_thread(primary_id);
        insta::assert_snapshot!(format!(
            "Main thread approval should still exist:\nActive: {:?}\nHas approval: {}",
            app.thread_store.active_thread().map(|t| t.display_name()),
            app.get_current_approval_state().is_some()
        ), @r###"
        Main thread approval should still exist:
        Active: Some("Main")
        Has approval: true
        "###);

        // ✅ 修复后：Thread-2 完成审批不影响 Main 线程的审批状态
    }
}
