// TDD 测试：验证宏能够处理带字段的结构体

use tool_macro::Tool;

// 模拟配置类型
struct Config {
    api_key: String,
}

// 测试：带字段的结构体
#[derive(Tool)]
#[tool(name = "web_search", description = "Search the web")]
struct WebSearchTool {
    #[tool(config)]
    config: Config,

    #[tool(state)]
    counter: usize,
}

// 验证字段标注被正确处理
#[test]
fn test_struct_with_fields_compiles() {
    // 验证基本属性仍然工作
    assert_eq!(WebSearchTool::TOOL_NAME, "web_search");
    assert_eq!(WebSearchTool::TOOL_DESCRIPTION, "Search the web");

    // 验证构造器生成
    let config = Config {
        api_key: "test-key".to_string(),
    };
    let tool = WebSearchTool::new(config, 42);

    // 后续会添加字段访问器的验证
    // 目前构造器能正常工作就是成功
}

// 测试：空结构体仍然兼容
#[derive(Tool)]
#[tool(name = "empty_tool", description = "An empty tool")]
struct EmptyTool;

#[test]
fn test_empty_struct_still_works() {
    assert_eq!(EmptyTool::TOOL_NAME, "empty_tool");
    assert_eq!(EmptyTool::TOOL_DESCRIPTION, "An empty tool");

    // 空结构体的构造器（无参数）
    let _tool = EmptyTool::new();
}
