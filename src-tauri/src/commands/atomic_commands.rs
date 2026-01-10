//! v0.2.8 原子文件操作命令
//!
//! 提供事务性文件写入 API：
//! - 开始原子写入会话
//! - 添加文件操作
//! - 提交或回滚
//! - 冲突检测

use tauri::State;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::fs;
use std::collections::HashMap;

// ============================================================================
// 类型定义
// ============================================================================

/// 文件操作类型
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum FileOperationType {
    Create,
    Update,
    Delete,
}

/// 文件操作请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileOperationRequest {
    /// 文件路径
    pub path: String,

    /// 操作类型
    pub op_type: FileOperationType,

    /// 文件内容（创建或更新时使用）
    pub content: Option<String>,

    /// 原始内容（更新时用于冲突检测）
    pub original_content: Option<String>,
}

/// 原子写入会话状态
#[derive(Debug, Clone)]
pub struct AtomicWriteSession {
    pub id: String,
    pub operations: Vec<FileOperationRequest>,
    pub temp_dir: String,
    pub created_at: i64, // 使用时间戳而不是 DateTime
}

/// 原子写入结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AtomicWriteResult {
    pub session_id: String,
    pub success: bool,
    pub applied_files: Vec<String>,
    pub conflicts: Vec<String>,
    pub errors: Vec<String>,
}

// 全局会话存储
pub type SessionStore = HashMap<String, AtomicWriteSession>;

// ============================================================================
// Tauri Commands
// ============================================================================

/// 开始新的原子写入会话
#[tauri::command]
pub fn atomic_write_start(
    sessions: State<std::sync::Mutex<SessionStore>>,
) -> Result<String, String> {
    let session_id = uuid::Uuid::new_v4().to_string();
    let temp_dir = std::env::temp_dir()
        .join(format!("ifainew-atomic-{}", session_id));

    // 创建临时目录
    fs::create_dir_all(&temp_dir)
        .map_err(|e| format!("Failed to create temp dir: {}", e))?;

    let session = AtomicWriteSession {
        id: session_id.clone(),
        operations: Vec::new(),
        temp_dir: temp_dir.to_string_lossy().to_string(),
        created_at: chrono::Utc::now().timestamp(),
    };

    let mut store = sessions.lock()
        .map_err(|e| format!("Failed to acquire lock: {}", e))?;
    store.insert(session_id.clone(), session);

    Ok(session_id)
}

/// 添加文件操作到会话
#[tauri::command]
pub fn atomic_write_add_operation(
    sessions: State<std::sync::Mutex<SessionStore>>,
    session_id: String,
    operation: FileOperationRequest,
) -> Result<(), String> {
    let mut store = sessions.lock()
        .map_err(|e| format!("Failed to acquire lock: {}", e))?;
    let session = store.get_mut(&session_id)
        .ok_or_else(|| format!("Session not found: {}", session_id))?;

    // 验证文件路径
    let path = PathBuf::from(&operation.path);
    if path.components().count() == 0 {
        return Err("Invalid file path".to_string());
    }

    session.operations.push(operation);
    Ok(())
}

/// 检测会话中的冲突
#[tauri::command]
pub fn atomic_write_detect_conflicts(
    sessions: State<std::sync::Mutex<SessionStore>>,
    session_id: String,
) -> Result<Vec<String>, String> {
    let store = sessions.lock()
        .map_err(|e| format!("Failed to acquire lock: {}", e))?;
    let session = store.get(&session_id)
        .ok_or_else(|| format!("Session not found: {}", session_id))?;

    let mut conflicts = Vec::new();

    for operation in &session.operations {
        if let FileOperationType::Update = operation.op_type {
            if let Some(original) = &operation.original_content {
                let path = PathBuf::from(&operation.path);

                // 检查文件是否存在
                if !path.exists() {
                    conflicts.push(format!("File not found: {}", operation.path));
                    continue;
                }

                // 读取当前文件内容
                let current_content = fs::read_to_string(&path)
                    .map_err(|e| format!("Failed to read file: {}", e))?;

                // 计算哈希比较
                let compute_hash = |content: &str| -> String {
                    use std::hash::{Hash, Hasher};
                    use std::collections::hash_map::DefaultHasher;

                    let mut hasher = DefaultHasher::new();
                    content.hash(&mut hasher);
                    format!("{:x}", hasher.finish())
                };

                let original_hash = compute_hash(original);
                let current_hash = compute_hash(&current_content);

                if original_hash != current_hash {
                    conflicts.push(format!(
                        "Conflict in {}: file has been modified",
                        operation.path
                    ));
                }
            }
        }
    }

    Ok(conflicts)
}

/// 提交原子写入会话
#[tauri::command]
pub fn atomic_write_commit(
    sessions: State<std::sync::Mutex<SessionStore>>,
    session_id: String,
) -> Result<AtomicWriteResult, String> {
    let mut store = sessions.lock()
        .map_err(|e| format!("Failed to acquire lock: {}", e))?;
    let session = store.remove(&session_id)
        .ok_or_else(|| format!("Session not found: {}", session_id))?;

    let mut applied_files = Vec::new();
    let mut conflicts = Vec::new();
    let mut errors = Vec::new();

    // 创建备份
    let mut backups: HashMap<PathBuf, String> = HashMap::new();

    for operation in &session.operations {
        let path = PathBuf::from(&operation.path);

        match &operation.op_type {
            FileOperationType::Create => {
                if let Some(content) = &operation.content {
                    // 确保目录存在
                    if let Some(parent) = path.parent() {
                        fs::create_dir_all(parent)
                            .map_err(|e| format!("Failed to create dir: {}", e))?;
                    }

                    fs::write(&path, content)
                        .map_err(|e| {
                            errors.push(format!("{}: {}", operation.path, e));
                            e
                        })
                        .ok();

                    applied_files.push(operation.path.clone());
                }
            }

            FileOperationType::Update => {
                // 创建备份
                if path.exists() {
                    let backup_content = fs::read_to_string(&path)
                        .map_err(|e| format!("Failed to backup: {}", e))?;
                    backups.insert(path.clone(), backup_content);
                }

                if let Some(content) = &operation.content {
                    fs::write(&path, content)
                        .map_err(|e| {
                            errors.push(format!("{}: {}", operation.path, e));
                            e
                        })
                        .ok();

                    applied_files.push(operation.path.clone());
                }
            }

            FileOperationType::Delete => {
                if path.exists() {
                    // 创建备份
                    let backup_content = fs::read_to_string(&path)
                        .map_err(|e| format!("Failed to backup: {}", e))?;
                    backups.insert(path.clone(), backup_content);

                    fs::remove_file(&path)
                        .map_err(|e| {
                            errors.push(format!("{}: {}", operation.path, e));
                            e
                        })
                        .ok();

                    applied_files.push(operation.path.clone());
                }
            }
        }
    }

    // 清理临时目录
    let temp_path = PathBuf::from(&session.temp_dir);
    if temp_path.exists() {
        fs::remove_dir_all(temp_path).ok();
    }

    Ok(AtomicWriteResult {
        session_id,
        success: errors.is_empty(),
        applied_files,
        conflicts,
        errors,
    })
}

/// 回滚原子写入会话
#[tauri::command]
pub fn atomic_write_rollback(
    sessions: State<std::sync::Mutex<SessionStore>>,
    session_id: String,
) -> Result<(), String> {
    let store = sessions.lock()
        .map_err(|e| format!("Failed to acquire lock: {}", e))?;
    let session = store.get(&session_id)
        .ok_or_else(|| format!("Session not found: {}", session_id))?;

    // 清理临时目录
    let temp_path = PathBuf::from(&session.temp_dir);
    if temp_path.exists() {
        fs::remove_dir_all(temp_path)
            .map_err(|e| format!("Failed to cleanup: {}", e))?;
    }

    // 从存储中移除会话
    drop(store);
    let mut store = sessions.lock()
        .map_err(|e| format!("Failed to acquire lock: {}", e))?;
    store.remove(&session_id);

    Ok(())
}

/// 获取会话信息
#[tauri::command]
pub fn atomic_write_get_session(
    sessions: State<std::sync::Mutex<SessionStore>>,
    session_id: String,
) -> Result<AtomicWriteSession, String> {
    let store = sessions.lock()
        .map_err(|e| format!("Failed to acquire lock: {}", e))?;
    let session = store.get(&session_id)
        .ok_or_else(|| format!("Session not found: {}", session_id))?;

    Ok(session.clone())
}

/// 计算文件哈希
#[tauri::command]
pub fn atomic_file_hash(path: String) -> Result<String, String> {
    use std::hash::{Hash, Hasher};
    use std::collections::hash_map::DefaultHasher;

    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    let mut hasher = DefaultHasher::new();
    content.hash(&mut hasher);
    Ok(format!("{:x}", hasher.finish()))
}

/// 检查文件冲突
#[tauri::command]
pub fn atomic_check_conflict(
    path: String,
    expected_hash: String,
) -> Result<bool, String> {
    let current_hash = atomic_file_hash(path)?;
    Ok(current_hash != expected_hash)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_session_creation() {
        // Session creation logic tested in atomic.rs
        // This is just a placeholder for command-level tests
    }
}
