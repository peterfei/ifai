//! Git Diff 工具 - 使用 #[derive(Tool)] 宏
//!
//! 获取 Git 差异信息，用于代码审查工作流。
//! base 为必填参数，path_filter 通过内部方法支持（宏不支持可选参数）。

use tool_macro::Tool;

/// Git Diff 工具
///
/// 获取指定基准提交以来的代码变更差异
#[derive(Tool)]
#[tool(
    name = "git_diff",
    description = "获取 Git 差异信息，只需传入基准提交（如 HEAD~1, main）。返回代码变更内容。",
    params(base: str)
)]
pub struct GitDiffTool {
    #[tool(config)]
    /// 上下文行数
    context_lines: u64,

    #[tool(state)]
    /// 已执行 diff 次数
    total_diffs: usize,
}

impl GitDiffTool {
    /// 宏生成的入口方法（只接受 base）
    pub fn execute_git_diff(&self, base: &str) -> Result<GitDiffOutput, GitDiffError> {
        self.diff_with_filter(base, "")
    }

    /// 带路径过滤的 diff（供 code_review 等内部调用）
    pub fn diff_with_filter(&self, base: &str, path_filter: &str) -> Result<GitDiffOutput, GitDiffError> {
        let mut cmd = std::process::Command::new("git");
        cmd.arg("diff");
        // 使用 -U 短格式（--context=N 与 .. 范围语法冲突）
        cmd.arg(format!("-U{}", self.context_lines));
        // 使用 commit range 语法（base..HEAD），避免工作树状态影响结果
        cmd.arg(format!("{}..HEAD", base));

        if !path_filter.is_empty() {
            cmd.arg("--");
            cmd.arg(path_filter);
        }

        let output = cmd.output().map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                GitDiffError::GitNotFound("git command not found in PATH".to_string())
            } else {
                GitDiffError::CommandFailed(format!("Failed to execute git diff: {}", e))
            }
        })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            if stderr.contains("fatal:") || stderr.contains("error:") {
                return Err(GitDiffError::CommandFailed(stderr.trim().to_string()));
            }
        }

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();

        if stdout.is_empty() {
            return Ok(GitDiffOutput("No changes found.".to_string()));
        }

        Ok(GitDiffOutput(stdout))
    }
}

/// Git Diff 执行结果
#[derive(Debug, Clone)]
pub struct GitDiffOutput(pub String);

impl GitDiffOutput {
    /// 格式化输出
    pub fn to_output_string(&self) -> String {
        self.to_string()
    }
}

impl std::fmt::Display for GitDiffOutput {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// Git Diff 错误
#[derive(Debug, thiserror::Error)]
pub enum GitDiffError {
    #[error("Git not found: {0}")]
    GitNotFound(String),

    #[error("Git command failed: {0}")]
    CommandFailed(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_macro_attributes() {
        assert_eq!(GitDiffTool::TOOL_NAME, "git_diff");
        assert!(GitDiffTool::TOOL_DESCRIPTION.contains("Git"));
        assert_eq!(GitDiffTool::get_name(), "git_diff");
    }

    #[test]
    fn test_constructor() {
        let tool = GitDiffTool::new(5, 0);
        assert_eq!(tool.context_lines, 5);
        assert_eq!(tool.total_diffs, 0);
    }

    #[test]
    fn test_git_diff_in_repo() {
        let tool = GitDiffTool::new(5, 0);
        let result = tool.execute_git_diff("HEAD~1");
        assert!(result.is_ok());
        let text = result.unwrap().to_output_string();
        assert!(text.contains("diff --git") || text.contains("No changes found"));
    }

    #[test]
    fn test_git_diff_with_path_filter() {
        let tool = GitDiffTool::new(3, 0);
        let result = tool.diff_with_filter("HEAD~1", "src-tauri/src/harness");
        assert!(result.is_ok());
    }

    #[test]
    fn test_git_diff_invalid_base() {
        let tool = GitDiffTool::new(5, 0);
        let result = tool.execute_git_diff("INVALID_REF_12345");
        match result {
            Err(GitDiffError::CommandFailed(msg)) => {
                assert!(msg.contains("invalid") || msg.contains("unknown") || msg.contains("bad"));
            },
            other => panic!("Expected CommandFailed error, got: {:?}", other),
        }
    }

    #[test]
    fn test_git_diff_only_base_no_filter() {
        // 模拟 LLM 只传 base，不传 path_filter
        let tool = GitDiffTool::new(5, 0);
        let result = tool.execute_git_diff("HEAD~1");
        assert!(result.is_ok());
    }

    #[test]
    fn test_error_display() {
        let err = GitDiffError::GitNotFound("not in PATH".to_string());
        let msg = format!("{}", err);
        assert!(msg.contains("not in PATH"));

        let err = GitDiffError::CommandFailed("fatal: ambiguous argument".to_string());
        let msg = format!("{}", err);
        assert!(msg.contains("fatal: ambiguous"));
    }
}
