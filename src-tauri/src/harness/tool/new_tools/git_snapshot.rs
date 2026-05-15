//! Git Snapshot 工具 — Ghost Snapshot（创建/回滚临时索引快照）
//!
//! Phase 6B: Git Commit Agent 的安全回滚机制
//!
//! 原理：git write-tree 创建 tree hash，git read-tree 回滚到该 tree

use tool_macro::Tool;

/// Git Snapshot 工具
///
/// 创建 Git tree 快照用于安全回滚
#[derive(Tool)]
#[tool(
    name = "git_snapshot",
    description = "创建或回滚 Git 快照。action: 'create' 创建快照返回 tree hash；action: 'rollback' + snapshot_hash 回滚。",
    params(action: str)
)]
pub struct GitSnapshotTool;

impl GitSnapshotTool {
    pub fn execute_git_snapshot(&self, action: &str) -> Result<GitSnapshotOutput, GitSnapshotError> {
        match action {
            "create" => self.create_snapshot(),
            "rollback" => Err(GitSnapshotError::MissingParameter(
                "rollback requires snapshot_hash parameter".to_string(),
            )),
            _ => Err(GitSnapshotError::InvalidAction(format!(
                "unknown action '{}', expected 'create' or 'rollback'",
                action
            ))),
        }
    }

    /// 创建快照：git write-tree 返回 tree hash
    fn create_snapshot(&self) -> Result<GitSnapshotOutput, GitSnapshotError> {
        let output = std::process::Command::new("git")
            .arg("write-tree")
            .output()
            .map_err(|e| GitSnapshotError::CommandFailed(e.to_string()))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(GitSnapshotError::CommandFailed(stderr.to_string()));
        }

        let hash = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Ok(GitSnapshotOutput::Created(hash))
    }

    /// 回滚到快照：git read-tree + git checkout-index
    pub fn rollback_to(&self, snapshot_hash: &str) -> Result<GitSnapshotOutput, GitSnapshotError> {
        // git read-tree --reset <hash>
        let read_tree = std::process::Command::new("git")
            .args(["read-tree", "--reset", snapshot_hash])
            .output()
            .map_err(|e| GitSnapshotError::CommandFailed(e.to_string()))?;

        if !read_tree.status.success() {
            let stderr = String::from_utf8_lossy(&read_tree.stderr);
            return Err(GitSnapshotError::CommandFailed(stderr.to_string()));
        }

        // git checkout-index -f -a
        let checkout = std::process::Command::new("git")
            .args(["checkout-index", "-f", "-a"])
            .output()
            .map_err(|e| GitSnapshotError::CommandFailed(e.to_string()))?;

        if !checkout.status.success() {
            let stderr = String::from_utf8_lossy(&checkout.stderr);
            return Err(GitSnapshotError::CommandFailed(stderr.to_string()));
        }

        Ok(GitSnapshotOutput::RolledBack(snapshot_hash.to_string()))
    }
}

#[derive(Debug, Clone)]
pub enum GitSnapshotOutput {
    Created(String),
    RolledBack(String),
}

impl GitSnapshotOutput {
    pub fn to_output_string(&self) -> String {
        match self {
            GitSnapshotOutput::Created(hash) => format!("snapshot_created:{}", hash),
            GitSnapshotOutput::RolledBack(hash) => format!("rolled_back_to:{}", hash),
        }
    }
}

impl std::fmt::Display for GitSnapshotOutput {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.to_output_string())
    }
}

#[derive(Debug, thiserror::Error)]
pub enum GitSnapshotError {
    #[error("Git not found: {0}")]
    GitNotFound(String),
    #[error("Git command failed: {0}")]
    CommandFailed(String),
    #[error("Invalid action: {0}")]
    InvalidAction(String),
    #[error("Missing parameter: {0}")]
    MissingParameter(String),
}
