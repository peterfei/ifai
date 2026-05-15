//! 共享重试策略 — R2: 消除连接建立和 chunk 读取的重复重试逻辑

use std::time::Duration;

/// 共享重试策略
pub struct RetryPolicy {
    pub max: u32,
    pub delays: Vec<Duration>,
}

/// 通用异步重试引擎
///
/// `f` 是异步闭包（返回 `Future<Output = Result>`），`is_retryable` 判断错误是否可重试。
/// 重试时按 `policy.delays` 中的延迟 sleep。
pub async fn with_retry<T, E, F, Fut, R>(
    policy: &RetryPolicy,
    is_retryable: R,
    mut f: F,
) -> Result<T, E>
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = Result<T, E>>,
    R: Fn(&E) -> bool,
{
    let mut attempt: u32 = 0;
    loop {
        match f().await {
            Ok(value) => return Ok(value),
            Err(e) => {
                if is_retryable(&e) && attempt < policy.max {
                    if let Some(&delay) = policy.delays.get(attempt as usize) {
                        tokio::time::sleep(delay).await;
                    }
                    attempt += 1;
                } else {
                    return Err(e);
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    #[tokio::test]
    async fn test_with_retry_success_on_first_try() {
        let policy = RetryPolicy {
            max: 2,
            delays: vec![Duration::from_millis(10), Duration::from_millis(10)],
        };
        let call_count = AtomicU32::new(0);

        let result: Result<String, String> = with_retry(
            &policy,
            |_| true,
            || {
                call_count.fetch_add(1, Ordering::SeqCst);
                async { Ok("ok".to_string()) }
            },
        )
        .await;

        assert_eq!(result.unwrap(), "ok");
        assert_eq!(call_count.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn test_with_retry_retryable_triggers_retry() {
        let policy = RetryPolicy {
            max: 2,
            delays: vec![Duration::from_millis(10), Duration::from_millis(10)],
        };
        let call_count = AtomicU32::new(0);

        let result: Result<String, String> = with_retry(
            &policy,
            |_| true,
            || {
                let count = call_count.fetch_add(1, Ordering::SeqCst);
                async move {
                    if count < 1 {
                        Err("transient".to_string())
                    } else {
                        Ok("recovered".to_string())
                    }
                }
            },
        )
        .await;

        assert_eq!(result.unwrap(), "recovered");
        assert_eq!(call_count.load(Ordering::SeqCst), 2);
    }

    #[tokio::test]
    async fn test_with_retry_exhausted_returns_error() {
        let policy = RetryPolicy {
            max: 2,
            delays: vec![Duration::from_millis(10), Duration::from_millis(10)],
        };
        let call_count = AtomicU32::new(0);

        let result: Result<String, String> = with_retry(
            &policy,
            |_| true,
            || {
                call_count.fetch_add(1, Ordering::SeqCst);
                async { Err("always_fail".to_string()) }
            },
        )
        .await;

        assert_eq!(result.unwrap_err(), "always_fail");
        assert_eq!(call_count.load(Ordering::SeqCst), 3);
    }

    #[tokio::test]
    async fn test_with_retry_non_retryable_no_retry() {
        let policy = RetryPolicy {
            max: 2,
            delays: vec![Duration::from_millis(10), Duration::from_millis(10)],
        };
        let call_count = AtomicU32::new(0);

        let result: Result<String, String> = with_retry(
            &policy,
            |e: &String| !e.contains("fatal"),
            || {
                call_count.fetch_add(1, Ordering::SeqCst);
                async { Err("fatal error".to_string()) }
            },
        )
        .await;

        assert_eq!(result.unwrap_err(), "fatal error");
        assert_eq!(call_count.load(Ordering::SeqCst), 1);
    }
}
