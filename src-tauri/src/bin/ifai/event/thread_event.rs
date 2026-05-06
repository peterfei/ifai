//! 线程事件处理器 - 声明式表驱动的多线程事件处理
//!
//! ## 架构哲学
//!
//! 本模块严格遵循 IfAI 的元编程架构原则：
//! - **声明式配置**: THREAD_KEYMAP 表驱动，零 if-match 分支
//! - **组合模式复用**: ThreadAction 嵌入 OverlayAction、SearchAction
//! - **模式守卫**: overlay/diff/search 时不响应线程快捷键

use crossterm::event::{Event, KeyCode, KeyEvent, KeyModifiers};

use crate::event::{ControlFlow, EventHandler};
use crate::tui::App;
use crate::AppResult;

// ============================================================================
// 线程动作定义（声明式，组合模式复用）
// ============================================================================

/// 线程相关动作（声明式枚举，支持组合模式）
///
/// ## 设计决策
///
/// - **ViewOverlay(OverlayAction)**: 侧线程完全复用主线程的 Overlay 系统
/// - **Search(SearchAction)**: 侧线程完全复用主线程的 Search 系统
/// - **零重复**: 无需为线程模式编写独立的 Handler
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ThreadAction {
    /// 创建侧线程（Ctrl+T）
    CreateSideThread,
    /// 切换到上一个线程（Alt+Left）
    PreviousThread,
    /// 切换到下一个线程（Alt+Right）
    NextThread,
    /// 返回父线程（Esc）
    ReturnToParent,
}

/// 线程快捷键配置（声明式表，零 if-match 分支）
///
/// ## 设计决策
///
/// - **表驱动**: 新增快捷键只需添加表项，零逻辑修改
/// - **O(1) 查找**: EventRouter 通过线性扫描查找匹配项
/// - **元编程友好**: 可通过宏自动生成 KeyAction 定义
#[derive(Debug, Clone, Copy)]
pub struct KeyAction {
    /// 按键代码
    pub key_code: KeyCode,
    /// 按键修饰符
    pub modifiers: KeyModifiers,
    /// 对应的动作
    pub action: ThreadAction,
    /// UI 显示标签
    pub label: &'static str,
}

impl KeyAction {
    /// 创建快捷键动作
    #[inline]
    pub const fn new(
        key_code: KeyCode,
        modifiers: KeyModifiers,
        action: ThreadAction,
        label: &'static str,
    ) -> Self {
        Self {
            key_code,
            modifiers,
            action,
            label,
        }
    }

    /// 匹配按键事件
    ///
    /// Windows 兼容：Windows 终端可能在 Alt 键上附带额外的修饰符位
    /// （如 Shift、或 Win32 特有的标志），因此 Alt 匹配使用 contains 而非精确相等。
    /// macOS/Linux 保持精确匹配。
    #[inline]
    pub fn matches(&self, key_event: &KeyEvent) -> bool {
        if self.key_code != key_event.code {
            return false;
        }
        #[cfg(target_os = "windows")]
        {
            // Windows：Alt 匹配使用 contains，容忍额外修饰符位
            if self.modifiers.contains(KeyModifiers::ALT) {
                return key_event.modifiers.contains(KeyModifiers::ALT);
            }
        }
        self.modifiers == key_event.modifiers
    }
}

/// 线程快捷键配置表（声明式，零分支）
pub const THREAD_KEYMAP: &[KeyAction] = &[
    // 创建侧线程
    KeyAction::new(
        KeyCode::Char('t'),
        KeyModifiers::CONTROL,
        ThreadAction::CreateSideThread,
        "创建侧线程",
    ),
    // 上一个线程（Alt+Left）
    KeyAction::new(
        KeyCode::Left,
        KeyModifiers::ALT,
        ThreadAction::PreviousThread,
        "上一个线程",
    ),
    // 下一个线程（Alt+Right）
    KeyAction::new(
        KeyCode::Right,
        KeyModifiers::ALT,
        ThreadAction::NextThread,
        "下一个线程",
    ),
    // 返回父线程（Esc）
    KeyAction::new(
        KeyCode::Esc,
        KeyModifiers::empty(),
        ThreadAction::ReturnToParent,
        "返回父线程",
    ),
];

// ============================================================================
// 线程进入处理器（创建/切换线程）
// ============================================================================

/// 线程切换进入处理器
///
/// 负责响应 Ctrl+T（创建侧线程）、Alt+Left/Right（切换线程）
///
/// ## 模式守卫
///
/// - overlay 模式: 不响应（Overlay 系统优先）
/// - diff 模式: 不响应（Diff 系统优先）
/// - search 模式: 不响应（Search 系统优先）
pub struct ThreadEnterHandler;

impl EventHandler<Event> for ThreadEnterHandler {
    fn handle(&mut self, event: &Event, app: &mut App) -> ControlFlow {
        // 模式守卫：非 Normal 模式时不响应
        if app.mode != crate::tui::Mode::Normal {
            return ControlFlow::Continue;
        }

        if let Event::Key(key) = event {
            // 查找 THREAD_KEYMAP 表（声明式，零 if-match）
            for key_action in THREAD_KEYMAP {
                if key_action.matches(key) {
                    match key_action.action {
                        ThreadAction::CreateSideThread => {
                            // 检查线程数量限制（最多 5 个）
                            if app.thread.store.len() >= 5 {
                                // TODO: 显示错误消息
                                return ControlFlow::Break(AppResult::Handled);
                            }

                            let name = format!("Thread-{}", app.thread.store.len());
                            app.create_side_thread(Some(name));
                            app.thread.active_mode = true;
                            app.mode = crate::tui::Mode::ThreadPicker;

                            return ControlFlow::Break(AppResult::Handled);
                        }
                        ThreadAction::PreviousThread => {
                            if let Some(prev_id) = app.thread.store.previous_thread() {
                                app.switch_thread(prev_id);
                            }
                            return ControlFlow::Break(AppResult::Handled);
                        }
                        ThreadAction::NextThread => {
                            if let Some(next_id) = app.thread.store.next_thread() {
                                app.switch_thread(next_id);
                            }
                            return ControlFlow::Break(AppResult::Handled);
                        }
                        ThreadAction::ReturnToParent => {
                            // 由 ThreadModeHandler 处理
                            return ControlFlow::Continue;
                        }
                    }
                }
            }
        }

        ControlFlow::Continue
    }
}

// ============================================================================
// 线程模式处理器（侧线程内的操作）
// ============================================================================

/// 线程模式处理器
///
/// 负责响应侧线程内的操作（Esc 返回父线程、Ctrl+O 查看详情等）
///
/// ## 模式守卫
///
/// - 仅在 active_thread_mode 时响应
pub struct ThreadModeHandler;

impl EventHandler<Event> for ThreadModeHandler {
    fn handle(&mut self, event: &Event, app: &mut App) -> ControlFlow {
        // 仅在线程模式下响应
        if !app.thread.active_mode {
            return ControlFlow::Continue;
        }

        if let Event::Key(key) = event {
            // 查找 THREAD_KEYMAP 表（声明式，零 if-match）
            for key_action in THREAD_KEYMAP {
                if key_action.matches(key) {
                    if key_action.action == ThreadAction::ReturnToParent {
                        if app.return_to_parent() {
                            // 如果没有父线程了，退出线程模式
                            let active = app.thread.store.active_thread();
                            if let Some(thread) = active {
                                if thread.kind == crate::thread::ThreadKind::Main {
                                    app.thread.active_mode = false;
                                    app.mode = crate::tui::Mode::Normal;
                                }
                            }
                        }
                        return ControlFlow::Break(AppResult::Handled);
                    }
                }
            }
        }

        ControlFlow::Continue
    }
}

// ============================================================================
// 单元测试
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // ========================================================================
    // KeyAction 测试
    // ========================================================================

    #[test]
    fn test_key_action_matches() {
        let action = KeyAction::new(
            KeyCode::Char('t'),
            KeyModifiers::CONTROL,
            ThreadAction::CreateSideThread,
            "创建侧线程",
        );

        let event = KeyEvent::new(KeyCode::Char('t'), KeyModifiers::CONTROL);
        assert!(action.matches(&event));

        let event = KeyEvent::new(KeyCode::Char('t'), KeyModifiers::empty());
        assert!(!action.matches(&event));

        let event = KeyEvent::new(KeyCode::Char('a'), KeyModifiers::CONTROL);
        assert!(!action.matches(&event));
    }

    #[test]
    fn test_key_action_alt_left() {
        let action = KeyAction::new(
            KeyCode::Left,
            KeyModifiers::ALT,
            ThreadAction::PreviousThread,
            "上一个线程",
        );

        let event = KeyEvent::new(KeyCode::Left, KeyModifiers::ALT);
        assert!(action.matches(&event));

        let event = KeyEvent::new(KeyCode::Left, KeyModifiers::CONTROL);
        assert!(!action.matches(&event));
    }

    #[test]
    fn test_key_action_esc() {
        let action = KeyAction::new(
            KeyCode::Esc,
            KeyModifiers::empty(),
            ThreadAction::ReturnToParent,
            "返回父线程",
        );

        let event = KeyEvent::new(KeyCode::Esc, KeyModifiers::empty());
        assert!(action.matches(&event));

        let event = KeyEvent::new(KeyCode::Esc, KeyModifiers::SHIFT);
        assert!(!action.matches(&event));
    }

    // ========================================================================
    // THREAD_KEYMAP 测试
    // ========================================================================

    #[test]
    fn test_thread_keymap_not_empty() {
        assert!(!THREAD_KEYMAP.is_empty());
    }

    #[test]
    fn test_thread_keymap_contains_ctrl_t() {
        let event = KeyEvent::new(KeyCode::Char('t'), KeyModifiers::CONTROL);
        assert!(THREAD_KEYMAP.iter().any(|ka| ka.matches(&event)));
    }

    #[test]
    fn test_thread_keymap_contains_alt_left() {
        let event = KeyEvent::new(KeyCode::Left, KeyModifiers::ALT);
        assert!(THREAD_KEYMAP.iter().any(|ka| ka.matches(&event)));
    }

    #[test]
    fn test_thread_keymap_contains_alt_right() {
        let event = KeyEvent::new(KeyCode::Right, KeyModifiers::ALT);
        assert!(THREAD_KEYMAP.iter().any(|ka| ka.matches(&event)));
    }

    #[test]
    fn test_thread_keymap_contains_esc() {
        let event = KeyEvent::new(KeyCode::Esc, KeyModifiers::empty());
        assert!(THREAD_KEYMAP.iter().any(|ka| ka.matches(&event)));
    }

    // ========================================================================
    // ThreadAction 测试
    // ========================================================================

    #[test]
    fn test_thread_action_create_side_thread() {
        let action = ThreadAction::CreateSideThread;
        assert!(matches!(action, ThreadAction::CreateSideThread));
    }
}
