use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::Path;
use crate::prompt_manager::BuiltinPrompts;

/**
 * 🏆 PIVO 3.0 Dynamic Tool Parser
 * 负责解析带有 YAML Frontmatter 的 Markdown 工具定义。
 */

#[derive(Debug, Serialize, Deserialize)]
pub struct ToolMetadata {
    pub name: String,
    pub description: String,
    pub parameters: Value,
}

pub fn load_tool_definition(project_root: &str, tool_id: &str, lang: &str) -> Option<Value> {
    let is_zh = lang.to_lowercase().starts_with("zh");
    
    // 1. 尝试从本地加载
    let local_path = if is_zh {
        std::path::Path::new(project_root).join(".ifai/prompts/zh-CN/tools").join(format!("{}.md", tool_id))
    } else {
        std::path::Path::new(project_root).join(".ifai/prompts/tools").join(format!("{}.md", tool_id))
    };

    if local_path.exists() {
        if let Ok(content) = fs::read_to_string(local_path) {
            return parse_markdown_tool(&content);
        }
    }

    // 2. 尝试从内置资源加载
    let builtin_path = if is_zh {
        format!("zh-CN/tools/{}.md", tool_id)
    } else {
        format!("tools/{}.md", tool_id)
    };

    if let Some(file) = BuiltinPrompts::get(&builtin_path) {
        if let Ok(content) = std::str::from_utf8(file.data.as_ref()) {
            return parse_markdown_tool(content);
        }
    }

    // 3. 回退到英文内置
    if is_zh {
        let fallback_path = format!("tools/{}.md", tool_id);
        if let Some(file) = BuiltinPrompts::get(&fallback_path) {
            if let Ok(content) = std::str::from_utf8(file.data.as_ref()) {
                return parse_markdown_tool(content);
            }
        }
    }

    None
}

fn parse_markdown_tool(content: &str) -> Option<Value> {
    if !content.starts_with("---") {
        return None;
    }

    let parts: Vec<&str> = content.split("---").collect();
    if parts.len() < 3 {
        return None;
    }

    let yaml_str = parts[1];
    let meta: ToolMetadata = serde_yaml::from_str(yaml_str).ok()?;

    Some(serde_json::json!({
        "type": "function",
        "function": {
            "name": meta.name,
            "description": meta.description,
            "parameters": meta.parameters
        }
    }))
}
