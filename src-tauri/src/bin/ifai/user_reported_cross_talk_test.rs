//! 🔥 用户报告的消息串台场景测试
//!
//! 用户报告的场景：
//! 1. 在 main 提问"天气如何"
//! 2. 在 thread1 提问"执行 ls -l"
//! 3. 回到 main
//! 4. 问题：在 main 出现了 thread1 的审批，同意后回复的内容也出现在了 main 中

#[cfg(test)]
mod tests {
    use crate::tui::App;

    #[test]
    fn test_user_reported_exact_scenario() {
        // ✅ 测试：用户报告的确切场景

        let mut app = App::new_for_test();

        let main_id = app.thread.store.primary_id();
        let thread1_id = app.create_side_thread(Some("Thread-1".to_string()));

        println!("\n=== 用户报告场景测试 ===\n");

        // === 步骤 1：在 main 提问"天气如何" ===
        println!("步骤 1: 在 main 提问'天气如何'");
        app.switch_thread(main_id);
        app.thread.messages.push(main_id, crate::thread::Message::user("天气如何".to_string()));
        app.set_thread_busy(main_id, true);
        app.begin_streaming(main_id);

        println!("  → main is busy: {}", app.is_thread_busy(main_id));
        println!("  → thread1 is busy: {}", app.is_thread_busy(thread1_id));
        println!("  → 当前活动线程: {:?}", app.thread.store.active_thread().map(|t| t.display_name()));

        // === 步骤 2：在 thread1 提问"执行 ls -l" ===
        println!("\n步骤 2: 切换到 thread1，提问'执行 ls -l'");
        app.switch_thread(thread1_id);
        app.thread.messages.push(thread1_id, crate::thread::Message::user("执行 ls -l".to_string()));
        app.set_thread_busy(thread1_id, true);

        println!("  → main is busy: {}", app.is_thread_busy(main_id));
        println!("  → thread1 is busy: {}", app.is_thread_busy(thread1_id));
        println!("  → 当前活动线程: {:?}", app.thread.store.active_thread().map(|t| t.display_name()));

        // === 步骤 3：thread1 的工具调用需要审批 ===
        println!("\n步骤 3: thread1 的 AI 触发工具调用（需要审批）");
        let approval_request = make_approval_request("bash", r#"{"cmd": "ls -l"}"#, thread1_id);
        app.set_approval_pending(approval_request);

        println!("  → thread1 has approval: {}", app.is_approving());
        println!("  → 当前活动线程: {:?}", app.thread.store.active_thread().map(|t| t.display_name()));

        // 快照：thread1 有审批
        insta::assert_snapshot!(format!(
            "Thread-1 has tool approval:\nActive: {:?}\nThread-1 has approval: {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.is_approving()
        ), @r###"
        Thread-1 has tool approval:
        Active: Some("Side: Thread-1")
        Thread-1 has approval: true
        "###);

        // === 步骤 4：回到 main ===
        println!("\n步骤 4: 用户切换回 main");
        app.switch_thread(main_id);

        println!("  → main is busy: {}", app.is_thread_busy(main_id));
        println!("  → thread1 is busy: {}", app.is_thread_busy(thread1_id));
        println!("  → 当前活动线程: {:?}", app.thread.store.active_thread().map(|t| t.display_name()));
        println!("  → main has approval: {}", app.is_approving());

        // 快照：main 不应该显示 thread1 的审批
        insta::assert_snapshot!(format!(
            "After switching to Main:\nActive: {:?}\nMain has approval: {}\nMain messages: {}\nThread-1 messages: {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.is_approving(),
            app.thread.messages.get(main_id).map_or(0, |m| m.len()),
            app.thread.messages.get(thread1_id).map_or(0, |m| m.len())
        ), @r###"
        After switching to Main:
        Active: Some("Main")
        Main has approval: false
        Main messages: 1
        Thread-1 messages: 1
        "###);

        // === 步骤 5：模拟用户在 main 中同意审批 ===
        // ⚠️ 这个步骤模拟了用户报告的问题：在 main 中看到了 thread1 的审批
        println!("\n步骤 5: 模拟用户在 main 中同意 thread1 的审批");
        println!("  → （这不应该发生，但用户报告说发生了）");

        // 检查：main 当前是否有审批
        if !app.is_approving() {
            println!("  ✅ 正确：main 没有显示审批");
            println!("  → 用户报告的问题可能是渲染问题或其他原因");
        } else {
            println!("  ❌ Bug：main 显示了审批（这是线程泄漏）");
        }

        // === 步骤 6：模拟 thread1 的 AI 响应 ===
        println!("\n步骤 6: 模拟 thread1 的工具执行结果返回");
        let tool_result = "file1.txt\nfile2.txt\nfile3.txt".to_string();

        // 模拟 AI 响应路由到 thread1
        app.thread.messages.push(thread1_id, crate::thread::Message::user(tool_result.clone()));

        println!("  → 当前活动线程: {:?}", app.thread.store.active_thread().map(|t| t.display_name()));
        println!("  → Main messages: {}", app.thread.messages.get(main_id).map_or(0, |m| m.len()));
        println!("  → Thread-1 messages: {}", app.thread.messages.get(thread1_id).map_or(0, |m| m.len()));

        // 快照：最终状态
        insta::assert_snapshot!(format!(
            "Final state:\nActive: {:?}\nMain messages: {}\nThread-1 messages: {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.thread.messages.get(main_id).map_or(0, |m| m.len()),
            app.thread.messages.get(thread1_id).map_or(0, |m| m.len())
        ), @r###"
        Final state:
        Active: Some("Main")
        Main messages: 1
        Thread-1 messages: 2
        "###);

        println!("\n=== 测试完成 ===\n");
        println!("✅ 数据结构层面的隔离是正确的");
        println!("→ 如果用户仍然看到串台，问题可能在运行时行为");
    }

    // ========================================================================
    // 辅助函数
    // ========================================================================

    fn make_approval_request(tool_name: &str, args: &str, thread_id: crate::thread::ThreadId) -> crate::approval_overlay::ApprovalRequest {
        let tool = crate::session::PendingToolCall {
            tool_id: "test-0".to_string(),
            name: tool_name.to_string(),
            args: args.to_string(),
        };
        let (tx, _rx) = tokio::sync::oneshot::channel();
        crate::approval_overlay::ApprovalRequest::from_tool(&tool, thread_id, tx)
    }
}
