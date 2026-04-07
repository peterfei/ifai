use ifainew::harness::tool::registry::get_global_tool_registry;
use serde_json::json;

fn main() {
    println!("=== Testing Tool Conversion ===\n");

    let registry = get_global_tool_registry();
    let tools = registry.all();

    println!("Total tools: {}\n", tools.len());

    for (i, tool) in tools.iter().enumerate() {
        println!("Tool #{}: {}", i, tool.name);

        // 转换为 OpenAI 格式
        let tool_json = json!({
            "type": "function",
            "function": {
                "name": tool.name,
                "description": tool.description,
                "parameters": tool.input_schema
            }
        });

        // 检查序列化结果
        let json_str = serde_json::to_string(&tool_json).unwrap_or_else(|_| "Invalid JSON".to_string());
        println!("  JSON length: {} bytes", json_str.len());
        println!("  JSON preview: {}...", &json_str[..json_str.len().min(100)]);

        // 检查关键字段
        if let Some(obj) = tool_json.as_object() {
            if let Some(type_val) = obj.get("type") {
                println!("  type field: {:?}", type_val);
            }
            if let Some(function) = obj.get("function") {
                if let Some(func_obj) = function.as_object() {
                    println!("  function.name: {:?}", func_obj.get("name"));
                    if let Some(params) = func_obj.get("parameters") {
                        println!("  parameters type: {:?}", params.get("type"));
                    }
                }
            }
        }

        println!();
    }

    println!("=== End of Tool Conversion Test ===");
}
