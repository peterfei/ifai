#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_pivo_retry_limit() {
        // 模拟一个始终返回错误的任务
        let mut retry_count = 0;
        let max_retries = 3;

        let result = simulate_pivo_loop(max_retries, || {
            retry_count += 1;
            Err("Simulated failure".to_string())
        })
        .await;

        // 验证重试次数：初始 1 次 + 重试 3 次 = 4 次
        assert_eq!(retry_count, 4);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "MAX_RETRIES_EXCEEDED");
    }

    #[tokio::test]
    async fn test_pivo_success_after_retry() {
        let mut attempt = 0;
        let max_retries = 3;

        let result = simulate_pivo_loop(max_retries, || {
            attempt += 1;
            if attempt < 2 {
                Err("Fail once".to_string())
            } else {
                Ok("Success".to_string())
            }
        })
        .await;

        // 第二次尝试成功
        assert_eq!(attempt, 2);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "Success");
    }
}

/// 模拟 PIVO 控制循环的核心逻辑
pub async fn simulate_pivo_loop<F>(max_retries: usize, mut task: F) -> Result<String, String>
where
    F: FnMut() -> Result<String, String>,
{
    for _ in 0..=max_retries {
        match task() {
            Ok(res) => return Ok(res),
            Err(_) => {
                // 在实际实现中，这里会记录日志并生成反思 Prompt
                continue;
            }
        }
    }

    Err("MAX_RETRIES_EXCEEDED".to_string())
}
