//! 线程消息隔离失败 E2E 快照测试
//!
//! Bug 描述：
//! 用户反馈"thread1 的回复出现在了 thread2，没有隔离"
//!
//! 测试场景：
//! 1. 在 Thread-1 发送消息
//! 2. 切换到 Thread-2
//! 3. Thread-1 的 AI 响应到达
//! 4. 验证 AI 响应是否错误显示在 Thread-2

#[cfg(test)]
mod tests {
    use crate::tui::App;

    // ========================================================================
    // Bug 重现：Thread-1 回复出现在 Thread-2
    // ========================================================================

    #[test]
    fn test_thread1_response_leaks_to_thread2() {
        // 重现 bug：Thread-1 的 AI 响应显示在 Thread-2

        let mut app = App::new_for_test();

        let primary_id = app.thread.store.primary_id();

        // 创建 Thread-1 和 Thread-2
        let thread1_id = app.create_side_thread(Some("Thread-1".to_string()));
        let thread2_id = app.create_side_thread(Some("Thread-2".to_string()));

        // === 场景 1：在 Thread-1 发送消息 ===
        app.switch_thread(thread1_id);

        // 用户输入
        let user_input_t1 = "Tell me about Rust";
        app.push_line(format!("⟩ {}", user_input_t1));
        app.thread.messages.push(
            thread1_id,
            crate::thread::Message::user(user_input_t1.to_string()),
        );

        // 快照 1：Thread-1 用户输入后
        insta::assert_snapshot!(format!(
            "After Thread-1 user input:\nActive: {:?}\ncontent_lines.len(): {}\nLast line: {:?}\nthread_messages[Thread-1].len(): {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.content_lines.len(),
            app.content_lines.last().and_then(|line| line.spans.first()).map(|s| s.content.clone()),
            app.thread.messages.get(thread1_id).map_or(0, |m| m.len())
        ), @r###"
        After Thread-1 user input:
        Active: Some("Side: Thread-1")
        content_lines.len(): 1
        Last line: Some("⟩ Tell me about Rust")
        thread_messages[Thread-1].len(): 1
        "###);

        // 切换到 Thread-2（在 AI 响应到达之前）
        app.switch_thread(thread2_id);

        // 在 Thread-2 发送消息
        let user_input_t2 = "Tell me about Go";
        app.push_line(format!("⟩ {}", user_input_t2));
        app.thread.messages.push(
            thread2_id,
            crate::thread::Message::user(user_input_t2.to_string()),
        );

        // 快照 2：Thread-2 用户输入后
        insta::assert_snapshot!(format!(
            "After Thread-2 user input:\nActive: {:?}\ncontent_lines.len(): {}\nLast line: {:?}\nthread_messages[Thread-2].len(): {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.content_lines.len(),
            app.content_lines.last().and_then(|line| line.spans.first()).map(|s| s.content.clone()),
            app.thread.messages.get(thread2_id).map_or(0, |m| m.len())
        ), @r###"
        After Thread-2 user input:
        Active: Some("Side: Thread-2")
        content_lines.len(): 1
        Last line: Some("⟩ Tell me about Go")
        thread_messages[Thread-2].len(): 1
        "###);

        // === 关键测试点：Thread-1 的 AI 响应到达 ===
        // 模拟：Thread-1 的 AI 响应到达
        // ThreadEvent::NewMessage { thread_id: thread1_id, message: "Rust is..." }

        let ai_response_t1 = "Rust is a systems programming language";

        // 存储 AI 响应到 thread_messages
        app.thread.messages.push(
            thread1_id,
            crate::thread::Message::user(ai_response_t1.to_string()),
        );

        // ❌ BUG：当前的实现会检查活动线程是否是 thread1_id
        // 但当前活动线程是 thread2_id，所以理论上不应该渲染
        // 让我们验证这个逻辑

        let active_id = app.thread.store.active_thread().map(|t| t.id);

        // 模拟 main.rs:1339-1346 的逻辑
        if let Some(active) = app.thread.store.active_thread() {
            if active.id == thread1_id {
                app.push_line(ai_response_t1.to_string());
            }
        }

        // 快照 3：Thread-1 AI 响应后（应该不在 Thread-2 显示）
        insta::assert_snapshot!(format!(
            "After Thread-1 AI response:\nActive: {:?}\ncontent_lines.len(): {}\nLast line: {:?}\nthread_messages[Thread-1].len(): {}\nthread_messages[Thread-2].len(): {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.content_lines.len(),
            app.content_lines.last().and_then(|line| line.spans.first()).map(|s| s.content.clone()),
            app.thread.messages.get(thread1_id).map_or(0, |m| m.len()),
            app.thread.messages.get(thread2_id).map_or(0, |m| m.len())
        ), @r###"
        After Thread-1 AI response:
        Active: Some("Side: Thread-2")
        content_lines.len(): 1
        Last line: Some("⟩ Tell me about Go")
        thread_messages[Thread-1].len(): 2
        thread_messages[Thread-2].len(): 1
        "###);

        // ✅ 正确：Thread-2 的 content_lines 没有显示 Thread-1 的 AI 响应
        // ✅ Thread-1 的 AI 响应被存储在 thread_messages[Thread-1]
    }

    #[test]
    fn test_thread_event_routing_bug() {
        // 测试实际的 bug：ThreadEvent 路由错误

        let mut app = App::new_for_test();

        let primary_id = app.thread.store.primary_id();
        let thread1_id = app.create_side_thread(Some("Thread-1".to_string()));
        let thread2_id = app.create_side_thread(Some("Thread-2".to_string()));

        // 在 Thread-1 发送消息
        app.switch_thread(thread1_id);
        app.thread.messages.push(
            thread1_id,
            crate::thread::Message::user("Thread-1 question".to_string()),
        );

        // 切换到 Thread-2
        app.switch_thread(thread2_id);
        app.thread.messages.push(
            thread2_id,
            crate::thread::Message::user("Thread-2 question".to_string()),
        );

        // 模拟：用户在 Thread-2，但 ThreadEvent::NewMessage 被错误路由

        // 检查当前活动线程
        let active_thread_id = app
            .thread
            .store
            .active_thread()
            .map(|t| t.id)
            .unwrap_or_else(|| app.thread.store.primary_id());

        // 模拟 main.rs:1031-1038 的逻辑
        // ❌ BUG：如果这里使用了错误的 active_thread_id
        // 比如，如果在发送 ThreadEvent 时获取的活动线程 ID 是错误的

        // 正确的流程：
        // 1. 用户在 Thread-1 输入 -> active_thread_id = thread1_id -> ThreadEvent { thread_id: thread1_id }
        // 2. 用户切换到 Thread-2
        // 3. ThreadEvent 到达 -> thread_id = thread1_id != active_id = thread2_id -> 不渲染 ✅

        // 错误的流程（可能的情况）：
        // 1. 用户在 Thread-1 输入
        // 2. 用户切换到 Thread-2
        // 3. ThreadEvent 发送时使用了当前的 active_thread_id = thread2_id（错误！）
        // 4. ThreadEvent { thread_id: thread2_id, message: "Thread-1 的 AI 响应" }
        // 5. thread_id == active_id -> 渲染到 Thread-2 ❌

        insta::assert_snapshot!(format!(
            "Thread isolation check:\nActive: {:?}\nThread-1 messages: {}\nThread-2 messages: {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.thread.messages.get(thread1_id).map_or(0, |m| m.len()),
            app.thread.messages.get(thread2_id).map_or(0, |m| m.len())
        ), @r###"
        Thread isolation check:
        Active: Some("Side: Thread-2")
        Thread-1 messages: 1
        Thread-2 messages: 1
        "###);
    }

    #[test]
    fn test_thread_event_send_timing_issue() {
        // 测试 ThreadEvent 发送时序问题

        let mut app = App::new_for_test();

        let primary_id = app.thread.store.primary_id();
        let thread1_id = app.create_side_thread(Some("Thread-1".to_string()));
        let thread2_id = app.create_side_thread(Some("Thread-2".to_string()));

        // === 问题场景 ===
        // 1. 用户在 Thread-1 发送消息
        // 2. 代码记录 active_thread_id = thread1_id
        // 3. 用户立即切换到 Thread-2
        // 4. AI 响应到达，发送 ThreadEvent { thread_id: thread1_id }
        // 5. 当前活动线程是 thread2_id
        // 6. 代码检查 thread_id == active_id -> false -> 不渲染

        // 这是正确的行为！

        // 但如果代码在步骤 4 时使用了当前的 active_thread_id（thread2_id）而不是记录的（thread1_id）
        // 那么 ThreadEvent 会是 { thread_id: thread2_id }
        // 然后步骤 6 的检查会通过 -> 错误地渲染到 Thread-2

        app.switch_thread(thread1_id);

        // 记录用户输入时的活动线程 ID
        let active_at_input_time = app.thread.store.active_thread().map(|t| t.id).unwrap();

        app.thread.messages.push(
            thread1_id,
            crate::thread::Message::user("Question".to_string()),
        );

        // 用户切换到 Thread-2
        app.switch_thread(thread2_id);

        // AI 响应到达
        // 正确：使用 active_at_input_time（thread1_id）
        // 错误：使用当前的 active_thread()（thread2_id）

        let correct_thread_id = active_at_input_time;
        let wrong_thread_id = app.thread.store.active_thread().map(|t| t.id).unwrap();

        insta::assert_snapshot!(format!(
            "Timing issue:\nCorrect thread_id: {:?}\nWrong thread_id: {:?}\nCurrent active: {:?}",
            correct_thread_id == thread1_id,
            wrong_thread_id == thread2_id,
            app.thread.store.active_thread().map(|t| t.display_name())
        ), @r###"
        Timing issue:
        Correct thread_id: true
        Wrong thread_id: true
        Current active: Some("Side: Thread-2")
        "###);

        // 这说明如果代码使用了错误的 active_thread_id，就会导致消息串台
    }

    #[test]
    fn test_real_world_cross_talk_scenario() {
        // 真实世界场景：用户快速切换线程

        let mut app = App::new_for_test();

        let primary_id = app.thread.store.primary_id();
        let thread1_id = app.create_side_thread(Some("Thread-1".to_string()));
        let thread2_id = app.create_side_thread(Some("Thread-2".to_string()));

        // 用户在 Thread-1 发送消息，然后快速切换到 Thread-2
        app.switch_thread(thread1_id);

        // 步骤 1：用户输入
        let user_input = "What is Rust?";
        app.push_line(format!("⟩ {}", user_input));

        // 步骤 2：存储到 thread_messages
        app.thread.messages.push(
            thread1_id,
            crate::thread::Message::user(user_input.to_string()),
        );

        // 步骤 3：用户立即切换到 Thread-2（AI 响应还未到达）
        app.switch_thread(thread2_id);

        // 步骤 4：在 Thread-2 也发送消息
        let user_input2 = "What is Go?";
        app.push_line(format!("⟩ {}", user_input2));
        app.thread.messages.push(
            thread2_id,
            crate::thread::Message::user(user_input2.to_string()),
        );

        // 快照：两个线程都有用户输入
        insta::assert_snapshot!(format!(
            "Both threads have user input:\nActive: {:?}\ncontent_lines.len(): {}\nThread-1 messages: {}\nThread-2 messages: {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.content_lines.len(),
            app.thread.messages.get(thread1_id).map_or(0, |m| m.len()),
            app.thread.messages.get(thread2_id).map_or(0, |m| m.len())
        ), @r###"
        Both threads have user input:
        Active: Some("Side: Thread-2")
        content_lines.len(): 1
        Thread-1 messages: 1
        Thread-2 messages: 1
        "###);

        // 步骤 5：Thread-1 的 AI 响应到达
        let ai_response_t1 = "Rust is a systems programming language";
        app.thread.messages.push(
            thread1_id,
            crate::thread::Message::user(ai_response_t1.to_string()),
        );

        // 步骤 6：Thread-2 的 AI 响应也到达
        let ai_response_t2 = "Go is a language developed by Google";
        app.thread.messages.push(
            thread2_id,
            crate::thread::Message::user(ai_response_t2.to_string()),
        );

        // 正确的渲染逻辑：
        // - Thread-1 的响应只渲染到 Thread-1
        // - Thread-2 的响应只渲染到 Thread-2

        // 当前活动线程是 Thread-2，所以只渲染 Thread-2 的响应
        if let Some(active) = app.thread.store.active_thread() {
            if active.id == thread2_id {
                app.push_line(ai_response_t2.to_string());
            }
        }

        // 快照：只有 Thread-2 的响应被渲染
        insta::assert_snapshot!(format!(
            "Only Thread-2 response rendered:\nActive: {:?}\ncontent_lines.len(): {}\nLast line: {:?}\nThread-1 messages: {}\nThread-2 messages: {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.content_lines.len(),
            app.content_lines.last().and_then(|line| line.spans.first()).map(|s| s.content.clone()),
            app.thread.messages.get(thread1_id).map_or(0, |m| m.len()),
            app.thread.messages.get(thread2_id).map_or(0, |m| m.len())
        ), @r###"
        Only Thread-2 response rendered:
        Active: Some("Side: Thread-2")
        content_lines.len(): 2
        Last line: Some("Go is a language developed by Google")
        Thread-1 messages: 2
        Thread-2 messages: 2
        "###);

        // ✅ 正确：Thread-2 的 content_lines 显示 Thread-2 的响应
        // ✅ Thread-1 的响应被存储在 thread_messages[Thread-1]
        // ✅ 切换到 Thread-1 时会加载完整历史

        // 验证：切换到 Thread-1
        app.switch_thread(thread1_id);

        insta::assert_snapshot!(format!(
            "After switching to Thread-1:\nActive: {:?}\ncontent_lines.len(): {}\nThread-1 messages: {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.content_lines.len(),
            app.thread.messages.get(thread1_id).map_or(0, |m| m.len())
        ), @r###"
        After switching to Thread-1:
        Active: Some("Side: Thread-1")
        content_lines.len(): 2
        Thread-1 messages: 2
        "###);

        // ✅ Thread-1 的完整历史被恢复
    }
}
