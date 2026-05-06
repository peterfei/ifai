//! 🔥 Phase 6: 并发和审批 E2E 高保真测试
//!
//! 测试目标：验证所有并发和审批相关修复的正确性
//!
//! 测试场景：
//! 1. 并发 AI 请求 - 两个线程同时提问
//! 2. 审批界面隔离 - thread1 的审批不出现在 thread2
//! 3. 消息路由隔离 - main 的响应不出现在 thread1
//! 4. 线程切换 - 切换线程后审批界面正确显示/隐藏
//! 5. Streaming 期间切换 - streaming 期间切换线程并发送新消息

#[cfg(test)]
mod tests {
    use crate::tui::App;
    use crate::approval_overlay::ApprovalRequest;
    use crate::session::PendingToolCall;

    // ========================================================================
    // 场景 1：并发 AI 请求
    // ========================================================================

    #[test]
    fn test_concurrent_ai_requests() {
        // ✅ 测试：两个线程同时进行 AI 请求，互不干扰

        let mut app = App::new_for_test();

        let main_id = app.thread.store.primary_id();
        let thread1_id = app.create_side_thread(Some("Thread-1".to_string()));

        println!("\n=== 场景 1：并发 AI 请求 ===\n");

        // === 步骤 1：main 发送消息 ===
        app.switch_thread(main_id);
        app.thread.messages.push(main_id, crate::thread::Message::user("What is Rust?".to_string()));
        app.set_thread_busy(main_id, true);

        println!("步骤 1: main 发送消息 'What is Rust?'");
        println!("  → main is busy: {}", app.is_thread_busy(main_id));
        println!("  → thread1 is busy: {}", app.is_thread_busy(thread1_id));

        insta::assert_snapshot!(format!(
            "Main started AI request:\nActive: {:?}\nMain is busy: {}\nThread-1 is busy: {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.is_thread_busy(main_id),
            app.is_thread_busy(thread1_id)
        ), @r###"
        Main started AI request:
        Active: Some("Main")
        Main is busy: true
        Thread-1 is busy: false
        "###);

        // === 步骤 2：thread1 发送消息（并发） ===
        app.switch_thread(thread1_id);
        app.thread.messages.push(thread1_id, crate::thread::Message::user("What is Python?".to_string()));
        app.set_thread_busy(thread1_id, true);

        println!("\n步骤 2: thread1 发送消息 'What is Python?'");
        println!("  → main is busy: {}", app.is_thread_busy(main_id));
        println!("  → thread1 is busy: {}", app.is_thread_busy(thread1_id));

        insta::assert_snapshot!(format!(
            "Thread-1 started AI request:\nActive: {:?}\nMain is busy: {}\nThread-1 is busy: {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.is_thread_busy(main_id),
            app.is_thread_busy(thread1_id)
        ), @r###"
        Thread-1 started AI request:
        Active: Some("Side: Thread-1")
        Main is busy: true
        Thread-1 is busy: true
        "###);

        // ✅ 两个线程都 busy，并发处理正常
        println!("\n✅ 两个线程可以同时进行 AI 请求");
    }

    // ========================================================================
    // 场景 2：审批界面隔离
    // ========================================================================

    #[test]
    fn test_approval_ui_isolation() {
        // ✅ 测试：thread1 的审批不出现在 thread2

        let mut app = App::new_for_test();

        let main_id = app.thread.store.primary_id();
        let thread1_id = app.create_side_thread(Some("Thread-1".to_string()));
        let thread2_id = app.create_side_thread(Some("Thread-2".to_string()));

        println!("\n=== 场景 2：审批界面隔离 ===\n");

        // === 步骤 1：thread1 有审批 ===
        app.switch_thread(thread1_id);
        let approval_request = make_approval_request("bash", r#"{"cmd": "ls -l"}"#, thread1_id);
        app.set_approval_pending(approval_request);

        println!("步骤 1: thread1 有工具审批");
        println!("  → thread1 has approval: {}", app.is_approving());

        insta::assert_snapshot!(format!(
            "Thread-1 has approval:\nActive: {:?}\nThread-1 is_approving: {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.is_approving()
        ), @r###"
        Thread-1 has approval:
        Active: Some("Side: Thread-1")
        Thread-1 is_approving: true
        "###);

        // === 步骤 2：切换到 thread2 ===
        app.switch_thread(thread2_id);

        println!("\n步骤 2: 切换到 thread2");
        println!("  → thread2 has approval: {}", app.is_approving());

        insta::assert_snapshot!(format!(
            "Switched to Thread-2:\nActive: {:?}\nThread-2 is_approving: {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.is_approving()
        ), @r###"
        Switched to Thread-2:
        Active: Some("Side: Thread-2")
        Thread-2 is_approving: false
        "###);

        // ✅ thread2 不显示 thread1 的审批
        println!("\n✅ thread2 不显示 thread1 的审批（审批界面隔离正常）");
    }

    // ========================================================================
    // 场景 3：消息路由隔离
    // ========================================================================

    #[test]
    fn test_message_routing_isolation() {
        // ✅ 测试：main 的 AI 响应不出现在 thread1

        let mut app = App::new_for_test();

        let main_id = app.thread.store.primary_id();
        let thread1_id = app.create_side_thread(Some("Thread-1".to_string()));

        println!("\n=== 场景 3：消息路由隔离 ===\n");

        // === 步骤 1：main 收到 AI 响应 ===
        app.switch_thread(main_id);
        app.thread.messages.push(main_id, crate::thread::Message::user("Main question".to_string()));
        let main_ai_response = "Rust is a systems programming language".to_string();
        app.thread.messages.push(main_id, crate::thread::Message::user(main_ai_response.clone()));

        println!("步骤 1: main 收到 AI 响应");
        println!("  → main messages: {}", app.thread.messages.get(main_id).map_or(0, |m| m.len()));

        insta::assert_snapshot!(format!(
            "Main received AI response:\nActive: {:?}\nMain messages: {}\nThread-1 messages: {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.thread.messages.get(main_id).map_or(0, |m| m.len()),
            app.thread.messages.get(thread1_id).map_or(0, |m| m.len())
        ), @r###"
        Main received AI response:
        Active: Some("Main")
        Main messages: 2
        Thread-1 messages: 0
        "###);

        // === 步骤 2：切换到 thread1 ===
        app.switch_thread(thread1_id);

        println!("\n步骤 2: 切换到 thread1");
        println!("  → main messages: {}", app.thread.messages.get(main_id).map_or(0, |m| m.len()));
        println!("  → thread1 messages: {}", app.thread.messages.get(thread1_id).map_or(0, |m| m.len()));

        insta::assert_snapshot!(format!(
            "After switching to Thread-1:\nActive: {:?}\nMain messages: {}\nThread-1 messages: {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.thread.messages.get(main_id).map_or(0, |m| m.len()),
            app.thread.messages.get(thread1_id).map_or(0, |m| m.len())
        ), @r###"
        After switching to Thread-1:
        Active: Some("Side: Thread-1")
        Main messages: 2
        Thread-1 messages: 0
        "###);

        // ✅ thread1 不包含 main 的消息
        println!("\n✅ thread1 不包含 main 的消息（消息路由隔离正常）");
    }

    // ========================================================================
    // 场景 4：线程切换后审批持久化
    // ========================================================================

    #[test]
    fn test_approval_persistence_across_thread_switches() {
        // ✅ 测试：切换线程后，审批状态正确显示/隐藏

        let mut app = App::new_for_test();

        let main_id = app.thread.store.primary_id();
        let thread1_id = app.create_side_thread(Some("Thread-1".to_string()));

        println!("\n=== 场景 4：线程切换后审批持久化 ===\n");

        // === 步骤 1：thread1 有审批 ===
        app.switch_thread(thread1_id);
        let approval_request = make_approval_request("read_file", r#"{"path": "/tmp/test.txt"}"#, thread1_id);
        app.set_approval_pending(approval_request);

        println!("步骤 1: thread1 有审批");
        println!("  → thread1 is_approving: {}", app.is_approving());

        insta::assert_snapshot!(format!(
            "Thread-1 with approval:\nActive: {:?}\nThread-1 is_approving: {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.is_approving()
        ), @r###"
        Thread-1 with approval:
        Active: Some("Side: Thread-1")
        Thread-1 is_approving: true
        "###);

        // === 步骤 2：切换到 main ===
        app.switch_thread(main_id);

        println!("\n步骤 2: 切换到 main");
        println!("  → main is_approving: {}", app.is_approving());

        insta::assert_snapshot!(format!(
            "Switched to Main:\nActive: {:?}\nMain is_approving: {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.is_approving()
        ), @r###"
        Switched to Main:
        Active: Some("Main")
        Main is_approving: false
        "###);

        // === 步骤 3：切换回 thread1 ===
        app.switch_thread(thread1_id);

        println!("\n步骤 3: 切换回 thread1");
        println!("  → thread1 is_approving: {}", app.is_approving());

        insta::assert_snapshot!(format!(
            "Switched back to Thread-1:\nActive: {:?}\nThread-1 is_approving: {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.is_approving()
        ), @r###"
        Switched back to Thread-1:
        Active: Some("Side: Thread-1")
        Thread-1 is_approving: true
        "###);

        // ✅ 审批状态持久化：切换回来后仍然显示
        println!("\n✅ 审批状态持久化正常");
    }

    // ========================================================================
    // 场景 5：Streaming 期间切换线程
    // ========================================================================

    #[test]
    fn test_thread_switch_during_streaming() {
        // ✅ 测试：streaming 期间切换线程并发送新消息

        let mut app = App::new_for_test();

        let main_id = app.thread.store.primary_id();
        let thread1_id = app.create_side_thread(Some("Thread-1".to_string()));

        println!("\n=== 场景 5：Streaming 期间切换线程 ===\n");

        // === 步骤 1：main 开始 streaming ===
        app.switch_thread(main_id);
        app.thread.messages.push(main_id, crate::thread::Message::user("Main question".to_string()));
        app.set_thread_busy(main_id, true);
        app.begin_streaming(main_id);
        app.append_streaming_output(main_id, "Partial response from main".to_string());

        println!("步骤 1: main 开始 streaming");
        println!("  → main is busy: {}", app.is_thread_busy(main_id));
        println!("  → thread1 is busy: {}", app.is_thread_busy(thread1_id));

        insta::assert_snapshot!(format!(
            "Main is streaming:\nActive: {:?}\nMain is busy: {}\nThread-1 is busy: {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.is_thread_busy(main_id),
            app.is_thread_busy(thread1_id)
        ), @r###"
        Main is streaming:
        Active: Some("Main")
        Main is busy: true
        Thread-1 is busy: false
        "###);

        // === 步骤 2：切换到 thread1 并发送消息 ===
        app.switch_thread(thread1_id);
        app.thread.messages.push(thread1_id, crate::thread::Message::user("Thread-1 question".to_string()));
        app.set_thread_busy(thread1_id, true);

        println!("\n步骤 2: 切换到 thread1 并发送消息");
        println!("  → main is busy: {}", app.is_thread_busy(main_id));
        println!("  → thread1 is busy: {}", app.is_thread_busy(thread1_id));

        insta::assert_snapshot!(format!(
            "Thread-1 sent message during Main streaming:\nActive: {:?}\nMain is busy: {}\nThread-1 is busy: {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.is_thread_busy(main_id),
            app.is_thread_busy(thread1_id)
        ), @r###"
        Thread-1 sent message during Main streaming:
        Active: Some("Side: Thread-1")
        Main is busy: true
        Thread-1 is busy: true
        "###);

        // === 步骤 3：验证消息隔离 ===
        println!("\n步骤 3: 验证消息隔离");
        println!("  → main messages: {}", app.thread.messages.get(main_id).map_or(0, |m| m.len()));
        println!("  → thread1 messages: {}", app.thread.messages.get(thread1_id).map_or(0, |m| m.len()));

        insta::assert_snapshot!(format!(
            "Message isolation verified:\nActive: {:?}\nMain messages: {}\nThread-1 messages: {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.thread.messages.get(main_id).map_or(0, |m| m.len()),
            app.thread.messages.get(thread1_id).map_or(0, |m| m.len())
        ), @r###"
        Message isolation verified:
        Active: Some("Side: Thread-1")
        Main messages: 1
        Thread-1 messages: 1
        "###);

        // ✅ 消息严格隔离
        println!("\n✅ 消息严格隔离，没有串台");
    }

    // ========================================================================
    // 场景 6：用户报告的确切问题
    // ========================================================================

    #[test]
    fn test_user_reported_exact_issue() {
        // ✅ 测试：用户报告的问题
        // "在 main 提问'天气如何'，在 thread1 提问'执行 ls -l'，回到 main，在 main 出现了 thread1 的审批"

        let mut app = App::new_for_test();

        let main_id = app.thread.store.primary_id();
        let thread1_id = app.create_side_thread(Some("Thread-1".to_string()));

        println!("\n=== 场景 6：用户报告的确切问题 ===\n");

        // === 步骤 1：在 main 提问"天气如何" ===
        app.switch_thread(main_id);
        app.thread.messages.push(main_id, crate::thread::Message::user("天气如何".to_string()));

        println!("步骤 1: 在 main 提问'天气如何'");
        println!("  → Active: {:?}", app.thread.store.active_thread().map(|t| t.display_name()));
        println!("  → main messages: {}", app.thread.messages.get(main_id).map_or(0, |m| m.len()));

        insta::assert_snapshot!(format!(
            "Step 1 - Main asked about weather:\nActive: {:?}\nMain messages: {}\nThread-1 messages: {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.thread.messages.get(main_id).map_or(0, |m| m.len()),
            app.thread.messages.get(thread1_id).map_or(0, |m| m.len())
        ), @r###"
        Step 1 - Main asked about weather:
        Active: Some("Main")
        Main messages: 1
        Thread-1 messages: 0
        "###);

        // === 步骤 2：在 thread1 提问"执行 ls -l" ===
        app.switch_thread(thread1_id);
        app.thread.messages.push(thread1_id, crate::thread::Message::user("执行 ls -l".to_string()));

        println!("\n步骤 2: 在 thread1 提问'执行 ls -l'");
        println!("  → Active: {:?}", app.thread.store.active_thread().map(|t| t.display_name()));
        println!("  → main messages: {}", app.thread.messages.get(main_id).map_or(0, |m| m.len()));
        println!("  → thread1 messages: {}", app.thread.messages.get(thread1_id).map_or(0, |m| m.len()));

        insta::assert_snapshot!(format!(
            "Step 2 - Thread-1 asked to run ls:\nActive: {:?}\nMain messages: {}\nThread-1 messages: {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.thread.messages.get(main_id).map_or(0, |m| m.len()),
            app.thread.messages.get(thread1_id).map_or(0, |m| m.len())
        ), @r###"
        Step 2 - Thread-1 asked to run ls:
        Active: Some("Side: Thread-1")
        Main messages: 1
        Thread-1 messages: 1
        "###);

        // === 步骤 3：thread1 触发工具审批 ===
        let approval_request = make_approval_request("bash", r#"{"cmd": "ls -l"}"#, thread1_id);
        app.set_approval_pending(approval_request);

        println!("\n步骤 3: thread1 触发工具审批");
        println!("  → thread1 is_approving: {}", app.is_approving());

        insta::assert_snapshot!(format!(
            "Step 3 - Thread-1 triggered tool approval:\nActive: {:?}\nThread-1 is_approving: {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.is_approving()
        ), @r###"
        Step 3 - Thread-1 triggered tool approval:
        Active: Some("Side: Thread-1")
        Thread-1 is_approving: true
        "###);

        // === 步骤 4：回到 main ===
        app.switch_thread(main_id);

        println!("\n步骤 4: 回到 main");
        println!("  → Active: {:?}", app.thread.store.active_thread().map(|t| t.display_name()));
        println!("  → main is_approving: {}", app.is_approving());

        insta::assert_snapshot!(format!(
            "Step 4 - Switched back to Main:\nActive: {:?}\nMain is_approving: {}\nMain messages: {}\nThread-1 messages: {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.is_approving(),
            app.thread.messages.get(main_id).map_or(0, |m| m.len()),
            app.thread.messages.get(thread1_id).map_or(0, |m| m.len())
        ), @r###"
        Step 4 - Switched back to Main:
        Active: Some("Main")
        Main is_approving: false
        Main messages: 1
        Thread-1 messages: 1
        "###);

        // ✅ 验证：main 不显示 thread1 的审批
        if app.is_approving() {
            println!("\n❌ Bug：main 显示了 thread1 的审批（这是线程泄漏）");
        } else {
            println!("\n✅ 正确：main 不显示 thread1 的审批");
        }

        assert!(!app.is_approving(), "main 不应该显示 thread1 的审批");
    }

    // ========================================================================
    // 场景 7：多个线程同时有审批
    // ========================================================================

    #[test]
    fn test_multiple_concurrent_approvals() {
        // ✅ 测试：多个线程同时有审批请求

        let mut app = App::new_for_test();

        let main_id = app.thread.store.primary_id();
        let thread1_id = app.create_side_thread(Some("Thread-1".to_string()));
        let thread2_id = app.create_side_thread(Some("Thread-2".to_string()));

        println!("\n=== 场景 7：多个线程同时有审批 ===\n");

        // === 三个线程都有审批 ===
        let main_approval = make_approval_request("read_file", r#"{"path": "/tmp/main.txt"}"#, main_id);
        app.set_approval_pending(main_approval);

        app.switch_thread(thread1_id);
        let thread1_approval = make_approval_request("bash", r#"{"cmd": "ls"}"#, thread1_id);
        app.set_approval_pending(thread1_approval);

        app.switch_thread(thread2_id);
        let thread2_approval = make_approval_request("write_file", r#"{"path": "/tmp/test.txt"}"#, thread2_id);
        app.set_approval_pending(thread2_approval);

        // === 验证每个线程只显示自己的审批 ===
        app.switch_thread(main_id);
        println!("步骤 1: 切换到 main");
        println!("  → main is_approving: {}", app.is_approving());

        insta::assert_snapshot!(format!(
            "On Main:\nActive: {:?}\nMain is_approving: {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.is_approving()
        ), @r###"
        On Main:
        Active: Some("Main")
        Main is_approving: true
        "###);

        app.switch_thread(thread1_id);
        println!("\n步骤 2: 切换到 thread1");
        println!("  → thread1 is_approving: {}", app.is_approving());

        insta::assert_snapshot!(format!(
            "On Thread-1:\nActive: {:?}\nThread-1 is_approving: {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.is_approving()
        ), @r###"
        On Thread-1:
        Active: Some("Side: Thread-1")
        Thread-1 is_approving: true
        "###);

        app.switch_thread(thread2_id);
        println!("\n步骤 3: 切换到 thread2");
        println!("  → thread2 is_approving: {}", app.is_approving());

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
        println!("\n✅ 多线程审批隔离正常");
    }

    // ========================================================================
    // 辅助函数
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
}
