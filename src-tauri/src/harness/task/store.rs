//! 任务存储
//!
//! 集中管理当前会话的任务列表。
//! 参考 claw-code 的设计，提供线程安全的任务状态管理。

use serde::{Deserialize, Serialize};
use std::sync::{Arc, RwLock};

/// 任务项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskItem {
    /// 任务内容（描述）
    pub content: String,

    /// 活动形式（进行中的描述）
    pub active_form: String,

    /// 任务状态
    pub status: TaskStatus,
}

/// 任务状态
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    /// 待处理
    Pending,

    /// 进行中
    InProgress,

    /// 已完成
    Completed,
}

/// 任务存储
#[derive(Clone)]
pub struct TaskStore {
    tasks: Arc<RwLock<Vec<TaskItem>>>,
}

impl TaskStore {
    /// 创建新的任务存储
    pub fn new() -> Self {
        Self {
            tasks: Arc::new(RwLock::new(Vec::new())),
        }
    }

    /// 添加任务列表
    ///
    /// 将新任务追加到现有列表中。
    pub fn add_tasks(&self, tasks: Vec<TaskItem>) -> Result<(), String> {
        let mut store = self.tasks.write().unwrap();
        store.extend(tasks);
        Ok(())
    }

    /// 设置任务列表（替换现有列表）
    pub fn set_tasks(&self, tasks: Vec<TaskItem>) -> Result<(), String> {
        let mut store = self.tasks.write().unwrap();
        *store = tasks;
        Ok(())
    }

    /// 更新任务状态
    pub fn update_task_status(&self, index: usize, status: TaskStatus) -> Result<(), String> {
        let mut store = self.tasks.write().unwrap();
        if index < store.len() {
            store[index].status = status;
            Ok(())
        } else {
            Err(format!(
                "Task index {} out of bounds (len: {})",
                index,
                store.len()
            ))
        }
    }

    /// 获取所有任务
    pub fn get_tasks(&self) -> Vec<TaskItem> {
        let store = self.tasks.read().unwrap();
        store.clone()
    }

    /// 获取任务数量
    pub fn task_count(&self) -> usize {
        let store = self.tasks.read().unwrap();
        store.len()
    }

    /// 获取特定状态的任务数量
    pub fn count_by_status(&self, status: TaskStatus) -> usize {
        let store = self.tasks.read().unwrap();
        store.iter().filter(|t| t.status == status).count()
    }

    /// 清空任务列表
    pub fn clear(&self) {
        let mut store = self.tasks.write().unwrap();
        store.clear();
    }

    /// 删除指定索引的任务
    pub fn remove_task(&self, index: usize) -> Result<TaskItem, String> {
        let mut store = self.tasks.write().unwrap();
        if index < store.len() {
            Ok(store.remove(index))
        } else {
            Err(format!(
                "Task index {} out of bounds (len: {})",
                index,
                store.len()
            ))
        }
    }
}

impl Default for TaskStore {
    fn default() -> Self {
        Self::new()
    }
}

// ============ 测试 ============

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_task_store_creation() {
        let store = TaskStore::new();
        assert_eq!(store.task_count(), 0);
    }

    #[test]
    fn test_add_tasks() {
        let store = TaskStore::new();
        let tasks = vec![
            TaskItem {
                content: "Task 1".to_string(),
                active_form: "Working on Task 1".to_string(),
                status: TaskStatus::Pending,
            },
            TaskItem {
                content: "Task 2".to_string(),
                active_form: "Working on Task 2".to_string(),
                status: TaskStatus::Pending,
            },
        ];

        store.add_tasks(tasks).unwrap();
        assert_eq!(store.task_count(), 2);
    }

    #[test]
    fn test_set_tasks() {
        let store = TaskStore::new();
        let tasks = vec![TaskItem {
            content: "New Task".to_string(),
            active_form: "Working on New Task".to_string(),
            status: TaskStatus::Pending,
        }];

        store.set_tasks(tasks).unwrap();
        assert_eq!(store.task_count(), 1);
    }

    #[test]
    fn test_update_task_status() {
        let store = TaskStore::new();
        let tasks = vec![TaskItem {
            content: "Task 1".to_string(),
            active_form: "Working".to_string(),
            status: TaskStatus::Pending,
        }];

        store.add_tasks(tasks).unwrap();
        store.update_task_status(0, TaskStatus::Completed).unwrap();

        let updated_tasks = store.get_tasks();
        assert_eq!(updated_tasks[0].status, TaskStatus::Completed);
    }

    #[test]
    fn test_update_task_status_out_of_bounds() {
        let store = TaskStore::new();
        let result = store.update_task_status(0, TaskStatus::Completed);
        assert!(result.is_err());
    }

    #[test]
    fn test_count_by_status() {
        let store = TaskStore::new();
        let tasks = vec![
            TaskItem {
                content: "Task 1".to_string(),
                active_form: "Working".to_string(),
                status: TaskStatus::Pending,
            },
            TaskItem {
                content: "Task 2".to_string(),
                active_form: "Working".to_string(),
                status: TaskStatus::InProgress,
            },
            TaskItem {
                content: "Task 3".to_string(),
                active_form: "Working".to_string(),
                status: TaskStatus::Pending,
            },
        ];

        store.add_tasks(tasks).unwrap();
        assert_eq!(store.count_by_status(TaskStatus::Pending), 2);
        assert_eq!(store.count_by_status(TaskStatus::InProgress), 1);
        assert_eq!(store.count_by_status(TaskStatus::Completed), 0);
    }

    #[test]
    fn test_clear() {
        let store = TaskStore::new();
        let tasks = vec![TaskItem {
            content: "Task 1".to_string(),
            active_form: "Working".to_string(),
            status: TaskStatus::Pending,
        }];

        store.add_tasks(tasks).unwrap();
        assert_eq!(store.task_count(), 1);

        store.clear();
        assert_eq!(store.task_count(), 0);
    }

    #[test]
    fn test_remove_task() {
        let store = TaskStore::new();
        let tasks = vec![
            TaskItem {
                content: "Task 1".to_string(),
                active_form: "Working".to_string(),
                status: TaskStatus::Pending,
            },
            TaskItem {
                content: "Task 2".to_string(),
                active_form: "Working".to_string(),
                status: TaskStatus::Pending,
            },
        ];

        store.add_tasks(tasks).unwrap();
        assert_eq!(store.task_count(), 2);

        let removed = store.remove_task(0).unwrap();
        assert_eq!(removed.content, "Task 1");
        assert_eq!(store.task_count(), 1);
    }

    #[test]
    fn test_remove_task_out_of_bounds() {
        let store = TaskStore::new();
        let result = store.remove_task(0);
        assert!(result.is_err());
    }

    #[test]
    fn test_task_status_serialization() {
        let status = TaskStatus::InProgress;
        let json = serde_json::to_string(&status).unwrap();
        assert_eq!(json, "\"in_progress\"");

        let deserialized: TaskStatus = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, TaskStatus::InProgress);
    }

    #[test]
    fn test_task_item_serialization() {
        let item = TaskItem {
            content: "Test task".to_string(),
            active_form: "Testing".to_string(),
            status: TaskStatus::Completed,
        };

        let json = serde_json::to_string(&item).unwrap();
        assert!(json.contains("\"completed\""));

        let deserialized: TaskItem = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.content, "Test task");
        assert_eq!(deserialized.status, TaskStatus::Completed);
    }
}
