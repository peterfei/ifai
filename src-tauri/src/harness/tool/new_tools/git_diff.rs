//! Git Diff 工具 - 使用 #[derive(Tool)] 宏
//!
//! 获取 Git 差异信息，用于代码审查工作流。
//! 支持指定基准提交和文件路径过滤。

use tool_macro::Tool;

/// Git Diff 工具
///
/// 获取指定基准提交以来的代码变更差异
#[derive(Tool)]
#[tool(
    name = "git_diff",
    description = "获取 Git 差异信息，支持指定基准提交和文件路径过滤",
    params(base: str, path_filter: str)
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
    /// 执行 git diff 命令
    pub fn execute_git_diff(&self, base: &str, path_filter: &str) -> Result<GitDiffOutput, GitDiffError> {
        let mut cmd = std::process::Command::new("git");
        cmd.arg("diff");
        cmd.arg(format!("--context={}", self.context_lines));
        cmd.arg(base);

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
            // git diff exits with 1 when there are differences — that's normal
            // but if there's actual error output, report it
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
        // 在当前 git 仓库中测试
        let tool = GitDiffTool::new(5, 0);
        let result = tool.execute_git_diff("HEAD~1", "");
        // 应该在 git 仓库中成功执行
        assert!(result.is_ok());
        let output = result.unwrap();
        let text = output.to_output_string();
        // 输出要么包含 diff 信息，要么是 "No changes found"
        assert!(text.contains("diff --git") || text.contains("No changes found"));
    }

    #[test]
    fn test_git_diff_with_path_filter() {
        let tool = GitDiffTool::new(3, 0);
        let result = tool.execute_git_diff("HEAD~1", "src-tauri/src/harness");
        assert!(result.is_ok());
    }

    #[test]
    fn test_git_diff_invalid_base() {
        let tool = GitDiffTool::new(5, 0);
        let result = tool.execute_git_diff("INVALID_REF_12345", "");
        // 无效引用应当报错
        match result {
            Err(GitDiffError::CommandFailed(msg)) => {
                assert!(msg.contains("invalid") || msg.contains("unknown") || msg.contains("bad"));
            },
            other => panic!("Expected CommandFailed error, got: {:?}", other),
        }
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
