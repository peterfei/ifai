//! 事件路由器 — 查表驱动的事件派发

use super::{ControlFlow, EventHandler, EventRoute};
use crate::tui::App;
use crate::AppResult;
use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};

/// 事件路由器（查表驱动派发）
///
/// # 设计理念
///
/// - **查表驱动**: 遍历路由表，找到第一个匹配的处理器
/// - **链式注册**: 使用 Builder 模式，流畅 API
/// - **Fallback 支持**: 未匹配事件使用 fallback 处理器
///
/// # 示例
///
/// ```rust
/// let router = EventRouter::new()
///     .on(|e| matches!(e, Event::Key(_)), KeyScrollHandler)
///     .on(|e| matches!(e, Event::Mouse(_)), MouseScrollHandler)
///     .fallback(IgnoreHandler);
///
/// router.dispatch(&event, &mut app);
/// ```
pub struct EventRouter<E> {
    /// 路由表（按注册顺序）
    routes: Vec<EventRoute<E>>,
    /// Fallback 处理器（未匹配时）
    fallback: Option<Box<dyn EventHandler<E>>>,
}

impl<E> EventRouter<E> {
    /// 创建空路由器
    pub fn new() -> Self {
        Self {
            routes: Vec::new(),
            fallback: None,
        }
    }

    /// 注册路由（链式调用）
    ///
    /// # 参数
    /// - `predicate`: 事件谓词（返回 `true` 表示匹配）
    /// - `handler`: 事件处理器
    ///
    /// # 返回
    /// - `Self`: 支持链式调用
    ///
    /// # 示例
    ///
    /// ```rust
    /// router.on(|e| matches!(e, Event::Key(_)), KeyScrollHandler)
    /// ```
    pub fn on<P, H>(mut self, predicate: P, handler: H) -> Self
    where
        P: Fn(&E) -> bool + 'static,
        H: EventHandler<E> + 'static,
    {
        self.routes.push(EventRoute::new(predicate, handler));
        self
    }

    /// 设置 fallback 处理器
    ///
    /// # 参数
    /// - `handler`: fallback 处理器
    ///
    /// # 返回
    /// - `Self`: 支持链式调用
    ///
    /// # 示例
    ///
    /// ```rust
    /// router.fallback(IgnoreHandler)
    /// ```
    pub fn fallback<H>(mut self, handler: H) -> Self
    where
        H: EventHandler<E> + 'static,
    {
        self.fallback = Some(Box::new(handler));
        self
    }

    /// 派发事件到匹配的处理器
    ///
    /// # 派发逻辑
    ///
    /// 1. 遍历路由表（按注册顺序）
    /// 2. 对每个路由，调用 `predicate` 判断是否匹配
    /// 3. 如果匹配，调用其 `handler`：
    ///    - 返回 `Break(result)` → 立即停止并返回
    ///    - 返回 `Continue` → 继续尝试下一个路由
    /// 4. 如果所有路由都返回 `Continue`，使用 `fallback`（如果有）
    /// 5. 否则返回 `ControlFlow::Continue`
    ///
    /// # 重要说明
    ///
    /// **"继续尝试"语义**：处理器返回 `Continue` 表示"我没有处理这个事件，
    /// 请继续尝试其他处理器"，而不是"我已处理但继续运行"。
    /// 这允许多个处理器共同处理不同的事件，实现了责任链模式。
    ///
    /// # 参数
    /// - `event`: 事件引用
    /// - `app`: 可变 App 引用
    ///
    /// # 返回
    /// - `ControlFlow`: 控制流
    ///
    /// # 示例
    ///
    /// ```rust
    /// match router.dispatch(&event, &mut app) {
    ///     ControlFlow::Break(result) => return result,
    ///     ControlFlow::Continue => {},
    /// }
    /// ```
    pub fn dispatch(&mut self, event: &E, app: &mut App) -> ControlFlow {
        // 遍历路由表
        for route in &mut self.routes {
            if (route.predicate)(event) {
                match route.handler.handle(event, app) {
                    ControlFlow::Break(result) => return ControlFlow::Break(result),
                    ControlFlow::Continue => {
                        // 处理器返回 Continue，继续尝试下一个路由
                        continue;
                    }
                }
            }
        }

        // 使用 fallback
        if let Some(fallback) = &mut self.fallback {
            return fallback.handle(event, app);
        }

        // 默认继续
        ControlFlow::Continue
    }
}

impl<E> Default for EventRouter<E> {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::AppResult;
    use crossterm::event::{KeyCode, KeyEvent};

    // 测试用处理器
    struct EnterHandler;
    impl EventHandler<KeyEvent> for EnterHandler {
        fn handle(&mut self, event: &KeyEvent, _app: &mut App) -> ControlFlow {
            if event.code == KeyCode::Enter {
                ControlFlow::Break(AppResult::Exit)
            } else {
                ControlFlow::Continue
            }
        }
    }

    struct EscHandler;
    impl EventHandler<KeyEvent> for EscHandler {
        fn handle(&mut self, event: &KeyEvent, _app: &mut App) -> ControlFlow {
            if event.code == KeyCode::Esc {
                ControlFlow::Break(AppResult::Exit)
            } else {
                ControlFlow::Continue
            }
        }
    }

    struct FallbackHandler;
    impl EventHandler<KeyEvent> for FallbackHandler {
        fn handle(&mut self, _event: &KeyEvent, _app: &mut App) -> ControlFlow {
            ControlFlow::Continue
        }
    }

    #[test]
    fn test_router_new() {
        let router: EventRouter<KeyEvent> = EventRouter::new();
        assert_eq!(router.routes.len(), 0);
        assert!(router.fallback.is_none());
    }

    #[test]
    fn test_router_on() {
        let router: EventRouter<KeyEvent> =
            EventRouter::new().on(|e| matches!(e.code, KeyCode::Enter), EnterHandler);

        assert_eq!(router.routes.len(), 1);
    }

    #[test]
    fn test_router_fallback() {
        let router: EventRouter<KeyEvent> =
            EventRouter::new().fallback(FallbackHandler);

        assert!(router.fallback.is_some());
    }

    #[test]
    fn test_router_dispatch_match() {
        let mut router: EventRouter<KeyEvent> =
            EventRouter::new().on(|e| matches!(e.code, KeyCode::Enter), EnterHandler);

        let mut app = App::new_for_test();
        let event = KeyEvent::new(KeyCode::Enter, KeyModifiers::empty());

        let flow = router.dispatch(&event, &mut app);

        assert!(matches!(flow, ControlFlow::Break(AppResult::Exit)));
    }

    #[test]
    fn test_router_dispatch_no_match() {
        let mut router: EventRouter<KeyEvent> =
            EventRouter::new().on(|e| matches!(e.code, KeyCode::Enter), EnterHandler);

        let mut app = App::new_for_test();
        let event = KeyEvent::new(KeyCode::Esc, KeyModifiers::empty());

        let flow = router.dispatch(&event, &mut app);

        assert!(matches!(flow, ControlFlow::Continue));
    }

    #[test]
    fn test_router_dispatch_fallback() {
        let mut router: EventRouter<KeyEvent> = EventRouter::new()
            .on(|e| matches!(e.code, KeyCode::Enter), EnterHandler)
            .fallback(FallbackHandler);

        let mut app = App::new_for_test();
        let event = KeyEvent::new(KeyCode::Esc, KeyModifiers::empty());

        let flow = router.dispatch(&event, &mut app);

        assert!(matches!(flow, ControlFlow::Continue));
    }

    #[test]
    fn test_router_dispatch_order() {
        // 测试新的 dispatch 逻辑：返回 Continue 时继续尝试后续路由
        let mut router: EventRouter<KeyEvent> = EventRouter::new()
            .on(|_e| true, EnterHandler) // 匹配所有事件，但只处理 Enter
            .on(|e| matches!(e.code, KeyCode::Esc), EscHandler); // 也会被尝试

        let mut app = App::new_for_test();
        let event = KeyEvent::new(KeyCode::Esc, KeyModifiers::empty());

        let flow = router.dispatch(&event, &mut app);

        // EnterHandler 匹配但返回 Continue（不处理 Esc）
        // 继续尝试 EscHandler，EscHandler 处理 Esc 并返回 Break(Exit)
        assert!(matches!(flow, ControlFlow::Break(AppResult::Exit)));
    }
}
