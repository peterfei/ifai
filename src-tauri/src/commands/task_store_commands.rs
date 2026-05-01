//! 任务存储 Tauri 命令
//!
//! 提供前端访问任务存储的接口。

use crate::harness::task::{TaskItem, TaskStatus, TaskStore};

/// 获取当前任务列表
#[tauri::command]
pub async fn get_tasks(state: tauri::State<'_, TaskStore>) -> Result<Vec<TaskItem>, String> {
    Ok(state.get_tasks())
}

/// 更新任务状态
///
/// # 参数
/// - `index`: 任务索引（从 0 开始）
/// - `status`: 新状态（"pending"、"in_progress"、"completed"）
#[tauri::command]
pub async fn update_task(
    state: tauri::State<'_, TaskStore>,
    index: usize,
    status: String,
) -> Result<(), String> {
    let task_status = match status.as_str() {
        "pending" => TaskStatus::Pending,
        "in_progress" => TaskStatus::InProgress,
        "completed" => TaskStatus::Completed,
        _ => {
            return Err(format!(
                "Invalid task status: '{}'. Expected: pending, in_progress, or completed",
                status
            ))
        }
    };
    state.update_task_status(index, task_status)
}

/// 清空任务列表
#[tauri::command]
pub async fn clear_tasks(state: tauri::State<'_, TaskStore>) -> Result<(), String> {
    state.clear();
    Ok(())
}

/// 删除指定任务
#[tauri::command]
pub async fn remove_task(
    state: tauri::State<'_, TaskStore>,
    index: usize,
) -> Result<TaskItem, String> {
    state.remove_task(index)
}

/// 获取任务统计信息
#[tauri::command]
pub async fn get_task_stats(state: tauri::State<'_, TaskStore>) -> Result<TaskStats, String> {
    Ok(TaskStats {
        total: state.task_count(),
        pending: state.count_by_status(TaskStatus::Pending),
        in_progress: state.count_by_status(TaskStatus::InProgress),
        completed: state.count_by_status(TaskStatus::Completed),
    })
}

/// 任务统计信息
#[derive(serde::Serialize)]
pub struct TaskStats {
    pub total: usize,
    pub pending: usize,
    pub in_progress: usize,
    pub completed: usize,
}

// ============ 测试 ============

#[cfg(test)]
mod tests {
    use super::*;

    // 注意：这些测试需要 Tauri 的 AppState 支持
    // 在实际环境中，这些会被集成测试覆盖
}
