/// 线程安全共享状态包装
///
/// 消除 `Arc<RwLock<T>>` 的手动 `unwrap()` 模板，自动管理锁生命周期。
/// 使用闭包模式确保锁在操作完成后立即释放，从设计上避免死锁。
///
/// # 示例
///
/// ```ignore
/// let state = SharedState::new(42u32);
/// let value = state.read(|s| *s);
/// state.write(|s| *s += 1);
/// ```
use std::sync::{Arc, RwLock};

/// 线程安全共享状态包装
#[derive(Clone, Debug)]
pub struct SharedState<T>(Arc<RwLock<T>>);

impl<T> SharedState<T> {
    /// 创建新的共享状态
    pub fn new(inner: T) -> Self {
        Self(Arc::new(RwLock::new(inner)))
    }

    /// 读取共享状态
    ///
    /// 闭包 `f` 在持有读锁的情况下执行，返回后自动释放锁。
    pub fn read<R>(&self, f: impl FnOnce(&T) -> R) -> R {
        let guard = self.0.read().expect("SharedState: 读取锁已损坏");
        f(&guard)
    }

    /// 写入共享状态
    ///
    /// 闭包 `f` 在持有写锁的情况下执行，返回后自动释放锁。
    pub fn write<R>(&self, f: impl FnOnce(&mut T) -> R) -> R {
        let mut guard = self.0.write().expect("SharedState: 写入锁已损坏");
        f(&mut guard)
    }
}

// ============================================================
// 测试
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::thread;
    use std::time::Duration;

    #[test]
    fn test_read_returns_initial_value() {
        let state = SharedState::new(42u32);
        let value = state.read(|s| *s);
        assert_eq!(value, 42);
    }

    #[test]
    fn test_write_modifies_value() {
        let state = SharedState::new(String::from("hello"));
        state.write(|s| *s = String::from("world"));
        let result = state.read(|s| s.clone());
        assert_eq!(result, "world");
    }

    #[test]
    fn test_multiple_writes_accumulate() {
        let state = SharedState::new(0i32);
        for i in 0..10 {
            state.write(|s| *s += i);
        }
        let sum: i32 = (0..10).sum();
        assert_eq!(state.read(|s| *s), sum);
    }

    #[test]
    fn test_write_returns_value() {
        let state = SharedState::new(0u32);
        let result = state.write(|s| {
            *s = 42;
            *s
        });
        assert_eq!(result, 42);
    }

    #[test]
    fn test_concurrent_reads_dont_block_each_other() {
        let state = SharedState::new(0u32);
        let state = Arc::new(state);
        let mut handles = vec![];

        for _ in 0..20 {
            let s = state.clone();
            handles.push(thread::spawn(move || {
                s.read(|_| {
                    // 模拟读操作耗时
                    thread::sleep(Duration::from_millis(10));
                });
            }));
        }

        let start = std::time::Instant::now();
        for h in handles {
            h.join().unwrap();
        }
        let elapsed = start.elapsed();

        // 20 个并发读应该在远小于 200ms 内完成（每个 10ms，串行需要 200ms）
        assert!(
            elapsed < Duration::from_millis(100),
            "并发读耗时 {elapsed:?}，期望 < 100ms（说明是串行执行）"
        );
    }

    #[test]
    fn test_write_is_exclusive() {
        let state = SharedState::new(0u32);
        let state = Arc::new(state);
        let counter = Arc::new(AtomicUsize::new(0));
        let max_concurrent = Arc::new(AtomicUsize::new(0));
        let mut handles = vec![];

        for _ in 0..5 {
            let s = state.clone();
            let c = counter.clone();
            let m = max_concurrent.clone();
            handles.push(thread::spawn(move || {
                s.write(|val| {
                    let current = c.fetch_add(1, Ordering::SeqCst) + 1;
                    m.fetch_max(current, Ordering::SeqCst);
                    thread::sleep(Duration::from_millis(20));
                    *val += 1;
                    c.fetch_sub(1, Ordering::SeqCst);
                });
            }));
        }

        for h in handles {
            h.join().unwrap();
        }

        assert_eq!(state.read(|s| *s), 5, "最终值应为 5（5 次递增）");
        assert_eq!(
            max_concurrent.load(Ordering::SeqCst),
            1,
            "写锁应互斥，同时最多 1 个写入者"
        );
    }

    #[test]
    fn test_clone_shares_inner_state() {
        let state = SharedState::new(vec![1, 2, 3]);
        let cloned = state.clone();
        cloned.write(|s| s.push(4));
        assert_eq!(state.read(|s| s.len()), 4, "clone 应共享内部 Arc，修改一方影响另一方");
    }

    #[test]
    fn test_read_after_write_sees_changes() {
        let state = SharedState::new(String::new());
        state.write(|s| {
            s.push_str("hello ");
            s.push_str("world");
        });
        let len = state.read(|s| s.len());
        assert_eq!(len, 11);
    }
}
