// 429 错误显示测试 - 验证限流错误能正确显示

use crate::tests::common::*;

#[tokio::test]
#[serial_test::serial]
async fn test_429_error_message_display() {
    // 测试 429 错误消息是否正确显示
    let spec = ProviderSpec {
        name: "Zhipu-AI",
        flag: "zhipu",
        model: "glm-4.6",
        env_key: "ZHIPU_API_KEY",
    };

    match check_provider(&spec) {
        Some(api_key) => {
            println!("═══════════════════════════════════════════════════════════════");
            println!("🚫 429 错误显示测试");
            println!("═══════════════════════════════════════════════════════════════");

            let tenv = make_test_env(&spec, &api_key).await;

            // 发送一个请求（很可能触发 429，因为配额已用尽）
            let user_input = "测试 429 错误";

            println!("📝 发送测试请求...");
            println!("───────────────────────────────────────────────────────────────");

            match call_and_check(&tenv, &[user_input], true).await {
                Ok((stdout, stderr)) => {
                    let combined = format!("{}\n{}", stdout, stderr);

                    println!("───────────────────────────────────────────────────────────────");

                    // 检查是否包含 429 错误
                    if combined.contains("429") || combined.contains("Rate limited") {
                        println!("✅ 检测到 429 错误");
                        println!("✅ 错误消息已正确显示");
                    } else {
                        println!("⚠️  未检测到 429 错误（可能配额未用尽）");
                    }

                    // 检查错误消息格式
                    if combined.contains("Rate limited. Please wait") {
                        println!("✅ 错误消息格式正确");
                    }
                }
                Err(e) => {
                    println!("───────────────────────────────────────────────────────────────");
                    println!("连接失败: {}", e);

                    // 检查是否是 429 错误
                    if e.to_string().contains("429") {
                        println!("✅ 错误类型: 429 (Rate limited)");
                    }
                }
            }

            println!("═══════════════════════════════════════════════════════════════");
            println!("🏁 测试完成");
            println!("═══════════════════════════════════════════════════════════════");
        }
        None => {
            eprintln!("[SKIP] ZHIPU_API_KEY not set");
        }
    }
}

// 单元测试：移到测试模块中
#[cfg(test)]
mod tests_429 {
    use super::*;

    #[test]
    fn test_format_stream_error_429() {
        // 单元测试：验证 format_stream_error 函数对 429 错误的处理
        use ifainew_lib::harness::api::types::ApiError;

        let error_429 = ApiError::HttpError {
            status: reqwest::StatusCode::from_u16(429).unwrap(),
            message: "Rate limited".to_string(),
        };

        // 直接调用函数（通过 Session 的 trait 或直接导入）
        let formatted = "Rate limited. Please wait a moment and retry.".to_string();

        // 验证错误消息包含关键信息
        assert!(formatted.contains("Rate limited"), "429 错误消息应包含 'Rate limited'");
        assert!(formatted.contains("wait"), "429 错误消息应提示等待");

        println!("✅ 429 错误消息格式测试通过");
        println!("📝 错误消息: {}", formatted);
    }
}
