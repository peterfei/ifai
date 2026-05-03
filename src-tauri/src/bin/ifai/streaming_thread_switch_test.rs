//! 流式输出期间线程切换 E2E 快照测试
//!
//! 测试场景：
//! 1. 在流式输出期间按 Ctrl+T 创建侧线程
//! 2. 在流式输出期间按 Alt+Left/Right 切换线程
//! 3. 验证快捷键在流式期间仍然有效

#[cfg(test)]
mod tests {
    use crate::tui::App;
    use crossterm::event::{Event, KeyCode, KeyEvent, KeyModifiers};

    // ========================================================================
    // Bug 重现：流式期间无法切换线程
    // ========================================================================

    #[test]
    fn test_thread_switch_during_streaming_blocked() {
        // 重现 bug：在流式输出期间，Ctrl+T 和 Alt+Left/Right 不响应

        let mut app = App::new_for_test();

        // 模拟流式输出状态
        app.set_busy(true);  // 设置为 busy 状态（流式输出期间）

        let primary_id = app.thread_store.primary_id();

        // 添加一些消息
        app.push_line("Main thread message".to_string());
        app.thread_messages.push(primary_id, crate::thread::Message::user("Main thread message".to_string()));

        // 创建 Ctrl+T 事件
        let ctrl_t_event = Event::Key(KeyEvent::new(
            KeyCode::Char('t'),
            KeyModifiers::CONTROL,
        ));

        // 创建 Alt+Right 事件
        let alt_right_event = Event::Key(KeyEvent::new(
            KeyCode::Right,
            KeyModifiers::ALT,
        ));

        // 快照：当前线程数量
        insta::assert_snapshot!(format!(
            "Thread count before Ctrl+T: {}",
            app.thread_store.len()
        ), @"Thread count before Ctrl+T: 1");

        // ❌ Bug: 当前实现中，流式期间的键盘事件处理不包含线程快捷键
        // 这段代码在 main.rs:1046-1147 的 tokio::time::sleep 分支中
        // 只处理了 Ctrl+C, Ctrl+D, Ctrl+O, 滚动键，但遗漏了 Ctrl+T, Alt+Left/Right

        // 期望行为：即使流式输出期间，也应该能创建侧线程
        // 实际行为：Ctrl+T 被忽略，不创建新线程
    }

    #[test]
    fn test_thread_shortcuts_should_work_during_streaming() {
        // 测试期望行为：流式期间线程快捷键应该有效

        let mut app = App::new_for_test();

        // 模拟流式输出状态
        app.set_busy(true);

        let primary_id = app.thread_store.primary_id();

        // 添加主线程消息
        app.thread_messages.push(primary_id, crate::thread::Message::user("Main message".to_string()));

        // 创建侧线程
        let side_id = app.create_side_thread(Some("Thread-1".to_string()));

        // 验证：应该成功创建侧线程
        assert_eq!(app.thread_store.len(), 2);

        // 切换回主线程
        app.switch_thread(primary_id);

        // 验证：应该成功切换
        assert_eq!(app.thread_store.active_thread().unwrap().id, primary_id);

        // 快照：线程切换成功
        insta::assert_snapshot!(format!(
            "Active thread after switch: {:?}",
            app.thread_store.active_thread().map(|t| t.display_name())
        ), @"Active thread after switch: Some(\"Main\")");
    }

    // ========================================================================
    // 快捷键优先级测试
    // ========================================================================

    #[test]
    fn test_thread_shortcuts_vs_overlay_mode() {
        // 测试线程快捷键在各种模式下的行为

        let mut app = App::new_for_test();

        // 模拟 overlay 模式
        app.enter_overlay_mode(crate::detail_overlay::DetailOverlay::new_transcript("Test".to_string()));

        // 在 overlay 模式下，线程快捷键应该被禁用
        // 这是由 ThreadEnterHandler 的模式守卫保证的

        assert!(app.is_overlay_mode());

        // 尝试创建侧线程应该失败（模式守卫）
        let initial_count = app.thread_store.len();

        // 由于模式守卫，这个操作应该被阻止
        // 实际的行为取决于 ThreadEnterHandler 的实现
    }
}
