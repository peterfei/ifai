//! 集成测试：验证宏生成的工具可以被 LLM 调用
//!
//! 这个测试验证了元编程工具系统与现有 ToolRouter 的集成。

use crate::harness::tool::ToolRouter;
use serde_json::json;

#[test]
fn test_ping_tool_registered_in_router() {
    // 创建 ToolRouter（会自动注册所有工具，包括 PingTool）
    let router = ToolRouter::new();

    // 测试 PingTool 已注册
    let args = json!({
        "host": "example.com",
        "port": 80
    });

    // 通过 ToolRouter 调用 ping 工具
    let result = router.execute("ping", &args);

    // 验证调用成功
    assert!(result.is_ok());

    let output = result.unwrap();
    // 验证输出包含预期内容
    assert!(output.contains("example.com"));
}

#[test]
fn test_ping_tool_with_localhost() {
    let router = ToolRouter::new();

    let args = json!({
        "host": "127.0.0.1",
        "port": 80
    });

    let result = router.execute("ping", &args);

    // 本地回环测试（可能失败，但不应该 panic）
    assert!(result.is_ok());

    let output = result.unwrap();
    println!("Ping result: {}", output);
}

#[test]
fn test_macro_tool_vs_traditional_tool() {
    // 对比宏生成的工具与传统工具的调用方式
    let router = ToolRouter::new();

    // 传统工具（bash）
    let bash_args = json!({
        "command": "echo 'Hello, World!'"
    });

    let bash_result = router.execute("bash", &bash_args);
    assert!(bash_result.is_ok());

    // 宏生成的工具
    let ping_args = json!({
        "host": "example.com",
        "port": 80
    });

    let ping_result = router.execute("ping", &ping_args);
    assert!(ping_result.is_ok());

    // 两者都应该能成功调用
    println!("Bash result: {}", bash_result.unwrap());
    println!("Ping result: {}", ping_result.unwrap());
}

#[test]
fn test_llm_function_calling_simulation() {
    // 模拟 LLM 进行 function calling 的场景
    let router = ToolRouter::new();

    // 模拟 LLM 生成的 function call
    let function_calls = vec![
        json!({
            "name": "ping",
            "arguments": {
                "host": "google.com",
                "port": 443
            }
        }),
        json!({
            "name": "ping",
            "arguments": {
                "host": "github.com",
                "port": 443
            }
        }),
    ];

    // 执行所有 function calls
    let results: Vec<String> = function_calls
        .into_iter()
        .filter_map(|call| {
            let name = call.get("name")?.as_str().unwrap_or("");
            let args = call.get("arguments")?;

            router.execute(name, args).ok()
        })
        .collect();

    // 验证所有调用都成功
    assert_eq!(results.len(), 2);

    // 验证结果
    for result in results {
        println!("LLM tool call result: {}", result);
        assert!(result.contains("google.com") || result.contains("github.com"));
    }
}
