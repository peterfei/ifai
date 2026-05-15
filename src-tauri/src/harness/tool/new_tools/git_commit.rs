//! Git Commit 工具 — 安全执行提交并自动追加 Co-authored-by
//!
//! Phase 6B: Git Commit Agent 的核心提交工具

use tool_macro::Tool;

/// Git Commit 工具
///
/// 执行 git add + git commit，自动追加 Co-authored-by attribution
#[derive(Tool)]
#[tool(
    name = "git_commit",
    description = "执行 git add -A + git commit，自动追加 Co-authored-by attribution。传入 message 参数（commit message，无需包含 Co-authored-by 行）。",
    params(message: str)
)]
pub struct GitCommitTool;

impl GitCommitTool {
    pub fn execute_git_commit(&self, message: &str) -> Result<GitCommitOutput, GitCommitError> {
        // 自动追加 Co-authored-by
        let full_message = format!(
            "{}\n\nCo-authored-by: IfAI CLI <noreply@ifai.today>",
            message.trim()
        );

        // git add -A
        let add_output = std::process::Command::new("git")
            .arg("add")
            .arg("-A")
            .output()
            .map_err(|e| {
                if e.kind() == std::io::ErrorKind::NotFound {
                    GitCommitError::GitNotFound("git command not found".to_string())
                } else {
                    GitCommitError::CommandFailed(e.to_string())
                }
            })?;

        if !add_output.status.success() {
            let stderr = String::from_utf8_lossy(&add_output.stderr);
            return Err(GitCommitError::StageFailed(stderr.to_string()));
        }

        // git commit -m "message"
        let commit_output = std::process::Command::new("git")
            .arg("commit")
            .arg("-m")
            .arg(&full_message)
            .output()
            .map_err(|e| GitCommitError::CommandFailed(e.to_string()))?;

        if !commit_output.status.success() {
            let stderr = String::from_utf8_lossy(&commit_output.stderr);
            // Nothing to commit is not an error
            if stderr.contains("nothing to commit") || stderr.contains("no changes") {
                return Ok(GitCommitOutput {
                    success: false,
                    commit_hash: None,
                    summary: "nothing to commit, working tree clean".to_string(),
                });
            }
            return Err(GitCommitError::CommitFailed(stderr.to_string()));
        }

        // 获取 commit hash
        let hash_output = std::process::Command::new("git")
            .arg("rev-parse")
            .arg("HEAD")
            .output()
            .ok();
        let commit_hash = hash_output
            .and_then(|o| {
                if o.status.success() {
                    String::from_utf8(o.stdout).ok()
                } else {
                    None
                }
            })
            .map(|s| s.trim().to_string());

        let stdout = String::from_utf8_lossy(&commit_output.stdout);
        Ok(GitCommitOutput {
            success: true,
            commit_hash,
            summary: stdout.trim().to_string(),
        })
    }
}

#[derive(Debug, Clone)]
pub struct GitCommitOutput {
    pub success: bool,
    pub commit_hash: Option<String>,
    pub summary: String,
}

impl GitCommitOutput {
    pub fn to_output_string(&self) -> String {
        if self.success {
            if let Some(ref hash) = self.commit_hash {
                format!("✅ Commit successful: {}\n   Hash: {}", self.summary, hash)
            } else {
                format!("✅ Commit successful: {}", self.summary)
            }
        } else {
            format!("ℹ️  {}", self.summary)
        }
    }
}

impl std::fmt::Display for GitCommitOutput {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.to_output_string())
    }
}

#[derive(Debug, thiserror::Error)]
pub enum GitCommitError {
    #[error("Git not found: {0}")]
    GitNotFound(String),
    #[error("Git command failed: {0}")]
    CommandFailed(String),
    #[error("Stage failed: {0}")]
    StageFailed(String),
    #[error("Commit failed: {0}")]
    CommitFailed(String),
}
