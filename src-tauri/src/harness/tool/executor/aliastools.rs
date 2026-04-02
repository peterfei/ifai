//! Agent 工具别名执行器
//!
//! 将旧的 agent_* 工具映射到新的 P3 工具系统，提供向后兼容性。
//! 支持 agent_read_file, agent_write_file, agent_list_dir, agent_scan_project。

use serde_json::{json, Map, Value};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
use tokio::runtime::Handle;

use super::super::{ToolError, ToolExecutor};

/// Agent 工具别名执行器
///
/// 将旧的 agent_* 工具调用映射到新的 P3 工具实现，
/// 同时保持对相对路径的支持。
pub struct AliasExecutor {
    /// 允许的工具列表
    allowed_tools: HashSet<String>,
    /// 项目根目录（用于解析相对路径）
    project_root: Arc<RwLock<Option<String>>>,
    /// Tokio runtime handle（用于 spawn_blocking）
    runtime_handle: Arc<RwLock<Option<Handle>>>,
}

impl Clone for AliasExecutor {
    fn clone(&self) -> Self {
        Self {
            allowed_tools: self.allowed_tools.clone(),
            project_root: Arc::clone(&self.project_root),
            runtime_handle: Arc::clone(&self.runtime_handle),
        }
    }
}

impl AliasExecutor {
    /// 创建新的 Alias 执行器
    pub fn new() -> Self {
        let mut allowed_tools = HashSet::new();
        allowed_tools.insert("agent_read_file".to_string());
        allowed_tools.insert("agent_write_file".to_string());
        allowed_tools.insert("agent_list_dir".to_string());
        allowed_tools.insert("agent_scan_project".to_string());

        Self {
            allowed_tools,
            project_root: Arc::new(RwLock::new(None)),
            runtime_handle: Arc::new(RwLock::new(None)),
        }
    }

    /// 设置项目根目录
    pub fn set_project_root(&self, root: String) {
        if let Ok(mut guard) = self.project_root.write() {
            *guard = Some(root);
        }
    }

    /// 设置 tokio runtime handle
    pub fn set_runtime_handle(&self, handle: Handle) {
        if let Ok(mut guard) = self.runtime_handle.write() {
            *guard = Some(handle);
        }
    }

    /// 获取项目根目录（优先使用本地，否则使用全局）
    fn get_project_root(&self) -> Result<String, ToolError> {
        // 先尝试本地 project_root
        let guard = self.project_root.read()
            .map_err(|e| ToolError::Execution(format!("Lock error: {}", e)))?;

        if let Some(root) = guard.as_ref() {
            return Ok(root.clone());
        }

        drop(guard);

        // 尝试全局 project_root
        if let Some(root) = super::super::router::get_global_project_root() {
            return Ok(root);
        }

        Err(ToolError::Execution(
            "project_root not set. Use set_project_root() first.".to_string()
        ))
    }

    /// 解析相对路径为绝对路径
    ///
    /// - 绝对路径：直接返回
    /// - 相对路径：添加 project_root 前缀
    fn resolve_path(&self, rel_path: &str) -> Result<PathBuf, ToolError> {
        let path = Path::new(rel_path);

        // 如果是绝对路径，直接返回
        if path.is_absolute() {
            return Ok(path.to_path_buf());
        }

        // 获取 project_root
        let root = self.get_project_root()?;

        // 拼接路径
        let full_path = Path::new(&root).join(rel_path);

        Ok(full_path)
    }

    /// 处理 agent_read_file 工具调用
    ///
    /// 映射到 read_file，支持相对路径
    fn handle_agent_read_file(&self, input: &Value) -> Result<String, ToolError> {
        let rel_path = input
            .get("rel_path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ToolError::InvalidInput("Missing 'rel_path' parameter".to_string()))?;

        let _full_path = self.resolve_path(rel_path)?;

        // 使用 file_cache 读取（如果可用）
        #[cfg(feature = "commercial")]
        {
            // 商业版：使用 ifainew_core
            return Err(ToolError::Execution(
                "agent_read_file in commercial mode should use ifainew_core".to_string()
            ));
        }

        #[cfg(not(feature = "commercial"))]
        {
            // 社区版：使用 file_cache（直接同步调用，不需要 runtime）
            let root = self.get_project_root()?;

            // 🔧 FIX: 直接使用 fs::read_to_string 而不是 file_cache
            // 因为 file_cache 是 async 的，会导致 runtime 问题
            let full_path = Path::new(&root).join(rel_path);
            let content = fs::read_to_string(&full_path)
                .map_err(|e| ToolError::Execution(format!("Failed to read file: {}", e)))?;

            // 返回格式化结果（兼容旧格式）
            Ok(json!({
                "content": content,
                "path": rel_path,
                "line_count": content.lines().count()
            }).to_string())
        }
    }

    /// 处理 agent_write_file 工具调用
    ///
    /// 映射到 write_file，支持相对路径，返回 diff 数据
    fn handle_agent_write_file(&self, input: &Value) -> Result<String, ToolError> {
        let rel_path = input
            .get("rel_path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ToolError::InvalidInput("Missing 'rel_path' parameter".to_string()))?;

        let content = input
            .get("content")
            .and_then(|v| v.as_str())
            .ok_or_else(|| {
                ToolError::InvalidInput("Missing 'content' parameter".to_string())
            })?;

        let full_path = self.resolve_path(rel_path)?;

        // 读取原始内容（用于 diff）
        let original_content = if full_path.exists() {
            Some(fs::read_to_string(&full_path).unwrap_or_default())
        } else {
            None
        };

        // 创建父目录
        if let Some(parent) = full_path.parent() {
            fs::create_dir_all(parent).map_err(|e| {
                ToolError::Execution(format!("Failed to create directory: {}", e))
            })?;
        }

        // 写入新内容
        fs::write(&full_path, content).map_err(|e| {
            ToolError::Execution(format!("Failed to write file '{}': {}", full_path.display(), e))
        })?;

        // 🔧 FIX: 不使用 invalidate_cache，避免 async 调用

        // 获取时间戳
        use std::time::{SystemTime, UNIX_EPOCH};
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        // 返回格式化结果（包含 diff 数据）
        Ok(json!({
            "success": true,
            "message": "File written successfully",
            "originalContent": original_content,
            "newContent": content,
            "filePath": rel_path,
            "timestamp": timestamp
        }).to_string())
    }

    /// 处理 agent_list_dir 工具调用
    ///
    /// 列出目录内容
    fn handle_agent_list_dir(&self, input: &Value) -> Result<String, ToolError> {
        let rel_path = input
            .get("rel_path")
            .and_then(|v| v.as_str())
            .unwrap_or(".");

        let full_path = self.resolve_path(rel_path)?;

        // 读取目录
        let mut entries = Vec::new();
        let read_dir = fs::read_dir(&full_path).map_err(|e| {
            ToolError::Execution(format!("Failed to read directory '{}': {}", full_path.display(), e))
        })?;

        for entry in read_dir {
            if let Ok(entry) = entry {
                if let Ok(name) = entry.file_name().into_string() {
                    entries.push(name);
                }
            }
        }

        // 返回 JSON 数组
        Ok(json!(entries).to_string())
    }

    /// 处理 agent_scan_project 工具调用
    ///
    /// 扫描项目结构，返回文件树和关键文件
    fn handle_agent_scan_project(&self, input: &Value) -> Result<String, ToolError> {
        let rel_path = input
            .get("rel_path")
            .and_then(|v| v.as_str())
            .unwrap_or(".");

        let max_depth = input
            .get("max_depth")
            .and_then(|v| v.as_u64())
            .unwrap_or(3) as usize;

        let full_path = self.resolve_path(rel_path)?;

        // 忽略的目录
        let ignore_dirs = vec![
            "node_modules", "target", "dist", "build", ".git",
            "vendor", "env", "venv", "__pycache__",
            ".next", ".nuxt", "coverage",
        ];

        // 忽略的文件
        let ignore_files = vec![
            ".DS_Store", "Thumbs.db", "*.lock", "*.pyc",
        ];

        // 扫描目录
        let mut structure = Map::new();
        let mut key_files = Vec::new();

        self.scan_dir_recursive(
            &full_path,
            "",
            0,
            max_depth,
            &ignore_dirs,
            &ignore_files,
            &mut structure,
            &mut key_files,
        ).map_err(|e| ToolError::Execution(format!("Scan failed: {}", e)))?;

        // 返回格式化结果
        Ok(json!({
            "structure": structure,
            "key_files": key_files
        }).to_string())
    }

    /// 递归扫描目录
    fn scan_dir_recursive(
        &self,
        base_path: &Path,
        rel_path: &str,
        current_depth: usize,
        max_depth: usize,
        ignore_dirs: &[&str],
        ignore_files: &[&str],
        structure: &mut Map<String, Value>,
        key_files: &mut Vec<String>,
    ) -> Result<(), std::io::Error> {
        if current_depth >= max_depth {
            return Ok(());
        }

        let full_path = base_path.join(rel_path);

        if !full_path.is_dir() {
            return Ok(());
        }

        let mut entries = Vec::new();

        for entry in fs::read_dir(&full_path)? {
            let entry = entry?;
            let name = entry.file_name();
            let name_str = name.to_string_lossy().to_string();

            // 跳过忽略的目录和文件
            if ignore_dirs.contains(&name_str.as_str()) {
                continue;
            }
            if ignore_files.iter().any(|f| name_str.ends_with(f)) {
                continue;
            }

            let entry_path = entry.path();
            let new_rel_path = if rel_path.is_empty() {
                name_str.clone()
            } else {
                format!("{}/{}", rel_path, name_str)
            };

            if entry_path.is_dir() {
                // 递归扫描子目录
                let mut subdir = Map::new();
                self.scan_dir_recursive(
                    base_path,
                    &new_rel_path,
                    current_depth + 1,
                    max_depth,
                    ignore_dirs,
                    ignore_files,
                    &mut subdir,
                    key_files,
                )?;

                entries.push((name_str, Value::Object(subdir)));
            } else {
                // 收集关键文件
                if self.is_key_file(&name_str) {
                    key_files.push(new_rel_path.clone());
                }

                entries.push((name_str, Value::String("file".to_string())));
            }
        }

        // 排序并构建结构
        entries.sort_by(|a, b| a.0.cmp(&b.0));

        // 目录优先
        entries.sort_by(|a, b| {
            let a_is_dir = matches!(&a.1, Value::Object(_));
            let b_is_dir = matches!(&b.1, Value::Object(_));
            b_is_dir.cmp(&a_is_dir)
                .then_with(|| a.0.cmp(&b.0))
        });

        for (name, value) in entries {
            structure.insert(name, value);
        }

        Ok(())
    }

    /// 判断是否为关键文件
    fn is_key_file(&self, filename: &str) -> bool {
        let key_extensions = vec![
            "rs", "go", "py", "js", "ts", "tsx", "jsx",
            "java", "cpp", "c", "h", "cs", "php", "rb",
            "vue", "svelte", "astro",
            "toml", "yaml", "yml", "json", "xml",
            "md", "txt", "dockerfile",
        ];

        if let Some(ext) = filename.rsplit('.').next() {
            key_extensions.contains(&ext)
        } else {
            // 无扩展名的文件（如 Dockerfile, Makefile）
            matches!(filename, "Dockerfile" | "Makefile" | "Cargo.toml" | "go.mod" | "package.json")
        }
    }
}

impl ToolExecutor for AliasExecutor {
    /// 执行工具
    fn execute(&mut self, name: &str, input: &Value) -> Result<String, ToolError> {
        match name {
            "agent_read_file" => self.handle_agent_read_file(input),
            "agent_write_file" => self.handle_agent_write_file(input),
            "agent_list_dir" => self.handle_agent_list_dir(input),
            "agent_scan_project" => self.handle_agent_scan_project(input),
            _ => Err(ToolError::NotFound { name: name.to_string() }),
        }
    }

    /// 检查工具是否可用
    fn is_available(&self, _name: &str) -> bool {
        true
    }

    /// 获取允许的工具列表
    fn allowed_tools(&self) -> &HashSet<String> {
        &self.allowed_tools
    }
}

impl Default for AliasExecutor {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_alias_executor_has_all_tools() {
        let executor = AliasExecutor::new();
        let tools = executor.allowed_tools();

        assert!(tools.contains(&"agent_read_file".to_string()));
        assert!(tools.contains(&"agent_write_file".to_string()));
        assert!(tools.contains(&"agent_list_dir".to_string()));
        assert!(tools.contains(&"agent_scan_project".to_string()));
    }
}
