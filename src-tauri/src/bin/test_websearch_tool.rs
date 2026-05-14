//! WebSearch 工具集成测试
//!
//! 测试真实的博查 API 调用

use ifainew_lib::harness::tool::new_tools::{WebSearchTool, BochaConfig};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("🔍 测试 WebSearch 工具（真实博查 API）\n");

    // 从 .env 文件加载配置
    let config = BochaConfig::from_env_file();

    // 检查是否有 API Key
    if !config.has_api_key() {
        eprintln!("❌ 错误：未找到有效的 BOCHA_API_KEY");
        eprintln!("\n请按以下步骤配置：");
        eprintln!("1. cp .env.example .env");
        eprintln!("2. 编辑 .env 文件，设置 BOCHA_API_KEY");
        eprintln!("3. 获取 API Key: https://open.bochaai.com/\n");
        eprintln!("当前配置状态：");
        eprintln!("  - API Key: {:?}", config.api_key);
        eprintln!("  - 端点: {}", config.endpoint);
        std::process::exit(1);
    }

    println!("✅ 配置已加载");
    println!("   端点: {}", config.endpoint);
    println!("   超时: {} 秒\n", config.timeout);

    // 创建工具实例
    let tool = WebSearchTool::new(config);

    // 测试搜索
    println!("📤 执行搜索...");
    println!("   查询: \"Rust 编程语言\"\n");

    let result = tool.execute_web_search_async("Rust 编程语言", 3).await?;

    println!("📥 搜索结果：");
    println!("   查询: {}", result.query);
    println!("   数量: {}\n", result.count);

    for (i, item) in result.results.iter().enumerate() {
        println!("{}. {}", i + 1, item.title);
        println!("   URL: {}", item.url);
        println!("   {}\n", item.snippet);
    }

    // 测试输出格式
    println!("📄 格式化输出：\n");
    println!("{}", result.to_output_string());

    println!("🎉 测试成功！");

    Ok(())
}
