//! 工作流工具执行器
//!
//! 参考 claw-code 的 ConversationRuntime 实现，支持 AI 工具调用循环

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use anyhow::Result;

/// 工具调用请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub input: serde_json::Value,
}

/// 工具调用结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolResult {
    pub id: String,
    pub name: String,
    pub output: String,
    pub is_error: bool,
    /// 🔥 工具调用详细信息（用于传递到前端）
    pub input: Option<String>,           // 工具输入
    pub execution_time_ms: Option<i64>,  // 执行时间
}

/// 工具执行器 trait
#[async_trait::async_trait]
pub trait ToolExecutor: Send + Sync {
    /// 执行工具调用
    async fn execute(&self, name: &str, input: &serde_json::Value) -> Result<String>;
}

/// 默认工具执行器
pub struct DefaultToolExecutor {
    pub project_root: String,
}

impl DefaultToolExecutor {
    pub fn new(project_root: String) -> Self {
        Self { project_root }
    }

    /// 执行 read_file 工具
    async fn read_file(&self, rel_path: &str) -> Result<String> {
        let full_path = std::path::Path::new(&self.project_root).join(rel_path);

        // 安全检查：确保路径在项目根目录内
        let canonical_path = full_path.canonicalize()?;
        let canonical_root = std::path::Path::new(&self.project_root).canonicalize()?;

        if !canonical_path.starts_with(&canonical_root) {
            return Err(anyhow::anyhow!("路径访问被拒绝：路径在项目根目录之外"));
        }

        let content = std::fs::read_to_string(&full_path)
            .map_err(|e| anyhow::anyhow!("读取文件失败 {}: {}", rel_path, e))?;

        Ok(content)
    }

    /// 执行 list_dir 工具
    async fn list_dir(&self, rel_path: &str) -> Result<String> {
        let full_path = std::path::Path::new(&self.project_root).join(rel_path);

        let entries = std::fs::read_dir(&full_path)
            .map_err(|e| anyhow::anyhow!("读取目录失败 {}: {}", rel_path, e))?;

        let mut result = String::new();
        for entry in entries {
            if let Ok(entry) = entry {
                let name = entry.file_name().into_string().unwrap_or_default();
                let file_type = if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                    "DIR"
                } else {
                    "FILE"
                };
                result.push_str(&format!("{} {}\n", file_type, name));
            }
        }

        Ok(result)
    }

    /// 执行 scan_project 工具（递归扫描项目结构）
    async fn scan_project(&self, rel_path: &str, max_depth: Option<usize>) -> Result<String> {
        let max_depth = max_depth.unwrap_or(3);
        let full_path = std::path::Path::new(&self.project_root).join(rel_path);

        let mut result = String::new();
        self.scan_dir_recursive(&full_path, 0, max_depth, &mut result)?;

        Ok(result)
    }

    /// 递归扫描目录
    fn scan_dir_recursive(
        &self,
        dir: &std::path::Path,
        current_depth: usize,
        max_depth: usize,
        result: &mut String,
    ) -> Result<()> {
        if current_depth > max_depth {
            return Ok(());
        }

        let entries = std::fs::read_dir(dir)
            .map_err(|e| anyhow::anyhow!("读取目录失败 {:?}: {}", dir, e))?;

        let mut entries_vec: Vec<std::fs::DirEntry> = entries.filter_map(|e| e.ok()).collect();
        entries_vec.sort_by_key(|e| e.file_name());

        for entry in entries_vec {
            let path = entry.path();
            let name = entry.file_name().into_string().unwrap_or_default();

            // 跳过隐藏目录和 node_modules 等
            if name.starts_with('.') || name == "node_modules" || name == "target" {
                continue;
            }

            let indent = "  ".repeat(current_depth);
            let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);

            if is_dir {
                result.push_str(&format!("{}[DIR] {}\n", indent, name));
                if current_depth < max_depth {
                    // 递归扫描子目录
                    let _ = self.scan_dir_recursive(&path, current_depth + 1, max_depth, result);
                }
            } else {
                result.push_str(&format!("{}[FILE] {}\n", indent, name));
            }
        }

        Ok(())
    }
}

#[async_trait::async_trait]
impl ToolExecutor for DefaultToolExecutor {
    async fn execute(&self, name: &str, input: &serde_json::Value) -> Result<String> {
        println!("[ToolExecutor] 🔧 Executing tool: {}", name);
        println!("[ToolExecutor] 📦 Input: {}", serde_json::to_string_pretty(input).unwrap_or_default());

        match name {
            "agent_read_file" => {
                let rel_path = input["rel_path"]
                    .as_str()
                    .ok_or_else(|| anyhow::anyhow!("缺少 rel_path 参数。工具调用格式: {{\"type\": \"function\", \"function\": {{\"name\": \"agent_read_file\", \"arguments\": {{\"rel_path\": \"文件路径\"}}}}}}"))?;
                self.read_file(rel_path).await
            }
            "agent_list_dir" => {
                let rel_path = input["rel_path"]
                    .as_str()
                    .ok_or_else(|| anyhow::anyhow!("缺少 rel_path 参数。工具调用格式: {{\"type\": \"function\", \"function\": {{\"name\": \"agent_list_dir\", \"arguments\": {{\"rel_path\": \"目录路径\"}}}}}}"))?;
                self.list_dir(rel_path).await
            }
            "agent_scan_project" => {
                let rel_path = input["rel_path"]
                    .as_str()
                    .ok_or_else(|| anyhow::anyhow!("缺少 rel_path 参数。工具调用格式: {{\"type\": \"function\", \"function\": {{\"name\": \"agent_scan_project\", \"arguments\": {{\"rel_path\": \"路径\", \"max_depth\": 3}}}}"))?;
                let max_depth = input["max_depth"].as_u64().map(|d| d as usize);
                self.scan_project(rel_path, max_depth).await
            }
            _ => Err(anyhow::anyhow!("未知的工具: {}。可用工具: agent_read_file, agent_list_dir, agent_scan_project", name)),
        }
    }
}

/// 创建工具定义（用于发送给 AI）
/// 🔥 优先使用私有库的工具定义，确保一致性
pub fn create_tool_definitions() -> Vec<serde_json::Value> {
    // 🔥 Commercial 版本：使用私有库的统一工具定义
    #[cfg(feature = "commercial")]
    {
        // 从私有库获取工具定义并转换为 JSON
        ifainew_core::ai::create_default_tools()
            .into_iter()
            .map(|tool| {
                // 将 ifainew_core::ai::Tool 转换为 serde_json::Value
                serde_json::to_value(tool).unwrap_or_default()
            })
            .collect()
    }

    // 🔥 Community 版本：使用本地工具定义（向后兼容）
    #[cfg(not(feature = "commercial"))]
    {
        create_tool_definitions_fallback()
    }
}

/// Community 版本的工具定义（降级处理）
#[cfg(not(feature = "commercial"))]
fn create_tool_definitions_fallback() -> Vec<serde_json::Value> {
    vec![
        // 🔥 优先级1：扫描工具（放在最前面）
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "agent_scan_project",
                "description": "【优先使用】深度扫描项目结构，一次性获取完整目录树。递归列出所有目录和文件，是理解项目的最快方式。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "rel_path": {
                            "type": "string",
                            "description": "相对于项目根目录的扫描路径"
                        },
                        "max_depth": {
                            "type": "number",
                            "description": "最大扫描深度（推荐2-3，默认3）",
                            "default": 3
                        }
                    },
                    "required": ["rel_path"]
                }
            }
        }),
        // 🔥 优先级2：读取文件
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "agent_read_file",
                "description": "读取文件内容。用于查看配置文件、源代码等。可以在一次调用中并行读取多个文件。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "rel_path": {
                            "type": "string",
                            "description": "相对于项目根目录的文件路径"
                        }
                    },
                    "required": ["rel_path"]
                }
            }
        }),
        // 🔥 优先级3：列出目录（仅在需要时使用）
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "agent_list_dir",
                "description": "列出目录内容（仅一层）。注意：agent_scan_project 已包含完整目录结构，通常不需要单独使用此工具。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "rel_path": {
                            "type": "string",
                            "description": "相对于项目根目录的目录路径"
                        }
                    },
                    "required": ["rel_path"]
                }
            }
        }),
    ]
}
