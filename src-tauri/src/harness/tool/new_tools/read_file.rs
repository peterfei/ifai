//! 使用 #[derive(Tool)] 宏实现的 read_file 工具
//!
//! 这是使用新的元编程工具系统重构的第一个实际工具。

use serde_json::Value;
use std::fs;
use std::path::Path;
use tool_macro::Tool;

/// 使用 #[derive(Tool)] 宏的 ReadFileTool
#[derive(Tool)]
#[tool(
    name = "read_file",
    description = "Read the contents of a file from disk"
)]
pub struct ReadFileTool {
    // 工具没有可配置参数或状态，保持简单
}

/// read_file 工具的结果
#[derive(Debug, Clone)]
pub struct ReadFileResult {
    /// 文件路径
    pub path: String,
    /// 文件内容
    pub content: String,
    /// 行数
    pub line_count: usize,
}

impl ReadFileResult {
    /// 格式化为输出字符串（匹配现有实现）
    pub fn to_output_string(&self) -> String {
        format!(
            "File: {}\n\n{}\n\n---\nLine count: {}",
            self.path, self.content, self.line_count
        )
    }
}

/// read_file 工具的错误类型
#[derive(Debug, Clone)]
pub enum ReadFileError {
    /// 文件不存在
    FileNotFound(String),
    /// 读取失败
    ReadFailed(String),
}

impl std::fmt::Display for ReadFileError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ReadFileError::FileNotFound(path) => write!(f, "File not found: {}", path),
            ReadFileError::ReadFailed(msg) => write!(f, "Failed to read file: {}", msg),
        }
    }
}

impl ReadFileTool {
    /// 执行文件读取操作
    pub fn execute_read_file(&self, path: &str) -> Result<ReadFileResult, ReadFileError> {
        let path_obj = Path::new(path);

        // 检查文件是否存在
        if !path_obj.exists() {
            return Err(ReadFileError::FileNotFound(path.to_string()));
        }

        // 读取文件内容
        let content = fs::read_to_string(path_obj).map_err(|e| {
            ReadFileError::ReadFailed(format!("{}: {}", path, e))
        })?;

        // 计算行数
        let line_count = content.lines().count();

        Ok(ReadFileResult {
            path: path.to_string(),
            content,
            line_count,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_read_file_tool_creation() {
        let tool = ReadFileTool::new();
        assert_eq!(ReadFileTool::TOOL_NAME, "read_file");
        assert!(ReadFileTool::TOOL_DESCRIPTION.contains("Read"));
    }

    #[test]
    fn test_read_file_success() {
        let temp_dir = TempDir::new().unwrap();
        let test_file = temp_dir.path().join("test.txt");
        fs::write(&test_file, "Hello, World!").unwrap();

        let tool = ReadFileTool::new();
        let result = tool.execute_read_file(test_file.to_str().unwrap());

        assert!(result.is_ok());
        let read_result = result.unwrap();
        assert_eq!(read_result.content, "Hello, World!");
        assert_eq!(read_result.line_count, 1);
    }

    #[test]
    fn test_read_file_not_found() {
        let tool = ReadFileTool::new();
        let result = tool.execute_read_file("/nonexistent/file.txt");

        assert!(result.is_err());
        match result.unwrap_err() {
            ReadFileError::FileNotFound(_) => {},
            _ => panic!("Expected FileNotFound error"),
        }
    }

    #[test]
    fn test_read_file_result_formatting() {
        let result = ReadFileResult {
            path: "/tmp/test.txt".to_string(),
            content: "Line 1\nLine 2".to_string(),
            line_count: 2,
        };

        let output = result.to_output_string();
        assert!(output.contains("File: /tmp/test.txt"));
        assert!(output.contains("Line 1"));
        assert!(output.contains("Line 2"));
        assert!(output.contains("Line count: 2"));
        assert!(output.contains("---"));
    }
}
