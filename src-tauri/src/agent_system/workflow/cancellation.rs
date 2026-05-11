//! 取消令牌管理
//!
//! 为工具执行提供 CancellationToken 支持，允许外部中断和超时取消。

use std::time::Duration;
use tokio_util::sync::CancellationToken;

/// 取消令牌管理器
///
/// 管理一批 tool_call 的子令牌，支持：
/// - 外部中断（Ctrl+C）：`cancel_all()` 取消所有子令牌
/// - 单工具超时：`with_timeout()` 创建带超时的子令牌
pub struct CancellationManager {
    root: CancellationToken,
    per_call: Vec<CancellationToken>,
}

impl CancellationManager {
    pub fn new() -> Self {
        Self {
            root: CancellationToken::new(),
            per_call: Vec::new(),
        }
    }

    /// 为新一批 tool_calls 创建子令牌
    ///
    /// 每次调用会清除上一批的子令牌
    pub fn create_child_tokens(&mut self, count: usize) -> Vec<CancellationToken> {
        self.per_call.clear();
        for _ in 0..count {
            let child = self.root.child_token();
            self.per_call.push(child.clone());
        }
        self.per_call.clone()
    }

    /// 外部中断（Ctrl+C）— 取消所有子令牌
    pub fn cancel_all(&self) {
        self.root.cancel();
    }

    /// 为单个工具设置超时
    ///
    /// 返回一个新的子令牌，在超时后自动取消。
    /// 原始令牌不受影响。
    pub fn with_timeout(token: &CancellationToken, timeout: Duration) -> CancellationToken {
        let child = token.child_token();
        let timeout_child = child.clone();
        tokio::spawn(async move {
            tokio::time::sleep(timeout).await;
            timeout_child.cancel();
        });
        child
    }

    /// 检查是否已取消
    pub fn is_cancelled(&self) -> bool {
        self.root.is_cancelled()
    }
}

impl Default for CancellationManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ===== T2.1: 取消传播测试 =====

    #[tokio::test]
    async fn test_cancel_propagation_to_children() {
        let mut mgr = CancellationManager::new();
        let tokens = mgr.create_child_tokens(3);

        // 取消前，子令牌未取消
        for token in &tokens {
            assert!(!token.is_cancelled());
        }

        // 取消所有
        mgr.cancel_all();

        // 取消后，所有子令牌被取消
        for token in &tokens {
            assert!(token.is_cancelled());
        }
    }

    #[tokio::test]
    async fn test_cancel_child_independent() {
        let mut mgr = CancellationManager::new();
        let tokens = mgr.create_child_tokens(3);

        // 单独取消第一个子令牌
        tokens[0].cancel();

        // 只有第一个被取消
        assert!(tokens[0].is_cancelled());
        assert!(!tokens[1].is_cancelled());
        assert!(!tokens[2].is_cancelled());

        // 管理器的 root 未取消
        assert!(!mgr.is_cancelled());
    }

    #[tokio::test]
    async fn test_timeout_cancellation() {
        let root = CancellationToken::new();
        let child = CancellationManager::with_timeout(&root, Duration::from_millis(50));

        // 初始未取消
        assert!(!child.is_cancelled());

        // 等待超时
        tokio::time::sleep(Duration::from_millis(100)).await;

        // 超时后子令牌被取消
        assert!(child.is_cancelled());

        // root 未取消
        assert!(!root.is_cancelled());
    }

    #[tokio::test]
    async fn test_timeout_does_not_affect_parent() {
        let mut mgr = CancellationManager::new();
        let tokens = mgr.create_child_tokens(2);

        // 给第一个加超时
        let timed_token = CancellationManager::with_timeout(&tokens[0], Duration::from_millis(50));
        tokio::time::sleep(Duration::from_millis(100)).await;

        // 超时的子令牌被取消
        assert!(timed_token.is_cancelled());
        // 原始令牌不受影响
        assert!(!tokens[0].is_cancelled());
        // 其他令牌不受影响
        assert!(!tokens[1].is_cancelled());
    }

    #[tokio::test]
    async fn test_create_child_tokens_clears_previous() {
        let mut mgr = CancellationManager::new();

        // 第一批 3 个
        let batch1 = mgr.create_child_tokens(3);
        assert_eq!(batch1.len(), 3);

        // 第二批 2 个（清除第一批）
        let batch2 = mgr.create_child_tokens(2);
        assert_eq!(batch2.len(), 2);

        // 取消所有应只影响第二批
        mgr.cancel_all();
        for token in &batch2 {
            assert!(token.is_cancelled());
        }
    }

    #[test]
    fn test_is_cancelled_initial_state() {
        let mgr = CancellationManager::new();
        assert!(!mgr.is_cancelled());
    }
}
