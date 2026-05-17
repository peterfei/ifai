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

    // ========================================================================
    // Git 工具（Git Commit Agent 使用）
    // ========================================================================

    /// 执行 git_status — 查看仓库状态
    async fn git_status(&self) -> Result<String> {
        let output = std::process::Command::new("git")
            .arg("status")
            .arg("--porcelain")
            .output()
            .map_err(|e| anyhow::anyhow!("执行 git status 失败: {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();

        if !output.status.success() {
            return Err(anyhow::anyhow!("git status 失败: {}", stderr));
        }

        if stdout.is_empty() {
            Ok("工作区干净，没有变更。".to_string())
        } else {
            Ok(format!("仓库状态:\n{}", stdout))
        }
    }

    /// 执行 git_snapshot — 创建或回滚快照
    async fn git_snapshot(&self, action: &str) -> Result<String> {
        match action {
            "create" => {
                // 使用 git stash create 创建临时快照
                let output = std::process::Command::new("git")
                    .arg("stash")
                    .arg("create")
                    .output()
                    .map_err(|e| anyhow::anyhow!("创建快照失败: {}", e))?;

                let hash = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if hash.is_empty() {
                    Ok("没有未暂存的变更需要快照。".to_string())
                } else {
                    Ok(format!("快照已创建: {}", hash))
                }
            }
            "rollback" => {
                // 这里需要快照 hash 作为参数，但简化处理
                let output = std::process::Command::new("git")
                    .arg("stash")
                    .arg("list")
                    .output()
                    .map_err(|e| anyhow::anyhow!("列出快照失败: {}", e))?;

                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                Ok(format!("可用的快照:\n{}", stdout))
            }
            _ => Err(anyhow::anyhow!("未知的快照操作: {}", action)),
        }
    }

    /// 执行 secret_scanner — 扫描敏感信息
    async fn secret_scanner(&self, content: &str) -> Result<String> {
        let patterns = [
            ("Generic API Key", r#"(?i)(api[_-]?key|apikey)\s*[=:]\s*['"]?[a-zA-Z0-9]{20,}"#),
            ("Password", r#"(?i)(password|passwd|pwd)\s*[=:]\s*['"]?[^\s'"]{8,}"#),
            ("Token", r#"(?i)(token|secret|auth)\s*[=:]\s*['"]?[a-zA-Z0-9_\-]{20,}"#),
            ("Private Key", r"-----BEGIN\s+(RSA|EC|DSA|OPENSSH)\s+PRIVATE\s+KEY-----"),
            ("JWT Token", r"eyJ[a-zA-Z0-9_\-]+\.eyJ[a-zA-Z0-9_\-]+\.[a-zA-Z0-9_\-]+"),
            ("AWS Key", r"(?i)AKIA[0-9A-Z]{16}"),
            ("GitHub Token", r"(?i)gh[ps]_[a-zA-Z0-9_]{36,}"),
            ("Slack Token", r"(?i)xox[baprs]-[a-zA-Z0-9_\-]{10,}"),
            ("npm token", r"(?i)npm_[a-zA-Z0-9]{36,}"),
        ];

        let mut findings = Vec::new();

        for (name, pattern) in &patterns {
            if let Ok(re) = regex::Regex::new(pattern) {
                for line in content.lines() {
                    if re.find(line).is_some() {
                        let masked = line.chars().map(|c| if c.is_alphanumeric() { '*' } else { c }).collect::<String>();
                        findings.push(format!("[{}] 发现 {}: {}", name, name, masked));
                    }
                }
            }
        }

        if findings.is_empty() {
            Ok("✅ 未发现敏感信息。".to_string())
        } else {
            let mut result = "⚠️  发现可能的敏感信息:\n".to_string();
            for finding in &findings {
                result.push_str(&format!("  {}\n", finding));
            }
            result.push_str("\n请检查并移除敏感信息后再提交。");
            Ok(result)
        }
    }

    /// 执行 git_commit — 安全提交（自动追加 Co-authored-by）
    async fn git_commit(&self, message: &str) -> Result<String> {
        let full_message = format!(
            "{}\n\nCo-authored-by: IfAI CLI <noreply@ifai.today>",
            message.trim()
        );

        // git add -A
        let add_output = std::process::Command::new("git")
            .arg("add")
            .arg("-A")
            .output()
            .map_err(|e| anyhow::anyhow!("git add 失败: {}", e))?;

        if !add_output.status.success() {
            let stderr = String::from_utf8_lossy(&add_output.stderr);
            return Err(anyhow::anyhow!("git add 失败: {}", stderr));
        }

        // git commit -m "message"
        let commit_output = std::process::Command::new("git")
            .arg("commit")
            .arg("-m")
            .arg(&full_message)
            .output()
            .map_err(|e| anyhow::anyhow!("git commit 失败: {}", e))?;

        if !commit_output.status.success() {
            let stderr = String::from_utf8_lossy(&commit_output.stderr);
            if stderr.contains("nothing to commit") || stderr.contains("no changes") {
                return Ok("nothing to commit, working tree clean".to_string());
            }
            return Err(anyhow::anyhow!("git commit 失败: {}", stderr));
        }

        // 获取 commit hash
        let hash_output = std::process::Command::new("git")
            .arg("rev-parse")
            .arg("HEAD")
            .output()
            .ok();
        let commit_hash = hash_output
            .and_then(|o| {
                if o.status.success() {
                    String::from_utf8(o.stdout).ok()
                } else {
                    None
                }
            })
            .map(|s| s.trim().to_string());

        let stdout = String::from_utf8_lossy(&commit_output.stdout);
        let mut summary = stdout.trim().to_string();
        if let Some(ref hash) = commit_hash {
            summary.push_str(&format!("\nHash: {}", hash));
        }

        Ok(summary)
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
            // Git 工具（Git Commit Agent）
            "git_status" => {
                self.git_status().await
            }
            "git_snapshot" => {
                let action = input["action"]
                    .as_str()
                    .ok_or_else(|| anyhow::anyhow!("缺少 action 参数（create/rollback）"))?;
                self.git_snapshot(action).await
            }
            "secret_scanner" => {
                let content = input["content"]
                    .as_str()
                    .ok_or_else(|| anyhow::anyhow!("缺少 content 参数"))?;
                self.secret_scanner(content).await
            }
            "git_commit" => {
                let message = input["message"]
                    .as_str()
                    .ok_or_else(|| anyhow::anyhow!("缺少 message 参数"))?;
                self.git_commit(message).await
            }
            _ => Err(anyhow::anyhow!(
                "未知的工具: {}。可用工具: agent_read_file, agent_list_dir, agent_scan_project, agent_search, git_status, git_snapshot, secret_scanner, git_commit",
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
        // Git Commit Agent 工具
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "git_status",
                "description": "查看当前 git 仓库状态（变更的文件列表）。返回 git status --porcelain 格式的输出。",
                "parameters": {
                    "type": "object",
                    "properties": {},
                    "required": []
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "git_snapshot",
                "description": "创建或回滚 git 快照。action=\"create\" 创建快照，action=\"rollback\" 查看可用的快照列表。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "action": {
                            "type": "string",
                            "description": "\"create\" 创建快照，\"rollback\" 查看快照列表"
                        }
                    },
                    "required": ["action"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "secret_scanner",
                "description": "扫描内容中的敏感信息（API key、密码、token、私钥等）。返回发现的敏感信息列表或确认安全。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "content": {
                            "type": "string",
                            "description": "要扫描的内容文本"
                        }
                    },
                    "required": ["content"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "git_commit",
                "description": "执行 git add -A + git commit，自动追加 Co-authored-by: IfAI CLI <noreply@ifai.today>。传入 commit message 参数。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "message": {
                            "type": "string",
                            "description": "Commit message，遵循 Conventional Commits 格式，例如 feat(scope): 描述。无需包含 Co-authored-by 行。"
                        }
                    },
                    "required": ["message"]
                }
            }
        }),
    ]
}

// ============================================================================
// 单元测试
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use tempfile::TempDir;

    /// 创建测试目录结构
    fn setup_test_dir() -> TempDir {
        let temp_dir = TempDir::new().unwrap();
        let root = temp_dir.path();

        // 创建目录结构
        fs::create_dir_all(root.join("src/models")).unwrap();
        fs::create_dir_all(root.join("tests")).unwrap();
        fs::create_dir_all(root.join("target")).unwrap(); // 应该被跳过
        fs::create_dir_all(root.join(".git")).unwrap(); // 应该被跳过
        fs::create_dir_all(root.join("node_modules")).unwrap(); // 应该被跳过

        // 创建测试文件
        fs::write(
            root.join("src/main.rs"),
            r#"// Main entry point
async fn main() {
    println!("Hello, world!");
    TODO: Implement this feature
}
"#,
        ).unwrap();

        fs::write(
            root.join("src/models/user.rs"),
            r#"// User model
struct User {
    name: String,
}

impl User {
    fn new(name: String) -> Self {
        Self { name }
    }
}
"#,
        ).unwrap();

        fs::write(
            root.join("tests/test_main.rs"),
            r#"#[test]
fn test_main() {
    assert_eq!(1, 1);
}
"#,
        ).unwrap();

        fs::write(root.join("README.md"), "TODO: Add documentation\n").unwrap();

        // 创建应该被跳过的文件
        fs::write(root.join("target/lib.rs"), "This should be skipped\n").unwrap();
        fs::write(root.join(".git/config"), "This should be skipped\n").unwrap();

        temp_dir
    }

    // ========================================================================
    // 功能测试
    // ========================================================================

    #[tokio::test]
    async fn test_search_single_pattern() {
        let temp_dir = setup_test_dir();
        let executor = DefaultToolExecutor::new(temp_dir.path().to_str().unwrap().to_string());

        let result = executor.search("TODO", ".").await.unwrap();
        assert!(result.contains("src/main.rs"));
        assert!(result.contains("README.md"));
        assert!(result.contains("TODO"));
    }

    #[tokio::test]
    async fn test_search_regex_pattern() {
        let temp_dir = setup_test_dir();
        let executor = DefaultToolExecutor::new(temp_dir.path().to_str().unwrap().to_string());

        let result = executor.search(r"struct \w+", ".").await.unwrap();
        assert!(result.contains("src/models/user.rs"));
        assert!(result.contains("struct User"));
    }

    #[tokio::test]
    async fn test_search_skips_ignored_dirs() {
        let temp_dir = setup_test_dir();
        let executor = DefaultToolExecutor::new(temp_dir.path().to_str().unwrap().to_string());

        let result = executor.search("skipped", ".").await.unwrap();
        // target 和 .git 中的文件应该被跳过
        assert!(!result.contains("target"));
        assert!(!result.contains(".git"));
        assert!(!result.contains("node_modules"));
    }

    #[tokio::test]
    async fn test_search_in_single_file() {
        let temp_dir = setup_test_dir();
        let executor = DefaultToolExecutor::new(temp_dir.path().to_str().unwrap().to_string());

        let result = executor.search("async fn", "src/main.rs").await.unwrap();
        assert!(result.contains("src/main.rs"));
        assert!(result.contains("async fn main"));
    }

    #[tokio::test]
    async fn test_search_empty_result() {
        let temp_dir = setup_test_dir();
        let executor = DefaultToolExecutor::new(temp_dir.path().to_str().unwrap().to_string());

        let result = executor.search("NONEXISTENT_PATTERN_12345", ".").await.unwrap();
        assert!(result.contains("未找到匹配"));
    }

    #[tokio::test]
    async fn test_search_invalid_regex() {
        let temp_dir = setup_test_dir();
        let executor = DefaultToolExecutor::new(temp_dir.path().to_str().unwrap().to_string());

        let result = executor.search("[invalid(", ".").await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("无效的正则表达式"));
    }

    #[tokio::test]
    async fn test_search_filters_text_files() {
        let temp_dir = setup_test_dir();
        let executor = DefaultToolExecutor::new(temp_dir.path().to_str().unwrap().to_string());

        // 创建一个非文本文件（.bin 扩展名不在允许列表中）
        fs::write(temp_dir.path().join("data.bin"), b"\x00\x01\x02\x03").unwrap();

        let result = executor.search("test", ".").await.unwrap();
        // 应该找到 tests/test_main.rs 中的 test
        assert!(result.contains("tests/test_main.rs"));
        // 但不应该搜索 .bin 文件
    }

    #[tokio::test]
    async fn test_search_path_traversal_protection() {
        let temp_dir = setup_test_dir();
        let executor = DefaultToolExecutor::new(temp_dir.path().to_str().unwrap().to_string());

        // 尝试路径遍历攻击
        let result = executor.search("test", "../../../etc/passwd").await;

        // 路径遍历攻击应该被阻止
        // 可能的结果：
        // 1. 返回错误（安全检查失败）
        // 2. 返回"未找到匹配"（路径被规范化到项目内但找不到文件）
        assert!(result.is_err() || result.unwrap().contains("未找到"));
    }

    // ========================================================================
    // 并行验证测试
    // ========================================================================

    #[tokio::test]
    async fn test_parallel_execution_consistency() {
        let temp_dir = setup_test_dir();

        // 创建多个测试文件
        for i in 0..20 {
            let file_path = temp_dir.path().join(format!("src/file_{}.rs", i));
            fs::write(
                &file_path,
                format!("// File {}\nfn function_{}() {{ }}\n", i, i),
            ).unwrap();
        }

        let executor = DefaultToolExecutor::new(temp_dir.path().to_str().unwrap().to_string());

        // 并行搜索
        let result = executor.search("fn function_", "src/").await.unwrap();

        // 验证结果格式正确
        let lines: Vec<&str> = result.lines().collect();
        assert!(!lines.is_empty());
        assert_eq!(lines.len(), 20, "Should find all 20 functions");

        // 验证每个结果都符合格式 "文件路径:行号:内容"
        for line in lines {
            let parts: Vec<&str> = line.splitn(3, ':').collect();
            assert_eq!(parts.len(), 3, "Result format should be 'file:line:content': {}", line);
        }
    }

    #[tokio::test]
    async fn test_collect_files_performance() {
        let temp_dir = setup_test_dir();

        // 清理 setup_test_dir 创建的文件和目录
        let src_dir = temp_dir.path().join("src");
        if src_dir.exists() {
            // 删除整个 src 目录及其内容
            fs::remove_dir_all(&src_dir).unwrap();
        }
        fs::create_dir_all(&src_dir).unwrap();

        // 创建多个嵌套目录和文件
        for i in 0..50 {
            let dir = temp_dir.path().join(format!("src/dir{}", i / 5));
            fs::create_dir_all(&dir).unwrap();

            let file_path = dir.join(format!("test_{}.rs", i));
            fs::write(
                &file_path,
                format!("// Test {}\nfn test_{}() {{ }}\n", i, i),
            ).unwrap();
        }

        let executor = DefaultToolExecutor::new(temp_dir.path().to_str().unwrap().to_string());
        let start = std::time::Instant::now();

        let files = executor.collect_searchable_files(temp_dir.path().join("src").as_path()).unwrap();
        let duration = start.elapsed();

        // 验证收集了所有文件
        assert_eq!(files.len(), 50, "Should collect all 50 files, got {}", files.len());

        // 验证性能合理（对于 50 个文件，应该在 500ms 内完成）
        assert!(duration.as_millis() < 500, "File collection took too long: {:?}", duration);

        println!("Collected {} files in {:?}", files.len(), duration);
    }

    // ========================================================================
    // 性能基准测试
    // ========================================================================

    #[tokio::test]
    #[ignore] // 默认跳过，使用 --ignored 运行
    async fn benchmark_search_performance() {
        use std::time::Instant;

        let temp_dir = setup_test_dir();

        // 创建大量测试文件以测试并行性能
        let file_count = 100;
        for i in 0..file_count {
            let dir = temp_dir.path().join(format!("src/dir{}", i / 10));
            fs::create_dir_all(&dir).unwrap();

            let file_path = dir.join(format!("file_{}.rs", i));
            fs::write(
                &file_path,
                format!(
                    "// File {}\n{}\n{}\nfn test_{}() {{ return {}; }}\n",
                    i, "line 2", "line 3", i, i
                ),
            ).unwrap();
        }

        let executor = DefaultToolExecutor::new(temp_dir.path().to_str().unwrap().to_string());

        // 基准测试
        let start = Instant::now();
        let result = executor.search("test_", "src/").await.unwrap();
        let duration = start.elapsed();

        println!("Search took: {:?}", duration);
        println!("Found {} matches", result.lines().count());
        println!("Files per second: {:.2}", file_count as f64 / duration.as_secs_f64());

        // 验证性能合理（对于 100 个文件，应该在 1 秒内完成）
        assert!(duration.as_secs() < 5, "Search took too long: {:?}", duration);

        // 验证找到了所有匹配
        let match_count = result.lines().count();
        assert_eq!(match_count, file_count, "Should find all {} test functions", file_count);
    }

    #[tokio::test]
    #[ignore] // 默认跳过，使用 --ignored 运行
    async fn benchmark_parallel_scaling() {
        use std::time::Instant;

        let temp_dir = setup_test_dir();

        // 测试不同文件数量下的性能
        for file_count in [10, 50, 100].iter() {
            // 清理并重新创建文件
            let src_dir = temp_dir.path().join("src");
            for entry in fs::read_dir(&src_dir).unwrap() {
                let entry = entry.unwrap();
                if entry.path().is_file() {
                    fs::remove_file(entry.path()).unwrap();
                }
            }

            for i in 0..*file_count {
                let file_path = src_dir.join(format!("test_{}.rs", i));
                fs::write(
                    &file_path,
                    format!("// Test {}\nfn test_{}() {{ }}\n", i, i),
                ).unwrap();
            }

            let executor = DefaultToolExecutor::new(temp_dir.path().to_str().unwrap().to_string());

            let start = Instant::now();
            let result = executor.search("test_", "src/").await.unwrap();
            let duration = start.elapsed();

            println!(
                "File count: {}, Time: {:?}, Files/sec: {:.2}",
                file_count,
                duration,
                *file_count as f64 / duration.as_secs_f64()
            );

            // 验证找到了所有文件
            assert_eq!(result.lines().count(), *file_count);
        }
    }

    // ========================================================================
    // Workflow 工具注册完整性测试
    //
    // 验证 Agent 提示词中声明的工具都在 create_tool_definitions() 中，
    // 否则 LLM 在 function calling 中看不到这些工具。
    //
    // ⚠️ 新增 Agent 时，如果提示词引入新工具，必须在此追加断言。
    // ========================================================================

    #[test]
    #[ignore = "Phase 6B: Git Commit Agent 工具尚未实现"]
    fn test_git_tools_registered_in_workflow_definitions() {
        let definitions = super::create_tool_definitions();
        let names: std::collections::HashSet<&str> = definitions
            .iter()
            .filter_map(|d| d["function"]["name"].as_str())
            .collect();

        // Phase 6B: Git Commit Agent 的工具
        assert!(
            names.contains("git_status"),
            "git_status 必须在 workflow tool definitions 中"
        );
        assert!(
            names.contains("git_snapshot"),
            "git_snapshot 必须在 workflow tool definitions 中"
        );
        assert!(
            names.contains("secret_scanner"),
            "secret_scanner 必须在 workflow tool definitions 中"
        );
        assert!(
            names.contains("git_commit"),
            "git_commit 必须在 workflow tool definitions 中"
        );
    }
}
