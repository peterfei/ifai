//! 高保真测试：thread1 streaming 时切回 main，验证快捷键可用性
//!
//! 用户报告场景：
//! 1. main 和 thread1 两个线程
//! 2. 在 thread1 发送消息，thread1 开始 streaming
//! 3. 切回 main
//! 4. 在 main 按快捷键（Ctrl+T / Alt+Left 等）无反应
//! 5. 等 thread1 streaming 结束后快捷键恢复正常
//!
//! 根因分析：
//! 切换线程时 app.mode 是否正确同步到 Mode::Normal，
//! 确保快捷键的 mode 守卫 `app.mode == Mode::Normal` 通过。

#[cfg(test)]
mod tests {
    use crate::tui::App;
    use crate::tui::Mode;

    #[test]
    fn test_mode_normal_after_switch_from_streaming_thread() {
        // 场景：thread1 streaming 中，切回 main，验证 mode 是 Normal

        let mut app = App::new_for_test();
        let main_id = app.thread.store.primary_id();
        let thread1_id = app.create_side_thread(Some("Thread-1".to_string()));

        // 1. 切到 thread1
        app.switch_thread(thread1_id);
        assert_eq!(app.mode, Mode::Normal);

        // 2. 模拟 thread1 开始 streaming（设 busy）
        app.set_thread_busy(thread1_id, true);
        assert_eq!(app.mode, Mode::Normal);

        // 3. 模拟 thread1 收到审批请求（进入 Approving 模式）
        // （streaming 期间可能触发工具调用审批）
        {
            use crate::approval_overlay::ApprovalRequest;
            let request = ApprovalRequest {
                thread_id: thread1_id,
                tool_id: "bash_0".to_string(),
                tool_name: "bash".to_string(),
                args_json: serde_json::json!("ls"),
                risk_level: crate::permission::RiskLevel::Low,
                category: crate::permission::ToolCategory::Safe,
                response_tx: tokio::sync::oneshot::channel().0,
            };
            app.set_approval_pending(request);
        }
        assert_eq!(app.mode, Mode::Approving, "thread1 收到审批后 mode 应该是 Approving");

        // 4. 切回 main（thread1 仍在 streaming + 审批中）
        app.switch_thread(main_id);

        // ✅ 关键断言：切到 main 后 mode 应该是 Normal
        // 因为审批状态是 per-thread 的，main 没有审批请求
        assert_eq!(app.mode, Mode::Normal,
            "切回 main 后 mode 应该是 Normal，审批状态不应跨线程");

        // 5. 验证快捷键守卫能通过
        assert!(app.mode == Mode::Normal, "Ctrl+T 守卫应该通过");
        assert!(!app.is_approving(), "main 不应该在审批模式");
        assert!(!app.is_diff_mode(), "main 不应该在 diff 模式");
        assert!(!app.is_searching(), "main 不应该在搜索模式");
        assert!(!app.is_overlay_mode(), "main 不应该在 overlay 模式");
    }

    #[test]
    fn test_mode_sync_when_switching_to_approving_thread() {
        // 反向场景：main 有审批请求，切到 thread1 再切回 main

        let mut app = App::new_for_test();
        let main_id = app.thread.store.primary_id();
        let thread1_id = app.create_side_thread(Some("Thread-1".to_string()));

        // 1. 切回 main（create_side_thread 已自动切到 thread1）
        app.switch_thread(main_id);

        // 2. main 收到审批请求
        {
            use crate::approval_overlay::ApprovalRequest;
            let request = ApprovalRequest {
                thread_id: main_id,
                tool_id: "bash_0".to_string(),
                tool_name: "bash".to_string(),
                args_json: serde_json::json!("ls"),
                risk_level: crate::permission::RiskLevel::Low,
                category: crate::permission::ToolCategory::Safe,
                response_tx: tokio::sync::oneshot::channel().0,
            };
            app.set_approval_pending(request);
        }
        assert_eq!(app.mode, Mode::Approving, "main 收到审批后 mode 应该是 Approving");

        // 2. 切到 thread1（审批模式不应跨线程）
        app.switch_thread(thread1_id);
        assert_eq!(app.mode, Mode::Normal,
            "切到 thread1 后 mode 应该是 Normal（审批不跨线程）");

        // 3. 切回 main
        app.switch_thread(main_id);
        assert_eq!(app.mode, Mode::Approving,
            "切回 main 后 mode 应该恢复为 Approving（main 有待审批请求）");
    }

    #[test]
    fn test_shortcut_guard_after_thread_switch_with_background_streaming() {
        // 完整场景：thread1 在后台 streaming，切回 main，验证所有快捷键守卫

        let mut app = App::new_for_test();
        let main_id = app.thread.store.primary_id();
        let thread1_id = app.create_side_thread(Some("Thread-1".to_string()));

        // 1. thread1 streaming 中
        app.switch_thread(thread1_id);
        app.set_thread_busy(thread1_id, true);

        // 2. 用户切回 main
        app.switch_thread(main_id);

        // 3. 验证所有快捷键守卫条件
        // 这些对应 main.rs 中的 `app.mode == Mode::Normal` 检查
        insta::assert_snapshot!(format!(
            "Shortcut guards after switching back to main (thread1 streaming):\n\
             mode: {:?}\n\
             is_approving: {}\n\
             is_diff_mode: {}\n\
             is_searching: {}\n\
             is_overlay_mode: {}\n\
             is_thread_busy(thread1): {}\n\
             is_thread_busy(main): {}",
            app.mode,
            app.is_approving(),
            app.is_diff_mode(),
            app.is_searching(),
            app.is_overlay_mode(),
            app.is_thread_busy(thread1_id),
            app.is_thread_busy(main_id),
        ), @r###"
        Shortcut guards after switching back to main (thread1 streaming):
        mode: Normal
        is_approving: false
        is_diff_mode: false
        is_searching: false
        is_overlay_mode: false
        is_thread_busy(thread1): true
        is_thread_busy(main): false
        "###);
    }

    #[test]
    fn test_diff_mode_exited_on_thread_switch() {
        // 场景：thread1 在 diff 模式，切到 main，diff 模式应退出

        let mut app = App::new_for_test();
        let main_id = app.thread.store.primary_id();
        let thread1_id = app.create_side_thread(Some("Thread-1".to_string()));

        // 1. thread1 有 diff 数据并进入 diff 模式
        app.switch_thread(thread1_id);
        app.diff.files.push(crate::diff_render::DiffFileChange {
            path: std::path::PathBuf::from("test.rs"),
            kind: crate::diff_render::DiffChangeKind::Modified,
            old_content: Some("old".to_string()),
            new_content: Some("new".to_string()),
            added: 0,
            removed: 0,
        });
        app.enter_diff_mode();
        assert_eq!(app.mode, Mode::Diff);
        assert!(app.is_diff_mode());

        // 2. 切到 main
        app.switch_thread(main_id);

        // 3. diff 模式应退出
        assert_eq!(app.mode, Mode::Normal, "切到 main 后 diff 模式应退出");
        assert!(!app.is_diff_mode());
    }

    #[test]
    fn test_search_mode_exited_on_thread_switch() {
        // 场景：thread1 在搜索模式，切到 main，搜索模式应退出

        let mut app = App::new_for_test();
        let main_id = app.thread.store.primary_id();
        let thread1_id = app.create_side_thread(Some("Thread-1".to_string()));

        // 1. thread1 在搜索模式
        app.switch_thread(thread1_id);
        app.enter_search_mode();
        assert_eq!(app.mode, Mode::Search);

        // 2. 切到 main
        app.switch_thread(main_id);

        // 3. 搜索模式应退出
        assert_eq!(app.mode, Mode::Normal, "切到 main 后搜索模式应退出");
        assert!(!app.is_searching());
    }
}
