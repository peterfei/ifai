//! 博查 API 测试程序
//!
//! 运行方式：cargo run --bin test_bocha_api

use std::env;
use std::fs;
use std::path::PathBuf;
use std::time::Duration;

/// 从 .env 文件加载 API Key
fn load_api_key_from_env() -> Option<String> {
    // 1. 尝试环境变量
    if let Ok(key) = env::var("BOCHA_API_KEY") {
        if !key.is_empty() && !key.starts_with("your_") {
            return Some(key);
        }
    }

    // 2. 尝试从 .env 文件读取
    let env_paths = vec![
        PathBuf::from(".env"),
        PathBuf::from("src-tauri/.env"),
    ];

    for env_path in env_paths {
        if let Ok(content) = fs::read_to_string(&env_path) {
            for line in content.lines() {
                let line = line.trim();
                if line.is_empty() || line.starts_with('#') {
                    continue;
                }

                if let Some((key, value)) = line.split_once('=') {
                    if key.trim() == "BOCHA_API_KEY" {
                        let value = value.trim();
                        if !value.starts_with("your_") && !value.is_empty() {
                            return Some(value.to_string());
                        }
                    }
                }
            }
        }
    }

    None
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("🔍 测试博查 AI Web Search API\n");

    // 从 .env 文件获取 API Key
    let api_key = load_api_key_from_env().unwrap_or_else(|| {
        eprintln!("❌ 错误：未找到 BOCHA_API_KEY");
        eprintln!("\n请按以下步骤配置：");
        eprintln!("1. cp .env.example .env");
        eprintln!("2. 编辑 .env 文件，设置 BOCHA_API_KEY");
        eprintln!("3. 获取 API Key: https://open.bochaai.com/\n");
        std::process::exit(1);
    });

    // 隐藏 API Key 的大部分内容
    let masked_key = if api_key.len() > 8 {
        format!("{}...{}", &api_key[..8], &api_key[api_key.len()-4..])
    } else {
        "***".to_string()
    };
    println!("✅ API Key 已配置: {}\n", masked_key);

    // 创建 HTTP 客户端
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()?;

    // 构建测试请求
    let request = serde_json::json!({
        "query": "Rust 编程语言",
        "summary": true,
        "freshness": "noLimit",
        "count": 3
    });

    println!("📤 发送搜索请求...");
    println!("   查询: \"Rust 编程语言\"\n");

    // 发送请求
    let response = client
        .post("https://api.bocha.cn/v1/web-search")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&request)
        .send()
        .await?;

    println!("📥 收到响应: {}\n", response.status());

    // 检查响应状态
    let status = response.status();
    if !status.is_success() {
        let error_text = response.text().await?;
        eprintln!("❌ API 请求失败:");
        eprintln!("   状态码: {}", status);
        eprintln!("   错误信息: {}", error_text);
        std::process::exit(1);
    }

    // 解析响应
    let json: serde_json::Value = response.json().await?;

    // 提取搜索结果
    if let Some(web_results) = json.get("web_results").and_then(|v| v.as_array()) {
        println!("✅ 搜索成功！找到 {} 条结果:\n", web_results.len());

        for (i, result) in web_results.iter().enumerate() {
            let title = result.get("title").and_then(|v| v.as_str()).unwrap_or("N/A");
            let url = result.get("url").and_then(|v| v.as_str()).unwrap_or("N/A");
            let snippet = result.get("snippet").and_then(|v| v.as_str()).unwrap_or("N/A");

            println!("{}. {}", i + 1, title);
            println!("   URL: {}", url);
            println!("   摘要: {}\n", snippet);
        }

        println!("🎉 博查 API 测试成功！");
    } else {
        println!("⚠️  响应格式异常，未找到 web_results 字段");
        println!("完整响应: {}", serde_json::to_string_pretty(&json)?);
    }

    Ok(())
}
