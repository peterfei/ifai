//! 事件处理器实现 — 具体的事件处理逻辑
//!
//! 所有处理器都为 `crossterm::event::Event` 实现，内部通过模式匹配
//! 解包具体的事件类型（KeyEvent, MouseEvent 等）。

use super::{ControlFlow, EventHandler};
use crate::input_composer::InputAction;
use crate::tui::App;
use crate::AppResult;
use crossterm::event::{Event, KeyCode, KeyEvent, KeyModifiers, MouseEvent, MouseEventKind};

// ============================================================================
// 键盘滚动处理器
// ============================================================================

/// 键盘滚动处理器（PageUp/PageDown/Shift+方向键）
pub struct KeyScrollHandler;

impl EventHandler<Event> for KeyScrollHandler {
    fn handle(&mut self, event: &Event, app: &mut App) -> ControlFlow {
        if let Event::Key(key) = event {
            match key.code {
                KeyCode::PageUp => {
                    app.scroll_up(5);
                    ControlFlow::Continue
                }
                KeyCode::PageDown => {
                    app.scroll_down(5);
                    ControlFlow::Continue
                }
                KeyCode::Up if key.modifiers.contains(KeyModifiers::SHIFT) => {
                    app.scroll_up(3);
                    ControlFlow::Continue
                }
                KeyCode::Down if key.modifiers.contains(KeyModifiers::SHIFT) => {
                    app.scroll_down(3);
                    ControlFlow::Continue
                }
                _ => ControlFlow::Continue,
            }
        } else {
            ControlFlow::Continue
        }
    }
}

// ============================================================================
// 鼠标滚动处理器
// ============================================================================

/// 鼠标滚动处理器（鼠标滚轮 + 选择支持）
pub struct MouseScrollHandler {
    /// 是否正在拖动选择
    selecting: bool,
}

impl MouseScrollHandler {
    pub fn new() -> Self {
        Self { selecting: false }
    }
}

impl Default for MouseScrollHandler {
    fn default() -> Self {
        Self::new()
    }
}

impl EventHandler<Event> for MouseScrollHandler {
    fn handle(&mut self, event: &Event, app: &mut App) -> ControlFlow {
        if let Event::Mouse(mouse) = event {
            match mouse.kind {
                MouseEventKind::ScrollUp => {
                    app.scroll_up(3);
                    ControlFlow::Continue
                }
                MouseEventKind::ScrollDown => {
                    app.scroll_down(3);
                    ControlFlow::Continue
                }
                // 检测鼠标左键按下 - 可能是开始选择
                MouseEventKind::Down(crossterm::event::MouseButton::Left) => {
                    self.selecting = true;
                    // 禁用鼠标捕获，让终端处理选择
                    let _ = crossterm::execute!(
                        std::io::stdout(),
                        crossterm::event::DisableMouseCapture
                    );
                    ControlFlow::Continue
                }
                // 检测鼠标左键释放 - 结束选择
                MouseEventKind::Up(crossterm::event::MouseButton::Left) => {
                    if self.selecting {
                        self.selecting = false;
                        // 重新启用鼠标捕获
                        let _ = crossterm::execute!(
                            std::io::stdout(),
                            crossterm::event::EnableMouseCapture
                        );
                    }
                    ControlFlow::Continue
                }
                _ => ControlFlow::Continue,
            }
        } else {
            ControlFlow::Continue
        }
    }
}

// ============================================================================
// Resize 处理器
// ============================================================================

/// 终端大小调整处理器
pub struct ResizeHandler;

impl EventHandler<Event> for ResizeHandler {
    fn handle(&mut self, event: &Event, app: &mut App) -> ControlFlow {
        if let Event::Resize(_, _) = event {
            app.scroll_to_bottom();
            ControlFlow::Continue
        } else {
            ControlFlow::Continue
        }
    }
}

// ============================================================================
// 输入提交处理器
// ============================================================================

/// 输入提交处理器
pub struct InputSubmitHandler;

impl EventHandler<Event> for InputSubmitHandler {
    fn handle(&mut self, event: &Event, app: &mut App) -> ControlFlow {
        if let Event::Key(key) = event {
            let action = app.input.handle_key(*key);
            match action {
                InputAction::Submit(text) => {
                    let text = text.trim().to_string();
                    if !text.is_empty() {
                        return ControlFlow::Break(AppResult::Submit(text));
                    }
                }
                InputAction::Exit => {
                    return ControlFlow::Break(AppResult::Exit);
                }
                InputAction::Interrupt => {
                    // 不调用 push_line，避免访问 terminal
                }
                InputAction::None => {}
            }
        }
        ControlFlow::Continue
    }
}

// ============================================================================
// Ignore 处理器
// ============================================================================

/// 默认忽略处理器（fallback）
pub struct IgnoreHandler;

impl EventHandler<Event> for IgnoreHandler {
    fn handle(&mut self, _event: &Event, _app: &mut App) -> ControlFlow {
        ControlFlow::Continue
    }
}

// ============================================================================
// 组合键盘处理器（输入 + 滚动）
// ============================================================================

/// 组合键盘处理器 - 先处理输入相关键，再处理滚动键
pub struct CombinedKeyHandler;

impl EventHandler<Event> for CombinedKeyHandler {
    fn handle(&mut self, event: &Event, app: &mut App) -> ControlFlow {
        // 如果处于搜索模式、帮助模式、diff 模式或 busy（AI 响应中），跳过处理
        // 注意：streaming 期间的输入由 main.rs 的 tokio::select! 分支直接处理，
        // run_loop() 不会被调用，此守卫作为防御层防止意外穿透
        if app.is_searching() || app.help_mode || app.is_diff_mode() || app.is_busy() {
            return ControlFlow::Continue;
        }

        if let Event::Key(key) = event {
            // 如果是 ? 键，跳过（由 HelpEnterHandler 处理）
            if key.code == KeyCode::Char('?') {
                return ControlFlow::Continue;
            }

            // 命令弹出框激活时：拦截导航键（不传给 InputComposer 的历史记录）
            if app.command_popup.is_visible() {
                if let Some(cmd_text) = app.command_popup.handle_key(*key) {
                    // 确认选择：替换输入框为完整命令 + 关闭弹出框
                    // 用户按第二遍 Enter 时才提交（允许先补参数）
                    app.command_popup.update(""); // 关闭弹出框
                    app.input.clear();
                    for c in cmd_text.chars() {
                        let _ = app
                            .input
                            .handle_key(KeyEvent::new(KeyCode::Char(c), KeyModifiers::NONE));
                    }
                    return ControlFlow::Continue;
                }
                // Esc → 关闭弹出框（清除输入中的 /）
                if key.code == KeyCode::Esc {
                    app.input.clear();
                    return ControlFlow::Continue;
                }
                // Up/Down/Ctrl+P/Ctrl+N → 已被 popup 消费，不传给 InputComposer
                use crate::command_popup::PopupAction;
                let popup_action = crate::command_popup::resolve_popup_key(*key);
                if !matches!(popup_action, PopupAction::Pass) {
                    // 非字符键（Up/Down/Tab 等）已被 popup 消费
                    if !matches!(key.code, KeyCode::Char(_)) {
                        return ControlFlow::Continue;
                    }
                    // 字符输入继续传给 InputComposer（下方处理）
                }
            }

            // 先处理输入相关的键
            let action = app.input.handle_key(*key);
            // 输入变化后更新弹出框过滤
            if app.command_popup.is_visible() || app.input.value().starts_with('/') {
                app.command_popup.update(app.input.value());
            }
            match action {
                InputAction::Submit(text) => {
                    let text = text.trim().to_string();
                    if !text.is_empty() {
                        return ControlFlow::Break(AppResult::Submit(text));
                    }
                }
                InputAction::Exit => {
                    return ControlFlow::Break(AppResult::Exit);
                }
                InputAction::Interrupt => {
                    // Ctrl+C - 清空输入但不退出
                    // 在原来的代码中会显示 ^C，但这里避免访问 terminal
                }
                InputAction::None => {
                    // 输入处理器没有消费这个键，检查是否是滚动键
                    match key.code {
                        KeyCode::PageUp => {
                            app.scroll_up(5);
                        }
                        KeyCode::PageDown => {
                            app.scroll_down(5);
                        }
                        KeyCode::Up if key.modifiers.contains(KeyModifiers::SHIFT) => {
                            app.scroll_up(3);
                        }
                        KeyCode::Down if key.modifiers.contains(KeyModifiers::SHIFT) => {
                            app.scroll_down(3);
                        }
                        _ => {
                            // 其他键被 input_composer 消费了（字符输入等）
                        }
                    }
                }
            }
        }
        ControlFlow::Continue
    }
}

// ============================================================================
// 搜索处理器
// ============================================================================

/// 搜索进入处理器（Ctrl+F）
pub struct SearchEnterHandler;

impl EventHandler<Event> for SearchEnterHandler {
    fn handle(&mut self, event: &Event, app: &mut App) -> ControlFlow {
        if let Event::Key(key) = event {
            // 检测 Ctrl+F
            if key.code == KeyCode::Char('f') && key.modifiers.contains(KeyModifiers::CONTROL) {
                app.enter_search_mode();
                return ControlFlow::Continue;
            }
        }
        ControlFlow::Continue
    }
}

/// 搜索输入处理器 - 处理搜索模式下的所有输入
pub struct SearchInputHandler;

impl EventHandler<Event> for SearchInputHandler {
    fn handle(&mut self, event: &Event, app: &mut App) -> ControlFlow {
        if !app.is_searching() {
            return ControlFlow::Continue;
        }

        if let Event::Key(key) = event {
            match key.code {
                // Esc - 退出搜索模式
                KeyCode::Esc => {
                    app.exit_search_mode();
                    ControlFlow::Continue
                }
                // Enter - 下一个匹配
                KeyCode::Enter => {
                    if key.modifiers.contains(KeyModifiers::SHIFT) {
                        // Shift+Enter - 上一个匹配
                        app.prev_match();
                    } else {
                        app.next_match();
                    }
                    ControlFlow::Continue
                }
                // Ctrl+N - 下一个匹配（便利键）
                KeyCode::Char('n') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                    app.next_match();
                    ControlFlow::Continue
                }
                // Ctrl+P - 上一个匹配（便利键）
                KeyCode::Char('p') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                    app.prev_match();
                    ControlFlow::Continue
                }
                // 向下箭头 - 上一个匹配（符合直觉）
                KeyCode::Down => {
                    app.prev_match();
                    ControlFlow::Continue
                }
                // 向上箭头 - 下一个匹配（符合直觉）
                KeyCode::Up => {
                    app.next_match();
                    ControlFlow::Continue
                }
                // 其他按键 - 交给 search_input 处理
                _ => {
                    let action = app.search_input.handle_key(*key);
                    match action {
                        InputAction::Submit(text) => {
                            // 搜索模式下 Enter 不提交，而是导航
                            app.next_match();
                            ControlFlow::Continue
                        }
                        InputAction::Exit => {
                            // 搜索模式下 Ctrl+D 退出搜索
                            app.exit_search_mode();
                            ControlFlow::Continue
                        }
                        InputAction::Interrupt => {
                            // Ctrl+C - 退出搜索模式
                            app.exit_search_mode();
                            ControlFlow::Continue
                        }
                        InputAction::None => {
                            // 更新搜索词并执行搜索
                            app.search_query = app.search_input.value().to_string();
                            app.perform_search();
                            ControlFlow::Continue
                        }
                    }
                }
            }
        } else {
            ControlFlow::Continue
        }
    }
}

// ============================================================================
// 帮助模式处理器
// ============================================================================

/// 帮助进入处理器 - 按 `?` 键进入帮助模式
pub struct HelpEnterHandler;

impl EventHandler<Event> for HelpEnterHandler {
    fn handle(&mut self, event: &Event, app: &mut App) -> ControlFlow {
        if let Event::Key(key) = event {
            if key.code == KeyCode::Char('?') && !app.help_mode && !app.is_searching() {
                app.help_mode = true;
                // 清除输入框（防止 ? 被添加）
                app.input.clear();
                // 设置 help_mode 后，CombinedKeyHandler 会跳过输入处理
            }
        }
        ControlFlow::Continue
    }
}

/// 帮助退出处理器 - 按 `Esc` 键退出帮助模式
pub struct HelpExitHandler;

impl EventHandler<Event> for HelpExitHandler {
    fn handle(&mut self, event: &Event, app: &mut App) -> ControlFlow {
        if let Event::Key(key) = event {
            if key.code == KeyCode::Esc && app.help_mode {
                app.help_mode = false;
                return ControlFlow::Continue;
            }
        }
        ControlFlow::Continue
    }
}

// ============================================================================
// Diff 模式处理器
// ============================================================================

/// Diff 进入处理器 - 按 `d` 键进入 diff 模式
pub struct DiffEnterHandler;

impl EventHandler<Event> for DiffEnterHandler {
    fn handle(&mut self, event: &Event, app: &mut App) -> ControlFlow {
        if let Event::Key(key) = event {
            // 按 d 键进入 diff 模式（仅当有 diff 可用时）
            if key.code == KeyCode::Char('d') && !app.is_diff_mode() {
                if !app.diffs.is_empty() {
                    app.enter_diff_mode();
                    // 清除输入框（防止 d 被添加）
                    app.input.clear();
                }
            }
        }
        ControlFlow::Continue
    }
}

/// Diff 模式处理器 - 处理 diff 模式下的所有输入
pub struct DiffModeHandler;

impl EventHandler<Event> for DiffModeHandler {
    fn handle(&mut self, event: &Event, app: &mut App) -> ControlFlow {
        if !app.is_diff_mode() {
            return ControlFlow::Continue;
        }

        use crate::diff_render::{resolve_diff_key, DiffAction};

        if let Event::Key(key) = event {
            if let Some(action) = resolve_diff_key(*key) {
                match action {
                    DiffAction::ScrollUp(n) => {
                        if let Some(diff_view) = &mut app.diff_view {
                            diff_view.scroll_by(-(n as i16));
                        }
                    }
                    DiffAction::ScrollDown(n) => {
                        if let Some(diff_view) = &mut app.diff_view {
                            diff_view.scroll_by(n as i16);
                        }
                    }
                    DiffAction::PageUp => {
                        if let Some(diff_view) = &mut app.diff_view {
                            diff_view.page_by(-10);
                        }
                    }
                    DiffAction::PageDown => {
                        if let Some(diff_view) = &mut app.diff_view {
                            diff_view.page_by(10);
                        }
                    }
                    DiffAction::ScrollToTop => {
                        if let Some(diff_view) = &mut app.diff_view {
                            diff_view.scroll_to_top();
                        }
                    }
                    DiffAction::ScrollToBottom => {
                        if let Some(diff_view) = &mut app.diff_view {
                            diff_view.scroll_to_bottom();
                        }
                    }
                    DiffAction::NextFile => {
                        app.next_diff();
                    }
                    DiffAction::PrevFile => {
                        app.prev_diff();
                    }
                    DiffAction::Exit => {
                        app.exit_diff_mode();
                    }
                }
            }
        } else if let Event::Mouse(mouse_event) = event {
            // 支持鼠标滚轮
            if let Some(diff_view) = &mut app.diff_view {
                match mouse_event.kind {
                    crossterm::event::MouseEventKind::ScrollUp => {
                        diff_view.scroll_by(-3);
                    }
                    crossterm::event::MouseEventKind::ScrollDown => {
                        diff_view.scroll_by(3);
                    }
                    _ => {}
                }
            }
        }

        ControlFlow::Continue
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 测试键盘滚动处理器 - 只测试滚动逻辑，不依赖 terminal
    #[test]
    fn test_key_scroll_handler_page_up() {
        let mut handler = KeyScrollHandler;
        let mut app = App::new_for_test();

        // 直接设置内容区数据，避免调用 push_line
        app.content_lines = vec![
            ratatui::text::Line::from("Line 1"),
            ratatui::text::Line::from("Line 2"),
            ratatui::text::Line::from("Line 3"),
            ratatui::text::Line::from("Line 4"),
            ratatui::text::Line::from("Line 5"),
            ratatui::text::Line::from("Line 6"),
        ];
        app.scroll_to_bottom();

        let initial_offset = app.scroll_offset;
        let event = Event::Key(KeyEvent::new(KeyCode::PageUp, KeyModifiers::empty()));

        handler.handle(&event, &mut app);

        assert!(app.scroll_offset < initial_offset || app.scroll_offset == 0);
    }

    #[test]
    fn test_key_scroll_handler_page_down() {
        let mut handler = KeyScrollHandler;
        let mut app = App::new_for_test();

        app.content_lines = vec![
            ratatui::text::Line::from("Line 1"),
            ratatui::text::Line::from("Line 2"),
            ratatui::text::Line::from("Line 3"),
            ratatui::text::Line::from("Line 4"),
            ratatui::text::Line::from("Line 5"),
            ratatui::text::Line::from("Line 6"),
        ];
        app.scroll_to_bottom();
        app.scroll_up(5);

        let initial_offset = app.scroll_offset;
        let event = Event::Key(KeyEvent::new(KeyCode::PageDown, KeyModifiers::empty()));

        handler.handle(&event, &mut app);

        assert!(app.scroll_offset >= initial_offset);
    }

    #[test]
    fn test_mouse_scroll_handler_up() {
        let mut handler = MouseScrollHandler::new();
        let mut app = App::new_for_test();

        app.content_lines = vec![
            ratatui::text::Line::from("Line 1"),
            ratatui::text::Line::from("Line 2"),
            ratatui::text::Line::from("Line 3"),
            ratatui::text::Line::from("Line 4"),
            ratatui::text::Line::from("Line 5"),
            ratatui::text::Line::from("Line 6"),
        ];
        app.scroll_to_bottom();

        let initial_offset = app.scroll_offset;
        let event = Event::Mouse(MouseEvent {
            kind: MouseEventKind::ScrollUp,
            column: 0,
            row: 0,
            modifiers: KeyModifiers::empty(),
        });

        handler.handle(&event, &mut app);

        assert!(app.scroll_offset < initial_offset || app.scroll_offset == 0);
    }

    #[test]
    fn test_mouse_scroll_handler_down() {
        let mut handler = MouseScrollHandler::new();
        let mut app = App::new_for_test();

        app.content_lines = vec![
            ratatui::text::Line::from("Line 1"),
            ratatui::text::Line::from("Line 2"),
            ratatui::text::Line::from("Line 3"),
            ratatui::text::Line::from("Line 4"),
            ratatui::text::Line::from("Line 5"),
            ratatui::text::Line::from("Line 6"),
        ];
        app.scroll_to_bottom();
        app.scroll_up(5);

        let initial_offset = app.scroll_offset;
        let event = Event::Mouse(MouseEvent {
            kind: MouseEventKind::ScrollDown,
            column: 0,
            row: 0,
            modifiers: KeyModifiers::empty(),
        });

        handler.handle(&event, &mut app);

        assert!(app.scroll_offset >= initial_offset);
    }
}
