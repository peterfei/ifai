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
    fs::write(&file_path, json).map_err(|e| format!("Failed to write breakdown file: {}", e))?;

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
pub async fn list_task_breakdowns(project_root: String) -> Result<Vec<TaskBreakdownData>, String> {
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
pub async fn delete_task_breakdown(project_root: String, id: String) -> Result<(), String> {
    println!("[TaskBreakdown] Deleting breakdown: {}", id);

    let tasks_dir = get_tasks_dir(&project_root)?;
    let file_path = tasks_dir.join("breakdowns").join(format!("{}.json", id));

    fs::remove_file(&file_path).map_err(|e| format!("Failed to delete breakdown file: {}", e))?;

    // 更新索引
    update_index(
        &tasks_dir,
        &TaskBreakdownData {
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
        },
    )?;

    println!("[TaskBreakdown] Deleted: {}", id);
    Ok(())
}

/// 更新索引文件
fn update_index(tasks_dir: &Path, breakdown: &TaskBreakdownData) -> Result<(), String> {
    let index_path = tasks_dir.join("index.json");

    // 读取现有索引
    let mut index: Vec<TaskIndexEntry> = if index_path.exists() {
        let json = fs::read_to_string(&index_path)
            .map_err(|e| format!("Failed to read index file: {}", e))?;
        serde_json::from_str(&json).unwrap_or_default()
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

    fs::write(&index_path, json).map_err(|e| format!("Failed to write index file: {}", e))?;

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

// ============================================================================
// 任务输出到 OpenSpec 提案（Phase 1: JSON → Markdown 转换）
// ============================================================================

/// 🔥 统一任务结构（借鉴 TodoWrite 设计）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnifiedTask {
    pub id: String,
    pub content: String, // 主内容（简化 title + description）
    #[serde(rename(serialize = "activeForm", deserialize = "activeForm"))]
    pub active_form: String, // 进度描述（借鉴 TodoWrite）
    pub status: TaskStatus, // 统一状态值
    pub dependencies: Vec<String>,
    pub meta: Option<TaskMeta>,
    pub children: Vec<UnifiedTask>,
}

/// 任务状态
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TaskStatus {
    Pending,
    #[serde(rename = "in_progress")]
    InProgress,
    Completed,
}

/// 任务元数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskMeta {
    pub priority: Option<String>,
    pub category: Option<String>,
    pub hours: Option<u32>,
    pub acceptance: Vec<String>,
}

/// 提案引用
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProposalReference {
    #[serde(alias = "proposalId")]
    pub proposal_id: String,
    #[serde(alias = "proposalTitle")]
    pub proposal_title: String,
}

/// 🔥 将任务分解结果追加到 OpenSpec 提案
#[tauri::command]
pub async fn append_task_breakdown_to_proposal(
    project_root: String,
    proposal_id: String,
    todos: Vec<UnifiedTask>,
    proposal_reference: ProposalReference,
) -> Result<(), String> {
    println!(
        "[TaskBreakdown] 📝 Appending tasks to proposal: {}",
        proposal_id
    );

    // 1. 构建提案路径
    let proposal_dir = Path::new(&project_root)
        .join(".ifai")
        .join("openspec")
        .join("proposals")
        .join(&proposal_id);

    if !proposal_dir.exists() {
        return Err(format!("Proposal directory not found: {:?}", proposal_dir));
    }

    let tasks_path = proposal_dir.join("tasks.md");

    // 2. 转换任务树为 Markdown
    let markdown = convert_unified_tasks_to_markdown(&todos, &proposal_reference);

    // 3. 追加到文件（保留现有内容）
    let existing_content = if tasks_path.exists() {
        fs::read_to_string(&tasks_path)
            .map_err(|e| format!("Failed to read existing tasks.md: {}", e))?
    } else {
        String::new()
    };

    let new_content = format!("{}\n{}", existing_content, markdown);

    // 4. 写入文件
    fs::write(&tasks_path, new_content).map_err(|e| format!("Failed to write tasks.md: {}", e))?;

    println!("[TaskBreakdown] ✅ Tasks appended to: {:?}", tasks_path);
    Ok(())
}

/// 🔥 转换统一任务为 Markdown 格式
fn convert_unified_tasks_to_markdown(
    tasks: &[UnifiedTask],
    proposal_ref: &ProposalReference,
) -> String {
    let mut md = String::new();

    // 标题
    md.push_str("# 任务列表\n\n");

    // 提案引用
    md.push_str(&format!("**提案**: `{}`\n", proposal_ref.proposal_id));
    md.push_str(&format!("**标题**: {}\n", proposal_ref.proposal_title));
    md.push_str("\n");

    // 遍历任务
    for task in tasks {
        md.push_str(&convert_task_to_markdown(task, 0));
    }

    md
}

/// 递归转换单个任务
fn convert_task_to_markdown(task: &UnifiedTask, level: usize) -> String {
    let mut md = String::new();
    let indent = "  ".repeat(level);

    // 标题（根据层级使用 H2/H3/H4）
    let heading = "#".repeat(2 + level.min(2));
    md.push_str(&format!(
        "{}{} {}: {}\n\n",
        indent, heading, task.id, task.content
    ));

    // 状态图标和进度
    let status_icon = match task.status {
        TaskStatus::Pending => "⏳",
        TaskStatus::InProgress => "🔄",
        TaskStatus::Completed => "✅",
    };
    md.push_str(&format!(
        "{}- **状态**: {} {:?}\n",
        indent, status_icon, task.status
    ));
    md.push_str(&format!("{}- **进度**: {} 👈\n", indent, task.active_form));

    // 元数据
    if let Some(meta) = &task.meta {
        if let Some(priority) = &meta.priority {
            md.push_str(&format!("{}- **优先级**: {}\n", indent, priority));
        }
        if let Some(category) = &meta.category {
            md.push_str(&format!("{}- **类别**: {}\n", indent, category));
        }
        if let Some(hours) = meta.hours {
            md.push_str(&format!("{}- **估算**: {} 小时\n", indent, hours));
        }
        if !meta.acceptance.is_empty() {
            md.push_str(&format!("{}- **验收标准**:\n", indent));
            for criteria in &meta.acceptance {
                md.push_str(&format!("{}  - {}\n", indent, criteria));
            }
        }
    }

    md.push_str("\n");

    // 子任务
    for child in &task.children {
        md.push_str(&convert_task_to_markdown(child, level + 1));
    }

    md
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_convert_unified_tasks_to_markdown() {
        let tasks = vec![UnifiedTask {
            id: "root-1".to_string(),
            content: "实现用户认证系统".to_string(),
            active_form: "实现用户认证系统中...".to_string(),
            status: TaskStatus::Pending,
            dependencies: vec![],
            meta: Some(TaskMeta {
                priority: Some("high".to_string()),
                category: Some("development".to_string()),
                hours: Some(0),
                acceptance: vec!["用户可以登录".to_string(), "用户可以注册".to_string()],
            }),
            children: vec![UnifiedTask {
                id: "task-1".to_string(),
                content: "设计数据库结构".to_string(),
                active_form: "设计数据库结构中...".to_string(),
                status: TaskStatus::Pending,
                dependencies: vec![],
                meta: Some(TaskMeta {
                    priority: Some("high".to_string()),
                    category: Some("development".to_string()),
                    hours: Some(2),
                    acceptance: vec!["用户表已创建".to_string()],
                }),
                children: vec![],
            }],
        }];

        let proposal_ref = ProposalReference {
            proposal_id: "add-user-authentication".to_string(),
            proposal_title: "实现用户认证系统".to_string(),
        };

        let markdown = convert_unified_tasks_to_markdown(&tasks, &proposal_ref);

        // 验证 Markdown 包含关键内容
        assert!(markdown.contains("# 任务列表"));
        assert!(markdown.contains("**提案**: `add-user-authentication`"));
        assert!(markdown.contains("## root-1: 实现用户认证系统"));
        assert!(markdown.contains("### task-1: 设计数据库结构"));
        assert!(markdown.contains("⏳"));
        assert!(markdown.contains("👈"));
        assert!(markdown.contains("**优先级**: high"));
        assert!(markdown.contains("**估算**: 2 小时"));
    }

    #[test]
    fn test_task_status_serialization() {
        // 测试 TaskStatus 序列化
        let status = TaskStatus::InProgress;
        let json = serde_json::to_string(&status).unwrap();
        assert!(json.contains("in_progress"));

        // 测试反序列化
        let deserialized: TaskStatus = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, TaskStatus::InProgress);
    }

    #[test]
    fn test_unified_task_with_active_form() {
        let task = UnifiedTask {
            id: "test-1".to_string(),
            content: "测试任务".to_string(),
            active_form: "测试任务进行中...".to_string(),
            status: TaskStatus::InProgress,
            dependencies: vec![],
            meta: None,
            children: vec![],
        };

        // 测试序列化
        let json = serde_json::to_string(&task).unwrap();
        assert!(json.contains("activeForm"));

        // 测试反序列化
        let deserialized: UnifiedTask = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.id, "test-1");
        assert_eq!(deserialized.content, "测试任务");
        assert_eq!(deserialized.active_form, "测试任务进行中...");
    }
}
