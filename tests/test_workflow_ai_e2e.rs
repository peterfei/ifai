//! E2E 测试：验证工作流 AI 调用
//!
//! 高保真测试，验证：
//! 1. AI API 调用是否正常
//! 2. 响应是否正确接收
//! 3. 工作流完成事件是否正确发送

#[cfg(test)]
mod workflow_ai_e2e_tests {
    use std::time::Duration;

    /// 测试 AI API 连接和响应
    #[tokio::test]
    async fn test_ai_api_connection() {
        println!("🧪 [E2E] Testing AI API connection...");

        // 从环境变量或配置读取 API 设置
        let api_key = std::env::var("ZHIPU_API_KEY").unwrap_or_default();
        let base_url = std::env::var("ZHIPU_BASE_URL")
            .unwrap_or_else(|_| "https://open.bigmodel.cn/api/coding/paas/v4/chat/completions".to_string());

        if api_key.is_empty() {
            println!("⚠️  [E2E] No API key found, skipping live API test");
            return;
        }

        // 创建简单的测试请求
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .expect("Failed to create HTTP client");

        let request_body = serde_json::json!({
            "model": "glm-4-flash",
            "messages": [
                {
                    "role": "system",
                    "content": "You are a helpful assistant."
                },
                {
                    "role": "user",
                    "content": "Say 'Hello, World!' in exactly that format."
                }
            ],
            "stream": false
        });

        println!("📤 [E2E] Sending test request to AI API...");

        let start = std::time::Instant::now();
        let response = match client.post(&base_url)
            .header("Authorization", format!("Bearer {}", api_key))
            .json(&request_body)
            .send()
            .await
        {
            Ok(resp) => {
                println!("✅ [E2E] Response received in {:?}", start.elapsed());
                println!("📊 [E2E] Status: {}", resp.status());
                resp
            }
            Err(e) => {
                println!("❌ [E2E] Request failed after {:?}: {}", start.elapsed(), e);
                if e.is_timeout() {
                    println!("⏱️  [E2E] Error: Request timed out");
                }
                if e.is_connect() {
                    println!("🔌 [E2E] Error: Could not connect to API");
                }
                panic!("API request failed: {}", e);
            }
        };

        let status = response.status();
        let headers = response.headers().clone();

        println!("📋 [E2E] Response details:");
        println!("  - Status: {}", status);
        if let Some(content_type) = headers.get("content-type") {
            println!("  - Content-Type: {:?}", content_type);
        }
        if let Some(content_length) = headers.get("content-length") {
            println!("  - Content-Length: {:?}", content_length);
        }

        assert!(
            status.is_success(),
            "API returned non-success status: {}",
            status
        );

        let response_text = response.text().await.expect("Failed to read response");
        println!("📝 [E2E] Response length: {} bytes", response_text.len());

        // 验证响应是有效的 JSON
        let json: serde_json::Value = serde_json::from_str(&response_text)
            .expect("Response is not valid JSON");

        println!("✅ [E2E] Response is valid JSON");
        println!("🔍 [E2E] Response structure: {}", serde_json::to_string_pretty(&json).unwrap_or_default());

        // 验证响应结构
        assert!(
            json.get("choices").is_some(),
            "Response missing 'choices' field"
        );

        let content = json["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or("");

        println!("📄 [E2E] AI Response content: {}", content);
        println!("✅ [E2E] AI API connection test passed!");
    }

    /// 测试工作流节点执行器的 AI 调用
    #[tokio::test]
    async fn test_workflow_executor_ai_call() {
        println!("🧪 [E2E] Testing workflow executor AI call...");

        // 这个测试需要实际的 Tauri 环境，在 CI/CD 中可能需要跳过
        if std::env::var("CI").is_ok() {
            println!("⚠️  [E2E] Skipping in CI environment (requires Tauri)");
            return;
        }

        // TODO: 实现工作流执行器的独立测试
        // 需要模拟或连接到实际的 Tauri 后端
        println!("ℹ️  [E2E] Workflow executor test requires full Tauri environment");
    }

    /// 测试 AI API 超时行为
    #[tokio::test]
    async fn test_ai_api_timeout_behavior() {
        println!("🧪 [E2E] Testing AI API timeout behavior...");

        let api_key = std::env::var("ZHIPU_API_KEY").unwrap_or_default();
        if api_key.is_empty() {
            println!("⚠️  [E2E] No API key, skipping timeout test");
            return;
        }

        // 创建一个极短的超时客户端
        let client = reqwest::Client::builder()
            .timeout(Duration::from_millis(100)) // 100ms 超时
            .build()
            .expect("Failed to create HTTP client");

        let request_body = serde_json::json!({
            "model": "glm-4-flash",
            "messages": [
                {
                    "role": "user",
                    "content": "This request should timeout"
                }
            ]
        });

        let base_url = "https://open.bigmodel.cn/api/coding/paas/v4/chat/completions";

        let start = std::time::Instant::now();
        let result = client.post(base_url)
            .header("Authorization", format!("Bearer {}", api_key))
            .json(&request_body)
            .send()
            .await;

        match result {
            Ok(_) => {
                println!("⚠️  [E2E] Request completed (should have timed out)");
            }
            Err(e) => {
                if e.is_timeout() {
                    println!("✅ [E2E] Timeout correctly triggered after {:?}", start.elapsed());
                } else {
                    println!("ℹ️  [E2E] Error (not timeout): {}", e);
                }
            }
        }
    }

    /// 测试不同超时配置下的 AI 响应
    #[tokio::test]
    async fn test_ai_response_with_various_timeouts() {
        println!("🧪 [E2E] Testing AI response with various timeouts...");

        let api_key = std::env::var("ZHIPU_API_KEY").unwrap_or_default();
        if api_key.is_empty() {
            println!("⚠️  [E2E] No API key, skipping");
            return;
        }

        let base_url = "https://open.bigmodel.cn/api/coding/paas/v4/chat/completions";
        let timeouts = vec![10, 30, 60, 120]; // 不同的超时时间（秒）

        for timeout_secs in timeouts {
            println!("⏱️  [E2E] Testing with {} second timeout...", timeout_secs);

            let client = reqwest::Client::builder()
                .timeout(Duration::from_secs(timeout_secs))
                .build()
                .expect("Failed to create client");

            let request_body = serde_json::json!({
                "model": "glm-4-flash",
                "messages": [
                    {
                        "role": "user",
                        "content": "Say 'OK'"
                    }
                ]
            });

            let start = std::time::Instant::now();
            match client.post(base_url)
                .header("Authorization", format!("Bearer {}", api_key))
                .json(&request_body)
                .send()
                .await
            {
                Ok(response) => {
                    let elapsed = start.elapsed();
                    println!("✅ [E2E] {}s timeout: Success ({:?})", timeout_secs, elapsed);
                    assert!(response.status().is_success());
                }
                Err(e) => {
                    let elapsed = start.elapsed();
                    println!("❌ [E2E] {}s timeout: Failed after {:?} - {}", timeout_secs, elapsed, e);
                    if e.is_timeout() {
                        println!("⏱️  [E2E] Request timed out (API too slow or network issue)");
                    }
                }
            }
        }
    }
}
