//! 事件处理器抽象 — EventHandler trait + ControlFlow

use crate::tui::App;
use crate::AppResult;
use crossterm::event::{KeyEvent, KeyModifiers};

/// 控制流（类型安全的返回值）
///
/// 替代传统的 `bool` 返回值，提供类型安全的控制流语义。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ControlFlow {
    /// 继续事件循环
    Continue,
    /// 退出循环并返回结果
    Break(AppResult),
}

/// 事件处理器 trait（编译期多态）
///
/// # 泛型参数
/// - `E`: 事件类型（如 `KeyEvent`, `MouseEvent`）
///
/// # 方法
/// - `handle`: 处理事件，返回控制流
///
/// # 示例
///
/// ```rust
/// struct MyHandler;
///
/// impl EventHandler<KeyEvent> for MyHandler {
///     fn handle(&mut self, event: &KeyEvent, app: &mut App) -> ControlFlow {
///         match event.code {
///             KeyCode::Enter => {
///                 // 处理 Enter 键
///                 ControlFlow::Continue
///             }
///             KeyCode::Esc => {
///                 // 退出循环
///                 ControlFlow::Break(AppResult::Exit)
///             }
///             _ => ControlFlow::Continue,
///         }
///     }
/// }
/// ```
pub trait EventHandler<E> {
    /// 处理事件
    ///
    /// # 参数
    /// - `event`: 事件引用
    /// - `app`: 可变 App 引用
    ///
    /// # 返回
    /// - `ControlFlow::Continue`: 继续事件循环
    /// - `ControlFlow::Break(result)`: 退出循环并返回结果
    fn handle(&mut self, event: &E, app: &mut App) -> ControlFlow;
}

/// 事件路由条目
///
/// 包含事件谓词和对应的处理器。
pub struct EventRoute<E> {
    /// 事件谓词（判断是否匹配此路由）
    pub predicate: Box<dyn Fn(&E) -> bool>,
    /// 事件处理器
    pub handler: Box<dyn EventHandler<E>>,
}

impl<E> EventRoute<E> {
    /// 创建新的事件路由
    ///
    /// # 参数
    /// - `predicate`: 事件谓词（返回 `true` 表示匹配）
    /// - `handler`: 事件处理器
    pub fn new<P, H>(predicate: P, handler: H) -> Self
    where
        P: Fn(&E) -> bool + 'static,
        H: EventHandler<E> + 'static,
    {
        Self {
            predicate: Box::new(predicate),
            handler: Box::new(handler),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::AppResult;
    use crossterm::event::{KeyCode, KeyEvent};

    // 测试用处理器
    struct MockHandler {
        call_count: std::sync::atomic::AtomicUsize,
    }

    impl EventHandler<KeyEvent> for MockHandler {
        fn handle(&mut self, _event: &KeyEvent, _app: &mut App) -> ControlFlow {
            self.call_count.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            ControlFlow::Continue
        }
    }

    #[test]
    fn test_control_flow_continue() {
        let flow = ControlFlow::Continue;
        assert!(matches!(flow, ControlFlow::Continue));
    }

    #[test]
    fn test_control_flow_break() {
        let flow = ControlFlow::Break(AppResult::Exit);
        assert!(matches!(flow, ControlFlow::Break(AppResult::Exit)));
    }

    #[test]
    fn test_event_handler_called() {
        let handler = MockHandler {
            call_count: std::sync::atomic::AtomicUsize::new(0),
        };
        let mut app = App::new_for_test();
        let event = KeyEvent::new(KeyCode::Enter, KeyModifiers::empty());

        // 创建可变 handler
        let mut handler = handler;
        handler.handle(&event, &mut app);

        assert_eq!(
            handler.call_count.load(std::sync::atomic::Ordering::SeqCst),
            1
        );
    }

    #[test]
    fn test_event_route_creation() {
        let route = EventRoute::new(
            |e: &KeyEvent| matches!(e.code, KeyCode::Enter),
            MockHandler {
                call_count: std::sync::atomic::AtomicUsize::new(0),
            },
        );

        let event = KeyEvent::new(KeyCode::Enter, KeyModifiers::empty());
        assert!((route.predicate)(&event));
    }
}
