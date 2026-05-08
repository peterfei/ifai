// DeepSeek 连接测试 - 复现 "Connecting..." 卡住问题

use crate::tests::common::*;

#[tokio::test]
#[serial_test::serial]
async fn test_deepseek_simple_connection() {
    // DeepSeek 提供商配置
    let spec = ProviderSpec {
        name: "DeepSeek",
        flag: "deepseek",
        model: "deepseek-chat",
        env_key: "DEEPSEEK_API_KEY",
    };

    // 检查 API Key
    let api_key = match std::env::var(&spec.env_key) {
        Ok(key) if !key.is_empty() => key,
        _ => {
            eprintln!("[SKIP] DEEPSEEK_API_KEY not set");
            return;
        }
    };

    println!("═══════════════════════════════════════════════════════════════");
    println!("🔗 DeepSeek 连接测试");
    println!("═══════════════════════════════════════════════════════════════");
    println!("📊 模型: {}", spec.model);
    println!("🔑 API Key: {}...{}", &api_key[..8], &api_key[api_key.len()-4..]);

    // 创建测试环境
    let tenv = make_test_env(&spec, &api_key).await;

    // 简单的测试消息
    let user_input = "你好，请用一句话回复：连接测试成功";

    println!("📝 发送测试消息: {}", user_input);
    println!("───────────────────────────────────────────────────────────────");

    // 调用 LLM
    match call_and_check(&tenv, &[user_input], true).await {
        Ok((stdout, stderr)) => {
            let combined = format!("{}\n{}", stdout, stderr);

            println!("───────────────────────────────────────────────────────────────");
            println!("✅ 连接成功！");
            println!("📊 响应长度: {} 字符", combined.len());

            // 检查是否包含中文回复
            if combined.contains("连接测试") || combined.len() > 10 {
                println!("✅ 收到有效回复");
            } else {
                println!("⚠️  回复可能不完整");
            }

            // 检查是否有错误
            if combined.contains("ERROR") || combined.contains("error") {
                println!("❌ 发现错误信息");
                println!("错误详情:\n{}", combined);
            }
        }
        Err(e) => {
            println!("───────────────────────────────────────────────────────────────");
            println!("❌ 连接失败！");
            println!("错误: {}", e);
        }
    }

    println!("═══════════════════════════════════════════════════════════════");
    println!("🏁 测试完成");
    println!("═══════════════════════════════════════════════════════════════");
}

#[tokio::test]
#[serial_test::serial]
async fn test_deepseek_with_tool_call() {
    // 测试带工具调用的 DeepSeek 连接
    let spec = ProviderSpec {
        name: "DeepSeek",
        flag: "deepseek",
        model: "deepseek-chat",
        env_key: "DEEPSEEK_API_KEY",
    };

    let api_key = match std::env::var(&spec.env_key) {
        Ok(key) if !key.is_empty() => key,
        _ => {
            eprintln!("[SKIP] DEEPSEEK_API_KEY not set");
            return;
        }
    };

    println!("═══════════════════════════════════════════════════════════════");
    println!("🔗 DeepSeek 工具调用测试");
    println!("═══════════════════════════════════════════════════════════════");

    let tenv = make_test_env(&spec, &api_key).await;

    // 要求使用 TodoWrite 工具
    let user_input = "请使用 TodoWrite 创建一个任务列表：1.测试任务1 2.测试任务2";

    println!("📝 发送消息: {}", user_input);
    println!("───────────────────────────────────────────────────────────────");

    match call_and_check(&tenv, &[user_input], true).await {
        Ok((stdout, stderr)) => {
            let combined = format!("{}\n{}", stdout, stderr);

            println!("───────────────────────────────────────────────────────────────");

            // 检查是否调用了 TodoWrite
            let todowrite_count = combined.matches("Updated task list").count();
            let continuings = combined.matches("Continuing...").count();

            println!("📊 TodoWrite 调用次数: {}", todowrite_count);
            println!("📊 Continuing 次数: {}", continuings);

            if todowrite_count > 0 {
                println!("✅ 工具调用成功");
            } else {
                println!("⚠️  未检测到工具调用");
            }

            // 检查断链
            if continuings == 0 && todowrite_count > 0 {
                println!("❌ 检测到断链：工具调用后没有继续");
            } else {
                println!("✅ 流程正常");
            }
        }
        Err(e) => {
            println!("───────────────────────────────────────────────────────────────");
            println!("❌ 测试失败！");
            println!("错误: {}", e);
        }
    }

    println!("═══════════════════════════════════════════════════════════════");
}
