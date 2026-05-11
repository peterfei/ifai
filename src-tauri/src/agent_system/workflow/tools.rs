//! 工作流工具执行器
//!
//! 参考 claw-code 的 ConversationRuntime 实现，支持 AI 工具调用循环

use anyhow::Result;
use rayon::prelude::*;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;

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
    pub input: Option<String>, // 工具输入
    pub execution_time_ms: Option<i64>, // 执行时间
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

    /// 单文件最大行数，超过则截断（保留首尾）
    const MAX_FILE_LINES: usize = 500;

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

        let (content, truncated) = Self::truncate_file(&content, Self::MAX_FILE_LINES);
        if truncated {
            Ok(format!(
                "[TRUNCATED] {} 超过 {} 行，已截断显示首尾\n\n{}",
                rel_path,
                Self::MAX_FILE_LINES,
                content
            ))
        } else {
            Ok(content)
        }
    }

    /// 截断大文件：保留 head 60% + tail 40%，中间省略
    fn truncate_file(content: &str, max_lines: usize) -> (String, bool) {
        let lines: Vec<&str> = content.lines().collect();
        if lines.len() <= max_lines {
            return (content.to_string(), false);
        }

        let head = max_lines * 60 / 100;
        let tail = max_lines - head;
        let skipped = lines.len() - head - tail;

        let mut out = String::new();
        for line in &lines[..head] {
            out.push_str(line);
            out.push('\n');
        }
        out.push_str(&format!("\n[... 省略 {} 行 ...]\n\n", skipped));
        for line in &lines[lines.len() - tail..] {
            out.push_str(line);
            out.push('\n');
        }
        (out, true)
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
        let max_depth = max_depth.unwrap_or(2);
        let full_path = std::path::Path::new(&self.project_root).join(rel_path);

        let mut result = String::new();
        self.scan_dir_recursive(&full_path, 0, max_depth, &mut result)?;

        Ok(result)
    }

    /// 执行 agent_search 工具（在代码中搜索模式）
    async fn search(&self, pattern: &str, rel_path: &str) -> Result<String> {
        use regex::Regex;

        let full_path = std::path::Path::new(&self.project_root).join(rel_path);

        // 安全检查
        let canonical_path = full_path.canonicalize()?;
        let canonical_root = std::path::Path::new(&self.project_root).canonicalize()?;
        if !canonical_path.starts_with(&canonical_root) {
            return Err(anyhow::anyhow!("路径访问被拒绝：路径在项目根目录之外"));
        }

        let regex = Regex::new(pattern)
            .map_err(|e| anyhow::anyhow!("无效的正则表达式: {}", e))?;

        let mut result = Vec::new();

        // 如果是文件，直接搜索
        if full_path.is_file() {
            self.search_in_file(&full_path, &regex, &rel_path, &mut result)?;
        } else if full_path.is_dir() {
            // 如果是目录，递归搜索所有文件
            self.search_in_dir(&full_path, &regex, &rel_path, &mut result)?;
        }

        if result.is_empty() {
            Ok(format!("未找到匹配 \"{}\" 的内容", pattern))
        } else {
            Ok(result.join("\n"))
        }
    }

    /// 在文件中搜索模式
    fn search_in_file(
        &self,
        file_path: &std::path::Path,
        regex: &Regex,
        display_path: &str,
        result: &mut Vec<String>,
    ) -> Result<()> {
        let content = std::fs::read_to_string(file_path)
            .map_err(|e| anyhow::anyhow!("读取文件失败 {:?}: {}", file_path, e))?;

        for (line_num, line) in content.lines().enumerate() {
            if regex.find(line).is_some() {
                result.push(format!("{}:{}:{}", display_path, line_num + 1, line));
            }
        }

        Ok(())
    }

    /// 🔥 在目录中递归搜索（并行版本）
    fn search_in_dir(
        &self,
        dir_path: &std::path::Path,
        regex: &Regex,
        _display_path: &str,
        result: &mut Vec<String>,
    ) -> Result<()> {
        // 第一步：串行收集所有需要搜索的文件路径
        let files_to_search = self.collect_searchable_files(dir_path)?;

        // 第二步：并行搜索所有文件
        let mutex_result = Mutex::new(result);
        files_to_search.par_iter().for_each(|(file_path, rel_path)| {
            if let Ok(content) = std::fs::read_to_string(file_path) {
                let mut matches: Vec<String> = content
                    .lines()
                    .enumerate()
                    .filter(|(_, line)| regex.find(line).is_some())
                    .map(|(line_num, line)| format!("{}:{}:{}", rel_path, line_num + 1, line))
                    .collect();

                if !matches.is_empty() {
                    if let Ok(mut result_guard) = mutex_result.lock() {
                        result_guard.append(&mut matches);
                    }
                }
            }
        });

        Ok(())
    }

    /// 收集目录中所有需要搜索的文件路径
    fn collect_searchable_files(&self, dir_path: &std::path::Path) -> Result<Vec<(std::path::PathBuf, String)>> {
        let mut files = Vec::new();
        self.collect_files_recursive(dir_path, &mut files)?;
        Ok(files)
    }

    /// 递归收集文件路径
    fn collect_files_recursive(
        &self,
        dir_path: &std::path::Path,
        files: &mut Vec<(std::path::PathBuf, String)>,
    ) -> Result<()> {
        let entries = std::fs::read_dir(dir_path)
            .map_err(|e| anyhow::anyhow!("读取目录失败 {:?}: {}", dir_path, e))?;

        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();

            // 跳过隐藏目录和常见忽略目录
            if let Some(name) = path.file_name() {
                let name_str = name.to_string_lossy();
                if name_str.starts_with('.')
                    || name_str == "node_modules"
                    || name_str == "target"
                    || name_str == "dist"
                    || name_str == ".git" {
                    continue;
                }
            }

            if path.is_file() {
                // 只收集文本文件
                if let Some(ext) = path.extension() {
                    let ext_str = ext.to_string_lossy();
                    let is_text = matches!(
                        ext_str.as_ref(),
                        "rs" | "toml" | "yaml" | "yml" | "json" | "md" | "txt" | "js" | "ts" | "tsx" | "jsx" | "py" | "go" | "java" | "cpp" | "c" | "h" | "cs" | "swift"
                    );
                    if is_text {
                        let rel_path = path.strip_prefix(&self.project_root)
                            .unwrap_or(&path)
                            .to_string_lossy()
                            .to_string();
                        files.push((path, rel_path));
                    }
                }
            } else if path.is_dir() {
                // 递归收集子目录中的文件
                let _ = self.collect_files_recursive(&path, files);
            }
        }

        Ok(())
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

        let entries =
            std::fs::read_dir(dir).map_err(|e| anyhow::anyhow!("读取目录失败 {:?}: {}", dir, e))?;

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
        wf_log!("[ToolExecutor] 🔧 Executing tool: {}", name);
        wf_log!(
            "[ToolExecutor] 📦 Input: {}",
            serde_json::to_string_pretty(input).unwrap_or_default()
        );

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
                    .ok_or_else(|| anyhow::anyhow!("缺少 rel_path 参数"))?;
                let max_depth = input["max_depth"].as_u64().map(|d| d as usize);
                self.scan_project(rel_path, max_depth).await
            }
            "agent_search" => {
                let pattern = input["pattern"]
                    .as_str()
                    .ok_or_else(|| anyhow::anyhow!("缺少 pattern 参数"))?;
                let path = input["path"]
                    .as_str()
                    .unwrap_or("."); // 默认搜索当前目录
                self.search(pattern, path).await
            }
            _ => Err(anyhow::anyhow!(
                "未知的工具: {}。可用工具: agent_read_file, agent_list_dir, agent_scan_project, agent_search",
                name
            )),
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
                "description": "扫描项目目录结构，获取目录树。用于快速了解项目骨架。深度建议 2，避免输出过长。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "rel_path": {
                            "type": "string",
                            "description": "相对于项目根目录的扫描路径，通常为 \".\""
                        },
                        "max_depth": {
                            "type": "number",
                            "description": "最大扫描深度（推荐2，默认2）",
                            "default": 2
                        }
                    },
                    "required": ["rel_path"]
                }
            }
        }),
        // 🔥 优先级2：读取单个文件（可同时调用多个实现并行读取）
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "agent_read_file",
                "description": "读取单个文件内容。需要读取多个文件时，请在同一次响应中发起多个 agent_read_file 调用，它们会并行执行。",
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
        // 🔥 优先级4：列出目录（仅在需要查看特定目录时使用）
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "agent_list_dir",
                "description": "列出指定目录的内容（仅一层）。当只需要查看某个目录下有哪些文件时使用。",
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
        // 🔥 优先级5：搜索代码（在代码中搜索模式，类似 grep）
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "agent_search",
                "description": "在代码中搜索匹配正则表达式的文本。支持递归搜索目录。会跳过常见忽略目录（node_modules/target/.git）。返回格式：文件路径:行号:匹配行内容",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "pattern": {
                            "type": "string",
                            "description": "正则表达式模式，例如：\"struct\\w+\"、\"fn\\w+\"、\"TODO|FIXME\"、\"async fn\""
                        },
                        "path": {
                            "type": "string",
                            "description": "搜索路径（文件或目录），默认为当前目录 \".\"。支持递归搜索目录。",
                            "default": "."
                        }
                    },
                    "required": ["pattern"]
                }
            }
        }),
    ]
}
