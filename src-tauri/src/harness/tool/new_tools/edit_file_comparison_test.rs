//! edit_file 功能验证测试

use crate::harness::tool::ToolRouter;
use serde_json::json;
use std::fs;
use tempfile::TempDir;

/// 测试：精确替换
#[test]
fn test_edit_file_exact_match() {
    let temp_dir = TempDir::new().unwrap();
    let test_file = temp_dir.path().join("test.txt");
    fs::write(&test_file, "Hello World\nGoodbye World").unwrap();
    let path_str = test_file.to_string_lossy().to_string();

    let router = ToolRouter::new();
    let result = router.execute(
        "edit_file",
        &json!({ "path": path_str, "old_text": "World", "new_text": "Rust" }),
    );

    assert!(result.is_ok());

    let output = result.unwrap();
    assert!(output.contains("2 occurrence(s)"), "Should show 2 replacements");

    // 验证文件已修改
    let content = fs::read_to_string(&test_file).unwrap();
    assert_eq!(content, "Hello Rust\nGoodbye Rust");
}

/// 测试：错误处理（文件不存在）
#[test]
fn test_edit_file_error_not_found() {
    let router = ToolRouter::new();
    let result = router.execute(
        "edit_file",
        &json!({ "path": "/nonexistent/file.txt", "old_text": "old", "new_text": "new" }),
    );

    assert!(result.is_err());

    let err = result.unwrap_err();
    let err_msg = err.to_string();
    assert!(
        err_msg.contains("File not found") || err_msg.contains("not found"),
        "Error should mention file not found"
    );
}

/// 测试：错误处理（缺少参数）
#[test]
fn test_edit_file_error_missing_param() {
    let router = ToolRouter::new();
    let result = router.execute("edit_file", &json!({ "old_text": "old", "new_text": "new" }));

    assert!(result.is_err());

    let err = result.unwrap_err();
    let err_msg = err.to_string();
    assert!(
        err_msg.contains("Missing") || err_msg.contains("missing"),
        "Error should mention missing parameter"
    );
}

/// 测试：old_text 未找到
#[test]
fn test_edit_file_old_text_not_found() {
    let temp_dir = TempDir::new().unwrap();
    let test_file = temp_dir.path().join("test.txt");
    fs::write(&test_file, "Hello World").unwrap();
    let path_str = test_file.to_string_lossy().to_string();

    let router = ToolRouter::new();
    let result = router.execute(
        "edit_file",
        &json!({ "path": path_str, "old_text": "NonExistent", "new_text": "NewValue" }),
    );

    assert!(result.is_err());

    let err = result.unwrap_err();
    let err_msg = err.to_string();

    // 验证错误信息包含诊断提示
    assert!(
        err_msg.contains("preview") || err_msg.contains("Hint"),
        "Error should include diagnostics: {}",
        err_msg
    );
}

/// 测试：模糊 trim 匹配
#[test]
fn test_edit_file_fuzzy_trim_match() {
    let temp_dir = TempDir::new().unwrap();
    let test_file = temp_dir.path().join("test.txt");
    fs::write(&test_file, "  Hello World\n").unwrap();
    let path_str = test_file.to_string_lossy().to_string();

    let router = ToolRouter::new();
    let result = router.execute(
        "edit_file",
        &json!({ "path": path_str, "old_text": "Hello World", "new_text": "Rust" }),
    );

    assert!(result.is_ok(), "trim match should succeed");

    let content = fs::read_to_string(&test_file).unwrap();
    assert!(content.contains("Rust"), "Should contain replaced text");
}

/// 测试：替换所有匹配项
#[test]
fn test_edit_file_replace_all() {
    let temp_dir = TempDir::new().unwrap();
    let test_file = temp_dir.path().join("test.txt");
    fs::write(&test_file, "aaa\naaa\naaa").unwrap();
    let path_str = test_file.to_string_lossy().to_string();

    let router = ToolRouter::new();
    let result = router.execute(
        "edit_file",
        &json!({ "path": path_str, "old_text": "aaa", "new_text": "bbb" }),
    );

    assert!(result.is_ok());

    let output = result.unwrap();
    assert!(output.contains("3 occurrence(s)"), "Should show 3 replacements");

    // 验证所有匹配都被替换
    let content = fs::read_to_string(&test_file).unwrap();
    assert_eq!(content, "bbb\nbbb\nbbb");
}

/// 测试：多行替换
#[test]
fn test_edit_file_multiline_replace() {
    let temp_dir = TempDir::new().unwrap();
    let test_file = temp_dir.path().join("test.txt");
    fs::write(&test_file, "Line 1\nLine 2\nLine 3\nLine 4").unwrap();
    let path_str = test_file.to_string_lossy().to_string();

    let router = ToolRouter::new();
    let result = router.execute(
        "edit_file",
        &json!({ "path": path_str, "old_text": "Line 2\nLine 3", "new_text": "Modified Line 2\nModified Line 3" }),
    );

    assert!(result.is_ok(), "edit_file should succeed for multiline");

    let content = fs::read_to_string(&test_file).unwrap();
    assert_eq!(content, "Line 1\nModified Line 2\nModified Line 3\nLine 4");
}

/// 测试：工具已注册
#[test]
fn test_edit_file_registered_in_router() {
    let router = ToolRouter::new();

    let tools = router.list_tools();
    assert!(
        tools.contains(&"edit_file".to_string()),
        "edit_file should be registered in ToolRouter"
    );
}

/// LLM function calling 模拟
#[test]
fn test_edit_file_llm_function_calling() {
    let temp_dir = TempDir::new().unwrap();
    let test_file = temp_dir.path().join("llm_test.txt");
    fs::write(&test_file, "Old content\nAnother line").unwrap();
    let path_str = test_file.to_string_lossy().to_string();

    let router = ToolRouter::new();

    let function_calls = vec![json!({
        "name": "edit_file",
        "arguments": {
            "path": path_str,
            "old_text": "Old content",
            "new_text": "New content"
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

    assert!(result.contains("Successfully edited file"));
    assert!(result.contains("1 occurrence(s)"));

    // 验证文件已修改
    let content = fs::read_to_string(&test_file).unwrap();
    assert_eq!(content, "New content\nAnother line");

    println!("✅ LLM function calling:\n{}\n", result);
}
