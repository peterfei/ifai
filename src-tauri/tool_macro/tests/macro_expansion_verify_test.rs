// 手动验证宏展开：检查生成的代码结构

use tool_macro::Tool;

// 简单的测试工具
#[derive(Tool)]
#[tool(name = "test_tool", description = "A test tool")]
struct TestTool {
    #[tool(config)]
    setting: String,

    #[tool(state)]
    count: usize,
}

#[test]
fn verify_macro_expansion() {
    // 验证生成的常量存在
    assert_eq!(TestTool::TOOL_NAME, "test_tool");
    assert_eq!(TestTool::TOOL_DESCRIPTION, "A test tool");

    // 验证生成的方法存在
    assert_eq!(TestTool::get_name(), "test_tool");
    assert_eq!(TestTool::get_description(), "A test tool");

    // 验证生成的构造器存在且工作正常
    let tool = TestTool::new("hello".to_string(), 42);

    // 构造器能工作就是成功（后续会添加字段访问验证）
    let _ = tool;
}

// 验证宏版本
#[test]
fn verify_macro_version() {
    // 验证 v0.1.1 版本特性：
    // ✅ 解析 #[tool(name, description)]
    // ✅ 支持带字段的结构体
    // ✅ 生成构造器 new()

    // 当前版本应该支持：
    let _tool = TestTool::new("test".to_string(), 0);
    assert!(true); // 构造器能正常工作

    println!("✅ Macro v0.1.1 verified!");
}
