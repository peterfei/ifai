// TDD 测试：验证 #[tool(...)] 属性能够被正确解析

use tool_macro::Tool;

// 测试工具 1：验证宏能够提取 tool 属性的 name 和 description
#[derive(Tool)]
#[tool(name = "search", description = "Search the web")]
struct WebSearchTool;

// 测试工具 2：验证不同的属性值也能正确解析
#[derive(Tool)]
#[tool(name = "read_file", description = "Read a file from disk")]
struct ReadFileTool;

// 验证属性解析的正确性
#[test]
fn test_websearch_tool_attributes() {
    assert_eq!(WebSearchTool::TOOL_NAME, "search");
    assert_eq!(WebSearchTool::TOOL_DESCRIPTION, "Search the web");
    assert_eq!(WebSearchTool::get_name(), "search");
    assert_eq!(WebSearchTool::get_description(), "Search the web");
}

#[test]
fn test_readfile_tool_attributes() {
    assert_eq!(ReadFileTool::TOOL_NAME, "read_file");
    assert_eq!(ReadFileTool::TOOL_DESCRIPTION, "Read a file from disk");
}

// 测试：没有属性时使用默认值
#[derive(Tool)]
struct NoAttrTool;

#[test]
fn test_default_attributes() {
    assert_eq!(NoAttrTool::TOOL_NAME, "unnamed_tool");
    assert_eq!(NoAttrTool::TOOL_DESCRIPTION, "A tool");
}
