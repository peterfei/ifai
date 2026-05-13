//! 使用 #[derive(Tool)] 宏实现的 edit_file 工具

use serde_json::Value;
use std::fs;
use std::path::Path;
use tool_macro::Tool;

/// 使用 #[derive(Tool)] 宏的 EditFileTool
#[derive(Tool)]
#[tool(
    name = "edit_file",
    description = "Edit a file by replacing old_text with new_text, with fuzzy matching"
)]
pub struct EditFileTool {
    // 工具没有可配置参数或状态
}

/// edit_file 工具的结果
#[derive(Debug, Clone)]
pub struct EditFileResult {
    /// 文件路径
    pub path: String,
    /// 替换次数
    pub replacement_count: usize,
}

impl EditFileResult {
    /// 格式化为输出字符串（匹配现有实现）
    pub fn to_output_string(&self) -> String {
        format!(
            "Successfully edited file: {}\nReplaced {} occurrence(s)",
            self.path, self.replacement_count
        )
    }
}

/// edit_file 工具的错误类型
#[derive(Debug, Clone)]
pub enum EditFileError {
    /// 缺少必需参数
    MissingParameter(String),
    /// 文件不存在
    FileNotFound(String),
    /// 读取文件失败
    ReadFailed(String),
    /// 写入文件失败
    WriteFailed(String),
    /// old_text 未找到
    OldTextNotFound { old_text_preview: String, file_preview: String },
}

impl std::fmt::Display for EditFileError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            EditFileError::MissingParameter(param) => {
                write!(f, "Missing '{}' parameter", param)
            }
            EditFileError::FileNotFound(path) => {
                write!(f, "File not found: {}", path)
            }
            EditFileError::ReadFailed(msg) => {
                write!(f, "Failed to read file: {}", msg)
            }
            EditFileError::WriteFailed(msg) => {
                write!(f, "Failed to write file: {}", msg)
            }
            EditFileError::OldTextNotFound { old_text_preview, file_preview } => {
                write!(
                    f,
                    "Text to replace not found in file\n\
                     old_text preview: {}\n\
                     File preview (first 500 chars):\n{}\n\
                     Hint: Check for whitespace, indentation, or line ending differences. \
                     Use read_file to verify the exact content before editing.",
                    old_text_preview, file_preview
                )
            }
        }
    }
}

impl EditFileTool {
    /// 执行文件编辑操作
    pub fn execute_edit_file(&self, path: &str, old_text: &str, new_text: &str) -> Result<EditFileResult, EditFileError> {
        let path_obj = Path::new(path);

        // 检查文件是否存在
        if !path_obj.exists() {
            return Err(EditFileError::FileNotFound(path.to_string()));
        }

        // 读取文件内容
        let content = fs::read_to_string(path_obj).map_err(|e| {
            EditFileError::ReadFailed(format!("{}: {}", path, e))
        })?;

        // 尝试匹配 old_text：精确 → 忽略首尾空白 → 逐行忽略空白
        let (actual_old, matched) = Self::find_match(&content, old_text);

        if !matched {
            // 提供诊断信息帮助 LLM 纠正
            let preview = &content[..content.len().min(500)];
            let old_preview = &old_text[..old_text.len().min(200)];
            return Err(EditFileError::OldTextNotFound {
                old_text_preview: old_preview.to_string(),
                file_preview: preview.to_string(),
            });
        }

        // 替换文本（替换所有匹配项）
        let new_content = content.replace(&actual_old, new_text);

        // 写回文件
        fs::write(path_obj, new_content).map_err(|e| {
            EditFileError::WriteFailed(format!("{}: {}", path, e))
        })?;

        // 计算替换次数
        let replacement_count = content.matches(&actual_old).count();

        Ok(EditFileResult {
            path: path.to_string(),
            replacement_count,
        })
    }

    /// 查找匹配的文本（支持模糊匹配）
    fn find_match(content: &str, old_text: &str) -> (String, bool) {
        // 尝试精确匹配
        if content.contains(old_text) {
            return (old_text.to_string(), true);
        }

        // 尝试忽略首尾空白
        let trimmed_old = old_text.trim();
        let trimmed_content = content.trim();
        if trimmed_old.is_empty() {
            return (old_text.to_string(), false);
        }
        if trimmed_content.contains(trimmed_old) {
            // 找到 trimmed 版本在原文中的对应区域（保留原始缩进）
            let trimmed_start = trimmed_content.find(trimmed_old).unwrap();
            // 将 trimmed_content 的偏移映射回 content 的偏移
            let leading_whitespace_len = content.len() - content.trim_start().len();
            let actual_start = leading_whitespace_len + trimmed_start;
            let actual_end = actual_start + trimmed_old.len();
            return (content[actual_start..actual_end].to_string(), true);
        }

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

                    return (content[actual_start..actual_end].to_string(), true);
                }
            }
        }

        (old_text.to_string(), false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_edit_file_tool_creation() {
        let tool = EditFileTool::new();
        assert_eq!(EditFileTool::TOOL_NAME, "edit_file");
        assert!(EditFileTool::TOOL_DESCRIPTION.contains("Edit"));
    }

    #[test]
    fn test_edit_file_exact_match() {
        let temp_dir = TempDir::new().unwrap();
        let test_file = temp_dir.path().join("test.txt");
        fs::write(&test_file, "Hello World\nGoodbye World").unwrap();

        let tool = EditFileTool::new();
        let result = tool.execute_edit_file(test_file.to_str().unwrap(), "World", "Rust");

        assert!(result.is_ok());
        let edit_result = result.unwrap();
        assert_eq!(edit_result.replacement_count, 2);

        // 验证文件已修改
        let content = fs::read_to_string(&test_file).unwrap();
        assert_eq!(content, "Hello Rust\nGoodbye Rust");
    }

    #[test]
    fn test_edit_file_not_found() {
        let tool = EditFileTool::new();
        let result = tool.execute_edit_file("/nonexistent/file.txt", "old", "new");

        assert!(result.is_err());
        match result.unwrap_err() {
            EditFileError::FileNotFound(_) => {},
            _ => panic!("Expected FileNotFound error"),
        }
    }

    #[test]
    fn test_edit_file_old_text_not_found() {
        let temp_dir = TempDir::new().unwrap();
        let test_file = temp_dir.path().join("test.txt");
        fs::write(&test_file, "Hello World").unwrap();

        let tool = EditFileTool::new();
        let result = tool.execute_edit_file(test_file.to_str().unwrap(), "NonExistent", "NewValue");

        assert!(result.is_err());
        match result.unwrap_err() {
            EditFileError::OldTextNotFound { .. } => {},
            _ => panic!("Expected OldTextNotFound error"),
        }
    }

    #[test]
    fn test_edit_file_fuzzy_trim_match() {
        let temp_dir = TempDir::new().unwrap();
        let test_file = temp_dir.path().join("test.txt");
        fs::write(&test_file, "  Hello World\n").unwrap();

        let tool = EditFileTool::new();
        let result = tool.execute_edit_file(test_file.to_str().unwrap(), "Hello World", "Rust");

        assert!(result.is_ok(), "trim match should succeed");

        let content = fs::read_to_string(&test_file).unwrap();
        assert!(content.contains("Rust"));
    }

    #[test]
    fn test_edit_file_result_formatting() {
        let result = EditFileResult {
            path: "/tmp/test.txt".to_string(),
            replacement_count: 3,
        };

        let output = result.to_output_string();
        assert!(output.contains("Successfully edited file"));
        assert!(output.contains("/tmp/test.txt"));
        assert!(output.contains("3 occurrence(s)"));
    }
}
