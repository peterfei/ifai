// TDD 测试：定义我们期望的 `#[derive(Tool)]` 宏的行为

use tool_macro::Tool;

// 测试 1: 最简单的用法 - 空结构体
#[derive(Tool)]
#[tool(name = "test_tool", description = "A test tool")]
struct TestTool;

// 如果宏正确实现，这个测试应该编译通过
#[test]
fn test_basic_tool_compiles() {
    // 这个测试的目的只是验证代码能编译
    // 如果宏实现有问题，编译就会失败
    assert!(true);
}
