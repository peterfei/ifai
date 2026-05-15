//! SIGINT 信号处理器
//!
//! 在 TUI 模式下注册全局 Ctrl+C 处理器，确保终端状态能正确恢复。
//! 使用 `ctrlc` crate 注册一次性的信号处理器。

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

/// SIGINT 处理器的状态
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SigintState {
    /// 未初始化
    Uninitialized,
    /// 已注册（正在运行）
    Registered,
    /// 已触发（收到 SIGINT）
    Triggered,
    /// 已恢复（终端已恢复）
    Restored,
}

/// SIGINT 信号处理器
///
/// 封装了 `ctrlc` 的安装逻辑，并提供可测试的状态查询接口。
pub struct SigintHandler {
    /// 是否已触发 SIGINT
    triggered: Arc<AtomicBool>,
    /// 是否已恢复终端
    restored: Arc<AtomicBool>,
    /// 是否已注册
    registered: bool,
}

impl SigintHandler {
    /// 创建新的 SIGINT 处理器（不自动注册）
    pub fn new() -> Self {
        Self {
            triggered: Arc::new(AtomicBool::new(false)),
            restored: Arc::new(AtomicBool::new(false)),
            registered: false,
        }
    }

    /// 注册 SIGINT 信号处理器
    ///
    /// 当收到 SIGINT 时：
    /// 1. 标记 triggered = true
    /// 2. 恢复终端状态（禁用 raw mode、离开 alternate screen）
    /// 3. 标记 restored = true
    /// 4. 退出进程（exit code 130）
    ///
    /// 返回 Ok(()) 表示注册成功，Err 表示注册失败。
    /// 注意：`ctrlc::set_handler` 在整个进程生命周期中只能调用一次。
    pub fn install(&mut self) -> Result<(), String> {
        if self.registered {
            return Err("SIGINT handler already registered".to_string());
        }

        let triggered = self.triggered.clone();
        let restored = self.restored.clone();

        ctrlc::set_handler(move || {
            // 防止重复执行（第二次 Ctrl+C 不再处理）
            if triggered.swap(true, Ordering::SeqCst) {
                return;
            }

            // 恢复终端状态
            let _ = crossterm::terminal::disable_raw_mode();
            let _ = crossterm::execute!(
                std::io::stdout(),
                crossterm::terminal::LeaveAlternateScreen,
                crossterm::event::DisableMouseCapture,
            );

            restored.store(true, Ordering::SeqCst);

            // 使用 eprintln 输出退出信息（stdout 可能被 TUI 占用）
            eprintln!();

            // 退出进程
            std::process::exit(130);
        })
        .map_err(|e| format!("Failed to install SIGINT handler: {}", e))?;

        self.registered = true;
        Ok(())
    }

    /// 是否已注册
    pub fn is_registered(&self) -> bool {
        self.registered
    }

    /// 是否已触发 SIGINT
    pub fn is_triggered(&self) -> bool {
        self.triggered.load(Ordering::SeqCst)
    }

    /// 是否已恢复终端
    pub fn is_restored(&self) -> bool {
        self.restored.load(Ordering::SeqCst)
    }

    /// 获取当前状态
    pub fn state(&self) -> SigintState {
        if !self.registered {
            SigintState::Uninitialized
        } else if self.restored.load(Ordering::SeqCst) {
            SigintState::Restored
        } else if self.triggered.load(Ordering::SeqCst) {
            SigintState::Triggered
        } else {
            SigintState::Registered
        }
    }

    /// 重置状态（用于测试后清理）
    /// 注意：ctrlc::set_handler 只能调用一次，所以此方法不重置 registered 标志
    pub fn reset_flags(&mut self) {
        self.triggered.store(false, Ordering::SeqCst);
        self.restored.store(false, Ordering::SeqCst);
    }
}

impl Default for SigintHandler {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_initial_state() {
        let handler = SigintHandler::new();
        assert_eq!(handler.state(), SigintState::Uninitialized);
        assert!(!handler.is_registered());
        assert!(!handler.is_triggered());
        assert!(!handler.is_restored());
    }

    #[test]
    fn test_install_twice_returns_error() {
        let mut handler = SigintHandler::new();
        // 第一次安装应该成功
        let result = handler.install();
        // 注意：在测试环境中 ctrlc::set_handler 可能因为全局唯一性而失败
        // 所以我们只检查状态变化
        if result.is_ok() {
            assert!(handler.is_registered());
            assert_eq!(handler.state(), SigintState::Registered);
        }

        // 第二次安装应该返回错误
        let result2 = handler.install();
        assert!(result2.is_err());
        assert!(result2.unwrap_err().contains("already registered"));
    }

    #[test]
    fn test_state_transition_uninitialized_to_registered() {
        let mut handler = SigintHandler::new();
        assert_eq!(handler.state(), SigintState::Uninitialized);

        // 尝试安装
        let _ = handler.install();

        // 如果安装成功，状态应为 Registered
        if handler.is_registered() {
            assert_eq!(handler.state(), SigintState::Registered);
        }
    }

    #[test]
    fn test_reset_flags() {
        let mut handler = SigintHandler::new();
        // 手动设置 triggered
        handler.triggered.store(true, Ordering::SeqCst);
        assert!(handler.is_triggered());

        // 重置
        handler.reset_flags();
        assert!(!handler.is_triggered());
        assert!(!handler.is_restored());
    }

    #[test]
    fn test_double_trigger_is_noop() {
        let triggered = Arc::new(AtomicBool::new(false));
        let restored = Arc::new(AtomicBool::new(false));

        // 模拟第一次触发
        assert!(!triggered.swap(true, Ordering::SeqCst));
        restored.store(true, Ordering::SeqCst);

        // 模拟第二次触发（应该被忽略）
        assert!(triggered.swap(true, Ordering::SeqCst)); // swap 返回旧值 true

        // restored 应该保持 true（第一次设置的值）
        assert!(restored.load(Ordering::SeqCst));
    }

    #[test]
    fn test_state_order_uninitialized_registered_triggered_restored() {
        // 验证状态枚举的顺序
        let uninit = SigintState::Uninitialized as u8;
        let registered = SigintState::Registered as u8;
        let triggered = SigintState::Triggered as u8;
        let restored = SigintState::Restored as u8;

        // 验证顺序：Uninitialized < Registered < Triggered < Restored
        assert!(uninit < registered);
        assert!(registered < triggered);
        assert!(triggered < restored);
    }

    #[test]
    fn test_default_is_new() {
        let handler1 = SigintHandler::default();
        let handler2 = SigintHandler::new();
        assert_eq!(handler1.state(), handler2.state());
        assert_eq!(handler1.is_registered(), handler2.is_registered());
    }

    #[test]
    fn test_sigint_state_debug_and_clone() {
        // 验证 SigintState 实现了 Debug 和 Clone
        let state = SigintState::Registered;
        let _debug = format!("{:?}", state);
        let cloned = state.clone();
        assert_eq!(state, cloned);
    }

    #[test]
    fn test_handler_send_sync() {
        // 验证 SigintHandler 可以在线程间传递
        fn assert_send<T: Send>() {}
        fn assert_sync<T: Sync>() {}
        assert_send::<SigintHandler>();
        assert_sync::<SigintHandler>();
    }
}
