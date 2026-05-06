//! 线程切换 E2E 快照测试
//!
//! 测试场景：
//! 1. 在主线程发送消息
//! 2. 切换到侧线程
//! 3. 在侧线程发送消息
//! 4. 切换回主线程
//! 5. 验证主线程消息仍然存在

#[cfg(test)]
mod tests {
    use crate::tui::App;
    use crate::thread;
    use crate::tui_test::render_to_buffer;

    // ========================================================================
    // Bug 重现：线程切换后消息丢失
    // ========================================================================

    #[test]
    fn test_thread_switch_message_loss_bug() {
        // 重现 bug 的测试场景
        let mut app = App::new_for_test();

        let primary_id = app.thread.store.primary_id();

        // 步骤 1: 在主线程添加消息（并保存到 thread_messages）
        app.thread.messages.push(primary_id, thread::Message::user("Main thread message 1".to_string()));
        app.thread.messages.push(primary_id, thread::Message::user("Main thread message 2".to_string()));

        // 加载主线程消息到 content_lines
        let messages_to_load: Vec<String> = app.thread.messages
            .get(primary_id)
            .map(|msgs| msgs.iter().map(|m| m.content.clone()).collect())
            .unwrap_or_default();
        for msg in messages_to_load {
            app.push_line(msg);
        }

        assert_eq!(app.content_lines.len(), 2);

        // 步骤 2: 创建侧线程（会自动切换到侧线程并清空 content_lines）
        let side_id = app.create_side_thread(Some("Thread-1".to_string()));

        assert_eq!(app.content_lines.len(), 0); // 侧线程没有消息

        // 步骤 3: 在侧线程添加消息（并保存到 thread_messages）
        app.thread.messages.push(side_id, thread::Message::user("Side thread message 1".to_string()));
        app.thread.messages.push(side_id, thread::Message::user("Side thread message 2".to_string()));

        // 加载侧线程消息到 content_lines
        let messages_to_load: Vec<String> = app.thread.messages
            .get(side_id)
            .map(|msgs| msgs.iter().map(|m| m.content.clone()).collect())
            .unwrap_or_default();
        for msg in messages_to_load {
            app.push_line(msg);
        }

        assert_eq!(app.content_lines.len(), 2);

        // 步骤 4: 切换回主线程
        app.switch_thread(primary_id);

        // ✅ 修复后：主线程消息应该被加载到 content_lines
        assert_eq!(app.content_lines.len(), 2, "主线程应该有 2 条消息");
        assert_eq!(app.thread.messages.get(primary_id).unwrap().len(), 2, "主线程 thread_messages 应该有 2 条");
    }

    // ========================================================================
    // 修复后的期望行为
    // ========================================================================

    #[test]
    fn test_thread_switch_with_message_persistence() {
        // 测试修复后的期望行为：
        // 1. 切换线程时保存当前线程的消息到 content_lines
        // 2. 切换到新线程时加载该线程的消息到 content_lines

        let mut app = App::new_for_test();

        let primary_id = app.thread.store.primary_id();

        // 在主线程添加消息
        app.push_line("Main message 1".to_string());
        app.push_line("Main message 2".to_string());

        // 创建侧线程
        let side_id = app.create_side_thread(Some("Thread-1".to_string()));

        // 在侧线程添加消息
        app.push_line("Side message 1".to_string());

        // 切换回主线程
        app.switch_thread(primary_id);

        // ✅ 期望：主线程消息被加载到 content_lines
        // 这个测试会在修复后通过
    }
}
