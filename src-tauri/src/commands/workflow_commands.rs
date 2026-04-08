//! 多智能体工作流 Tauri 命令
//!
//! 提供前端 UI 与工作流系统的集成

use crate::agent_system::workflow::*;
use std::sync::Arc;
use tokio::sync::Mutex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// 工作流执行状态
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowStatus {
    pub id: String,
    pub status: String,
    pub current_node: Option<String>,
    pub completed_nodes: Vec<String>,
    pub started_at: Option<i64>,
    pub message: Option<String>,
}

/// 工作流执行结果（UI用）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowExecutionResult {
    pub workflow_id: String,
    pub status: String,
    pub node_results: Vec<NodeResultInfo>,
    pub started_at: Option<i64>,
    pub completed_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeResultInfo {
    pub node_id: String,
    pub status: String,
    pub output: Option<String>,
    pub error: Option<String>,
}

/// 全局工作流管理器
static WORKFLOW_MANAGER: std::sync::OnceLock<Arc<Mutex<WorkflowManager>>> = std::sync::OnceLock::new();

fn get_workflow_manager() -> Arc<Mutex<WorkflowManager>> {
    WORKFLOW_MANAGER.get_or_init(|| {
        Arc::new(Mutex::new(WorkflowManager::new()))
    }).clone()
}

/// 工作流管理器
pub struct WorkflowManager {
    running_workflows: HashMap<String, Arc<Mutex<WorkflowRunner>>>,
}

impl WorkflowManager {
    pub fn new() -> Self {
        Self {
            running_workflows: HashMap::new(),
        }
    }

    pub fn start_workflow(
        &mut self,
        id: String,
        runner: WorkflowRunner,
    ) -> Result<(), String> {
        self.running_workflows.insert(id, Arc::new(Mutex::new(runner)));
        Ok(())
    }

    pub fn get_workflow(&self, id: &str) -> Option<Arc<Mutex<WorkflowRunner>>> {
        self.running_workflows.get(id).cloned()
    }

    pub fn remove_workflow(&mut self, id: &str) {
        self.running_workflows.remove(id);
    }
}

/// 从 YAML 字符串解析工作流
#[tauri::command]
pub async fn parse_workflow_from_yaml(yaml_content: String) -> Result<Workflow, String> {
    WorkflowParser::from_str(&yaml_content)
        .map_err(|e| format!("YAML 解析失败: {}", e))
}

/// 从 YAML 文件加载工作流
#[tauri::command]
pub async fn load_workflow_from_file(file_path: String) -> Result<Workflow, String> {
    let yaml_content = std::fs::read_to_string(&file_path)
        .map_err(|e| format!("无法读取文件: {}", e))?;

    WorkflowParser::from_str(&yaml_content)
        .map_err(|e| format!("YAML 解析失败: {}", e))
}

/// 验证工作流
#[tauri::command]
pub async fn validate_workflow(workflow: Workflow) -> Result<(), String> {
    workflow.validate()
        .map_err(|e| format!("工作流验证失败: {:?}", e))
}

/// 获取工作流执行计划
#[tauri::command]
pub async fn get_workflow_schedule(workflow: Workflow) -> Result<ScheduleInfo, String> {
    let schedule = WorkflowScheduler::schedule(&workflow)
        .map_err(|e| format!("调度失败: {:?}", e))?;

    // 构建并行组信息
    let parallel_groups: Vec<Vec<String>> = schedule.parallel_groups
        .iter()
        .map(|group| group.iter().cloned().collect())
        .collect();

    Ok(ScheduleInfo {
        execution_order: schedule.execution_order,
        parallel_groups,
    })
}

/// 执行工作流（异步）
#[tauri::command]
pub async fn execute_workflow(
    workflow: Workflow,
    _window: tauri::Window,
) -> Result<String, String> {
    let workflow_id = workflow.id.clone();

    // 创建运行器
    let runner = WorkflowRunner::with_default_config(workflow)
        .map_err(|e| format!("创建运行器失败: {}", e))?;

    // 注册工作流
    {
        let manager = get_workflow_manager();
        let mut manager = manager.lock().await;
        manager.start_workflow(workflow_id.clone(), runner)?;
    }

    // 在后台执行
    let workflow_id_clone = workflow_id.clone();
    tokio::spawn(async move {
        let manager = get_workflow_manager();
        if let Some(runner_arc) = {
            let mgr = manager.lock().await;
            mgr.get_workflow(&workflow_id_clone)
        } {
            let mut runner = runner_arc.lock().await;
            match runner.run().await {
                Ok(_result) => {
                    // TODO: 发送完成事件（需要使用 AppHandle）
                    // 清理
                    let mut manager = manager.lock().await;
                    manager.remove_workflow(&workflow_id_clone);
                }
                Err(_e) => {
                    // TODO: 发送错误事件（需要使用 AppHandle）
                    // 清理
                    let mut manager = manager.lock().await;
                    manager.remove_workflow(&workflow_id_clone);
                }
            }
        }
    });

    Ok(workflow_id)
}

/// 取消工作流执行
#[tauri::command]
pub async fn cancel_workflow(workflow_id: String) -> Result<(), String> {
    let manager = get_workflow_manager();
    let mut manager = manager.lock().await;

    if let Some(runner_arc) = manager.get_workflow(&workflow_id) {
        let mut runner = runner_arc.lock().await;
        runner.cancel().await
            .map_err(|e| format!("取消失败: {}", e))?;

        manager.remove_workflow(&workflow_id);
        Ok(())
    } else {
        Err("工作流不存在".to_string())
    }
}

/// 获取工作流状态
#[tauri::command]
pub async fn get_workflow_status(workflow_id: String) -> Result<WorkflowStatus, String> {
    let manager = get_workflow_manager();
    let manager_lock = manager.lock().await;

    if let Some(runner_arc) = manager_lock.get_workflow(&workflow_id) {
        let runner = runner_arc.lock().await;
        let status = runner.get_status().await;
        Ok(WorkflowStatus {
            id: workflow_id,
            status: format!("{:?}", status),
            current_node: None,
            completed_nodes: vec![],
            started_at: None,
            message: None,
        })
    } else {
        Err("工作流不存在".to_string())
    }
}

/// 获取默认工作流列表
#[tauri::command]
pub async fn get_default_workflows() -> Result<Vec<DefaultWorkflow>, String> {
    let workflows = vec![
        DefaultWorkflow {
            id: "default-code-review".to_string(),
            name: "默认代码审查".to_string(),
            description: "自动探索、审查、测试和生成文档".to_string(),
            file_path: "workflows/default-code-review.yml".to_string(),
            nodes_count: 5,
        },
        DefaultWorkflow {
            id: "simple-exploration".to_string(),
            name: "简单探索".to_string(),
            description: "快速探索和分析项目结构".to_string(),
            file_path: "workflows/simple-exploration.yml".to_string(),
            nodes_count: 2,
        },
        DefaultWorkflow {
            id: "quality-check".to_string(),
            name: "质量检查".to_string(),
            description: "全面的代码质量检查和分析".to_string(),
            file_path: "workflows/quality-check.yml".to_string(),
            nodes_count: 3,
        },
    ];

    Ok(workflows)
}

/// 创建自定义工作流
#[tauri::command]
pub async fn create_custom_workflow(
    id: String,
    name: String,
    description: String,
    nodes: Vec<NodeConfig>,
    edges: Vec<EdgeConfig>,
) -> Result<Workflow, String> {
    let mut workflow = Workflow::new(&id, &name)
        .with_description(&description);

    // 添加节点
    for node_config in nodes {
        let agent_type = AgentType::from_str(&node_config.agent_type)
            .ok_or_else(|| format!("无效的智能体类型: {}", node_config.agent_type))?;

        let mut node = WorkflowNode::new(&node_config.id, agent_type);

        if let Some(label) = node_config.label {
            node = node.with_label(&label);
        }

        workflow.add_node(node);
    }

    // 添加边
    for edge_config in edges {
        let mut edge = WorkflowEdge::new(&edge_config.from, &edge_config.to);

        if let Some(condition) = edge_config.condition {
            edge = edge.with_condition(&condition);
        }

        workflow.add_edge(edge);
    }

    Ok(workflow)
}

/// 执行快速工作流（预设模板）
#[tauri::command]
pub async fn execute_quick_workflow(
    workflow_type: String,
    target_path: String,
    window: tauri::Window,
) -> Result<String, String> {
    let workflow = match workflow_type.as_str() {
        "code_review" => {
            create_quick_code_review_workflow(&target_path)
        }
        "exploration" => {
            create_quick_exploration_workflow(&target_path)
        }
        "quality_check" => {
            create_quick_quality_check_workflow(&target_path)
        }
        _ => {
            return Err(format!("未知的工作流类型: {}", workflow_type));
        }
    };

    execute_workflow(workflow, window).await
}

// ==================== 辅助结构 ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduleInfo {
    pub execution_order: Vec<String>,
    pub parallel_groups: Vec<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DefaultWorkflow {
    pub id: String,
    pub name: String,
    pub description: String,
    pub file_path: String,
    pub nodes_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeConfig {
    pub id: String,
    pub agent_type: String,
    pub label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EdgeConfig {
    pub from: String,
    pub to: String,
    pub condition: Option<String>,
}

// ==================== 快速工作流模板 ====================

fn create_quick_code_review_workflow(target_path: &str) -> Workflow {
    let mut workflow = Workflow::new("quick-code-review", "快速代码审查")
        .with_description("自动代码审查和改进建议");

    workflow
        .add_node(WorkflowNode::new("explore", AgentType::Explore)
            .with_label("探索代码"))
        .add_node(WorkflowNode::new("review", AgentType::Review)
            .with_label("代码审查"))
        .add_node(WorkflowNode::new("refactor", AgentType::Refactor)
            .with_label("重构建议"))
        .add_edge(WorkflowEdge::new("explore", "review"))
        .add_edge(WorkflowEdge::new("review", "refactor"));

    // 设置目标路径
    workflow.variables.insert("target_path".to_string(), target_path.to_string());

    workflow
}

fn create_quick_exploration_workflow(target_path: &str) -> Workflow {
    let mut workflow = Workflow::new("quick-exploration", "快速探索")
        .with_description("快速探索代码结构");

    workflow
        .add_node(WorkflowNode::new("explore", AgentType::Explore)
            .with_label("探索结构"))
        .add_node(WorkflowNode::new("analyze", AgentType::Explore)
            .with_label("分析依赖"))
        .add_edge(WorkflowEdge::new("explore", "analyze"));

    workflow.variables.insert("target_path".to_string(), target_path.to_string());

    workflow
}

fn create_quick_quality_check_workflow(target_path: &str) -> Workflow {
    let mut workflow = Workflow::new("quick-quality-check", "质量检查")
        .with_description("快速质量检查");

    workflow
        .add_node(WorkflowNode::new("review", AgentType::Review)
            .with_label("代码审查"))
        .add_node(WorkflowNode::new("security", AgentType::Review)
            .with_label("安全检查"))
        .add_edge(WorkflowEdge::new("review", "security"));

    workflow.variables.insert("target_path".to_string(), target_path.to_string());

    workflow
}

// AgentType 辅助方法
impl AgentType {
    fn from_str(s: &str) -> Option<Self> {
        match s {
            "explore" => Some(AgentType::Explore),
            "review" => Some(AgentType::Review),
            "refactor" => Some(AgentType::Refactor),
            "test" => Some(AgentType::Test),
            "doc" => Some(AgentType::Doc),
            "task_breakdown" => Some(AgentType::TaskBreakdown),
            "proposal_generator" => Some(AgentType::ProposalGenerator),
            "general_purpose" => Some(AgentType::GeneralPurpose),
            _ => None,
        }
    }
}
