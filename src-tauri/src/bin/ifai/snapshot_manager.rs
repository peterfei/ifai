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
    /// 保留策略（按优先级）：
    /// 1. 始终保留最近 max_snapshots 个快照
    /// 2. 保留最近 retain_hours 小时内的所有快照
    /// 3. 保留最近 24 小时内每小时一个快照（整点最近的那个）
    /// 4. 超过 max_age_days 天的快照自动删除
    pub fn cleanup_old_snapshots(&self) -> Result<usize, SnapshotManagerError> {
        let snapshots = self.list_snapshots()?;
        if snapshots.is_empty() {
            return Ok(0);
        }

        let now = now_millis() / 1000; // 转换为秒
        let max_age_seconds = self.policy.max_age_days * 24 * 3600;
        let retain_window_seconds = self.policy.retain_hours * 3600;

        // 收集需要保留的快照索引
        let mut keep_indices = std::collections::HashSet::new();

        // 1. 始终保留最近 max_snapshots 个
        for i in 0..snapshots.len().min(self.policy.max_snapshots) {
            keep_indices.insert(i);
        }

        // 2. 保留 retain_hours 小时内的所有快照
        for (i, snapshot) in snapshots.iter().enumerate() {
            let age_seconds = now.saturating_sub(snapshot.timestamp);
            if age_seconds <= retain_window_seconds {
                keep_indices.insert(i);
            }
        }

        // 3. 保留最近 24 小时内每小时一个快照（每小时的最后一个）
        let one_day_seconds: u64 = 24 * 3600;
        let mut hourly_slots: std::collections::HashMap<u64, usize> = std::collections::HashMap::new();
        for (i, snapshot) in snapshots.iter().enumerate() {
            let age_seconds = now.saturating_sub(snapshot.timestamp);
            if age_seconds <= one_day_seconds {
                let hour_slot = snapshot.timestamp / 3600; // 所属的小时
                hourly_slots.entry(hour_slot).or_insert(i);
            }
        }
        for idx in hourly_slots.values() {
            keep_indices.insert(*idx);
        }

        // 4. 删除未被保留且超过 max_age_days 的快照
        let mut deleted_count = 0;
        for (i, snapshot) in snapshots.iter().enumerate() {
            if keep_indices.contains(&i) {
                continue;
            }

            let age_seconds = now.saturating_sub(snapshot.timestamp);
            if age_seconds > max_age_seconds {
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

    #[test]
    fn test_cleanup_retains_recent_snapshots() {
        let temp_dir = TempDir::new().unwrap();
        let snapshots_dir = temp_dir.path().join("snapshots");
        let live_dir = temp_dir.path().join("live");
        let archive_dir = temp_dir.path().join("archive");
        fs::create_dir_all(&snapshots_dir).unwrap();

        let now = now_millis() / 1000;

        // 创建 12 个近期快照（每分钟一个）+ 3 个过期快照（超过 7 天）
        // 按时间戳降序排列后，过期快照排在后面（不在前 10 个中）
        for i in 0..12 {
            let ts = now - (i * 60); // 每分钟一个
            let path = snapshots_dir.join(format!("auto-{}.json", ts));
            fs::write(&path, "{}").unwrap();
        }
        // 超过 7 天的快照（这些在按时间降序排列时会排在最后面）
        let old_ts1 = now - 8 * 24 * 3600;
        let old_ts2 = now - 9 * 24 * 3600;
        let old_ts3 = now - 10 * 24 * 3600;
        fs::write(snapshots_dir.join(format!("auto-{}.json", old_ts1)), "{}").unwrap();
        fs::write(snapshots_dir.join(format!("auto-{}.json", old_ts2)), "{}").unwrap();
        fs::write(snapshots_dir.join(format!("auto-{}.json", old_ts3)), "{}").unwrap();

        let manager = SnapshotManager::with_defaults(
            snapshots_dir.clone(), live_dir, archive_dir,
        );
        let deleted = manager.cleanup_old_snapshots().unwrap();

        // 应该删除 3 个过期快照（超过 max_age_days=7，且不在前 10 个中）
        assert_eq!(deleted, 3);

        // 剩余 12 个
        let remaining = manager.list_snapshots().unwrap();
        assert_eq!(remaining.len(), 12);
    }

    #[test]
    fn test_archive_incremental_log_moves_file() {
        let temp_dir = TempDir::new().unwrap();
        let snapshots_dir = temp_dir.path().join("snapshots");
        let live_dir = temp_dir.path().join("live");
        let archive_dir = temp_dir.path().join("archive");
        fs::create_dir_all(&live_dir).unwrap();
        fs::create_dir_all(&archive_dir).unwrap();

        // 创建增量日志文件
        let live_file = live_dir.join("session-test-001.jsonl");
        fs::write(&live_file, "test data").unwrap();

        let manager = SnapshotManager::with_defaults(
            snapshots_dir, live_dir.clone(), archive_dir.clone(),
        );
        manager.archive_incremental_log("session-test-001").unwrap();

        // 原文件应该不存在
        assert!(!live_file.exists());

        // 归档目录应该有文件
        let archive_files: Vec<_> = fs::read_dir(&archive_dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .collect();
        assert_eq!(archive_files.len(), 1);
        assert!(archive_files[0].path().to_str().unwrap().contains("session-test-001"));
    }

    #[test]
    fn test_cleanup_old_archives_removes_expired() {
        let temp_dir = TempDir::new().unwrap();
        let snapshots_dir = temp_dir.path().join("snapshots");
        let live_dir = temp_dir.path().join("live");
        let archive_dir = temp_dir.path().join("archive");
        fs::create_dir_all(&archive_dir).unwrap();

        // 创建过期归档文件（修改时间设为 31 天前）
        let old_file = archive_dir.join("old-session-123.jsonl");
        fs::write(&old_file, "old data").unwrap();

        // 使用 utime 设置文件修改时间为 31 天前
        let old_time_secs = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() - 31 * 24 * 3600;
        // 使用 std::os::unix 设置文件时间
        use std::os::unix::fs::MetadataExt;
        // 通过 C 函数 utime 修改时间
        let c_path = std::ffi::CString::new(old_file.to_str().unwrap()).unwrap();
        let utimbuf = libc::utimbuf {
            actime: old_time_secs as libc::time_t,
            modtime: old_time_secs as libc::time_t,
        };
        unsafe { libc::utime(c_path.as_ptr(), &utimbuf); };

        // 创建近期归档文件
        let recent_file = archive_dir.join("recent-session-456.jsonl");
        fs::write(&recent_file, "recent data").unwrap();

        let manager = SnapshotManager::with_defaults(
            snapshots_dir, live_dir, archive_dir.clone(),
        );
        let deleted = manager.cleanup_old_archives(30).unwrap();

        assert_eq!(deleted, 1);
        assert!(!old_file.exists());
        assert!(recent_file.exists());
    }
}
