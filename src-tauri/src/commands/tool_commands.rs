//!
//! Tool Commands
//!
//! 提供工具描述系统的 Tauri 命令接口。
//!
//! P3: 通用工具系统 UI - 后端命令实现
//!

use crate::harness::tool::{ToolRegistry, ToolSpec, ToolPermissionMode, ToolCategory};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// 工具描述响应（前端格式）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDescriptionResponse {
    /// 工具名称
    pub name: String,

    /// 工具描述
    pub description: String,

    /// 输入参数 JSON Schema
    pub input_schema: serde_json::Value,

    /// 所需权限级别
    pub required_permission: String,

    /// 工具分类
    pub category: String,

    /// 是否为危险操作
    pub is_dangerous: bool,

    /// 示例用法
    pub examples: Vec<String>,

    /// 参数说明
    pub parameter_descriptions: HashMap<String, String>,
}

/// 工具列表响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolListResponse {
    /// 所有工具
    pub tools: Vec<ToolDescriptionResponse>,

    /// 按分类组织的工具
    pub by_category: HashMap<String, Vec<ToolDescriptionResponse>>,

    /// 按权限组织的工具
    pub by_permission: HashMap<String, Vec<ToolDescriptionResponse>>,

    /// 统计信息
    pub stats: ToolStatsResponse,
}

/// 工具统计信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolStatsResponse {
    /// 总工具数
    pub total_count: usize,

    /// 各分类数量
    pub category_counts: HashMap<String, usize>,

    /// 各权限级别数量
    pub permission_counts: HashMap<String, usize>,
}

/// 获取所有工具描述
///
/// 返回所有已注册工具的完整信息，包括：
/// - 基本信息（名称、描述）
/// - 输入参数 schema
/// - 权限要求
/// - 分类信息
/// - 示例用法
#[tauri::command]
pub async fn get_tool_descriptions() -> Result<ToolListResponse, String> {
    let registry = ToolRegistry::new();
    let tools = registry.all();

    // 转换为前端格式
    let tool_descriptions: Vec<ToolDescriptionResponse> = tools
        .into_iter()
        .map(|spec| convert_tool_spec_to_response(&spec))
        .collect();

    // 按分类组织
    let mut by_category: HashMap<String, Vec<ToolDescriptionResponse>> = HashMap::new();
    for tool in &tool_descriptions {
        by_category
            .entry(tool.category.clone())
            .or_insert_with(Vec::new)
            .push(tool.clone());
    }

    // 按权限组织
    let mut by_permission: HashMap<String, Vec<ToolDescriptionResponse>> = HashMap::new();
    for tool in &tool_descriptions {
        by_permission
            .entry(tool.required_permission.clone())
            .or_insert_with(Vec::new)
            .push(tool.clone());
    }

    // 统计信息
    let mut category_counts: HashMap<String, usize> = HashMap::new();
    for (category, tools) in &by_category {
        category_counts.insert(category.clone(), tools.len());
    }

    let mut permission_counts: HashMap<String, usize> = HashMap::new();
    for (permission, tools) in &by_permission {
        permission_counts.insert(permission.clone(), tools.len());
    }

    let stats = ToolStatsResponse {
        total_count: tool_descriptions.len(),
        category_counts,
        permission_counts,
    };

    Ok(ToolListResponse {
        tools: tool_descriptions,
        by_category,
        by_permission,
        stats,
    })
}

/// 获取单个工具的详细信息
#[tauri::command]
pub async fn get_tool_description(name: String) -> Result<ToolDescriptionResponse, String> {
    let registry = ToolRegistry::new();
    let spec = registry
        .get(&name)
        .ok_or_else(|| format!("Tool '{}' not found", name))?;

    Ok(convert_tool_spec_to_response(&spec))
}

/// 根据权限级别过滤工具
#[tauri::command]
pub async fn get_tools_by_permission(
    max_permission: String,
) -> Result<Vec<ToolDescriptionResponse>, String> {
    let registry = ToolRegistry::new();

    // 解析权限级别
    let permission = match max_permission.to_lowercase().as_str() {
        "readonly" | "read_only" => ToolPermissionMode::ReadOnly,
        "workspacewrite" | "workspace_write" => ToolPermissionMode::WorkspaceWrite,
        "prompt" => ToolPermissionMode::Prompt,
        "dangerfullaccess" | "danger_full_access" => ToolPermissionMode::DangerFullAccess,
        "allow" => ToolPermissionMode::Allow,
        _ => {
            return Err(format!("Invalid permission level: {}", max_permission));
        }
    };

    let tools = registry.filter_by_permission(permission);
    let descriptions = tools
        .into_iter()
        .map(|spec| convert_tool_spec_to_response(&spec))
        .collect();

    Ok(descriptions)
}

/// 将 ToolSpec 转换为前端响应格式
fn convert_tool_spec_to_response(spec: &ToolSpec) -> ToolDescriptionResponse {
    let category = categorize_tool(&spec.name);
    let is_dangerous = matches!(
        spec.required_permission,
        ToolPermissionMode::DangerFullAccess
    );

    let examples = generate_tool_examples(&spec.name);
    let parameter_descriptions = generate_parameter_descriptions(&spec.name);

    ToolDescriptionResponse {
        name: spec.name.to_string(),
        description: spec.description.to_string(),
        input_schema: spec.input_schema.clone(),
        required_permission: format!("{:?}", spec.required_permission),
        category: format!("{:?}", category),
        is_dangerous,
        examples,
        parameter_descriptions,
    }
}

/// 根据工具名称确定分类
fn categorize_tool(name: &str) -> ToolCategory {
    match name {
        "read_file" | "write_file" | "edit_file" => ToolCategory::File,
        "glob_search" | "grep_search" => ToolCategory::Search,
        "bash" | "PowerShell" => ToolCategory::Command,
        "WebFetch" | "WebSearch" => ToolCategory::Network,
        "TodoWrite" => ToolCategory::System,
        _ => ToolCategory::Other,
    }
}

/// 生成工具示例用法
fn generate_tool_examples(name: &str) -> Vec<String> {
    match name {
        "read_file" => vec![
            "读取单个文件内容".to_string(),
            "查看源代码文件".to_string(),
            "读取配置文件".to_string(),
        ],
        "write_file" => vec![
            "创建新文件并写入内容".to_string(),
            "覆盖现有文件".to_string(),
            "保存生成的代码".to_string(),
        ],
        "edit_file" => vec![
            "修改文件中的特定部分".to_string(),
            "替换代码片段".to_string(),
            "更新配置项".to_string(),
        ],
        "glob_search" => vec![
            "查找所有 .ts 文件".to_string(),
            "搜索特定目录下的文件".to_string(),
            "按文件名模式匹配".to_string(),
        ],
        "grep_search" => vec![
            "在文件中搜索特定文本".to_string(),
            "查找函数定义".to_string(),
            "搜索变量使用位置".to_string(),
        ],
        "bash" => vec![
            "执行 shell 命令".to_string(),
            "运行构建脚本".to_string(),
            "执行 git 操作".to_string(),
        ],
        "PowerShell" => vec![
            "执行 PowerShell 命令（Windows）".to_string(),
            "管理系统配置".to_string(),
        ],
        "WebFetch" => vec![
            "获取网页内容".to_string(),
            "读取在线文档".to_string(),
            "获取 API 响应".to_string(),
        ],
        "WebSearch" => vec![
            "搜索技术文档".to_string(),
            "查找问题解决方案".to_string(),
            "获取最新信息".to_string(),
        ],
        "TodoWrite" => vec![
            "创建任务列表".to_string(),
            "更新任务进度".to_string(),
            "标记任务完成状态".to_string(),
        ],
        _ => vec![],
    }
}

/// 生成参数说明
fn generate_parameter_descriptions(name: &str) -> HashMap<String, String> {
    let mut descriptions = HashMap::new();

    match name {
        "read_file" => {
            descriptions.insert("path".to_string(), "要读取的文件路径".to_string());
        }
        "write_file" => {
            descriptions.insert("path".to_string(), "要写入的文件路径".to_string());
            descriptions.insert("content".to_string(), "要写入的文件内容".to_string());
        }
        "edit_file" => {
            descriptions.insert("path".to_string(), "要编辑的文件路径".to_string());
            descriptions.insert(
                "old_text".to_string(),
                "要替换的原始文本内容".to_string(),
            );
            descriptions.insert("new_text".to_string(), "替换后的新文本内容".to_string());
        }
        "glob_search" => {
            descriptions.insert(
                "pattern".to_string(),
                "Glob 匹配模式（如 **/*.ts）".to_string(),
            );
            descriptions.insert("path".to_string(), "搜索目录（可选）".to_string());
        }
        "grep_search" => {
            descriptions.insert("pattern".to_string(), "搜索的文本或正则表达式".to_string());
            descriptions.insert("path".to_string(), "搜索目录（可选）".to_string());
        }
        "bash" => {
            descriptions.insert("command".to_string(), "要执行的 bash 命令".to_string());
        }
        "PowerShell" => {
            descriptions.insert("command".to_string(), "要执行的 PowerShell 命令".to_string());
        }
        "WebFetch" => {
            descriptions.insert("url".to_string(), "要获取的网页 URL".to_string());
        }
        "WebSearch" => {
            descriptions.insert("query".to_string(), "搜索查询关键词".to_string());
        }
        "TodoWrite" => {
            descriptions.insert(
                "todos".to_string(),
                "任务列表数组，每个任务包含 content、activeForm、status".to_string(),
            );
        }
        _ => {}
    }

    descriptions
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tool_categorization() {
        assert!(matches!(
            categorize_tool("read_file"),
            ToolCategory::File
        ));
        assert!(matches!(
            categorize_tool("bash"),
            ToolCategory::Command
        ));
        assert!(matches!(
            categorize_tool("glob_search"),
            ToolCategory::Search
        ));
    }

    #[test]
    fn test_dangerous_tool_detection() {
        let registry = ToolRegistry::new();
        let bash_spec = registry.get("bash").unwrap();
        let read_spec = registry.get("read_file").unwrap();

        assert!(matches!(
            bash_spec.required_permission,
            ToolPermissionMode::DangerFullAccess
        ));
        assert!(matches!(
            read_spec.required_permission,
            ToolPermissionMode::ReadOnly
        ));
    }
}
