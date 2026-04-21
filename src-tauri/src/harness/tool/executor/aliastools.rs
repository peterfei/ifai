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
    /// v0.5.0: 使用 SmartScanner 极简元编程框架
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

        // 🆕 使用 SmartScanner 极简元编程框架
        use crate::scanners::ExploreScanner;

        // 尝试从配置文件加载，失败则使用默认配置
        let scanner = ExploreScanner::from_config_file("config/agents/explore.yml")
            .unwrap_or_else(|_| ExploreScanner::new());

        // 执行扫描
        let result = scanner.scan_with_cache(&full_path)
            .map_err(|e| ToolError::Execution(format!("Scan failed: {}", e)))?;

        // 返回格式化结果
        Ok(result.to_json()
            .map_err(|e| ToolError::Execution(format!("JSON serialization failed: {}", e)))?)
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
