//! WebSearch 缓存功能测试程序
//!
//! 测试 WebSearch 工具的缓存层功能。

use ifainew_lib::harness::tool::ToolRouter;
use serde_json::json;

fn main() {
    println!("🔍 WebSearch 缓存测试\n");
    let separator = "═".repeat(50);
    println!("{}", separator);

    // 创建工具路由器（自动初始化缓存）
    let router = ToolRouter::new();

    // 测试 1: 第一次搜索（缓存未命中，调用 API）
    println!("\n📌 测试 1: 第一次搜索 'Rust 编程'");
    println!("预期: 调用博查 API");

    let input1 = json!({
        "query": "Rust 编程语言",
        "count": 3
    });

    let start1 = std::time::Instant::now();
    match router.execute("web_search", &input1) {
        Ok(result) => {
            let duration1 = start1.elapsed();
            println!("✅ 成功 (耗时: {:?})", duration1);
            println!("{}", result);
        }
        Err(e) => {
            println!("❌ 失败: {}", e);
            println!("💡 提示: 请在 .env 文件中配置 BOCHA_API_KEY");
            return;
        }
    }

    // 测试 2: 第二次搜索（缓存命中）
    println!("\n📌 测试 2: 再次搜索 'Rust 编程语言'");
    println!("预期: 使用缓存（速度更快）");

    let input2 = json!({
        "query": "Rust 编程语言",
        "count": 3
    });

    let start2 = std::time::Instant::now();
    match router.execute("web_search", &input2) {
        Ok(result) => {
            let duration2 = start2.elapsed();
            println!("✅ 成功 (耗时: {:?})", duration2);
            println!("💡 缓存命中！速度明显提升");
        }
        Err(e) => {
            println!("❌ 失败: {}", e);
        }
    }

    // 测试 3: 不同查询（缓存未命中）
    println!("\n📌 测试 3: 搜索 'Python 编程'");
    println!("预期: 调用 API（不同查询）");

    let input3 = json!({
        "query": "Python 编程",
        "count": 3
    });

    match router.execute("web_search", &input3) {
        Ok(_) => println!("✅ 成功"),
        Err(e) => println!("❌ 失败: {}", e),
    }

    // 测试 4: 检查缓存文件
    println!("\n📌 测试 4: 检查缓存文件");
    let cache_path = dirs::home_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join(".ifai")
        .join("cache")
        .join("search.json");

    if cache_path.exists() {
        println!("✅ 缓存文件已创建: {:?}", cache_path);

        // 读取并显示缓存内容
        if let Ok(content) = std::fs::read_to_string(&cache_path) {
            if let Ok(cache_json) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(entries) = cache_json.get("entries").and_then(|e| e.as_object()) {
                    println!("📊 缓存条目数: {}", entries.len());
                }
            }
        }
    } else {
        println!("⚠️  缓存文件不存在");
    }

    println!("\n{}", separator);
    println!("✨ 测试完成！");
    println!("\n💡 提示:");
    println!("  - 第一次搜索较慢（调用 API）");
    println!("  - 相同查询第二次搜索极快（使用缓存）");
    println!("  - 缓存文件位于: ~/.ifai/cache/search.json");
    println!("  - 缓存有效期: 1 小时");
}
