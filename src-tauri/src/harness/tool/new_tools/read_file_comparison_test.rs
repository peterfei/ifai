//! read_file 功能验证测试

use crate::harness::tool::ToolRouter;
use serde_json::json;
use std::fs;
use tempfile::TempDir;

/// 测试：输出格式验证
#[test]
fn test_read_file_output_format() {
    let temp_dir = TempDir::new().unwrap();
    let test_file = temp_dir.path().join("test.txt");
    fs::write(&test_file, "Hello, World!\nLine 2").unwrap();
    let path_str = test_file.to_string_lossy().to_string();

    let router = ToolRouter::new();
    let result = router.execute("read_file", &json!({ "path": path_str }));

    assert!(result.is_ok());

    let output = result.unwrap();

    // 验证输出格式
    assert!(
        output.contains("File:"),
        "Output should contain 'File:' prefix"
    );
    assert!(
        output.contains("Hello, World!"),
        "Output should contain file content"
    );
    assert!(output.contains("---"), "Output should contain separator");
    assert!(output.contains("Line count: 2"), "Output should contain line count");

    println!("✅ Output format:\n{}\n", output);
}

/// 测试：错误处理（文件不存在）
#[test]
fn test_read_file_error_not_found() {
    let router = ToolRouter::new();
    let result = router.execute("read_file", &json!({ "path": "/nonexistent/file.txt" }));

    assert!(result.is_err());

    let err = result.unwrap_err();
    let err_msg = err.to_string();
    assert!(
        err_msg.contains("File not found") || err_msg.contains("not found"),
        "Error should mention file not found: {}",
        err_msg
    );
}

/// 测试：错误处理（缺少参数）
#[test]
fn test_read_file_error_missing_param() {
    let router = ToolRouter::new();
    let result = router.execute("read_file", &json!({}));

    assert!(result.is_err());

    let err = result.unwrap_err();
    let err_msg = err.to_string();
    assert!(
        err_msg.contains("Missing") || err_msg.contains("missing"),
        "Error should mention missing parameter: {}",
        err_msg
    );
}

/// 测试：空文件处理
#[test]
fn test_read_file_empty_file() {
    let temp_dir = TempDir::new().unwrap();
    let test_file = temp_dir.path().join("empty.txt");
    fs::write(&test_file, "").unwrap();
    let path_str = test_file.to_string_lossy().to_string();

    let router = ToolRouter::new();
    let result = router.execute("read_file", &json!({ "path": path_str }));

    assert!(result.is_ok());

    let output = result.unwrap();
    assert!(output.contains("Line count: 0"), "Empty file should have 0 lines");
}

/// 测试：多行文件
#[test]
fn test_read_file_multiline() {
    let temp_dir = TempDir::new().unwrap();
    let test_file = temp_dir.path().join("multi.txt");
    let content = "Line 1\nLine 2\nLine 3\nLine 4\nLine 5";
    fs::write(&test_file, content).unwrap();
    let path_str = test_file.to_string_lossy().to_string();

    let router = ToolRouter::new();
    let result = router.execute("read_file", &json!({ "path": path_str }));

    assert!(result.is_ok());

    let output = result.unwrap();
    assert!(output.contains("Line count: 5"), "Should have 5 lines");
}

/// 测试：特殊字符处理
#[test]
fn test_read_file_special_chars() {
    let temp_dir = TempDir::new().unwrap();
    let test_file = temp_dir.path().join("special.txt");
    let content = "Hello 世界\n🚀 Rocket\n\tTabbed";
    fs::write(&test_file, content).unwrap();
    let path_str = test_file.to_string_lossy().to_string();

    let router = ToolRouter::new();
    let result = router.execute("read_file", &json!({ "path": path_str }));

    assert!(result.is_ok());

    let output = result.unwrap();
    assert!(output.contains("Hello 世界"), "Should handle Chinese");
    assert!(output.contains("🚀"), "Should handle emoji");
}

/// 测试：工具已注册
#[test]
fn test_read_file_registered_in_router() {
    let router = ToolRouter::new();

    let tools = router.list_tools();
    assert!(
        tools.contains(&"read_file".to_string()),
        "read_file should be registered in ToolRouter"
    );
}

/// LLM function calling 模拟
#[test]
fn test_read_file_llm_function_calling() {
    let temp_dir = TempDir::new().unwrap();
    let test_file = temp_dir.path().join("llm_test.txt");
    fs::write(&test_file, "Content for LLM\nLine 2").unwrap();
    let path_str = test_file.to_string_lossy().to_string();

    let router = ToolRouter::new();

    let function_calls = vec![json!({
        "name": "read_file",
        "arguments": {
            "path": path_str
        }
    })];

    let results: Vec<String> = function_calls
        .into_iter()
        .filter_map(|call| {
            let name = call.get("name")?.as_str().unwrap_or("");
            let args = call.get("arguments")?;
            router.execute(name, args).ok()
        })
        .collect();

    assert_eq!(results.len(), 1);
    let result = &results[0];

    assert!(result.contains("Content for LLM"));
    assert!(result.contains("Line count: 2"));

    println!("✅ LLM function calling:\n{}\n", result);
}
