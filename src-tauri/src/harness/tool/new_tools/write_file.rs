//! 使用 #[derive(Tool)] 宏实现的 write_file 工具

use serde_json::Value;
use std::fs;
use std::path::Path;
use tool_macro::Tool;

/// 使用 #[derive(Tool)] 宏的 WriteFileTool
#[derive(Tool)]
#[tool(
    name = "write_file",
    description = "Write content to a file, creating directories if needed",
    params(path: str, content: str)
)]
pub struct WriteFileTool {
    // 工具没有可配置参数或状态
}

/// write_file 工具的结果
#[derive(Debug, Clone)]
pub struct WriteFileResult {
    /// 文件路径
    pub path: String,
    /// 写入的行数
    pub line_count: usize,
    /// 写入的字符数
    pub char_count: usize,
}

impl WriteFileResult {
    /// 格式化为输出字符串（匹配现有实现）
    pub fn to_output_string(&self) -> String {
        format!(
            "Successfully wrote to file: {}\n{} lines, {} characters",
            self.path, self.line_count, self.char_count
        )
    }
}

/// write_file 工具的错误类型
#[derive(Debug, Clone)]
pub enum WriteFileError {
    /// 缺少必需参数
    MissingParameter(String),
    /// 目录创建失败
    DirectoryCreationFailed(String),
    /// 文件写入失败
    WriteFailed(String),
}

impl std::fmt::Display for WriteFileError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            WriteFileError::MissingParameter(param) => {
                write!(f, "Missing '{}' parameter", param)
            }
            WriteFileError::DirectoryCreationFailed(msg) => {
                write!(f, "Failed to create directory: {}", msg)
            }
            WriteFileError::WriteFailed(msg) => {
                write!(f, "Failed to write file: {}", msg)
            }
        }
    }
}

impl WriteFileTool {
    /// 执行文件写入操作
    pub fn execute_write_file(&self, path: &str, content: &str) -> Result<WriteFileResult, WriteFileError> {
        let path_obj = Path::new(path);

        // 如果父目录不存在，创建父目录
        if let Some(parent) = path_obj.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent).map_err(|e| {
                    WriteFileError::DirectoryCreationFailed(format!("{}: {}", parent.display(), e))
                })?;
            }
        }

        // 写入文件
        fs::write(path_obj, content).map_err(|e| {
            WriteFileError::WriteFailed(format!("{}: {}", path, e))
        })?;

        // 计算行数和字符数
        let line_count = content.lines().count();
        let char_count = content.len();

        Ok(WriteFileResult {
            path: path.to_string(),
            line_count,
            char_count,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_write_file_tool_creation() {
        let tool = WriteFileTool::new();
        assert_eq!(WriteFileTool::TOOL_NAME, "write_file");
        assert!(WriteFileTool::TOOL_DESCRIPTION.contains("Write"));
    }

    #[test]
    fn test_write_file_success() {
        let temp_dir = TempDir::new().unwrap();
        let test_file = temp_dir.path().join("test.txt");

        let tool = WriteFileTool::new();
        let result = tool.execute_write_file(test_file.to_str().unwrap(), "Hello, World!");

        assert!(result.is_ok());
        let write_result = result.unwrap();
        assert_eq!(write_result.line_count, 1);
        assert_eq!(write_result.char_count, 13);

        // 验证文件已写入
        let content = fs::read_to_string(&test_file).unwrap();
        assert_eq!(content, "Hello, World!");
    }

    #[test]
    fn test_write_file_creates_directory() {
        let temp_dir = TempDir::new().unwrap();
        let test_file = temp_dir.path().join("subdir").join("nested").join("file.txt");

        let tool = WriteFileTool::new();
        let result = tool.execute_write_file(test_file.to_str().unwrap(), "Test content");

        assert!(result.is_ok());

        // 验证文件已创建
        assert!(fs::metadata(&test_file).is_ok());
    }

    #[test]
    fn test_write_file_result_formatting() {
        let result = WriteFileResult {
            path: "/tmp/test.txt".to_string(),
            line_count: 3,
            char_count: 42,
        };

        let output = result.to_output_string();
        assert!(output.contains("Successfully wrote to file"));
        assert!(output.contains("/tmp/test.txt"));
        assert!(output.contains("3 lines"));
        assert!(output.contains("42 characters"));
    }

    #[test]
    fn test_write_file_empty_content() {
        let temp_dir = TempDir::new().unwrap();
        let test_file = temp_dir.path().join("empty.txt");

        let tool = WriteFileTool::new();
        let result = tool.execute_write_file(test_file.to_str().unwrap(), "");

        assert!(result.is_ok());
        let write_result = result.unwrap();
        assert_eq!(write_result.line_count, 0);
        assert_eq!(write_result.char_count, 0);
    }
}
