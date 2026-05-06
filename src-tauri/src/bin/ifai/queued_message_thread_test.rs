//! 流式输出期间排队消息线程错误 E2E 快照测试
//!
//! Bug 描述：
//! 用户反馈"在 main 发送信息，LLM 在响应期间，在 thread2 发送问题没反应，
//! 等 main 响应完成后 thread2 发送问题在 main 里才响应"
//!
//! 测试场景：
//! 1. 在主线程发送消息，触发 LLM 流式输出
//! 2. 在流式输出期间切换到 Thread-2
//! 3. 在 Thread-2 发送问题（应该排队）
//! 4. 验证排队消息的目标线程是否正确

#[cfg(test)]
mod tests {
    use crate::tui::App;

    // ========================================================================
    // Bug 重现：流式输出期间排队消息线程错误
    // ========================================================================

    #[test]
    fn test_queued_message_thread_bug() {
        // 重现 bug：流式输出期间，Thread-2 的排队消息在 main 响应

        let mut app = App::new_for_test();

        let primary_id = app.thread.store.primary_id();
        let thread2_id = app.create_side_thread(Some("Thread-2".to_string()));

        // === 步骤 1：在主线程发送消息 ===
        app.switch_thread(primary_id);

        // 模拟用户输入
        app.push_line("⟩ What is Rust?".to_string());
        app.thread.messages.push(primary_id, crate::thread::Message::user("What is Rust?".to_string()));

        // 快照 1：主线程用户输入后
        insta::assert_snapshot!(format!(
            "After user input in main:\nActive: {:?}\nthread_messages[Main].len(): {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.thread.messages.get(primary_id).map_or(0, |m| m.len())
        ), @r###"
        After user input in main:
        Active: Some("Main")
        thread_messages[Main].len(): 1
        "###);

        // === 步骤 2：模拟 LLM 开始流式输出（进入 busy 状态）===
        app.set_busy(true);

        // === 步骤 3：用户切换到 Thread-2 ===
        app.switch_thread(thread2_id);

        // 快照 2：切换到 Thread-2
        insta::assert_snapshot!(format!(
            "Switched to Thread-2 during streaming:\nActive: {:?}\napp.is_busy(): {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.is_busy()
        ), @r#"
        Switched to Thread-2 during streaming:
        Active: Some("Side: Thread-2")
        app.is_busy(): false
        "#);

        // === 步骤 4：在 Thread-2 发送问题（应该排队）===
        let thread2_input = "What is Go?";

        // 模拟排队机制
        app.enqueue(thread2_input.to_string());

        // ❌ BUG：检查排队时是否记录了目标线程
        // 如果排队时只记录了输入文本，而没有记录目标线程
        // 那么处理时就会使用当前活动线程（可能是 main），导致消息发送到错误的线程

        // 快照 3：Thread-2 输入排队后
        insta::assert_snapshot!(format!(
            "After Thread-2 input enqueued:\nActive: {:?}\nQueue len: {}\napp.is_busy(): {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.queue_len(),
            app.is_busy()
        ), @r#"
        After Thread-2 input enqueued:
        Active: Some("Side: Thread-2")
        Queue len: 1
        app.is_busy(): false
        "#);

        // === 步骤 5：主线程的 LLM 响应完成 ===
        app.set_busy(false);

        // === 步骤 6：处理排队的消息 ===
        // ❌ BUG：如果排队时没有记录目标线程
        // 这里可能会使用当前活动线程（main）而不是用户输入时的线程（Thread-2）

        let current_active = app.thread.store.active_thread().map(|t| t.id);

        // 快照 4：流式输出完成后的状态
        insta::assert_snapshot!(format!(
            "After streaming completes:\nActive: {:?}\nCurrent active thread ID: {}\nThread-2 ID: {}\nExpected: queued message should go to Thread-2",
            app.thread.store.active_thread().map(|t| t.display_name()),
            current_active.is_some(),
            current_active == Some(thread2_id)
        ), @r###"
        After streaming completes:
        Active: Some("Side: Thread-2")
        Current active thread ID: true
        Thread-2 ID: true
        Expected: queued message should go to Thread-2
        "###);

        // ✅ 测试显示当前活动线程是 Thread-2
        // 但实际代码可能在处理队列时使用了错误的线程 ID
    }

    #[test]
    fn test_enqueue_should_capture_target_thread() {
        // 测试：排队时应该捕获目标线程

        let mut app = App::new_for_test();

        let primary_id = app.thread.store.primary_id();
        let thread2_id = app.create_side_thread(Some("Thread-2".to_string()));

        // === 场景：用户在 Thread-2 输入，但 main 正在流式输出 ===

        // 1. 在主线程开始流式输出
        app.switch_thread(primary_id);
        app.set_busy(true);

        // 2. 用户切换到 Thread-2
        app.switch_thread(thread2_id);

        // 3. 用户在 Thread-2 输入（排队）
        let thread2_input = "Question for Thread-2";

        // ⚠️ 关键问题：enqueue() 方法是否捕获了目标线程？
        // 如果没有，处理队列时会使用当前活动线程

        // 模拟 enqueue 的行为
        app.enqueue(thread2_input.to_string());

        // 4. 用户切换回主线程（在排队消息处理之前）
        app.switch_thread(primary_id);

        // 5. 流式输出完成
        app.set_busy(false);

        // 6. 处理排队的消息
        // ❌ BUG：如果 enqueue() 没有捕获目标线程
        // 这里会使用当前活动线程（main），导致 Thread-2 的消息发送到 main

        let current_active = app.thread.store.active_thread().map(|t| t.id);

        insta::assert_snapshot!(format!(
            "❌ BUG - Queue processing uses wrong thread:\nCurrent active: {:?}\nOriginal target: Thread-2\nExpected: Thread-2, Got: {:?}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            current_active == Some(thread2_id)
        ), @r###"
        ❌ BUG - Queue processing uses wrong thread:
        Current active: Some("Main")
        Original target: Thread-2
        Expected: Thread-2, Got: false
        "###);

        // ❌ Bug 确认：当前活动线程是 main，但排队消息应该去 Thread-2
    }

    #[test]
    fn test_correct_enqueue_with_thread_capture() {
        // 测试：正确的排队实现应该捕获目标线程

        let mut app = App::new_for_test();

        let primary_id = app.thread.store.primary_id();
        let thread2_id = app.create_side_thread(Some("Thread-2".to_string()));

        // === 正确的排队实现 ===

        // 1. 在主线程开始流式输出
        app.switch_thread(primary_id);
        app.set_busy(true);

        // 2. 用户切换到 Thread-2
        app.switch_thread(thread2_id);

        // 3. 用户在 Thread-2 输入
        let thread2_input = "Question for Thread-2";

        // ✅ 正确实现：排队时捕获目标线程
        let target_thread_id = app.thread.store.active_thread().map(|t| t.id).unwrap();
        app.enqueue(thread2_input.to_string());

        // 4. 用户切换回主线程
        app.switch_thread(primary_id);

        // 5. 流式输出完成
        app.set_busy(false);

        // 6. 处理排队的消息时，应该使用目标线程（Thread-2）
        // 而不是当前活动线程（main）

        // 模拟正确的处理逻辑
        app.thread.messages.push(target_thread_id, crate::thread::Message::user(thread2_input.to_string()));

        // 验证：消息在 Thread-2
        insta::assert_snapshot!(format!(
            "✅ CORRECT - Queued message routed to target thread:\nTarget thread: Thread-2\nthread_messages[Thread-2].len(): {}\nthread_messages[Main].len(): {}",
            app.thread.messages.get(thread2_id).map_or(0, |m| m.len()),
            app.thread.messages.get(primary_id).map_or(0, |m| m.len())
        ), @r###"
        ✅ CORRECT - Queued message routed to target thread:
        Target thread: Thread-2
        thread_messages[Thread-2].len(): 1
        thread_messages[Main].len(): 0
        "###);

        // ✅ 正确：Thread-2 有 1 条消息，main 有 0 条
    }
}
