/**
 * 任务拆解文件存储 Commands
 * v0.2.6 新增
 *
 * 负责任务拆解结果的文件读写
 */

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

/// 任务拆解结果（对应前端的 TaskBreakdown）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskBreakdownData {
    pub id: String,
    pub title: String,
    pub description: String,
    #[serde(alias = "originalPrompt")]
    pub original_prompt: String,
    #[serde(alias = "taskTree")]
    pub task_tree: TaskNodeData,
    #[serde(alias = "createdAt")]
    pub created_at: u64,
    #[serde(alias = "updatedAt")]
    pub updated_at: u64,
    pub status: String,
    #[serde(alias = "openspecProposal")]
    pub openspec_proposal: Option<OpenSpecProposalData>,
    #[serde(alias = "totalEstimatedHours")]
    pub total_estimated_hours: Option<f64>,
    pub stats: Option<TaskStatsData>,
}

/// 任务节点（对应前端的 TaskNode）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskNodeData {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub status: String,
    pub dependencies: Vec<String>,
    pub children: Vec<TaskNodeData>,
    #[serde(alias = "estimatedHours")]
    pub estimated_hours: Option<f64>,
    pub category: Option<String>,
    #[serde(alias = "acceptanceCriteria")]
    pub acceptance_criteria: Option<Vec<String>>,
    pub priority: Option<String>,
    pub assignee: Option<String>,
    pub tags: Option<Vec<String>>,
}

/// OpenSpec 提案信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenSpecProposalData {
    #[serde(alias = "changeId")]
    pub change_id: String,
    pub path: String,
    #[serde(alias = "isValid")]
    pub is_valid: bool,
}

/// 任务统计信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskStatsData {
    pub total: u32,
    pub pending: u32,
    #[serde(alias = "inProgress")]
    pub in_progress: u32,
    pub completed: u32,
    pub failed: u32,
}

/// 获取任务拆解存储目录
fn get_tasks_dir(project_root: &str) -> Result<PathBuf, String> {
    let tasks_dir = Path::new(project_root).join(".ifai").join("tasks");

    // 创建目录结构
    fs::create_dir_all(&tasks_dir)
        .map_err(|e| format!("Failed to create tasks directory: {}", e))?;

    let breakdowns_dir = tasks_dir.join("breakdowns");
    fs::create_dir_all(&breakdowns_dir)
        .map_err(|e| format!("Failed to create breakdowns directory: {}", e))?;

    Ok(tasks_dir)
}

/// 保存任务拆解到文件
#[tauri::command]
pub async fn save_task_breakdown(
    project_root: String,
    breakdown: TaskBreakdownData,
) -> Result<(), String> {
    println!("[TaskBreakdown] Saving breakdown: {}", breakdown.id);

    let tasks_dir = get_tasks_dir(&project_root)?;
    let breakdowns_dir = tasks_dir.join("breakdowns");

    // 文件名：tb-{timestamp}-{slug}.json
    let file_name = format!("{}.json", breakdown.id);
    let file_path = breakdowns_dir.join(&file_name);

    // 序列化为 JSON
    let json = serde_json::to_string_pretty(&breakdown)
        .map_err(|e| format!("Failed to serialize breakdown: {}", e))?;

    // 写入文件
    fs::write(&file_path, json)
        .map_err(|e| format!("Failed to write breakdown file: {}", e))?;

    // 更新索引文件
    update_index(&tasks_dir, &breakdown)?;

    println!("[TaskBreakdown] Saved to: {:?}", file_path);
    Ok(())
}

/// 从文件加载任务拆解
#[tauri::command]
pub async fn load_task_breakdown(
    project_root: String,
    id: String,
) -> Result<TaskBreakdownData, String> {
    println!("[TaskBreakdown] Loading breakdown: {}", id);

    let tasks_dir = get_tasks_dir(&project_root)?;
    let file_path = tasks_dir.join("breakdowns").join(format!("{}.json", id));

    // 读取文件
    let json = fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read breakdown file: {}", e))?;

    // 反序列化
    let breakdown: TaskBreakdownData = serde_json::from_str(&json)
        .map_err(|e| format!("Failed to deserialize breakdown: {}", e))?;

    println!("[TaskBreakdown] Loaded: {}", breakdown.title);
    Ok(breakdown)
}

/// 列出所有任务拆解
#[tauri::command]
pub async fn list_task_breakdowns(
    project_root: String,
) -> Result<Vec<TaskBreakdownData>, String> {
    println!("[TaskBreakdown] Listing all breakdowns");

    let tasks_dir = get_tasks_dir(&project_root)?;
    let breakdowns_dir = tasks_dir.join("breakdowns");

    if !breakdowns_dir.exists() {
        return Ok(Vec::new());
    }

    let mut breakdowns = Vec::new();

    // 读取目录中的所有 JSON 文件
    let entries = fs::read_dir(&breakdowns_dir)
        .map_err(|e| format!("Failed to read breakdowns directory: {}", e))?;

    for entry in entries {
        if let Ok(entry) = entry {
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) == Some("json") {
                // 读取文件
                if let Ok(json) = fs::read_to_string(&path) {
                    if let Ok(breakdown) = serde_json::from_str::<TaskBreakdownData>(&json) {
                        breakdowns.push(breakdown);
                    }
                }
            }
        }
    }

    // 按创建时间倒序排序
    breakdowns.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    println!("[TaskBreakdown] Found {} breakdowns", breakdowns.len());
    Ok(breakdowns)
}

/// 删除任务拆解
#[tauri::command]
pub async fn delete_task_breakdown(
    project_root: String,
    id: String,
) -> Result<(), String> {
    println!("[TaskBreakdown] Deleting breakdown: {}", id);

    let tasks_dir = get_tasks_dir(&project_root)?;
    let file_path = tasks_dir.join("breakdowns").join(format!("{}.json", id));

    fs::remove_file(&file_path)
        .map_err(|e| format!("Failed to delete breakdown file: {}", e))?;

    // 更新索引
    update_index(&tasks_dir, &TaskBreakdownData {
        id: id.clone(),
        title: String::new(),
        description: String::new(),
        original_prompt: String::new(),
        task_tree: TaskNodeData {
            id: String::new(),
            title: String::new(),
            description: None,
            status: String::new(),
            dependencies: Vec::new(),
            children: Vec::new(),
            estimated_hours: None,
            category: None,
            acceptance_criteria: None,
            priority: None,
            assignee: None,
            tags: None,
        },
        created_at: 0,
        updated_at: 0,
        status: String::new(),
        openspec_proposal: None,
        total_estimated_hours: None,
        stats: None,
    })?;

    println!("[TaskBreakdown] Deleted: {}", id);
    Ok(())
}

/// 更新索引文件
fn update_index(
    tasks_dir: &Path,
    breakdown: &TaskBreakdownData,
) -> Result<(), String> {
    let index_path = tasks_dir.join("index.json");

    // 读取现有索引
    let mut index: Vec<TaskIndexEntry> = if index_path.exists() {
        let json = fs::read_to_string(&index_path)
            .map_err(|e| format!("Failed to read index file: {}", e))?;
        serde_json::from_str(&json)
            .unwrap_or_default()
    } else {
        Vec::new()
    };

    // 查找并更新或添加条目
    let entry = TaskIndexEntry {
        id: breakdown.id.clone(),
        title: breakdown.title.clone(),
        created_at: breakdown.created_at,
        updated_at: breakdown.updated_at,
        status: breakdown.status.clone(),
    };

    if let Some(pos) = index.iter().position(|e| e.id == breakdown.id) {
        index[pos] = entry;
    } else {
        index.push(entry);
    }

    // 按更新时间排序
    index.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));

    // 写回文件
    let json = serde_json::to_string_pretty(&index)
        .map_err(|e| format!("Failed to serialize index: {}", e))?;

    fs::write(&index_path, json)
        .map_err(|e| format!("Failed to write index file: {}", e))?;

    Ok(())
}

/// 索引条目
#[derive(Debug, Clone, Serialize, Deserialize)]
struct TaskIndexEntry {
    id: String,
    title: String,
    created_at: u64,
    updated_at: u64,
    status: String,
}

impl Default for TaskIndexEntry {
    fn default() -> Self {
        Self {
            id: String::new(),
            title: String::new(),
            created_at: 0,
            updated_at: 0,
            status: String::new(),
        }
    }
}
