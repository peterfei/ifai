//! 文件操作工具执行器
//!
//! 实现 Read, Write, Edit 文件操作工具。

use serde_json::Value;
use std::collections::HashSet;
use std::fs;
use std::path::Path;

use super::super::{ToolError, ToolExecutor};

/// 文件操作工具执行器
pub struct FileToolsExecutor {
    /// 允许的工具列表
    allowed_tools: HashSet<String>,
}

impl FileToolsExecutor {
    /// 创建新的文件工具执行器
    pub fn new() -> Self {
        let mut allowed_tools = HashSet::new();
        allowed_tools.insert("read_file".to_string());
        allowed_tools.insert("write_file".to_string());
        allowed_tools.insert("edit_file".to_string());

        Self { allowed_tools }
    }

    /// 处理 read_file 工具调用
    fn handle_read_file(&self, input: &Value) -> Result<String, ToolError> {
        let path = input
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ToolError::InvalidInput("Missing 'path' parameter".to_string()))?;

        let path_obj = Path::new(path);

        // 检查文件是否存在
        if !path_obj.exists() {
            return Err(ToolError::Execution(format!(
                "File not found: {}",
                path
            )));
        }

        // 读取文件内容
        let content = fs::read_to_string(path_obj).map_err(|e| {
            ToolError::Execution(format!("Failed to read file '{}': {}", path, e))
        })?;

        // 返回文件内容和路径信息
        Ok(format!(
            "📄 File: {}\n\n{}\n\n---\n📊 Line count: {}",
            path,
            content,
            content.lines().count()
        ))
    }

    /// 处理 write_file 工具调用
    fn handle_write_file(&self, input: &Value) -> Result<String, ToolError> {
        let path = input
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ToolError::InvalidInput("Missing 'path' parameter".to_string()))?;

        let content = input
            .get("content")
            .and_then(|v| v.as_str())
            .ok_or_else(|| {
                ToolError::InvalidInput("Missing 'content' parameter".to_string())
            })?;

        let path_obj = Path::new(path);

        // 如果父目录不存在，创建父目录
        if let Some(parent) = path_obj.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent).map_err(|e| {
                    ToolError::Execution(format!(
                        "Failed to create directory '{}': {}",
                        parent.display(),
                        e
                    ))
                })?;
            }
        }

        // 写入文件
        fs::write(path_obj, content).map_err(|e| {
            ToolError::Execution(format!("Failed to write file '{}': {}", path, e))
        })?;

        // 返回成功消息
        let line_count = content.lines().count();
        let char_count = content.len();
        Ok(format!(
            "✅ Successfully wrote to file: {}\n📊 {} lines, {} characters",
            path,
            line_count,
            char_count
        ))
    }

    /// 处理 edit_file 工具调用
    fn handle_edit_file(&self, input: &Value) -> Result<String, ToolError> {
        let path = input
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ToolError::InvalidInput("Missing 'path' parameter".to_string()))?;

        let old_text = input
            .get("old_text")
            .and_then(|v| v.as_str())
            .ok_or_else(|| {
                ToolError::InvalidInput("Missing 'old_text' parameter".to_string())
            })?;

        let new_text = input
            .get("new_text")
            .and_then(|v| v.as_str())
            .ok_or_else(|| {
                ToolError::InvalidInput("Missing 'new_text' parameter".to_string())
            })?;

        let path_obj = Path::new(path);

        // 检查文件是否存在
        if !path_obj.exists() {
            return Err(ToolError::Execution(format!(
                "File not found: {}",
                path
            )));
        }

        // 读取文件内容
        let content = fs::read_to_string(path_obj).map_err(|e| {
            ToolError::Execution(format!("Failed to read file '{}': {}", path, e))
        })?;

        // 检查 old_text 是否存在
        if !content.contains(old_text) {
            return Err(ToolError::Execution(format!(
                "Text to replace not found in file: {}",
                path
            )));
        }

        // 替换文本（替换所有匹配项）
        let new_content = content.replace(old_text, new_text);

        // 写回文件
        fs::write(path_obj, new_content).map_err(|e| {
            ToolError::Execution(format!("Failed to write file '{}': {}", path, e))
        })?;

        // 返回成功消息
        let replacements = content.matches(old_text).count();
        Ok(format!(
            "✅ Successfully edited file: {}\n🔄 Replaced {} occurrence(s)",
            path, replacements
        ))
    }
}

impl ToolExecutor for FileToolsExecutor {
    fn execute(&mut self, name: &str, input: &Value) -> Result<String, ToolError> {
        match name {
            "read_file" => self.handle_read_file(input),
            "write_file" => self.handle_write_file(input),
            "edit_file" => self.handle_edit_file(input),
            _ => Err(ToolError::NotFound {
                name: name.to_string(),
            }),
        }
    }

    fn is_available(&self, name: &str) -> bool {
        self.allowed_tools.contains(name)
    }

    fn allowed_tools(&self) -> &HashSet<String> {
        &self.allowed_tools
    }
}

impl Default for FileToolsExecutor {
    fn default() -> Self {
        Self::new()
    }
}

// ============ 测试 ============

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn create_test_file(dir: &TempDir, name: &str, content: &str) -> String {
        let file_path = dir.path().join(name);
        fs::write(&file_path, content).unwrap();
        file_path.to_string_lossy().to_string()
    }

    #[test]
    fn test_read_file_success() {
        let temp_dir = TempDir::new().unwrap();
        let test_file = create_test_file(&temp_dir, "test.txt", "Hello, World!");

        let mut executor = FileToolsExecutor::new();
        let input = serde_json::json!({
            "path": test_file
        });

        let result = executor.execute("read_file", &input);
        assert!(result.is_ok());

        let output = result.unwrap();
        assert!(output.contains("Hello, World!"));
        assert!(output.contains("Line count: 1"));
    }

    #[test]
    fn test_read_file_not_found() {
        let mut executor = FileToolsExecutor::new();
        let input = serde_json::json!({
            "path": "/nonexistent/file.txt"
        });

        let result = executor.execute("read_file", &input);
        assert!(result.is_err());
    }

    #[test]
    fn test_write_file_success() {
        let temp_dir = TempDir::new().unwrap();
        let test_file = temp_dir.path().join("new.txt").to_string_lossy().to_string();

        let mut executor = FileToolsExecutor::new();
        let input = serde_json::json!({
            "path": test_file,
            "content": "New content\nLine 2"
        });

        let result = executor.execute("write_file", &input);
        assert!(result.is_ok());

        let output = result.unwrap();
        assert!(output.contains("Successfully wrote to file"));
        assert!(output.contains("2 lines"));

        // 验证文件已写入
        let content = fs::read_to_string(&test_file).unwrap();
        assert_eq!(content, "New content\nLine 2");
    }

    #[test]
    fn test_write_file_creates_directory() {
        let temp_dir = TempDir::new().unwrap();
        let test_file = temp_dir
            .path()
            .join("subdir")
            .join("nested")
            .join("file.txt")
            .to_string_lossy()
            .to_string();

        let mut executor = FileToolsExecutor::new();
        let input = serde_json::json!({
            "path": test_file,
            "content": "Test content"
        });

        let result = executor.execute("write_file", &input);
        assert!(result.is_ok());
        assert!(fs::metadata(&test_file).is_ok());
    }

    #[test]
    fn test_edit_file_success() {
        let temp_dir = TempDir::new().unwrap();
        let test_file = create_test_file(&temp_dir, "edit.txt", "Hello World\nGoodbye World");

        let mut executor = FileToolsExecutor::new();
        let input = serde_json::json!({
            "path": test_file,
            "old_text": "World",
            "new_text": "Rust"
        });

        let result = executor.execute("edit_file", &input);
        assert!(result.is_ok());

        let output = result.unwrap();
        assert!(output.contains("2 occurrence(s)"));

        // 验证文件已修改
        let content = fs::read_to_string(&test_file).unwrap();
        assert_eq!(content, "Hello Rust\nGoodbye Rust");
    }

    #[test]
    fn test_edit_file_old_text_not_found() {
        let temp_dir = TempDir::new().unwrap();
        let test_file = create_test_file(&temp_dir, "edit.txt", "Hello World");

        let mut executor = FileToolsExecutor::new();
        let input = serde_json::json!({
            "path": test_file,
            "old_text": "NonExistent",
            "new_text": "NewValue"
        });

        let result = executor.execute("edit_file", &input);
        assert!(result.is_err());
    }

    #[test]
    fn test_allowed_tools() {
        let mut executor = FileToolsExecutor::new();
        assert!(executor.is_available("read_file"));
        assert!(executor.is_available("write_file"));
        assert!(executor.is_available("edit_file"));
        assert!(!executor.is_available("bash"));
    }

    #[test]
    fn test_execute_unknown_tool() {
        let mut executor = FileToolsExecutor::new();
        let input = serde_json::json!({});

        let result = executor.execute("unknown_tool", &input);
        assert!(matches!(result, Err(ToolError::NotFound { .. })));
    }

    #[test]
    fn test_read_file_missing_path() {
        let mut executor = FileToolsExecutor::new();
        let input = serde_json::json!({});

        let result = executor.execute("read_file", &input);
        assert!(matches!(result, Err(ToolError::InvalidInput { .. })));
    }
}
