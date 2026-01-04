/**
 * OpenSpec 提案 Commands
 * v0.2.6 新增
 *
 * 负责提案的文件读写和管理
 */

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

/// 提案位置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProposalLocation {
    Proposals,
    Changes,
    Archive,
}

/// 提案数据（对应前端的 OpenSpecProposal）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProposalData {
    pub id: String,
    pub path: String,
    pub status: String,
    #[serde(rename = "location")]
    pub proposal_location: String,
    pub why: String,
    #[serde(rename = "whatChanges")]
    pub what_changes: Vec<String>,
    pub impact: ProposalImpactData,
    pub tasks: Vec<ProposalTaskData>,
    #[serde(rename = "specDeltas")]
    pub spec_deltas: Vec<SpecDeltaData>,
    pub design: Option<String>,
    #[serde(rename = "createdAt")]
    pub created_at: u64,
    #[serde(rename = "updatedAt")]
    pub updated_at: u64,
    pub validated: bool,
    #[serde(rename = "validationErrors")]
    pub validation_errors: Option<Vec<String>>,
    #[serde(rename = "validationWarnings")]
    pub validation_warnings: Option<Vec<String>>,
}

/// 提案影响范围
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProposalImpactData {
    pub specs: Vec<String>,
    pub files: Vec<String>,
    #[serde(rename = "breakingChanges")]
    pub breaking_changes: bool,
}

/// 提案任务
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProposalTaskData {
    pub id: String,
    pub title: String,
    pub description: String,
    pub category: String,
    #[serde(rename = "estimatedHours")]
    pub estimated_hours: f64,
    pub dependencies: Option<Vec<String>>,
}

/// Spec 增量
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpecDeltaData {
    pub capability: String,
    #[serde(rename = "type")]
    pub delta_type: String,
    pub content: String,
    pub scenarios: Option<Vec<ScenarioData>>,
}

/// 场景定义
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScenarioData {
    pub name: String,
    pub description: String,
    pub given: Option<String>,
    #[serde(rename = "when")]
    pub when_clause: String,
    pub then: String,
}

/// 提案索引
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProposalIndexData {
    pub proposals: Vec<ProposalIndexItem>,
    #[serde(rename = "lastUpdated")]
    pub last_updated: u64,
}

/// 提案索引项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProposalIndexItem {
    pub id: String,
    pub title: String,
    pub status: String,
    pub location: String,
    #[serde(rename = "createdAt")]
    pub created_at: u64,
    #[serde(rename = "updatedAt")]
    pub updated_at: u64,
}

/// 获取提案存储目录
fn get_proposals_base_dir(root_path: &str) -> Result<PathBuf, String> {
    // 使用传入的项目根目录
    let base_dir = PathBuf::from(root_path);

    let ifai_dir = base_dir.join(".ifai");

    // 创建目录结构
    fs::create_dir_all(&ifai_dir)
        .map_err(|e| format!("Failed to create .ifai directory: {}", e))?;

    for location in &[ProposalLocation::Proposals, ProposalLocation::Changes, ProposalLocation::Archive] {
        let dir = ifai_dir.join(location_str(location));
        fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create {} directory: {}", location_str(location), e))?;
    }

    Ok(ifai_dir)
}

/// 将 ProposalLocation 转换为字符串
fn location_str(location: &ProposalLocation) -> &str {
    match location {
        ProposalLocation::Proposals => "proposals",
        ProposalLocation::Changes => "changes",
        ProposalLocation::Archive => "archive",
    }
}

/// 获取提案目录路径
fn get_proposal_dir(id: &str, location: &ProposalLocation, root_path: &str) -> Result<PathBuf, String> {
    let base_dir = get_proposals_base_dir(root_path)?;
    let dir = base_dir.join(location_str(location)).join(id);
    Ok(dir)
}

/// 保存提案
#[tauri::command]
pub async fn save_proposal(
    proposal: ProposalData,
    location: ProposalLocation,
    root_path: String,
) -> Result<(), String> {
    println!("[Proposal] Saving proposal: {} at root: {}", proposal.id, root_path);

    let proposal_dir = get_proposal_dir(&proposal.id, &location, &root_path)?;

    // 创建提案目录
    fs::create_dir_all(&proposal_dir)
        .map_err(|e| format!("Failed to create proposal directory: {}", e))?;

    // 保存 proposal.md
    let proposal_md = generate_proposal_md(&proposal);
    fs::write(proposal_dir.join("proposal.md"), proposal_md)
        .map_err(|e| format!("Failed to write proposal.md: {}", e))?;

    // 保存 tasks.md
    let tasks_md = generate_tasks_md(&proposal);
    fs::write(proposal_dir.join("tasks.md"), tasks_md)
        .map_err(|e| format!("Failed to write tasks.md: {}", e))?;

    // 如果有 design.md，保存它
    if let Some(design) = &proposal.design {
        fs::write(proposal_dir.join("design.md"), design)
            .map_err(|e| format!("Failed to write design.md: {}", e))?;
    }

    // 保存 spec deltas
    let specs_dir = proposal_dir.join("specs");
    for delta in &proposal.spec_deltas {
        let spec_dir = specs_dir.join(&delta.capability);
        fs::create_dir_all(&spec_dir)
            .map_err(|e| format!("Failed to create spec directory: {}", e))?;

        let spec_md = generate_spec_delta_md(delta);
        fs::write(spec_dir.join("spec.md"), spec_md)
            .map_err(|e| format!("Failed to write spec.md: {}", e))?;
    }

    // 保存元数据 JSON
    let json = serde_json::to_string_pretty(&proposal)
        .map_err(|e| format!("Failed to serialize proposal: {}", e))?;
    fs::write(proposal_dir.join("metadata.json"), json)
        .map_err(|e| format!("Failed to write metadata.json: {}", e))?;

    // 更新索引
    update_index(&proposal, &location, &root_path)?;

    println!("[Proposal] Saved to: {:?}", proposal_dir);
    Ok(())
}

/// 加载提案
#[tauri::command]
pub async fn load_proposal(
    id: String,
    location: ProposalLocation,
    root_path: String,
) -> Result<ProposalData, String> {
    println!("[Proposal] Loading proposal: {} from root: {}", id, root_path);

    let proposal_dir = get_proposal_dir(&id, &location, &root_path)?;
    let metadata_path = proposal_dir.join("metadata.json");

    // 读取元数据
    let json = fs::read_to_string(&metadata_path)
        .map_err(|e| format!("Failed to read metadata.json: {}", e))?;

    let proposal: ProposalData = serde_json::from_str(&json)
        .map_err(|e| format!("Failed to deserialize proposal: {}", e))?;

    println!("[Proposal] Loaded: {}", proposal.id);
    Ok(proposal)
}

/// 删除提案
#[tauri::command]
pub async fn delete_proposal(
    id: String,
    location: ProposalLocation,
    root_path: String,
) -> Result<(), String> {
    println!("[Proposal] Deleting proposal: {} from root: {}", id, root_path);

    let proposal_dir = get_proposal_dir(&id, &location, &root_path)?;

    fs::remove_dir_all(&proposal_dir)
        .map_err(|e| format!("Failed to delete proposal directory: {}", e))?;

    println!("[Proposal] Deleted: {}", id);
    Ok(())
}

/// 移动提案
#[tauri::command]
pub async fn move_proposal(
    id: String,
    from: ProposalLocation,
    to: ProposalLocation,
    root_path: String,
) -> Result<(), String> {
    println!("[Proposal] Moving proposal: {} from {:?} to {:?} (root: {})", id, from, to, root_path);

    let from_dir = get_proposal_dir(&id, &from, &root_path)?;
    let to_dir = get_proposal_dir(&id, &to, &root_path)?;

    // 如果目标目录已存在，先删除它
    if to_dir.exists() {
        println!("[Proposal] Target directory exists, removing: {:?}", to_dir);
        fs::remove_dir_all(&to_dir)
            .map_err(|e| format!("Failed to remove existing target directory: {}", e))?;
    }

    // 移动目录
    fs::rename(&from_dir, &to_dir)
        .map_err(|e| format!("Failed to move proposal: {}", e))?;

    // 更新元数据中的位置
    let metadata_path = to_dir.join("metadata.json");
    let json = fs::read_to_string(&metadata_path)
        .map_err(|e| format!("Failed to read metadata.json: {}", e))?;

    let mut proposal: ProposalData = serde_json::from_str(&json)
        .map_err(|e| format!("Failed to deserialize proposal: {}", e))?;

    proposal.proposal_location = location_str(&to).to_string();
    proposal.path = format!(".ifai/{}/{}", location_str(&to), id);

    // 保存更新后的元数据
    let updated_json = serde_json::to_string_pretty(&proposal)
        .map_err(|e| format!("Failed to serialize proposal: {}", e))?;
    fs::write(&metadata_path, updated_json)
        .map_err(|e| format!("Failed to write metadata.json: {}", e))?;

    println!("[Proposal] Moved: {}", id);
    Ok(())
}

/// 列出所有提案
#[tauri::command]
pub async fn list_proposals(root_path: String) -> Result<ProposalIndexData, String> {
    println!("[Proposal] Listing all proposals from root: {}", root_path);

    let mut all_proposals = Vec::new();

    // 扫描所有位置
    for location in &[ProposalLocation::Proposals, ProposalLocation::Changes, ProposalLocation::Archive] {
        let base_dir = get_proposals_base_dir(&root_path)?;
        let location_dir = base_dir.join(location_str(location));

        if !location_dir.exists() {
            continue;
        }

        let entries = fs::read_dir(&location_dir)
            .map_err(|e| format!("Failed to read directory: {}", e))?;

        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let metadata_path = path.join("metadata.json");
                if metadata_path.exists() {
                    if let Ok(json) = fs::read_to_string(&metadata_path) {
                        if let Ok(proposal) = serde_json::from_str::<ProposalData>(&json) {
                            all_proposals.push(ProposalIndexItem {
                                id: proposal.id.clone(),
                                title: proposal.why.clone(),
                                status: proposal.status,
                                location: proposal.proposal_location,
                                created_at: proposal.created_at,
                                updated_at: proposal.updated_at,
                            });
                        }
                    }
                }
            }
        }
    }

    // 按更新时间倒序排序
    all_proposals.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));

    let index = ProposalIndexData {
        proposals: all_proposals,
        last_updated: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as u64,
    };

    println!("[Proposal] Found {} proposals", index.proposals.len());
    Ok(index)
}

/// 更新索引
fn update_index(proposal: &ProposalData, location: &ProposalLocation, root_path: &str) -> Result<(), String> {
    let base_dir = get_proposals_base_dir(root_path)?;
    let location_str = location_str(location);
    let index_path = base_dir.join(location_str).join("index.json");

    // 读取现有索引
    let mut index: ProposalIndexData = if index_path.exists() {
        let json = fs::read_to_string(&index_path)
            .map_err(|e| format!("Failed to read index file: {}", e))?;
        serde_json::from_str(&json).unwrap_or(ProposalIndexData {
            proposals: Vec::new(),
            last_updated: 0,
        })
    } else {
        ProposalIndexData {
            proposals: Vec::new(),
            last_updated: 0,
        }
    };

    // 查找并更新或添加条目
    let item = ProposalIndexItem {
        id: proposal.id.clone(),
        title: proposal.why.clone(),
        status: proposal.status.clone(),
        location: location_str.to_string(),
        created_at: proposal.created_at,
        updated_at: proposal.updated_at,
    };

    if let Some(pos) = index.proposals.iter().position(|e| e.id == proposal.id) {
        index.proposals[pos] = item;
    } else {
        index.proposals.push(item);
    }

    // 按更新时间排序
    index.proposals.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));

    // 写回文件
    let json = serde_json::to_string_pretty(&index)
        .map_err(|e| format!("Failed to serialize index: {}", e))?;

    fs::write(&index_path, json)
        .map_err(|e| format!("Failed to write index file: {}", e))?;

    Ok(())
}

/// 生成 proposal.md 内容
fn generate_proposal_md(proposal: &ProposalData) -> String {
    format!(
        r#"# Proposal: {}

## Why

{}

## What Changes

{}

## Impact

- **Specs affected**: {}
- **Files affected**: {}
- **Breaking changes**: {}
"#,
        proposal.id,
        proposal.why,
        proposal.what_changes.join("\n"),
        proposal.impact.specs.join(", "),
        proposal.impact.files.join(", "),
        if proposal.impact.breaking_changes { "Yes" } else { "No" }
    )
}

/// 生成 tasks.md 内容
fn generate_tasks_md(proposal: &ProposalData) -> String {
    let mut content = String::from("# Tasks\n\n");

    for (i, task) in proposal.tasks.iter().enumerate() {
        content.push_str(&format!(
            "## Task {}: {} ({})\n\n",
            i + 1,
            task.title,
            task.category
        ));
        content.push_str(&format!("{}\n\n", task.description));
        content.push_str(&format!("**Estimated**: {} hours\n\n", task.estimated_hours));
    }

    content
}

/// 生成 spec delta 内容
fn generate_spec_delta_md(delta: &SpecDeltaData) -> String {
    let delta_type_str = match delta.delta_type.as_str() {
        "ADDED" => "ADDED",
        "MODIFIED" => "MODIFIED",
        "REMOVED" => "REMOVED",
        _ => "UNKNOWN",
    };

    let mut content = format!("## {}: {}\n\n", delta_type_str, delta.capability);
    content.push_str(&format!("{}\n\n", delta.content));

    if let Some(scenarios) = &delta.scenarios {
        for scenario in scenarios {
            content.push_str("### Scenario\n\n");
            content.push_str(&format!("**{}**: {}\n\n", scenario.name, scenario.description));

            if let Some(given) = &scenario.given {
                content.push_str(&format!("Given {}\n", given));
            }
            content.push_str(&format!("When {}\n", scenario.when_clause));
            content.push_str(&format!("Then {}\n\n", scenario.then));
        }
    }

    content
}
