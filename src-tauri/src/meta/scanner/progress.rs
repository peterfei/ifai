//! 进度跟踪模块
//!
//! 提供节流机制，避免高频进度更新导致性能问题

use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;

/// 进度事件
#[derive(Debug, Clone)]
pub struct ProgressEvent {
    /// 当前进度（0-100）
    pub current: usize,
    /// 总数
    pub total: usize,
    /// 消息
    pub message: String,
    /// 时间戳
    pub timestamp: Instant,
}

/// 进度跟踪器（节流机制）
pub struct ProgressTracker {
    /// 节流间隔（毫秒）
    throttle_interval: Duration,
    /// 上次发送时间
    last_send: Arc<Mutex<Instant>>,
    /// 回调函数
    callback: Arc<dyn Fn(ProgressEvent) + Send + Sync>,
    /// 当前计数
    current: Arc<Mutex<usize>>,
    /// 总数
    total: usize,
}

impl ProgressTracker {
    /// 创建新的进度跟踪器
    pub fn new<F>(total: usize, throttle_ms: u64, callback: F) -> Self
    where
        F: Fn(ProgressEvent) + Send + Sync + 'static,
    {
        Self {
            throttle_interval: Duration::from_millis(throttle_ms),
            last_send: Arc::new(Mutex::new(Instant::now())),
            callback: Arc::new(callback),
            current: Arc::new(Mutex::new(0)),
            total,
        }
    }

    /// 增加进度（带节流）
    pub async fn increment(&self, delta: usize, message: String) {
        let mut current = self.current.lock().await;
        *current += delta;
        let current_val = *current;

        drop(current);

        // 检查是否应该发送（节流）
        let should_send = {
            let mut last_send = self.last_send.lock().await;
            let elapsed = last_send.elapsed();

            if elapsed >= self.throttle_interval {
                *last_send = Instant::now();
                true
            } else {
                false
            }
        };

        if should_send {
            let event = ProgressEvent {
                current: current_val,
                total: self.total,
                message,
                timestamp: Instant::now(),
            };

            (self.callback)(event);
        }
    }

    /// 更新进度（直接设置，带节流）
    pub async fn update(&self, value: usize, message: String) {
        let mut current = self.current.lock().await;
        *current = value;
        let current_val = *current;

        drop(current);

        // 检查是否应该发送（节流）
        let should_send = {
            let mut last_send = self.last_send.lock().await;
            let elapsed = last_send.elapsed();

            if elapsed >= self.throttle_interval {
                *last_send = Instant::now();
                true
            } else {
                false
            }
        };

        if should_send {
            let event = ProgressEvent {
                current: current_val,
                total: self.total,
                message,
                timestamp: Instant::now(),
            };

            (self.callback)(event);
        }
    }

    /// 完成进度（100%）
    pub async fn complete(&self, message: String) {
        self.update(self.total, message).await;
    }

    /// 获取当前进度
    pub async fn current(&self) -> usize {
        *self.current.lock().await
    }

    /// 获取进度百分比
    pub async fn percentage(&self) -> f64 {
        let current = *self.current.lock().await;
        (current as f64 / self.total as f64) * 100.0
    }
}

/// 简单的同步进度跟踪器（用于非异步上下文）
pub struct SyncProgressTracker {
    /// 节流间隔（毫秒）
    throttle_interval: Duration,
    /// 上次发送时间
    last_send: std::cell::Cell<Instant>,
    /// 回调函数
    callback: Box<dyn Fn(ProgressEvent)>,
    /// 当前计数
    current: std::cell::Cell<usize>,
    /// 总数
    total: usize,
}

impl SyncProgressTracker {
    /// 创建新的同步进度跟踪器
    pub fn new<F>(total: usize, throttle_ms: u64, callback: F) -> Self
    where
        F: Fn(ProgressEvent) + 'static,
    {
        // 初始化 last_send 为很久以前，确保第一次调用立即触发
        let initial_time = Instant::now() - Duration::from_secs(1000);

        Self {
            throttle_interval: Duration::from_millis(throttle_ms),
            last_send: std::cell::Cell::new(initial_time),
            callback: Box::new(callback),
            current: std::cell::Cell::new(0),
            total,
        }
    }

    /// 增加进度（带节流）
    pub fn increment(&self, delta: usize, message: String) {
        let current_val = self.current.get();
        self.current.set(current_val + delta);

        // 检查是否应该发送（节流）
        let elapsed = self.last_send.get().elapsed();

        if elapsed >= self.throttle_interval {
            self.last_send.set(Instant::now());

            let event = ProgressEvent {
                current: self.current.get(),
                total: self.total,
                message,
                timestamp: Instant::now(),
            };

            (self.callback)(event);
        }
    }

    /// 更新进度（直接设置，带节流）
    pub fn update(&self, value: usize, message: String) {
        self.current.set(value);

        // 检查是否应该发送（节流）
        let elapsed = self.last_send.get().elapsed();

        if elapsed >= self.throttle_interval {
            self.last_send.set(Instant::now());

            let event = ProgressEvent {
                current: value,
                total: self.total,
                message,
                timestamp: Instant::now(),
            };

            (self.callback)(event);
        }
    }

    /// 完成进度（100%）
    pub fn complete(&self, message: String) {
        self.update(self.total, message);
    }

    /// 获取当前进度
    pub fn current(&self) -> usize {
        self.current.get()
    }

    /// 获取进度百分比
    pub fn percentage(&self) -> f64 {
        (self.current.get() as f64 / self.total as f64) * 100.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    #[test]
    fn test_sync_progress_tracker() {
        let call_count = Arc::new(AtomicUsize::new(0));
        let call_count_clone = call_count.clone();

        let tracker = SyncProgressTracker::new(100, 100, move |_| {
            call_count_clone.fetch_add(1, Ordering::Relaxed);
        });

        // 快速增加 10 次（应该被节流）
        for i in 0..10 {
            tracker.increment(1, format!("Processing {}", i));
        }

        // 由于节流，回调次数应该 < 10
        let calls = call_count.load(Ordering::Relaxed);
        assert!(calls < 10, "Too many callbacks: {}", calls);
        assert!(calls > 0, "No callbacks fired");

        // 完成进度
        tracker.complete("Done".to_string());

        println!("Throttled {} callbacks for 10 updates", calls);
    }

    #[test]
    fn test_progress_percentage() {
        let tracker = SyncProgressTracker::new(100, 100, move |_| {});

        tracker.update(50, "Half done".to_string());
        assert_eq!(tracker.percentage(), 50.0);

        tracker.update(100, "Complete".to_string());
        assert_eq!(tracker.percentage(), 100.0);
    }

    #[test]
    fn test_throttle_interval() {
        let call_count = Arc::new(AtomicUsize::new(0));
        let call_count_clone = call_count.clone();

        // 使用 10ms 节流间隔
        let tracker = SyncProgressTracker::new(100, 10, move |_| {
            call_count_clone.fetch_add(1, Ordering::Relaxed);
        });

        // 第一次更新应该立即触发
        tracker.update(10, "First".to_string());
        assert_eq!(call_count.load(Ordering::Relaxed), 1);

        // 快速更新应该被节流
        tracker.update(20, "Second".to_string());
        tracker.update(30, "Third".to_string());

        // 等待节流间隔
        std::thread::sleep(Duration::from_millis(15));

        // 下一次更新应该触发
        tracker.update(40, "Fourth".to_string());
        assert_eq!(call_count.load(Ordering::Relaxed), 2);
    }
}
