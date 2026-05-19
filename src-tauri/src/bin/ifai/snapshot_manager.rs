//! Snapshot Manager - 快照管理和清理逻辑
//!
//! 🎯 设计目标：
//! - 快照保留策略（时间+数量限制）
//! - 自动清理过期快照
//! - 增量日志归档

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use thiserror::Error;

/// 🔥 快照保留策略
#[derive(Debug, Clone)]
pub struct SnapshotRetentionPolicy {
    /// 保留最近 N 个快照
    pub max_snapshots: usize,
    /// 保留最近 N 小时内的所有快照
    pub retain_hours: u64,
    /// 超过 N 天的快照自动删除
    pub max_age_days: u64,
}

impl Default for SnapshotRetentionPolicy {
    fn default() -> Self {
        Self {
            max_snapshots: 10,
            retain_hours: 1,
            max_age_days: 7,
        }
    }
}

/// 🔥 快照元数据
#[derive(Debug, Clone)]
pub struct SnapshotMetadata {
    pub file_path: PathBuf,
    pub timestamp: u64,
    pub message_count: usize,
}

impl SnapshotMetadata {
    /// 🔥 从文件路径解析元数据
    pub fn from_path(path: PathBuf) -> Option<Self> {
        // 从文件名解析时间戳：auto-{timestamp}.json
        let file_name = path.file_stem()?.to_str()?;
        let timestamp_str = file_name.strip_prefix("auto-")?;
        let timestamp: u64 = timestamp_str.parse().ok()?;

        Some(Self {
            file_path: path.clone(),
            timestamp,
            message_count: 0, // TODO: 从文件内容读取
        })
    }
}

/// 🔥 快照管理器
pub struct SnapshotManager {
    snapshots_dir: PathBuf,
    live_dir: PathBuf,
    archive_dir: PathBuf,
    policy: SnapshotRetentionPolicy,
}

/// 🔥 快照管理错误
#[derive(Debug, Error)]
pub enum SnapshotManagerError {
    #[error("IO 错误: {0}")]
    Io(#[from] std::io::Error),

    #[error("快照目录无效: {0}")]
    InvalidSnapshotDir(String),
}

impl SnapshotManager {
    /// 🔥 创建新的快照管理器
    pub fn new(
        snapshots_dir: PathBuf,
        live_dir: PathBuf,
        archive_dir: PathBuf,
        policy: SnapshotRetentionPolicy,
    ) -> Self {
        Self {
            snapshots_dir,
            live_dir,
            archive_dir,
            policy,
        }
    }

    /// 🔥 使用默认策略创建
    pub fn with_defaults(snapshots_dir: PathBuf, live_dir: PathBuf, archive_dir: PathBuf) -> Self {
        Self::new(
            snapshots_dir,
            live_dir,
            archive_dir,
            SnapshotRetentionPolicy::default(),
        )
    }

    /// 🔥 列出所有快照
    pub fn list_snapshots(&self) -> Result<Vec<SnapshotMetadata>, SnapshotManagerError> {
        if !self.snapshots_dir.exists() {
            return Ok(Vec::new());
        }

        let mut snapshots = Vec::new();

        for entry in fs::read_dir(&self.snapshots_dir)? {
            let entry = entry?;
            let path = entry.path();

            if path.extension().and_then(|s| s.to_str()) == Some("json") {
                if let Some(metadata) = SnapshotMetadata::from_path(path) {
                    snapshots.push(metadata);
                }
            }
        }

        // 按时间戳降序排序
        snapshots.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));

        Ok(snapshots)
    }

    /// 🔥 清理过期快照
    ///
    /// 根据保留策略删除过期的快照文件
    pub fn cleanup_old_snapshots(&self) -> Result<usize, SnapshotManagerError> {
        let snapshots = self.list_snapshots()?;
        let now = now_millis() / 1000; // 转换为秒
        let mut deleted_count = 0;

        let max_age_seconds = self.policy.max_age_days * 24 * 3600;

        for (i, snapshot) in snapshots.iter().enumerate() {
            let should_delete = if i >= self.policy.max_snapshots {
                // 超过最大数量限制
                true
            } else {
                let age_seconds = now.saturating_sub(snapshot.timestamp);
                age_seconds > max_age_seconds
            };

            if should_delete {
                fs::remove_file(&snapshot.file_path)?;
                deleted_count += 1;
            }
        }

        Ok(deleted_count)
    }

    /// 🔥 归档增量日志
    ///
    /// 将增量日志移动到归档目录
    pub fn archive_incremental_log(&self, session_id: &str) -> Result<(), SnapshotManagerError> {
        // 确保归档目录存在
        fs::create_dir_all(&self.archive_dir)?;

        let live_file = self.live_dir.join(format!("{}.jsonl", session_id));
        if !live_file.exists() {
            return Ok(()); // 文件不存在，无需归档
        }

        // 生成归档文件名：{session-id}-{timestamp}.jsonl
        let archive_name = format!("{}-{}.jsonl", session_id, now_millis());
        let archive_path = self.archive_dir.join(&archive_name);

        fs::rename(&live_file, &archive_path)?;

        Ok(())
    }

    /// 🔥 清理过期的归档日志
    ///
    /// 删除超过指定天数的归档日志
    pub fn cleanup_old_archives(&self, max_days: u64) -> Result<usize, SnapshotManagerError> {
        if !self.archive_dir.exists() {
            return Ok(0);
        }

        let now = now_millis() / 1000;
        let max_age_seconds = max_days * 24 * 3600;
        let mut deleted_count = 0;

        for entry in fs::read_dir(&self.archive_dir)? {
            let entry = entry?;
            let path = entry.path();

            // 检查文件修改时间
            if let Ok(metadata) = entry.metadata() {
                if let Ok(modified) = metadata.modified() {
                    let age_seconds = now
                        .saturating_sub(modified.duration_since(UNIX_EPOCH).unwrap().as_secs());

                    if age_seconds > max_age_seconds {
                        fs::remove_file(&path)?;
                        deleted_count += 1;
                    }
                }
            }
        }

        Ok(deleted_count)
    }

    /// 🔥 获取快照目录
    pub fn snapshots_dir(&self) -> &Path {
        &self.snapshots_dir
    }

    /// 🔥 获取增量日志目录
    pub fn live_dir(&self) -> &Path {
        &self.live_dir
    }

    /// 🔥 获取归档目录
    pub fn archive_dir(&self) -> &Path {
        &self.archive_dir
    }
}

/// 🔥 获取当前时间戳（毫秒）
fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_snapshot_retention_policy_default() {
        let policy = SnapshotRetentionPolicy::default();
        assert_eq!(policy.max_snapshots, 10);
        assert_eq!(policy.retain_hours, 1);
        assert_eq!(policy.max_age_days, 7);
    }

    #[test]
    fn test_snapshot_manager_creation() {
        let temp_dir = TempDir::new().unwrap();
        let snapshots_dir = temp_dir.path().join("snapshots");
        let live_dir = temp_dir.path().join("live");
        let archive_dir = temp_dir.path().join("archive");

        let manager = SnapshotManager::with_defaults(
            snapshots_dir.clone(),
            live_dir.clone(),
            archive_dir.clone(),
        );

        assert_eq!(manager.snapshots_dir(), &snapshots_dir);
        assert_eq!(manager.live_dir(), &live_dir);
        assert_eq!(manager.archive_dir(), &archive_dir);
    }

    #[test]
    fn test_list_snapshots_empty() {
        let temp_dir = TempDir::new().unwrap();
        let snapshots_dir = temp_dir.path().join("snapshots");
        let live_dir = temp_dir.path().join("live");
        let archive_dir = temp_dir.path().join("archive");

        let manager = SnapshotManager::with_defaults(snapshots_dir, live_dir, archive_dir);
        let snapshots = manager.list_snapshots().unwrap();

        assert_eq!(snapshots.len(), 0);
    }

    #[test]
    fn test_cleanup_old_snapshots_empty() {
        let temp_dir = TempDir::new().unwrap();
        let snapshots_dir = temp_dir.path().join("snapshots");
        let live_dir = temp_dir.path().join("live");
        let archive_dir = temp_dir.path().join("archive");

        let manager = SnapshotManager::with_defaults(snapshots_dir, live_dir, archive_dir);
        let deleted = manager.cleanup_old_snapshots().unwrap();

        assert_eq!(deleted, 0);
    }

    #[test]
    fn test_archive_incremental_log_not_exists() {
        let temp_dir = TempDir::new().unwrap();
        let snapshots_dir = temp_dir.path().join("snapshots");
        let live_dir = temp_dir.path().join("live");
        let archive_dir = temp_dir.path().join("archive");

        let manager = SnapshotManager::with_defaults(snapshots_dir, live_dir, archive_dir);

        // 文件不存在时应该返回 Ok
        let result = manager.archive_incremental_log("test-session");
        assert!(result.is_ok());
    }

    #[test]
    fn test_cleanup_old_archives_empty() {
        let temp_dir = TempDir::new().unwrap();
        let snapshots_dir = temp_dir.path().join("snapshots");
        let live_dir = temp_dir.path().join("live");
        let archive_dir = temp_dir.path().join("archive");

        let manager = SnapshotManager::with_defaults(snapshots_dir, live_dir, archive_dir);
        let deleted = manager.cleanup_old_archives(30).unwrap();

        assert_eq!(deleted, 0);
    }

    #[test]
    fn test_snapshot_metadata_from_path() {
        let path = PathBuf::from("/path/to/auto-1234567890.json");
        let metadata = SnapshotMetadata::from_path(path);

        assert!(metadata.is_some());
        let metadata = metadata.unwrap();
        assert_eq!(metadata.timestamp, 1234567890);
    }

    #[test]
    fn test_snapshot_metadata_invalid_path() {
        // 无效的文件名
        let path = PathBuf::from("/path/to/invalid.json");
        let metadata = SnapshotMetadata::from_path(path);
        assert!(metadata.is_none());

        // 无效的时间戳
        let path = PathBuf::from("/path/to/auto-abc.json");
        let metadata = SnapshotMetadata::from_path(path);
        assert!(metadata.is_none());
    }
}
