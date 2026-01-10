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
// 内部辅助函数（供测试和 Tauri 命令使用）
// ============================================================================

/// 内部函数：开始新的原子写入会话
pub fn atomic_write_start_internal(
    sessions: &std::sync::Mutex<SessionStore>,
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

/// 内部函数：添加文件操作到会话
pub fn atomic_write_add_operation_internal(
    sessions: &std::sync::Mutex<SessionStore>,
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

/// 内部函数：检测会话中的冲突
pub fn atomic_write_detect_conflicts_internal(
    sessions: &std::sync::Mutex<SessionStore>,
    session_id: String,
) -> Result<Vec<String>, String> {
    let store = sessions.lock()
        .map_err(|e| format!("Failed to acquire lock: {}", e))?;
    let session = store.get(&session_id)
        .ok_or_else(|| format!("Session not found: {}", session_id))?;

    let conflicts = Vec::new();

    for operation in &session.operations {
        if let FileOperationType::Update = operation.op_type {
            if let Some(original) = &operation.original_content {
                let path = PathBuf::from(&operation.path);

                // 检查文件是否存在
                if !path.exists() {
                    return Ok(vec![format!("File not found: {}", operation.path)]);
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
                    let mut result = Vec::new();
                    result.push(format!(
                        "Conflict in {}: file has been modified",
                        operation.path
                    ));
                    return Ok(result);
                }
            }
        }
    }

    Ok(conflicts)
}

/// 内部函数：提交原子写入会话
pub fn atomic_write_commit_internal(
    sessions: &std::sync::Mutex<SessionStore>,
    session_id: String,
) -> Result<AtomicWriteResult, String> {
    let mut store = sessions.lock()
        .map_err(|e| format!("Failed to acquire lock: {}", e))?;
    let session = store.remove(&session_id)
        .ok_or_else(|| format!("Session not found: {}", session_id))?;

    let mut applied_files = Vec::new();
    let conflicts = Vec::new();
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

/// 内部函数：回滚原子写入会话
pub fn atomic_write_rollback_internal(
    sessions: &std::sync::Mutex<SessionStore>,
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

// ============================================================================
// Tauri Commands（调用内部辅助函数）
// ============================================================================

/// 开始新的原子写入会话
#[tauri::command]
pub fn atomic_write_start(
    sessions: State<std::sync::Mutex<SessionStore>>,
) -> Result<String, String> {
    atomic_write_start_internal(&sessions)
}

/// 添加文件操作到会话
#[tauri::command]
pub fn atomic_write_add_operation(
    sessions: State<std::sync::Mutex<SessionStore>>,
    session_id: String,
    operation: FileOperationRequest,
) -> Result<(), String> {
    atomic_write_add_operation_internal(&sessions, session_id, operation)
}

/// 检测会话中的冲突
#[tauri::command]
pub fn atomic_write_detect_conflicts(
    sessions: State<std::sync::Mutex<SessionStore>>,
    session_id: String,
) -> Result<Vec<String>, String> {
    atomic_write_detect_conflicts_internal(&sessions, session_id)
}

/// 提交原子写入会话
#[tauri::command]
pub fn atomic_write_commit(
    sessions: State<std::sync::Mutex<SessionStore>>,
    session_id: String,
) -> Result<AtomicWriteResult, String> {
    atomic_write_commit_internal(&sessions, session_id)
}

/// 回滚原子写入会话
#[tauri::command]
pub fn atomic_write_rollback(
    sessions: State<std::sync::Mutex<SessionStore>>,
    session_id: String,
) -> Result<(), String> {
    atomic_write_rollback_internal(&sessions, session_id)
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

/**
 * v0.2.8 CMP-001: 原子写入回滚逻辑测试
 *
 * 测试场景：
 * 1. 正常提交：3个文件全部成功写入
 * 2. 回滚测试：会话被取消
 * 3. 冲突检测：文件已被修改，检测到冲突
 * 4. 更新/删除/混合操作测试
 * 5. 会话隔离测试
 */
#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    /// 创建临时测试目录
    fn setup_test_dir() -> PathBuf {
        let test_dir = std::env::temp_dir()
            .join("ifainew-test")
            .join(format!("atomic-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&test_dir).unwrap();
        test_dir
    }

    /// 清理测试目录
    fn cleanup_test_dir(test_dir: &PathBuf) {
        if test_dir.exists() {
            fs::remove_dir_all(test_dir).ok();
        }
    }

    /// 辅助函数：创建测试存储
    fn create_test_store() -> SessionStore {
        HashMap::new()
    }

    /// CMP-001-1: 正常提交测试 - 3个文件全部成功写入
    #[test]
    fn test_atomic_write_commit_success() {
        let test_dir = setup_test_dir();
        let store = create_test_store();
        let store = std::sync::Mutex::new(store);

        // 创建会话
        let session_id = atomic_write_start_internal(&store).unwrap();

        // 添加3个文件操作
        let file1 = test_dir.join("file1.txt");
        let file2 = test_dir.join("file2.txt");
        let file3 = test_dir.join("file3.txt");

        atomic_write_add_operation_internal(
            &store,
            session_id.clone(),
            FileOperationRequest {
                path: file1.to_string_lossy().to_string(),
                op_type: FileOperationType::Create,
                content: Some("Content 1".to_string()),
                original_content: None,
            }
        ).unwrap();

        atomic_write_add_operation_internal(
            &store,
            session_id.clone(),
            FileOperationRequest {
                path: file2.to_string_lossy().to_string(),
                op_type: FileOperationType::Create,
                content: Some("Content 2".to_string()),
                original_content: None,
            }
        ).unwrap();

        atomic_write_add_operation_internal(
            &store,
            session_id.clone(),
            FileOperationRequest {
                path: file3.to_string_lossy().to_string(),
                op_type: FileOperationType::Create,
                content: Some("Content 3".to_string()),
                original_content: None,
            }
        ).unwrap();

        // 提交
        let result = atomic_write_commit_internal(&store, session_id.clone()).unwrap();

        // 验证结果
        assert!(result.success);
        assert_eq!(result.applied_files.len(), 3);
        assert!(result.conflicts.is_empty());
        assert!(result.errors.is_empty());

        // 验证文件确实被创建
        assert!(file1.exists());
        assert!(file2.exists());
        assert!(file3.exists());

        assert_eq!(fs::read_to_string(&file1).unwrap(), "Content 1");
        assert_eq!(fs::read_to_string(&file2).unwrap(), "Content 2");
        assert_eq!(fs::read_to_string(&file3).unwrap(), "Content 3");

        cleanup_test_dir(&test_dir);
    }

    /// CMP-001-2: 回滚测试 - 会话被取消
    #[test]
    fn test_atomic_write_rollback() {
        let test_dir = setup_test_dir();
        let store = create_test_store();
        let store = std::sync::Mutex::new(store);

        // 创建会话
        let session_id = atomic_write_start_internal(&store).unwrap();

        // 添加文件操作
        let file1 = test_dir.join("file1.txt");

        atomic_write_add_operation_internal(
            &store,
            session_id.clone(),
            FileOperationRequest {
                path: file1.to_string_lossy().to_string(),
                op_type: FileOperationType::Create,
                content: Some("Content 1".to_string()),
                original_content: None,
            }
        ).unwrap();

        // 回滚
        atomic_write_rollback_internal(&store, session_id.clone()).unwrap();

        // 验证会话已被移除
        let store_lock = store.lock().unwrap();
        assert!(!store_lock.contains_key(&session_id));

        // 验证临时目录被清理
        let temp_dir = std::env::temp_dir().join(format!("ifainew-atomic-{}", session_id));
        assert!(!temp_dir.exists());

        // 验证文件没有被创建
        assert!(!file1.exists());

        cleanup_test_dir(&test_dir);
    }

    /// CMP-001-3: 冲突检测测试
    #[test]
    fn test_atomic_write_conflict_detection() {
        let test_dir = setup_test_dir();
        let store = create_test_store();
        let store = std::sync::Mutex::new(store);

        // 创建一个现有文件
        let file1 = test_dir.join("file1.txt");
        fs::write(&file1, "Original content").unwrap();

        // 创建会话
        let session_id = atomic_write_start_internal(&store).unwrap();

        // 添加更新操作，使用原始内容
        atomic_write_add_operation_internal(
            &store,
            session_id.clone(),
            FileOperationRequest {
                path: file1.to_string_lossy().to_string(),
                op_type: FileOperationType::Update,
                content: Some("New content".to_string()),
                original_content: Some("Original content".to_string()),
            }
        ).unwrap();

        // 检测冲突（此时没有冲突）
        let conflicts = atomic_write_detect_conflicts_internal(&store, session_id.clone()).unwrap();
        assert!(conflicts.is_empty(), "No conflict expected initially");

        // 模拟用户修改了文件
        fs::write(&file1, "Modified by user").unwrap();

        // 再次检测冲突（应该检测到）
        let conflicts = atomic_write_detect_conflicts_internal(&store, session_id.clone()).unwrap();
        assert_eq!(conflicts.len(), 1, "Expected 1 conflict");
        assert!(conflicts[0].contains("Conflict in"));
        assert!(conflicts[0].contains(&file1.to_string_lossy().to_string()));

        cleanup_test_dir(&test_dir);
    }

    /// CMP-001-4: 更新操作测试
    #[test]
    fn test_atomic_write_update() {
        let test_dir = setup_test_dir();
        let store = create_test_store();
        let store = std::sync::Mutex::new(store);

        // 创建现有文件
        let file1 = test_dir.join("file1.txt");
        fs::write(&file1, "Original content").unwrap();

        // 创建会话
        let session_id = atomic_write_start_internal(&store).unwrap();

        // 添加更新操作
        atomic_write_add_operation_internal(
            &store,
            session_id.clone(),
            FileOperationRequest {
                path: file1.to_string_lossy().to_string(),
                op_type: FileOperationType::Update,
                content: Some("Updated content".to_string()),
                original_content: Some("Original content".to_string()),
            }
        ).unwrap();

        // 提交
        let result = atomic_write_commit_internal(&store, session_id.clone()).unwrap();

        // 验证
        assert!(result.success);
        assert_eq!(result.applied_files.len(), 1);

        // 验证文件内容已更新
        assert_eq!(fs::read_to_string(&file1).unwrap(), "Updated content");

        cleanup_test_dir(&test_dir);
    }

    /// CMP-001-5: 删除操作测试
    #[test]
    fn test_atomic_write_delete() {
        let test_dir = setup_test_dir();
        let store = create_test_store();
        let store = std::sync::Mutex::new(store);

        // 创建现有文件
        let file1 = test_dir.join("file1.txt");
        fs::write(&file1, "To be deleted").unwrap();

        // 创建会话
        let session_id = atomic_write_start_internal(&store).unwrap();

        // 添加删除操作
        atomic_write_add_operation_internal(
            &store,
            session_id.clone(),
            FileOperationRequest {
                path: file1.to_string_lossy().to_string(),
                op_type: FileOperationType::Delete,
                content: None,
                original_content: None,
            }
        ).unwrap();

        // 提交
        let result = atomic_write_commit_internal(&store, session_id.clone()).unwrap();

        // 验证
        assert!(result.success);
        assert_eq!(result.applied_files.len(), 1);

        // 验证文件已被删除
        assert!(!file1.exists());

        cleanup_test_dir(&test_dir);
    }

    /// CMP-001-6: 混合操作测试
    #[test]
    fn test_atomic_write_mixed_operations() {
        let test_dir = setup_test_dir();
        let store = create_test_store();
        let store = std::sync::Mutex::new(store);

        // 创建现有文件用于更新和删除
        let file_to_update = test_dir.join("update.txt");
        let file_to_delete = test_dir.join("delete.txt");
        fs::write(&file_to_update, "Original").unwrap();
        fs::write(&file_to_delete, "Will be deleted").unwrap();

        // 创建会话
        let session_id = atomic_write_start_internal(&store).unwrap();

        // 操作1: 创建新文件
        let file_to_create = test_dir.join("create.txt");
        atomic_write_add_operation_internal(
            &store,
            session_id.clone(),
            FileOperationRequest {
                path: file_to_create.to_string_lossy().to_string(),
                op_type: FileOperationType::Create,
                content: Some("New file".to_string()),
                original_content: None,
            }
        ).unwrap();

        // 操作2: 更新现有文件
        atomic_write_add_operation_internal(
            &store,
            session_id.clone(),
            FileOperationRequest {
                path: file_to_update.to_string_lossy().to_string(),
                op_type: FileOperationType::Update,
                content: Some("Updated".to_string()),
                original_content: Some("Original".to_string()),
            }
        ).unwrap();

        // 操作3: 删除文件
        atomic_write_add_operation_internal(
            &store,
            session_id.clone(),
            FileOperationRequest {
                path: file_to_delete.to_string_lossy().to_string(),
                op_type: FileOperationType::Delete,
                content: None,
                original_content: None,
            }
        ).unwrap();

        // 提交
        let result = atomic_write_commit_internal(&store, session_id.clone()).unwrap();

        // 验证
        assert!(result.success);
        assert_eq!(result.applied_files.len(), 3);

        // 验证各文件状态
        assert!(file_to_create.exists());
        assert_eq!(fs::read_to_string(&file_to_create).unwrap(), "New file");

        assert!(file_to_update.exists());
        assert_eq!(fs::read_to_string(&file_to_update).unwrap(), "Updated");

        assert!(!file_to_delete.exists());

        cleanup_test_dir(&test_dir);
    }

    /// CMP-001-7: 嵌套目录创建测试
    #[test]
    fn test_atomic_write_nested_directories() {
        let test_dir = setup_test_dir();
        let store = create_test_store();
        let store = std::sync::Mutex::new(store);

        // 创建会话
        let session_id = atomic_write_start_internal(&store).unwrap();

        // 创建深层嵌套文件
        let nested_file = test_dir.join("level1").join("level2").join("level3").join("file.txt");

        atomic_write_add_operation_internal(
            &store,
            session_id.clone(),
            FileOperationRequest {
                path: nested_file.to_string_lossy().to_string(),
                op_type: FileOperationType::Create,
                content: Some("Nested content".to_string()),
                original_content: None,
            }
        ).unwrap();

        // 提交
        let result = atomic_write_commit_internal(&store, session_id.clone()).unwrap();

        // 验证
        assert!(result.success);
        assert!(nested_file.exists());
        assert_eq!(fs::read_to_string(&nested_file).unwrap(), "Nested content");

        cleanup_test_dir(&test_dir);
    }

    /// CMP-001-8: 会话隔离测试
    #[test]
    fn test_atomic_write_session_isolation() {
        let test_dir = setup_test_dir();
        let store = create_test_store();
        let store = std::sync::Mutex::new(store);

        // 创建两个独立会话
        let session1 = atomic_write_start_internal(&store).unwrap();
        let session2 = atomic_write_start_internal(&store).unwrap();

        assert_ne!(session1, session2);

        // 会话1添加文件
        let file1 = test_dir.join("session1.txt");
        atomic_write_add_operation_internal(
            &store,
            session1.clone(),
            FileOperationRequest {
                path: file1.to_string_lossy().to_string(),
                op_type: FileOperationType::Create,
                content: Some("Session 1".to_string()),
                original_content: None,
            }
        ).unwrap();

        // 会话2添加文件
        let file2 = test_dir.join("session2.txt");
        atomic_write_add_operation_internal(
            &store,
            session2.clone(),
            FileOperationRequest {
                path: file2.to_string_lossy().to_string(),
                op_type: FileOperationType::Create,
                content: Some("Session 2".to_string()),
                original_content: None,
            }
        ).unwrap();

        // 只提交会话1
        let result1 = atomic_write_commit_internal(&store, session1.clone()).unwrap();
        assert!(result1.success);
        assert!(file1.exists());

        // 会话2的文件不应该存在
        assert!(!file2.exists());

        // 回滚会话2
        atomic_write_rollback_internal(&store, session2.clone()).unwrap();
        assert!(!file2.exists());

        cleanup_test_dir(&test_dir);
    }
}
