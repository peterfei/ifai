//! Git Status 工具 — 获取仓库当前状态
//!
//! Phase 6B: Git Commit Agent 的基础工具

use tool_macro::Tool;

/// Git Status 工具
///
/// 获取 Git 仓库当前状态（staged / unstaged / untracked）
#[derive(Tool)]
#[tool(
    name = "git_status",
    description = "获取 Git 仓库当前状态（已暂存/未暂存/未跟踪文件）。无需参数。",
    params()
)]
pub struct GitStatusTool;

impl GitStatusTool {
    pub fn execute_git_status(&self) -> Result<GitStatusOutput, GitStatusError> {
        let output = std::process::Command::new("git")
            .arg("status")
            .arg("--porcelain")
            .output()
            .map_err(|e| {
                if e.kind() == std::io::ErrorKind::NotFound {
                    GitStatusError::GitNotFound("git command not found".to_string())
                } else {
                    GitStatusError::CommandFailed(e.to_string())
                }
            })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(GitStatusError::CommandFailed(stderr.to_string()));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        Ok(GitStatusOutput(stdout.to_string()))
    }
}

#[derive(Debug, Clone)]
pub struct GitStatusOutput(pub String);

impl GitStatusOutput {
    pub fn to_output_string(&self) -> String {
        if self.0.is_empty() {
            "clean — no changes".to_string()
        } else {
            self.0.clone()
        }
    }
}

impl std::fmt::Display for GitStatusOutput {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

#[derive(Debug, thiserror::Error)]
pub enum GitStatusError {
    #[error("Git not found: {0}")]
    GitNotFound(String),
    #[error("Git command failed: {0}")]
    CommandFailed(String),
}
