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
            return Err(ToolError::Execution(format!("File not found: {}", path)));
        }

        // 读取文件内容
        let content = fs::read_to_string(path_obj)
            .map_err(|e| ToolError::Execution(format!("Failed to read file '{}': {}", path, e)))?;

        // 返回文件内容和路径信息
        Ok(format!(
            "File: {}\n\n{}\n\n---\nLine count: {}",
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
            .ok_or_else(|| ToolError::InvalidInput("Missing 'content' parameter".to_string()))?;

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
        fs::write(path_obj, content)
            .map_err(|e| ToolError::Execution(format!("Failed to write file '{}': {}", path, e)))?;

        // 返回成功消息
        let line_count = content.lines().count();
        let char_count = content.len();
        Ok(format!(
            "Successfully wrote to file: {}\n{} lines, {} characters",
            path, line_count, char_count
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
            .ok_or_else(|| ToolError::InvalidInput("Missing 'old_text' parameter".to_string()))?;

        let new_text = input
            .get("new_text")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ToolError::InvalidInput("Missing 'new_text' parameter".to_string()))?;

        let path_obj = Path::new(path);

        // 检查文件是否存在
        if !path_obj.exists() {
            return Err(ToolError::Execution(format!("File not found: {}", path)));
        }

        // 读取文件内容
        let content = fs::read_to_string(path_obj)
            .map_err(|e| ToolError::Execution(format!("Failed to read file '{}': {}", path, e)))?;

        // 尝试匹配 old_text：精确 → 忽略首尾空白 → 逐行忽略空白
        let (actual_old, matched) = if content.contains(old_text) {
            (old_text.to_string(), true)
        } else {
            // 尝试忽略首尾空白
            let trimmed_old = old_text.trim();
            let trimmed_content = content.trim();
            if trimmed_old.is_empty() {
                return Err(ToolError::Execution(format!(
                    "old_text is empty or whitespace-only, cannot match in file: {}",
                    path
                )));
            }
            if trimmed_content.contains(trimmed_old) {
                // 找到 trimmed 版本在原文中的对应区域（保留原始缩进）
                let trimmed_start = trimmed_content.find(trimmed_old).unwrap();
                // 将 trimmed_content 的偏移映射回 content 的偏移
                let leading_whitespace_len = content.len() - content.trim_start().len();
                let actual_start = leading_whitespace_len + trimmed_start;
                let actual_end = actual_start + trimmed_old.len();
                (content[actual_start..actual_end].to_string(), true)
            } else {
                // 尝试逐行匹配（忽略行尾空白和缩进差异）
                let old_lines: Vec<&str> = old_text.lines().collect();
                if old_lines.len() >= 2 {
                    // 取 old_text 的中间行（跳过可能缩进不同的首行和末行空白行）
                    let mid_idx = old_lines.len() / 2;
                    let mid_line = old_lines[mid_idx].trim();
                    if !mid_line.is_empty() && content.contains(mid_line) {
                        // 找到中间行在文件中的位置，然后尝试扩展匹配
                        if let Some(mid_pos) = content.find(mid_line) {
                            // 向上向下扩展匹配
                            let before_mid = &content[..mid_pos];
                            let after_mid = &content[mid_pos + mid_line.len()..];
                            let mut actual_start = mid_pos;
                            let mut actual_end = mid_pos + mid_line.len();

                            // 向上匹配
                            for (i, line) in old_lines[..mid_idx].iter().rev().enumerate() {
                                let trimmed = line.trim();
                                if trimmed.is_empty() {
                                    continue;
                                }
                                if let Some(pos) = before_mid.rfind(trimmed) {
                                    actual_start = pos;
                                } else {
                                    break;
                                }
                            }

                            // 向下匹配
                            let remaining_after = &content[actual_end..];
                            for line in &old_lines[mid_idx + 1..] {
                                let trimmed = line.trim();
                                if trimmed.is_empty() {
                                    continue;
                                }
                                if let Some(pos) = remaining_after.find(trimmed) {
                                    actual_end += pos + trimmed.len();
                                } else {
                                    break;
                                }
                            }

                            (content[actual_start..actual_end].to_string(), true)
                        } else {
                            (old_text.to_string(), false)
                        }
                    } else {
                        (old_text.to_string(), false)
                    }
                } else {
                    (old_text.to_string(), false)
                }
            }
        };

        if !matched {
            // 提供诊断信息帮助 LLM 纠正
            let preview = &content[..content.len().min(500)];
            return Err(ToolError::Execution(format!(
                "Text to replace not found in file: {}\n\
                 old_text preview: {}\n\
                 File preview (first 500 chars):\n{}\n\
                 Hint: Check for whitespace, indentation, or line ending differences. \
                 Use read_file to verify the exact content before editing.",
                path,
                &old_text[..old_text.len().min(200)],
                preview
            )));
        }

        // 替换文本（替换所有匹配项）
        let new_content = content.replace(&actual_old, new_text);

        // 写回文件
        fs::write(path_obj, new_content)
            .map_err(|e| ToolError::Execution(format!("Failed to write file '{}': {}", path, e)))?;

        // 返回成功消息
        let replacements = content.matches(&actual_old).count();
        Ok(format!(
            "Successfully edited file: {}\nReplaced {} occurrence(s)",
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
        let test_file = temp_dir
            .path()
            .join("new.txt")
            .to_string_lossy()
            .to_string();

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
        let err = result.unwrap_err().to_string();
        // 验证错误信息包含诊断提示
        assert!(
            err.contains("old_text preview"),
            "error should include old_text preview: {}",
            err
        );
        assert!(
            err.contains("File preview"),
            "error should include file preview: {}",
            err
        );
        assert!(err.contains("Hint:"), "error should include hint: {}", err);
    }

    #[test]
    fn test_edit_file_fuzzy_trim_match() {
        // LLM 生成的 old_text 有多余的首尾空白时，应该通过 trim 匹配
        let temp_dir = TempDir::new().unwrap();
        let test_file = create_test_file(&temp_dir, "edit.txt", "  Hello World\n");

        let mut executor = FileToolsExecutor::new();
        let input = serde_json::json!({
            "path": test_file,
            "old_text": "Hello World",
            "new_text": "Rust"
        });

        let result = executor.execute("edit_file", &input);
        assert!(result.is_ok(), "trim match should succeed: {:?}", result);
        let content = fs::read_to_string(&test_file).unwrap();
        assert!(content.contains("Rust"));
    }

    #[test]
    fn test_edit_file_fuzzy_line_match() {
        // LLM 生成的 old_text 缩进不同时，通过中间行匹配
        let temp_dir = TempDir::new().unwrap();
        let test_file = create_test_file(
            &temp_dir,
            "edit.txt",
            "function hello() {\n    console.log('hi');\n    return true;\n}",
        );

        let mut executor = FileToolsExecutor::new();
        // LLM 可能把缩进搞错了
        let input = serde_json::json!({
            "path": test_file,
            "old_text": "function hello() {\n  console.log('hi');\n  return true;\n}",
            "new_text": "function hello() {\n  console.log('bye');\n  return false;\n}"
        });

        let result = executor.execute("edit_file", &input);
        // 中间行 "console.log('hi')" 可以匹配到，应该成功
        assert!(
            result.is_ok(),
            "line-level fuzzy match should succeed: {:?}",
            result
        );
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
