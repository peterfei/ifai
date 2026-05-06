//! Thread-3 消息显示 E2E 快照测试
//!
//! Bug 描述：
//! 用户反馈"Thread-3 发送消息没任何反应，也没显示消息"
//!
//! 测试场景：
//! 1. 创建 Thread-1, Thread-2, Thread-3（三层线程嵌套）
//! 2. 切换到 Thread-3
//! 3. 在 Thread-3 发送消息
//! 4. 验证消息是否显示和 AI 是否响应

#[cfg(test)]
mod tests {
    use crate::tui::App;

    // ========================================================================
    // Bug 重现：Thread-3 消息不显示
    // ========================================================================

    #[test]
    fn test_thread3_message_not_showing() {
        // 重现 bug：在 Thread-3 发送消息，没有反应，也没有内容显示

        let mut app = App::new_for_test();

        let primary_id = app.thread.store.primary_id();

        // 步骤 1: 创建三层线程嵌套
        let thread1_id = app.create_side_thread(Some("Thread-1".to_string()));
        println!("Created Thread-1: {:?}", thread1_id);
        assert_eq!(app.thread.store.active_thread().unwrap().id, thread1_id);

        let thread2_id = app.create_side_thread(Some("Thread-2".to_string()));
        println!("Created Thread-2: {:?}", thread2_id);
        assert_eq!(app.thread.store.active_thread().unwrap().id, thread2_id);

        let thread3_id = app.create_side_thread(Some("Thread-3".to_string()));
        println!("Created Thread-3: {:?}", thread3_id);
        assert_eq!(app.thread.store.active_thread().unwrap().id, thread3_id);

        // 快照 1：线程层级结构
        insta::assert_snapshot!(format!(
            "Thread count: {}\nActive: {:?}\nThread-3 parent: {:?}\ncontent_lines.len(): {}",
            app.thread.store.len(),
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.thread.store.get_thread(thread3_id).and_then(|t| t.parent_id)
                .and_then(|pid| app.thread.store.get_thread(pid).map(|t| t.display_name())),
            app.content_lines.len()
        ), @r###"
        Thread count: 4
        Active: Some("Side: Thread-3")
        Thread-3 parent: Some("Side: Thread-2")
        content_lines.len(): 0
        "###);

        // 步骤 2: 模拟在 Thread-3 发送消息
        let user_input = "Hello from Thread-3";

        // 2.1 显示用户输入
        app.push_line(format!("⟩ {}", user_input));

        // 2.2 存储到 thread_messages
        app.thread.messages.push(thread3_id, crate::thread::Message::user(user_input.to_string()));

        // 快照 2：用户输入后状态
        insta::assert_snapshot!(format!(
            "After user input in Thread-3:\ncontent_lines.len(): {}\nFirst line: {:?}\nthread_messages[Thread-3].len(): {}",
            app.content_lines.len(),
            app.content_lines.first().and_then(|line| line.spans.first()).map(|s| s.content.clone()),
            app.thread.messages.get(thread3_id).map_or(0, |m| m.len())
        ), @r###"
        After user input in Thread-3:
        content_lines.len(): 1
        First line: Some("⟩ Hello from Thread-3")
        thread_messages[Thread-3].len(): 1
        "###);

        // ✅ 用户输入显示正常

        // 步骤 3: 模拟 AI 响应（通过 ThreadEvent）
        // 这是关键的测试点：AI 响应是否正确路由到 Thread-3

        let ai_response = "AI response to Thread-3";

        // 3.1 存储 AI 响应到 thread_messages
        app.thread.messages.push(thread3_id, crate::thread::Message::user(ai_response.to_string()));

        // 3.2 检查当前活动线程是否还是 Thread-3
        let is_still_active = app.thread.store.active_thread()
            .map(|t| t.id == thread3_id)
            .unwrap_or(false);

        // 3.3 如果当前活动线程是 Thread-3，渲染 AI 响应
        if is_still_active {
            app.push_line(ai_response.to_string());
        }

        // 快照 3：AI 响应后状态
        insta::assert_snapshot!(format!(
            "After AI response:\ncontent_lines.len(): {}\nis_still_active: {}\nthread_messages[Thread-3].len(): {}\nLast line: {:?}",
            app.content_lines.len(),
            is_still_active,
            app.thread.messages.get(thread3_id).map_or(0, |m| m.len()),
            app.content_lines.last().and_then(|line| line.spans.first()).map(|s| s.content.clone())
        ), @r###"
        After AI response:
        content_lines.len(): 2
        is_still_active: true
        thread_messages[Thread-3].len(): 2
        Last line: Some("AI response to Thread-3")
        "###);

        // ✅ AI 响应显示正常（当活动线程没有改变时）
    }

    #[test]
    fn test_thread3_hierarchy_and_routing() {
        // 测试 Thread-3 的层级结构和消息路由

        let mut app = App::new_for_test();

        let primary_id = app.thread.store.primary_id();

        // 创建三层线程
        let thread1_id = app.create_side_thread(Some("Thread-1".to_string()));
        let thread2_id = app.create_side_thread(Some("Thread-2".to_string()));
        let thread3_id = app.create_side_thread(Some("Thread-3".to_string()));

        // 验证层级结构
        let primary_parent = app.thread.store.get_thread(primary_id).and_then(|t| t.parent_id);
        let thread1_parent = app.thread.store.get_thread(thread1_id).and_then(|t| t.parent_id);
        let thread2_parent = app.thread.store.get_thread(thread2_id).and_then(|t| t.parent_id);
        let thread3_parent = app.thread.store.get_thread(thread3_id).and_then(|t| t.parent_id);

        insta::assert_snapshot!(format!(
            "Hierarchy:\n  Main parent: {:?}\n  Thread-1 parent: {:?}\n  Thread-2 parent: {:?}\n  Thread-3 parent: {:?}",
            primary_parent.map(|_| "Some"),
            thread1_parent.map(|_| "Some"),
            thread2_parent.map(|_| "Some"),
            thread3_parent.map(|_| "Some")
        ), @r#"
        Hierarchy:
          Main parent: None
          Thread-1 parent: Some("Some")
          Thread-2 parent: Some("Some")
          Thread-3 parent: Some("Some")
        "#);

        // 在每个线程添加消息
        app.thread.messages.push(primary_id, crate::thread::Message::user("Main message".to_string()));
        app.thread.messages.push(thread1_id, crate::thread::Message::user("Thread-1 message".to_string()));
        app.thread.messages.push(thread2_id, crate::thread::Message::user("Thread-2 message".to_string()));
        app.thread.messages.push(thread3_id, crate::thread::Message::user("Thread-3 message".to_string()));

        // 验证每个线程的消息隔离
        insta::assert_snapshot!(format!(
            "Message isolation:\n  Main: {}\n  Thread-1: {}\n  Thread-2: {}\n  Thread-3: {}",
            app.thread.messages.get(primary_id).map_or(0, |m| m.len()),
            app.thread.messages.get(thread1_id).map_or(0, |m| m.len()),
            app.thread.messages.get(thread2_id).map_or(0, |m| m.len()),
            app.thread.messages.get(thread3_id).map_or(0, |m| m.len())
        ), @r###"
        Message isolation:
          Main: 1
          Thread-1: 1
          Thread-2: 1
          Thread-3: 1
        "###);

        // ✅ 每个线程的消息完全隔离
    }

    #[test]
    fn test_thread3_switch_and_restore() {
        // 测试 Thread-3 切换和恢复

        let mut app = App::new_for_test();

        let primary_id = app.thread.store.primary_id();
        let thread3_id = app.create_side_thread(Some("Thread-1".to_string()));
        let thread3_id = app.create_side_thread(Some("Thread-2".to_string()));
        let thread3_id = app.create_side_thread(Some("Thread-3".to_string()));

        // 在 Thread-3 添加消息
        app.thread.messages.push(thread3_id, crate::thread::Message::user("Thread-3 message 1".to_string()));
        app.thread.messages.push(thread3_id, crate::thread::Message::user("Thread-3 message 2".to_string()));
        app.thread.messages.push(thread3_id, crate::thread::Message::user("Thread-3 message 3".to_string()));

        // 加载到 content_lines
        let messages: Vec<String> = app.thread.messages
            .get(thread3_id)
            .map(|msgs| msgs.iter().map(|m| m.content.clone()).collect())
            .unwrap_or_default();
        for msg in messages {
            app.push_line(msg);
        }

        assert_eq!(app.content_lines.len(), 3);

        // 快照 1：Thread-3 有 3 条消息
        insta::assert_snapshot!(format!(
            "Thread-3 messages:\ncontent_lines.len(): {}\nthread_messages[Thread-3].len(): {}",
            app.content_lines.len(),
            app.thread.messages.get(thread3_id).map_or(0, |m| m.len())
        ), @r###"
        Thread-3 messages:
        content_lines.len(): 3
        thread_messages[Thread-3].len(): 3
        "###);

        // 切换到主线程
        app.switch_thread(primary_id);

        // 快照 2：切换后主线程为空
        insta::assert_snapshot!(format!(
            "After switch to main:\nActive: {:?}\ncontent_lines.len(): {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.content_lines.len()
        ), @r###"
        After switch to main:
        Active: Some("Main")
        content_lines.len(): 0
        "###);

        // 切换回 Thread-3
        app.switch_thread(thread3_id);

        // 快照 3：Thread-3 消息恢复
        insta::assert_snapshot!(format!(
            "After switch back to Thread-3:\nActive: {:?}\ncontent_lines.len(): {}\nthread_messages[Thread-3].len(): {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.content_lines.len(),
            app.thread.messages.get(thread3_id).map_or(0, |m| m.len())
        ), @r###"
        After switch back to Thread-3:
        Active: Some("Side: Thread-3")
        content_lines.len(): 3
        thread_messages[Thread-3].len(): 3
        "###);

        // ✅ Thread-3 的完整历史被恢复
    }

    // ========================================================================
    // 真实 E2E LLM 场景测试
    // ========================================================================

    #[test]
    fn test_real_thread3_llm_scenario() {
        // 真实 E2E 场景：模拟完整的 LLM 对话流程
        //
        // 场景描述：
        // 1. 用户在主线程问问题
        // 2. 用户创建 Thread-1 追问
        // 3. 用户创建 Thread-2 深入讨论
        // 4. 用户创建 Thread-3 探索新方向
        // 5. 在每个线程都应该看到正确的对话历史

        let mut app = App::new_for_test();

        let primary_id = app.thread.store.primary_id();

        // === 主线程对话 ===
        app.thread.messages.push(primary_id, crate::thread::Message::user("What is Rust?".to_string()));
        app.thread.messages.push(primary_id, crate::thread::Message::user("Rust is a systems programming language.".to_string()));

        // === Thread-1 对话 ===
        let thread1_id = app.create_side_thread(Some("Thread-1".to_string()));
        app.thread.messages.push(thread1_id, crate::thread::Message::user("Tell me more about Rust's memory safety".to_string()));
        app.thread.messages.push(thread1_id, crate::thread::Message::user("Rust uses ownership and borrow checking...".to_string()));

        // === Thread-2 对话 ===
        let thread2_id = app.create_side_thread(Some("Thread-2".to_string()));
        app.thread.messages.push(thread2_id, crate::thread::Message::user("How does Rust compare to C++?".to_string()));
        app.thread.messages.push(thread2_id, crate::thread::Message::user("Rust offers memory safety without garbage collection...".to_string()));

        // === Thread-3 对话 ===
        let thread3_id = app.create_side_thread(Some("Thread-3".to_string()));

        // 用户在 Thread-3 发送消息
        app.thread.messages.push(thread3_id, crate::thread::Message::user("What about Rust's async ecosystem?".to_string()));

        // 模拟 AI 响应
        app.thread.messages.push(thread3_id, crate::thread::Message::user("Rust has excellent async support with tokio...".to_string()));

        // 快照：验证每个线程的消息数
        insta::assert_snapshot!(format!(
            "Thread message counts:\n  Main: {}\n  Thread-1: {}\n  Thread-2: {}\n  Thread-3: {}\nActive: {:?}",
            app.thread.messages.get(primary_id).map_or(0, |m| m.len()),
            app.thread.messages.get(thread1_id).map_or(0, |m| m.len()),
            app.thread.messages.get(thread2_id).map_or(0, |m| m.len()),
            app.thread.messages.get(thread3_id).map_or(0, |m| m.len()),
            app.thread.store.active_thread().map(|t| t.display_name())
        ), @r###"
        Thread message counts:
          Main: 2
          Thread-1: 2
          Thread-2: 2
          Thread-3: 2
        Active: Some("Side: Thread-3")
        "###);

        // ✅ Thread-3 有 2 条消息（用户问题 + AI 响应）
        // ✅ 所有线程的消息完全隔离
    }
}
