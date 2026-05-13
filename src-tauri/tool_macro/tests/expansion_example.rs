// 宏展开示例：展示 #[derive(Tool)] 生成的代码

use tool_macro::Tool;

// 原始代码：
#[derive(Tool)]
#[tool(name = "example_tool", description = "An example tool")]
struct ExampleTool {
    #[tool(config)]
    setting: String,

    #[tool(state)]
    count: usize,
}

// 宏展开后生成的代码（等价于以下实现）：

/*
impl ExampleTool {
    // 生成的常量
    pub const TOOL_NAME: &'static str = "example_tool";
    pub const TOOL_DESCRIPTION: &'static str = "An example tool";

    // 获取工具名称
    pub fn get_name() -> &'static str {
        Self::TOOL_NAME
    }

    // 获取工具描述
    pub fn get_description() -> &'static str {
        Self::TOOL_DESCRIPTION
    }

    // 生成的构造器
    pub fn new(setting: String, count: usize) -> Self {
        Self {
            setting,
            count,
        }
    }
}
*/

#[test]
fn demonstrate_generated_code() {
    // 验证常量
    assert_eq!(ExampleTool::TOOL_NAME, "example_tool");
    assert_eq!(ExampleTool::TOOL_DESCRIPTION, "An example tool");

    // 验证方法
    assert_eq!(ExampleTool::get_name(), "example_tool");
    assert_eq!(ExampleTool::get_description(), "An example tool");

    // 验证构造器
    let tool = ExampleTool::new("hello".to_string(), 42);

    // 工具创建成功！
    println!("✅ Tool created with name: {}", ExampleTool::get_name());
}
