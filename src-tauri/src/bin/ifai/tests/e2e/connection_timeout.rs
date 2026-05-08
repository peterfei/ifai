// 连接超时测试 - 复现 "Connecting..." 卡住问题

use crate::tests::common::*;

#[tokio::test]
#[serial_test::serial]
async fn test_connection_timeout_simulation() {
    // 使用 Zhipu API 模拟连接超时场景
    let spec = ProviderSpec {
        name: "Zhipu-AI",
        flag: "zhipu",
        model: "glm-4.6",
        env_key: "ZHIPU_API_KEY",
    };

    match check_provider(&spec) {
        Some(api_key) => {
            println!("═══════════════════════════════════════════════════════════════");
            println!("🔗 连接超时模拟测试");
            println!("═══════════════════════════════════════════════════════════════");
            println!("📊 模型: {}", spec.model);
            println!("🔑 API Key: {}...{}", &api_key[..8], &api_key[api_key.len()-4..]);

            let tenv = make_test_env(&spec, &api_key).await;

            // 测试场景：发送一个需要长时间响应的消息
            let user_input = "请详细介绍 Rust 语言的所有特性，包括所有权、借用、生命周期等";

            println!("📝 发送测试消息（可能需要较长时间响应）");
            println!("───────────────────────────────────────────────────────────────");

            let start = std::time::Instant::now();

            match call_and_check(&tenv, &[user_input], true).await {
                Ok((stdout, stderr)) => {
                    let elapsed = start.elapsed();
                    let combined = format!("{}\n{}", stdout, stderr);

                    println!("───────────────────────────────────────────────────────────────");
                    println!("✅ 连接成功！");
                    println!("⏱️  响应时间: {:.2}s", elapsed.as_secs_f64());
                    println!("📊 响应长度: {} 字符", combined.len());

                    // 检查是否有重试发生
                    let retry_count = combined.matches("Retrying").count();
                    if retry_count > 0 {
                        println!("🔄 检测到重试: {} 次", retry_count);
                    }

                    // 检查是否有超时
                    if combined.contains("timeout") || combined.contains("timed out") {
                        println!("⏰ 检测到超时");
                    }
                }
                Err(e) => {
                    let elapsed = start.elapsed();
                    println!("───────────────────────────────────────────────────────────────");
                    println!("❌ 连接失败！");
                    println!("⏱️  失败时间: {:.2}s", elapsed.as_secs_f64());
                    println!("错误: {}", e);

                    // 检查是否是超时错误
                    if e.to_string().to_lowercase().contains("timeout") {
                        println!("⏰ 确认是超时错误");
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

#[tokio::test]
#[serial_test::serial]
async fn test_streaming_behavior_under_load() {
    // 测试流式传输在高负载情况下的行为
    let spec = ProviderSpec {
        name: "Zhipu-AI",
        flag: "zhipu",
        model: "glm-4.6",
        env_key: "ZHIPU_API_KEY",
    };

    match check_provider(&spec) {
        Some(api_key) => {
            println!("═══════════════════════════════════════════════════════════════");
            println!("🌊 流式传输行为测试");
            println!("═══════════════════════════════════════════════════════════════");

            let tenv = make_test_env(&spec, &api_key).await;

            // 测试场景：快速连续发送多个请求
            let test_inputs = vec![
                "任务1：用一句话介绍 Rust",
                "任务2：用一句话介绍 Python",
                "任务3：用一句话介绍 Go",
            ];

            println!("📝 发送 {} 个连续请求", test_inputs.len());

            for (i, input) in test_inputs.iter().enumerate() {
                println!("───────────────────────────────────────────────────────────────");
                println!("📝 请求 {}/{}", i + 1, test_inputs.len());
                println!("内容: {}", input);

                let start = std::time::Instant::now();

                match call_and_check(&tenv, &[input], true).await {
                    Ok((stdout, stderr)) => {
                        let elapsed = start.elapsed();
                        let combined = format!("{}\n{}", stdout, stderr);

                        println!("✅ 成功 | ⏱️  {:.2}s | 📊 {} 字符",
                            elapsed.as_secs_f64(), combined.len());

                        // 检查流式传输标记
                        if combined.contains("Continuing...") {
                            let continuings = combined.matches("Continuing...").count();
                            println!("🔄 流式迭代: {} 次", continuings);
                        }
                    }
                    Err(e) => {
                        let elapsed = start.elapsed();
                        println!("❌ 失败 | ⏱️  {:.2}s", elapsed.as_secs_f64());
                        println!("错误: {}", e);
                    }
                }

                // 短暂延迟，避免请求过快
                tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
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
