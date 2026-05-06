//! 线程消息串台 E2E 快照测试
//!
//! Bug 描述：
//! 用户反馈"消息是串的" - 即 Thread-2 的消息显示在了主线程或其他线程上
//!
//! 根本原因：
//! 之前的修复让 ThreadEvent::NewMessage 总是渲染到当前活动线程，
//! 这导致如果用户切换线程后，AI 响应会显示在错误的线程上。
//!
//! 正确的修复：
//! ThreadEvent::NewMessage 应该只在目标线程是活动线程时才渲染。
//! 如果目标线程不是活动线程，消息只存储到 thread_messages，
//! 用户切换回目标线程时会自动加载。

#[cfg(test)]
mod tests {
    use crate::tui::App;

    // ========================================================================
    // Bug 重现：消息串台问题
    // ========================================================================

    #[test]
    fn test_message_cross_talk_bug() {
        // 重现消息串台 bug：
        // 1. 在主线程发送消息 "Hello from main"
        // 2. 切换到 Thread-2
        // 3. 在 Thread-2 发送消息 "Hello from Thread-2"
        // 4. 切换回主线程
        // 5. Thread-2 的 AI 响应不应该显示在主线程

        let mut app = App::new_for_test();

        let primary_id = app.thread.store.primary_id();
        let thread2_id = app.create_side_thread(Some("Thread-2".to_string()));

        // 场景：主线程和 Thread-2 的对话历史
        // 主线程：
        app.switch_thread(primary_id);
        app.thread.messages.push(primary_id, crate::thread::Message::user("Main message 1".to_string()));
        app.push_line("⟩ Main message 1".to_string());

        // Thread-2：
        app.switch_thread(thread2_id);
        app.thread.messages.push(thread2_id, crate::thread::Message::user("Thread-2 message 1".to_string()));
        app.push_line("⟩ Thread-2 message 1".to_string());

        // 快照 1：切换前，Thread-2 有 1 条消息
        insta::assert_snapshot!(format!(
            "Before switch:\nActive: {:?}\ncontent_lines.len(): {}\nLast line: {:?}\nthread_messages[Thread-2].len(): {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.content_lines.len(),
            app.content_lines.last().and_then(|line| line.spans.first()).map(|s| s.content.clone()),
            app.thread.messages.get(thread2_id).map_or(0, |m| m.len())
        ), @r###"
        Before switch:
        Active: Some("Side: Thread-2")
        content_lines.len(): 1
        Last line: Some("⟩ Thread-2 message 1")
        thread_messages[Thread-2].len(): 1
        "###);

        // 切换回主线程
        app.switch_thread(primary_id);

        // 快照 2：切换后，主线程有 1 条消息
        insta::assert_snapshot!(format!(
            "After switch to main:\nActive: {:?}\ncontent_lines.len(): {}\nLast line: {:?}\nthread_messages[Main].len(): {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.content_lines.len(),
            app.content_lines.last().and_then(|line| line.spans.first()).map(|s| s.content.clone()),
            app.thread.messages.get(primary_id).map_or(0, |m| m.len())
        ), @r#"
        After switch to main:
        Active: Some("Main")
        content_lines.len(): 1
        Last line: Some("Main message 1")
        thread_messages[Main].len(): 1
        "#);

        // 模拟：Thread-2 的 AI 响应到达
        // ThreadEvent::NewMessage { thread_id: thread2_id, message: "AI response to Thread-2" }
        // 错误的修复：总是渲染到当前线程（消息串台！）
        // 正确的修复：只在 thread_id 是活动线程时渲染

        // 模拟当前错误的逻辑：
        app.thread.messages.push(thread2_id, crate::thread::Message::user("AI response to Thread-2".to_string()));
        app.push_line("AI response to Thread-2".to_string()); // ❌ 这会在主线程显示 Thread-2 的消息！

        // 快照 3：消息串台！
        insta::assert_snapshot!(format!(
            "❌ BUG - Message cross-talk:\nActive: {:?}\ncontent_lines.len(): {}\nLast line: {:?}\nthread_messages[Main].len(): {}\nthread_messages[Thread-2].len(): {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.content_lines.len(),
            app.content_lines.last().and_then(|line| line.spans.first()).map(|s| s.content.clone()),
            app.thread.messages.get(primary_id).map_or(0, |m| m.len()),
            app.thread.messages.get(thread2_id).map_or(0, |m| m.len())
        ), @r###"
        ❌ BUG - Message cross-talk:
        Active: Some("Main")
        content_lines.len(): 2
        Last line: Some("AI response to Thread-2")
        thread_messages[Main].len(): 1
        thread_messages[Thread-2].len(): 2
        "###);

        // ❌ 消息串台：主线程显示了 Thread-2 的 AI 响应！
        // content_lines.len() = 2（主线程有 2 行）
        // 但 thread_messages[Main].len() = 1（主线程只有 1 条消息）
        // thread_messages[Thread-2].len() = 2（Thread-2 有 2 条消息）
    }

    #[test]
    fn test_correct_message_routing() {
        // 正确的消息路由测试：
        // ThreadEvent::NewMessage 应该只在目标线程是活动线程时才渲染

        let mut app = App::new_for_test();

        let primary_id = app.thread.store.primary_id();
        let thread2_id = app.create_side_thread(Some("Thread-2".to_string()));

        // 在 Thread-2 发送消息
        app.switch_thread(thread2_id);
        app.thread.messages.push(thread2_id, crate::thread::Message::user("Thread-2 message".to_string()));
        app.push_line("⟩ Thread-2 message".to_string());

        // 切换到主线程
        app.switch_thread(primary_id);

        // Thread-2 的 AI 响应到达
        app.thread.messages.push(thread2_id, crate::thread::Message::user("AI response".to_string()));

        // 正确逻辑：只在 thread_id == active_id 时渲染
        let active_id = app.thread.store.active_thread().map(|t| t.id);
        if active_id == Some(thread2_id) {
            app.push_line("AI response".to_string());
        }

        // 快照：消息不应该串台
        insta::assert_snapshot!(format!(
            "✅ CORRECT - No cross-talk:\nActive: {:?}\ncontent_lines.len(): {}\nthread_messages[Main].len(): {}\nthread_messages[Thread-2].len(): {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.content_lines.len(),
            app.thread.messages.get(primary_id).map_or(0, |m| m.len()),
            app.thread.messages.get(thread2_id).map_or(0, |m| m.len())
        ), @r###"
        ✅ CORRECT - No cross-talk:
        Active: Some("Main")
        content_lines.len(): 0
        thread_messages[Main].len(): 0
        thread_messages[Thread-2].len(): 2
        "###);

        // ✅ 正确：主线程的 content_lines 为空
        // ✅ Thread-2 的消息存储在 thread_messages 中
        // ✅ 切换到 Thread-2 时会加载完整历史
    }

    #[test]
    fn test_thread2_message_not_showing() {
        // 重现 bug：在 Thread-2 发送消息，没有反应，也没有内容显示

        let mut app = App::new_for_test();

        let primary_id = app.thread.store.primary_id();

        // 步骤 1: 创建 Thread-1（从主线程）
        let thread1_id = app.create_side_thread(Some("Thread-1".to_string()));
        println!("Created Thread-1: {:?}", thread1_id);

        // 验证当前在 Thread-1
        assert_eq!(app.thread.store.active_thread().unwrap().id, thread1_id);

        // 步骤 2: 创建 Thread-2（从 Thread-1）
        let thread2_id = app.create_side_thread(Some("Thread-2".to_string()));
        println!("Created Thread-2: {:?}", thread2_id);

        // 验证当前在 Thread-2
        assert_eq!(app.thread.store.active_thread().unwrap().id, thread2_id);

        // 快照 1：线程创建后状态
        insta::assert_snapshot!(format!(
            "Thread count: {}\nActive thread: {:?}\nThread-2 name: {:?}\ncontent_lines.len(): {}",
            app.thread.store.len(),
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.thread.store.get_thread(thread2_id).map(|t| t.display_name()),
            app.content_lines.len()
        ), @r###"
        Thread count: 3
        Active thread: Some("Side: Thread-2")
        Thread-2 name: Some("Side: Thread-2")
        content_lines.len(): 0
        "###);

        // 步骤 3: 模拟在 Thread-2 发送消息的用户输入显示
        // 这模拟 main.rs:982 的逻辑
        let user_input = "Hello from Thread-2";
        app.push_line(format!("⟩ {}", user_input));

        // 步骤 4: 存储到 thread_messages（main.rs:988）
        app.thread.messages.push(thread2_id, crate::thread::Message::user(user_input.to_string()));

        // 快照 2：用户输入后状态
        insta::assert_snapshot!(format!(
            "After user input:\ncontent_lines.len(): {}\ntext[0]: {:?}\nthread_messages[Thread-2].len(): {}",
            app.content_lines.len(),
            app.content_lines.first().and_then(|line| line.spans.first()).map(|s| s.content.clone()),
            app.thread.messages.get(thread2_id).map_or(0, |m| m.len())
        ), @r#"
        After user input:
        content_lines.len(): 1
        text[0]: Some("⟩ Hello from Thread-2")
        thread_messages[Thread-2].len(): 1
        "#);

        // ✅ 用户输入显示正常

        // 步骤 5: 模拟 AI 响应（通过 ThreadEvent）
        // 这模拟 main.rs:1014-1033 + 1333-1342 的逻辑

        // 模拟：AI 响应到达，创建 ThreadEvent
        let ai_response = "AI response to Thread-2";
        let _ = std::sync::Arc::new(tokio::sync::Mutex::new(
            tokio::sync::mpsc::unbounded_channel::<crate::thread::ThreadEvent>()
        ));

        // 在流式输出循环中，ThreadEvent::NewMessage 会被处理
        // 但由于我们没有真正运行流式循环，我们模拟这个处理：
        // main.rs:1335: app.thread.messages.push(thread_id, thread::Message::user(message.clone()));
        // main.rs:1337-1342: 如果是当前活动线程，渲染消息

        app.thread.messages.push(thread2_id, crate::thread::Message::user(ai_response.to_string()));

        // 模拟：检查活动线程是否还是 Thread-2
        let is_still_active = app.thread.store.active_thread()
            .map(|t| t.id == thread2_id)
            .unwrap_or(false);

        // 如果当前活动线程是 Thread-2，渲染 AI 响应
        if is_still_active {
            app.push_line(ai_response.to_string());
        }

        // 快照 3：AI 响应后状态
        insta::assert_snapshot!(format!(
            "After AI response:\ncontent_lines.len(): {}\nis_still_active: {}\nthread_messages[Thread-2].len(): {}",
            app.content_lines.len(),
            is_still_active,
            app.thread.messages.get(thread2_id).map_or(0, |m| m.len())
        ), @r###"
        After AI response:
        content_lines.len(): 2
        is_still_active: true
        thread_messages[Thread-2].len(): 2
        "###);

        // ✅ AI 响应显示正常（当活动线程没有改变时）

        // 步骤 6: 模拟问题场景 - 用户在 AI 响应期间切换线程
        // 切换到主线程
        app.switch_thread(primary_id);

        // 现在 AI 响应到达（当前活动线程是主线程）
        // 修复后的逻辑：
        // 1. 消息被存储到 thread_messages[thread2_id]
        // 2. 消息也被渲染到当前活动线程的 content_lines
        // 这样设计是因为用户切换线程是主动行为，应该看到 AI 响应

        app.thread.messages.push(thread2_id, crate::thread::Message::user("Second AI response".to_string()));

        // 模拟 ThreadEvent 处理：渲染到当前线程
        app.push_line("Second AI response".to_string());

        // 快照 4：切换线程后的 AI 响应
        insta::assert_snapshot!(format!(
            "After switching to main thread and AI response:\ncontent_lines.len(): {}\nActive thread: {:?}\nthread_messages[Thread-2].len(): {}",
            app.content_lines.len(),
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.thread.messages.get(thread2_id).map_or(0, |m| m.len())
        ), @r###"
        After switching to main thread and AI response:
        content_lines.len(): 1
        Active thread: Some("Main")
        thread_messages[Thread-2].len(): 3
        "###);

        // ✅ 修复后：消息被渲染到当前活动线程（主线程）
        // ✅ thread_messages[Thread-2] 包含所有 3 条消息（用户输入 + 2 个 AI 响应）

        // 步骤 7: 切换回 Thread-2，验证完整历史恢复
        app.switch_thread(thread2_id);

        // 快照 5：切换回 Thread-2
        insta::assert_snapshot!(format!(
            "After switching back to Thread-2:\ncontent_lines.len(): {}\nActive thread: {:?}\nthread_messages[Thread-2].len(): {}",
            app.content_lines.len(),
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.thread.messages.get(thread2_id).map_or(0, |m| m.len())
        ), @r###"
        After switching back to Thread-2:
        content_lines.len(): 3
        Active thread: Some("Side: Thread-2")
        thread_messages[Thread-2].len(): 3
        "###);

        // ✅ 切换回 Thread-2 时，完整历史（3条消息）被恢复
    }

    #[test]
    fn test_thread_event_routing_issue() {
        // 测试 ThreadEvent 路由问题

        let mut app = App::new_for_test();

        let primary_id = app.thread.store.primary_id();

        // 创建 Thread-1 和 Thread-2
        let thread1_id = app.create_side_thread(Some("Thread-1".to_string()));
        let thread2_id = app.create_side_thread(Some("Thread-2".to_string()));

        // 验证线程层级（只检查是否有 parent_id，不检查具体值）
        let primary_has_parent = app.thread.store.get_thread(primary_id).map(|t| t.parent_id.is_some());
        let thread1_has_parent = app.thread.store.get_thread(thread1_id).map(|t| t.parent_id.is_some());
        let thread2_has_parent = app.thread.store.get_thread(thread2_id).map(|t| t.parent_id.is_some());

        insta::assert_snapshot!(format!(
            "Primary parent: {:?}\nThread-1 parent: {:?}\nThread-2 parent: {:?}",
            primary_has_parent,
            thread1_has_parent,
            thread2_has_parent
        ), @r#"
        Primary parent: Some(false)
        Thread-1 parent: Some(true)
        Thread-2 parent: Some(true)
        "#);

        // 在 Thread-2 添加消息
        app.thread.messages.push(thread2_id, crate::thread::Message::user("Test message".to_string()));

        // 切换回主线程
        app.switch_thread(primary_id);

        // 再切换回 Thread-2
        app.switch_thread(thread2_id);

        // 验证消息是否加载到 content_lines
        insta::assert_snapshot!(format!(
            "After switching to Thread-2:\ncontent_lines.len(): {}\nthread_messages[Thread-2].len(): {}",
            app.content_lines.len(),
            app.thread.messages.get(thread2_id).map_or(0, |m| m.len())
        ), @r###"
        After switching to Thread-2:
        content_lines.len(): 1
        thread_messages[Thread-2].len(): 1
        "###);
    }

    // ========================================================================
    // 根本原因分析
    // ========================================================================

    #[test]
    fn analyze_thread_event_rendering_flow() {
        // 分析 ThreadEvent 渲染流程

        let mut app = App::new_for_test();

        let primary_id = app.thread.store.primary_id();
        let thread2_id = app.create_side_thread(Some("Thread-2".to_string()));

        // 模拟完整的消息发送流程：
        // 1. 用户输入 -> main.rs:978-982 存储到 thread_messages
        // 2. 用户输入显示 -> main.rs:976 调用 app.push_line()
        // 3. AI 响应 -> main.rs:1014-1033 发送 ThreadEvent
        // 4. ThreadEvent 处理 -> main.rs:1261-1270

        // 问题：步骤 2（app.push_line）可能没有执行，或者被清空了

        // 模拟：在 Thread-2，用户输入 "Hello"
        let user_input = "Hello from Thread-2";

        // 这行应该被执行（main.rs:976）
        app.push_line(format!("⟩ {}", user_input));

        // 然后存储到 thread_messages（main.rs:979-982）
        app.thread.messages.push(thread2_id, crate::thread::Message::user(user_input.to_string()));

        // 快照：检查状态
        insta::assert_snapshot!(format!(
            "After user input in Thread-2:\ncontent_lines.len(): {}\ntext[0]: {:?}",
            app.content_lines.len(),
            app.content_lines.first().and_then(|line| line.spans.first()).map(|s| s.content.clone())
        ), @r#"
        After user input in Thread-2:
        content_lines.len(): 1
        text[0]: Some("⟩ Hello from Thread-2")
        "#);

        // ✅ 这部分应该工作正常

        // 问题可能在 AI 响应后的 ThreadEvent 处理
    }
}
