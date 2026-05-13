//! 新旧 write_file 实现对比测试（已替换为功能验证测试）

use crate::harness::tool::ToolRouter;
use serde_json::json;
use std::fs;
use tempfile::TempDir;

/// 测试：输出格式验证
#[test]
fn test_write_file_output_format() {
    let temp_dir = TempDir::new().unwrap();
    let test_file = temp_dir.path().join("test.txt");
    let path_str = test_file.to_string_lossy().to_string();

    // 新实现（通过 ToolRouter）
    let router = ToolRouter::new();
    let result = router.execute(
        "write_file",
        &json!({ "path": path_str, "content": "Hello, World!\nLine 2" }),
    );

    assert!(result.is_ok(), "write_file should succeed");

    let output = result.unwrap();

    // 验证输出格式
    assert!(
        output.contains("Successfully wrote to file"),
        "Output should contain success message"
    );
    assert!(output.contains("2 lines"), "Should show 2 lines");

    println!("✅ Output format:\n{}\n", output);
}

/// 测试：错误处理（缺少 path）
#[test]
fn test_write_file_error_missing_path() {
    let router = ToolRouter::new();
    let result = router.execute("write_file", &json!({ "content": "test" }));

    assert!(result.is_err(), "write_file should fail without path");

    let err = result.unwrap_err().to_string();

    assert!(
        err.contains("Missing") || err.contains("missing"),
        "Error should mention missing parameter: {}",
        err
    );
}

/// 测试：错误处理（缺少 content）
#[test]
fn test_write_file_error_missing_content() {
    let router = ToolRouter::new();
    let result = router.execute("write_file", &json!({ "path": "/tmp/test.txt" }));

    assert!(result.is_err(), "write_file should fail without content");

    let err = result.unwrap_err().to_string();

    assert!(
        err.contains("Missing") || err.contains("missing"),
        "Error should mention missing parameter"
    );
}

/// 测试：自动创建目录
#[test]
fn test_write_file_creates_directory() {
    let temp_dir = TempDir::new().unwrap();
    let test_file = temp_dir
        .path()
        .join("subdir")
        .join("nested")
        .join("file.txt");
    let path_str = test_file.to_string_lossy().to_string();

    let router = ToolRouter::new();
    let result = router.execute(
        "write_file",
        &json!({ "path": path_str, "content": "Test content" }),
    );

    assert!(result.is_ok(), "write_file should create directories");

    // 验证文件已创建
    assert!(fs::metadata(&test_file).is_ok(), "File should exist");
}

/// 测试：空内容处理
#[test]
fn test_write_file_empty_content() {
    let temp_dir = TempDir::new().unwrap();
    let test_file = temp_dir.path().join("empty.txt");
    let path_str = test_file.to_string_lossy().to_string();

    let router = ToolRouter::new();
    let result = router.execute("write_file", &json!({ "path": path_str, "content": "" }));

    assert!(result.is_ok(), "write_file should handle empty content");

    let output = result.unwrap();
    assert!(output.contains("0 lines"), "Empty content should show 0 lines");
    assert!(output.contains("0 characters"), "Empty content should show 0 characters");
}

/// 测试：覆盖现有文件
#[test]
fn test_write_file_overwrite() {
    let temp_dir = TempDir::new().unwrap();
    let test_file = temp_dir.path().join("overwrite.txt");
    let path_str = test_file.to_string_lossy().to_string();

    // 先写入初始内容
    fs::write(&test_file, "Old content").unwrap();

    let router = ToolRouter::new();
    let result = router.execute(
        "write_file",
        &json!({ "path": path_str, "content": "New content" }),
    );

    assert!(result.is_ok(), "write_file should overwrite existing file");

    // 验证内容已覆盖
    let content = fs::read_to_string(&test_file).unwrap();
    assert_eq!(content, "New content");
}

/// 测试：行数和字符数统计
#[test]
fn test_write_file_line_char_count() {
    let temp_dir = TempDir::new().unwrap();
    let test_file = temp_dir.path().join("count.txt");
    let content = "Line 1\nLine 2\nLine 3\nLine 4\nLine 5";
    let path_str = test_file.to_string_lossy().to_string();

    let router = ToolRouter::new();
    let result = router.execute("write_file", &json!({ "path": path_str, "content": content }));

    assert!(result.is_ok(), "write_file should succeed");

    let output = result.unwrap();
    assert!(output.contains("5 lines"), "Should show 5 lines");

    // 验证字符数
    let char_count = content.len();
    assert!(output.contains(&char_count.to_string()), "Should show correct char count");
}

/// 测试：工具已注册
#[test]
fn test_write_file_registered_in_router() {
    let router = ToolRouter::new();

    // 验证 write_file 已注册（使用宏实现）
    let tools = router.list_tools();
    assert!(
        tools.contains(&"write_file".to_string()),
        "write_file should be registered in ToolRouter"
    );
}

/// 综合测试：LLM function calling 模拟
#[test]
fn test_write_file_llm_function_calling() {
    let temp_dir = TempDir::new().unwrap();
    let test_file = temp_dir.path().join("llm_test.txt");
    let path_str = test_file.to_string_lossy().to_string();

    let router = ToolRouter::new();

    // 模拟 LLM 生成的 function call
    let function_calls = vec![json!({
        "name": "write_file",
        "arguments": {
            "path": path_str,
            "content": "Content written by LLM\nLine 2"
        }
    })];

    // 执行所有 function calls
    let results: Vec<String> = function_calls
        .into_iter()
        .filter_map(|call| {
            let name = call.get("name")?.as_str().unwrap_or("");
            let args = call.get("arguments")?;
            router.execute(name, args).ok()
        })
        .collect();

    // 验证调用成功
    assert_eq!(results.len(), 1, "Should have 1 successful result");
    let result = &results[0];

    // 验证结果内容
    assert!(result.contains("Successfully wrote to file"), "Should contain success message");
    assert!(result.contains("2 lines"), "Should show correct line count");

    // 验证文件已写入
    let content = fs::read_to_string(&test_file).unwrap();
    assert_eq!(content, "Content written by LLM\nLine 2");

    println!("✅ LLM function calling successful:\n{}\n", result);
}
