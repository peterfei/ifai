/*
Test program for llama.cpp inference functionality.

Run with:
cargo run --features llm-inference --example test_inference
*/

#[cfg(feature = "llm-inference")]
fn main() {
    // 启用详细日志
    tracing_subscriber::fmt::init();

    use ifainew_lib::llm_inference::{
        generate_completion,
        default_model_path,
        load_model,
        is_model_loaded,
        VERSION,
    };

    println!("========================================");
    println!("Llama.cpp 推理功能测试");
    println!("========================================");
    println!("版本: {}", VERSION);
    println!();

    // 1. 检查模型路径
    println!("1. 检查模型路径...");
    let model_path = default_model_path();
    println!("   模型路径: {:?}", model_path);
    println!("   文件存在: {}", model_path.exists());
    println!();

    // 2. 测试模型加载
    println!("2. 测试模型加载...");
    match load_model(&model_path) {
        Ok(_model) => {
            println!("   ✅ 模型加载成功!");
        }
        Err(e) => {
            println!("   ❌ 模型加载失败: {}", e);
            return;
        }
    }
    println!();

    // 3. 测试推理功能
    println!("3. 测试推理功能...");
    let test_prompts = vec![
        ("fn main() {", "简单函数"),
        ("fn add(a: i32, b: i32) -> i32 {", "带参数函数"),
        ("struct Point {", "结构体定义"),
        ("for i in 0..10 {", "循环语句"),
    ];

    for (prompt, description) in test_prompts {
        println!("   测试: {}", description);
        println!("   提示词: {:?}", prompt);

        match generate_completion(prompt, 50) {
            Ok(text) => {
                let result = if text.len() > 100 {
                    format!("{}...", &text[..100])
                } else {
                    text.clone()
                };
                println!("   ✅ 生成结果: {:?}", result);
            }
            Err(e) => {
                println!("   ❌ 生成失败: {}", e);
            }
        }
        println!();
    }

    // 4. 检查模型状态
    println!("4. 检查模型状态...");
    println!("   模型已加载: {}", is_model_loaded());
    println!();

    println!("========================================");
    println!("测试完成!");
    println!("========================================");
}

#[cfg(not(feature = "llm-inference"))]
fn main() {
    eprintln!("错误: 请启用 llm-inference feature");
    eprintln!("运行: cargo run --features llm-inference --example test_inference");
}
