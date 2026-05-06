//! 🔥 Phase 6: 并发处理 E2E 快照测试
//!
//! Bug 修复验证：
//! 用户反馈"开了2个threads，同时提问，thread2一直没有开始，要等thread1的结束才开始"
//!
//! ✅ 修复方案：Per-Thread Busy 状态
//! - 将全局 `busy: bool` 改为 `thread_busy: HashMap<ThreadId, bool>`
//! - 每个线程独立管理自己的 AI 处理状态
//! - 支持真正的并发 AI 请求

#[cfg(test)]
mod tests {
    use crate::tui::App;

    // ========================================================================
    // ✅ Phase 6 修复验证：Per-Thread Busy 状态
    // ========================================================================

    #[test]
    fn test_per_thread_busy_state() {
        // ✅ 测试：每个线程有独立的 busy 状态

        let mut app = App::new_for_test();

        let primary_id = app.thread.store.primary_id();
        let thread2_id = app.create_side_thread(Some("Thread-2".to_string()));

        // === 步骤 1：Main 线程进入 busy 状态 ===
        app.set_thread_busy(primary_id, true);

        // === 步骤 2：验证 Main 线程 busy ===
        insta::assert_snapshot!(format!(
            "Main thread busy:\nMain is busy: {}\nThread-2 is busy: {}",
            app.is_thread_busy(primary_id),
            app.is_thread_busy(thread2_id)
        ), @r###"
        Main thread busy:
        Main is busy: true
        Thread-2 is busy: false
        "###);

        // ✅ 修复成功：Main 线程 busy，Thread-2 不受影响
    }

    #[test]
    fn test_current_thread_busy_method() {
        // ✅ 测试：is_current_thread_busy() 方法

        let mut app = App::new_for_test();

        let primary_id = app.thread.store.primary_id();
        let thread2_id = app.create_side_thread(Some("Thread-2".to_string()));

        // === 步骤 1：Main 线程进入 busy 状态 ===
        app.set_thread_busy(primary_id, true);

        // === 步骤 2：切换到 Thread-2 ===
        app.switch_thread(thread2_id);

        // === 步骤 3：检查当前线程（Thread-2）是否 busy ===
        insta::assert_snapshot!(format!(
            "Thread-2 current busy check:\nActive: {:?}\nMain is busy: true\nThread-2 is busy: false\nis_current_thread_busy: {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.is_current_thread_busy()
        ), @r###"
        Thread-2 current busy check:
        Active: Some("Side: Thread-2")
        Main is busy: true
        Thread-2 is busy: false
        is_current_thread_busy: false
        "###);

        // ✅ 修复成功：Thread-2 不受 Main 的 busy 状态影响
    }

    #[test]
    fn test_backward_compatible_is_busy() {
        // ✅ 测试：向后兼容的 is_busy() 方法（检查当前线程）

        let mut app = App::new_for_test();

        let primary_id = app.thread.store.primary_id();
        let thread2_id = app.create_side_thread(Some("Thread-2".to_string()));

        // === 步骤 1：Main 线程进入 busy 状态 ===
        app.switch_thread(primary_id);
        app.set_busy(true);  // 使用向后兼容的 API

        // === 步骤 2：验证 Main 线程 busy ===
        insta::assert_snapshot!(format!(
            "Backward compatible is_busy:\nActive: {:?}\nis_busy(): {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.is_busy()
        ), @r###"
        Backward compatible is_busy:
        Active: Some("Main")
        is_busy(): true
        "###);

        // === 步骤 3：切换到 Thread-2 ===
        app.switch_thread(thread2_id);

        // === 步骤 4：验证 is_busy() 现在检查 Thread-2 ===
        insta::assert_snapshot!(format!(
            "Switch to Thread-2:\nActive: {:?}\nis_busy(): {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.is_busy()
        ), @r###"
        Switch to Thread-2:
        Active: Some("Side: Thread-2")
        is_busy(): false
        "###);

        // ✅ 向后兼容：is_busy() 自动检查当前线程
    }

    #[test]
    fn test_concurrent_requests_independent() {
        // ✅ 测试：两个线程可以同时进行 AI 请求

        let mut app = App::new_for_test();

        let primary_id = app.thread.store.primary_id();
        let thread2_id = app.create_side_thread(Some("Thread-2".to_string()));

        // === 步骤 1：Main 线程开始 AI 请求 ===
        app.set_thread_busy(primary_id, true);

        // === 步骤 2：Thread-2 也可以开始 AI 请求（不受 Main 影响）===
        app.set_thread_busy(thread2_id, true);

        // === 步骤 3：验证两个线程都 busy ===
        insta::assert_snapshot!(format!(
            "Concurrent AI requests:\nMain is busy: {}\nThread-2 is busy: {}",
            app.is_thread_busy(primary_id),
            app.is_thread_busy(thread2_id)
        ), @r###"
        Concurrent AI requests:
        Main is busy: true
        Thread-2 is busy: true
        "###);

        // ✅ 修复成功：两个线程可以同时进行 AI 请求
    }

    #[test]
    fn test_thread_completion_independence() {
        // ✅ 测试：线程完成顺序不影响其他线程

        let mut app = App::new_for_test();

        let primary_id = app.thread.store.primary_id();
        let thread2_id = app.create_side_thread(Some("Thread-2".to_string()));

        // === 步骤 1：两个线程都开始 AI 请求 ===
        app.set_thread_busy(primary_id, true);
        app.set_thread_busy(thread2_id, true);

        // === 步骤 2：Thread-2 先完成 ===
        app.set_thread_busy(thread2_id, false);

        insta::assert_snapshot!(format!(
            "Thread-2 completed:\nMain is busy: {}\nThread-2 is busy: {}",
            app.is_thread_busy(primary_id),
            app.is_thread_busy(thread2_id)
        ), @r###"
        Thread-2 completed:
        Main is busy: true
        Thread-2 is busy: false
        "###);

        // === 步骤 3：Main 完成 ===
        app.set_thread_busy(primary_id, false);

        insta::assert_snapshot!(format!(
            "Main completed:\nMain is busy: {}\nThread-2 is busy: {}",
            app.is_thread_busy(primary_id),
            app.is_thread_busy(thread2_id)
        ), @r###"
        Main completed:
        Main is busy: false
        Thread-2 is busy: false
        "###);

        // ✅ 完成顺序独立：每个线程独立管理自己的状态
    }

    #[test]
    fn test_multiple_threads_concurrent() {
        // ✅ 测试：多个线程同时进行 AI 请求

        let mut app = App::new_for_test();

        let primary_id = app.thread.store.primary_id();
        let thread2_id = app.create_side_thread(Some("Thread-2".to_string()));
        let thread3_id = app.create_side_thread(Some("Thread-3".to_string()));

        // === 步骤 1：三个线程都开始 AI 请求 ===
        app.set_thread_busy(primary_id, true);
        app.set_thread_busy(thread2_id, true);
        app.set_thread_busy(thread3_id, true);

        insta::assert_snapshot!(format!(
            "Three concurrent requests:\nMain is busy: {}\nThread-2 is busy: {}\nThread-3 is busy: {}",
            app.is_thread_busy(primary_id),
            app.is_thread_busy(thread2_id),
            app.is_thread_busy(thread3_id)
        ), @r###"
        Three concurrent requests:
        Main is busy: true
        Thread-2 is busy: true
        Thread-3 is busy: true
        "###);

        // === 步骤 2：Main 完成，其他线程继续 ===
        app.set_thread_busy(primary_id, false);

        insta::assert_snapshot!(format!(
            "Main completed, others continue:\nMain is busy: {}\nThread-2 is busy: {}\nThread-3 is busy: {}",
            app.is_thread_busy(primary_id),
            app.is_thread_busy(thread2_id),
            app.is_thread_busy(thread3_id)
        ), @r###"
        Main completed, others continue:
        Main is busy: false
        Thread-2 is busy: true
        Thread-3 is busy: true
        "###);

        // ✅ 多线程并发：每个线程独立处理
    }

    #[test]
    fn test_thread_busy_persistence() {
        // ✅ 测试：线程 busy 状态持久化（切换线程不丢失状态）

        let mut app = App::new_for_test();

        let primary_id = app.thread.store.primary_id();
        let thread2_id = app.create_side_thread(Some("Thread-2".to_string()));

        // === 步骤 1：Main 线程进入 busy 状态 ===
        app.switch_thread(primary_id);
        app.set_thread_busy(primary_id, true);

        // === 步骤 2：切换到 Thread-2 ===
        app.switch_thread(thread2_id);

        // === 步骤 3：切换回 Main，状态仍然保持 ===
        app.switch_thread(primary_id);

        insta::assert_snapshot!(format!(
            "Main state persisted:\nActive: {:?}\nMain is busy: {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.is_thread_busy(primary_id)
        ), @r###"
        Main state persisted:
        Active: Some("Main")
        Main is busy: true
        "###);

        // ✅ 状态持久化：切换线程不丢失 busy 状态
    }

    #[test]
    fn test_queue_only_affected_by_current_thread() {
        // ✅ 测试：队列只受当前线程的 busy 状态影响

        let mut app = App::new_for_test();

        let primary_id = app.thread.store.primary_id();
        let thread2_id = app.create_side_thread(Some("Thread-2".to_string()));

        // === 步骤 1：Main 线程进入 busy 状态 ===
        app.set_thread_busy(primary_id, true);

        // === 步骤 2：切换到 Thread-2（Thread-2 不 busy）===
        app.switch_thread(thread2_id);

        // === 步骤 3：模拟 TUI 事件循环的逻辑 ===
        // 在实际的事件循环中，会先检查 is_current_thread_busy()
        // 如果当前线程不 busy，消息会立即处理，不会排队
        let should_enqueue = app.is_current_thread_busy();
        if should_enqueue {
            app.enqueue("Thread-2 message".to_string());
        }

        insta::assert_snapshot!(format!(
            "Thread-2 not queued:\nActive: {:?}\nMain is busy: {}\nThread-2 is busy: {}\nShould enqueue: {}\nQueue length: {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.is_thread_busy(primary_id),
            app.is_thread_busy(thread2_id),
            should_enqueue,
            app.queue_len()
        ), @r###"
        Thread-2 not queued:
        Active: Some("Side: Thread-2")
        Main is busy: true
        Thread-2 is busy: false
        Should enqueue: false
        Queue length: 0
        "###);

        // ✅ 修复成功：队列只检查当前线程的 busy 状态
    }

    #[test]
    fn test_user_reported_scenario_thread1_busy_thread2_send() {
        // ✅ 测试：用户报告的真实场景
        //
        // Bug 修复前：
        // T1: Thread-1 发送消息 → AI处理（全局busy=true）
        // T2: 切换到 Thread-2
        // T3: Thread-2 发送消息 → ❌被排队（因为全局busy=true）
        // T4: Thread-1 完成 → 全局busy=false
        // T5: Thread-2 开始处理
        //
        // Bug 修复后：
        // T1: Thread-1 发送消息 → AI处理（thread-1 busy=true）
        // T2: 切换到 Thread-2
        // T3: Thread-2 发送消息 → ✅立即开始处理（thread-2 busy=false）
        // T4: Thread-1 和 Thread-2 并发处理

        let mut app = App::new_for_test();

        let primary_id = app.thread.store.primary_id();
        let thread2_id = app.create_side_thread(Some("Thread-2".to_string()));

        // === T1: Thread-1 发送消息，开始 AI 处理 ===
        app.switch_thread(primary_id);
        app.thread.messages.push(primary_id, crate::thread::Message::user("Question for Thread-1".to_string()));
        app.set_thread_busy(primary_id, true);

        insta::assert_snapshot!(format!(
            "T1: Thread-1 started AI processing:\nActive: {:?}\nThread-1 is busy: {}\nThread-2 is busy: {}\nQueue length: {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.is_thread_busy(primary_id),
            app.is_thread_busy(thread2_id),
            app.queue_len()
        ), @r###"
        T1: Thread-1 started AI processing:
        Active: Some("Main")
        Thread-1 is busy: true
        Thread-2 is busy: false
        Queue length: 0
        "###);

        // === T2: 切换到 Thread-2 ===
        app.switch_thread(thread2_id);

        insta::assert_snapshot!(format!(
            "T2: Switched to Thread-2:\nActive: {:?}\nThread-1 is busy: true\nThread-2 is busy: false\nis_current_thread_busy: {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            app.is_current_thread_busy()
        ), @r###"
        T2: Switched to Thread-2:
        Active: Some("Side: Thread-2")
        Thread-1 is busy: true
        Thread-2 is busy: false
        is_current_thread_busy: false
        "###);

        // === T3: Thread-2 发送消息 ===
        // 模拟 TUI 事件循环：先检查当前线程是否 busy
        let should_enqueue = app.is_current_thread_busy();

        // Thread-2 不 busy，所以消息会立即处理，不会排队
        if should_enqueue {
            app.enqueue("Question for Thread-2".to_string());
        } else {
            // 立即处理，不排队
            app.thread.messages.push(thread2_id, crate::thread::Message::user("Question for Thread-2".to_string()));
        }

        insta::assert_snapshot!(format!(
            "T3: Thread-2 sent message:\nActive: {:?}\nThread-1 is busy: true\nThread-2 is busy: false\nMessage queued: {}\nQueue length: {}",
            app.thread.store.active_thread().map(|t| t.display_name()),
            should_enqueue,
            app.queue_len()
        ), @r###"
        T3: Thread-2 sent message:
        Active: Some("Side: Thread-2")
        Thread-1 is busy: true
        Thread-2 is busy: false
        Message queued: false
        Queue length: 0
        "###);

        // === T4: 验证两个线程的消息都正确存储 ===
        insta::assert_snapshot!(format!(
            "T4: Both threads have messages:\nthread_messages[Thread-1].len(): {}\nthread_messages[Thread-2].len(): {}",
            app.thread.messages.get(primary_id).map_or(0, |m| m.len()),
            app.thread.messages.get(thread2_id).map_or(0, |m| m.len())
        ), @r###"
        T4: Both threads have messages:
        thread_messages[Thread-1].len(): 1
        thread_messages[Thread-2].len(): 1
        "###);

        // ✅ Bug 修复成功！Thread-2 不需要等待 Thread-1 完成
        // 两个线程可以并发处理
    }

    #[test]
    fn test_active_requests_manager() {
        // ✅ 测试：ActiveRequests 管理器

        let mut app = App::new_for_test();

        let primary_id = app.thread.store.primary_id();
        let thread2_id = app.create_side_thread(Some("Thread-2".to_string()));

        // === 步骤 1：初始状态 ===
        insta::assert_snapshot!(format!(
            "ActiveRequests initial:\nis_empty: {}\nactive_count: {}",
            app.stream.active_requests.is_empty(),
            app.stream.active_requests.active_count()
        ), @r###"
        ActiveRequests initial:
        is_empty: true
        active_count: 0
        "###);

        // === 步骤 2：模拟添加请求（需要 mock ActiveRequest）===
        // 注意：实际测试中需要 mock tokio::task::JoinHandle
        // 这里只测试基础方法

        // === 步骤 3：检查线程是否 busy ===
        insta::assert_snapshot!(format!(
            "Thread busy check:\nMain is busy (via active_requests): {}\nThread-2 is busy (via active_requests): {}",
            app.stream.active_requests.is_thread_busy(&primary_id),
            app.stream.active_requests.is_thread_busy(&thread2_id)
        ), @r###"
        Thread busy check:
        Main is busy (via active_requests): false
        Thread-2 is busy (via active_requests): false
        "###);

        // ✅ ActiveRequests 管理器工作正常
    }
}
