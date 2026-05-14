//! 多智能体工作流 Tauri 命令
//!
//! 提供前端 UI 与工作流系统的集成

use crate::agent_system::workflow::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::Emitter;
use tokio::sync::Mutex; // 🔥 添加 Emitter trait 以使用 emit 方法

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
static WORKFLOW_MANAGER: std::sync::OnceLock<Arc<Mutex<WorkflowManager>>> =
    std::sync::OnceLock::new();

pub fn get_workflow_manager() -> Arc<Mutex<WorkflowManager>> {
    WORKFLOW_MANAGER
        .get_or_init(|| Arc::new(Mutex::new(WorkflowManager::new())))
        .clone()
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

    pub fn start_workflow(&mut self, id: String, runner: WorkflowRunner) -> Result<(), String> {
        self.running_workflows
            .insert(id, Arc::new(Mutex::new(runner)));
        Ok(())
    }

    pub fn get_workflow(&self, id: &str) -> Option<Arc<Mutex<WorkflowRunner>>> {
        self.running_workflows.get(id).cloned()
    }

    pub fn remove_workflow(&mut self, id: &str) {
        self.running_workflows.remove(id);
    }

    /// 🔥 获取所有运行中的 workflow ID
    pub fn all_workflows(&self) -> Vec<String> {
        self.running_workflows.keys().cloned().collect()
    }
}

/// 从 YAML 字符串解析工作流
#[tauri::command]
pub async fn parse_workflow_from_yaml(yaml_content: String) -> Result<Workflow, String> {
    WorkflowParser::from_str(&yaml_content).map_err(|e| format!("YAML 解析失败: {}", e))
}

/// 从 YAML 文件加载工作流
#[tauri::command]
pub async fn load_workflow_from_file(file_path: String) -> Result<Workflow, String> {
    let yaml_content =
        std::fs::read_to_string(&file_path).map_err(|e| format!("无法读取文件: {}", e))?;

    WorkflowParser::from_str(&yaml_content).map_err(|e| format!("YAML 解析失败: {}", e))
}

/// 验证工作流
#[tauri::command]
pub async fn validate_workflow(workflow: Workflow) -> Result<(), String> {
    workflow
        .validate()
        .map_err(|e| format!("工作流验证失败: {:?}", e))
}

/// 获取工作流执行计划
#[tauri::command]
pub async fn get_workflow_schedule(workflow: Workflow) -> Result<ScheduleInfo, String> {
    let schedule =
        WorkflowScheduler::schedule(&workflow).map_err(|e| format!("调度失败: {:?}", e))?;

    // 构建并行组信息
    let parallel_groups: Vec<Vec<String>> = schedule
        .parallel_groups
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
    window: tauri::Window,
    correlation_id: Option<String>, // 🔥 添加 correlation_id 参数
    session_id: Option<String>,     // 🔥 添加 session_id 参数用于标签页隔离
) -> Result<String, String> {
    let workflow_id = workflow.id.clone();

    println!("[Workflow] 🎬 execute_workflow called");
    println!("[Workflow] 🆔 ID: {}", workflow_id);
    println!("[Workflow] 📋 Name: {}", workflow.name);
    println!(
        "[Workflow] 📄 Nodes: {:?}",
        workflow.nodes.iter().map(|n| &n.id).collect::<Vec<_>>()
    );
    println!(
        "[Workflow] 🔗 Edges: {:?}",
        workflow
            .edges
            .iter()
            .map(|e| (e.from.clone(), e.to.clone()))
            .collect::<Vec<_>>()
    );

    // 🔥 创建 window_clone 用于 progress_callback（必须在 tokio::spawn 外部）
    let window_for_progress = window.clone();

    // 创建运行器
    let runner = WorkflowRunner::with_default_config(workflow)
        .map_err(|e| {
            let error = format!("创建运行器失败: {}", e);
            println!("[Workflow] ❌ {}", error);
            error
        })?
        .with_progress_callback(move |event| {
            // 🔥 发送进度事件到前端
            // ProgressEvent 已经通过 `use crate::agent_system::workflow::*;` 导入
            println!("[Workflow] 📤 Sending progress event to frontend:");
            println!("  - event_type: {}", event.event_type);
            println!("  - workflow_id: {:?}", event.workflow_id);
            println!("  - node_id: {:?}", event.node_id);
            println!("  - message: {:?}", event.message);
            println!("  - has_tool_details: {}", event.tool_details.is_some());
            println!(
                "  - content_delta length: {:?}",
                event.content_delta.as_ref().map(|d| d.len())
            );
            println!("  - content_finished: {:?}", event.content_finished);

            if let Err(e) = window_for_progress.emit("workflow:progress", &event) {
                println!("[Workflow] ⚠️ Failed to emit progress event: {}", e);
            } else {
                println!("[Workflow] ✅ Progress event sent successfully");
            }
        });

    println!("[Workflow] ✅ WorkflowRunner created with progress callback");

    // 注册工作流
    {
        let manager = get_workflow_manager();
        let mut manager = manager.lock().await;
        manager.start_workflow(workflow_id.clone(), runner)?;
        println!("[Workflow] ✅ Workflow registered in manager");
    }

    // 🔥 在后台任务开始前，先提取计划节点信息（避免在异步任务中访问 runner）
    let manager_for_nodes = get_workflow_manager();
    let planned_nodes: Vec<crate::agent_system::workflow::runner::PlannedNode> = {
        let mgr = manager_for_nodes.lock().await;
        if let Some(runner_arc) = mgr.get_workflow(&workflow_id) {
            let runner = runner_arc.lock().await;
            // 🔥 使用公共方法获取计划节点
            runner.get_planned_nodes()
        } else {
            vec![]
        }
    };

    // 在后台执行
    let workflow_id_clone = workflow_id.clone();
    let window_for_start = window.clone();
    let planned_nodes_clone = planned_nodes.clone(); // 克隆用于闭包
    let session_id_clone = session_id.clone(); // 🔥 克隆 session_id 用于闭包（标签页隔离）
    tokio::spawn(async move {
        println!(
            "[Workflow] 🔄 Starting background execution for {}",
            workflow_id_clone
        );

        // 🔥 CRITICAL FIX: 发送 workflow:started 事件，包含计划节点信息
        // 这样前端可以立即显示所有计划节点（pending 状态）
        println!("[Workflow] 📤 Emitting workflow:started event to frontend with planned nodes...");
        println!(
            "[Workflow] 📋 Sending {} planned nodes in workflow:started event",
            planned_nodes_clone.len()
        );
        for (i, node) in planned_nodes_clone.iter().enumerate() {
            println!("  {}. {} ({})", i + 1, node.label, node.agent_type);
        }

        let mut started_event = serde_json::json!({
            "workflowId": workflow_id_clone,
            "workflowType": "custom",
            "targetPath": ".",
            "timestamp": chrono::Utc::now().timestamp_millis(),
            "nodes": planned_nodes_clone  // 🔥 包含计划节点
        });

        // 🔥 添加 session_id 到 workflow:started 事件（标签页隔离）
        if let Some(sid) = &session_id_clone {
            started_event["sessionId"] = serde_json::json!(sid);
            println!(
                "[Workflow] 🏷️ Added sessionId to workflow:started event: {}",
                sid
            );
        }

        if let Err(e) = window_for_start.emit("workflow:started", &started_event) {
            println!("[Workflow] ⚠️ Failed to emit workflow:started event: {}", e);
        } else {
            println!(
                "[Workflow] ✅ workflow:started event sent successfully with {} nodes",
                planned_nodes_clone.len()
            );
        }

        let manager = get_workflow_manager();
        if let Some(runner_arc) = {
            let mgr = manager.lock().await;
            mgr.get_workflow(&workflow_id_clone)
        } {
            let mut runner = runner_arc.lock().await;
            match runner.run().await {
                Ok(result) => {
                    println!(
                        "[Workflow] ✅ Workflow {} completed successfully",
                        workflow_id_clone
                    );
                    println!("[Workflow] 📊 Status: {:?}", result.status);
                    println!(
                        "[Workflow] 📄 Nodes completed: {}",
                        result.node_results.len()
                    );

                    // 打印每个节点的结果摘要
                    for (node_id, node_result) in &result.node_results {
                        println!(
                            "[Workflow] 🔍 Node {}: status={:?}",
                            node_id, node_result.status
                        );
                        if let Some(output) = &node_result.output {
                            println!(
                                "[Workflow] 📝 Node {} output: {} chars",
                                node_id,
                                output.len()
                            );
                        }
                        if let Some(error) = &node_result.error {
                            println!("[Workflow] ❌ Node {} error: {}", node_id, error);
                        }
                    }

                    // 🔥 生成工作流结果总结
                    let response_summary = generate_workflow_summary(&result);

                    // 🔥 先发送 workflow:response 事件（包含结果总结和 correlation_id）
                    println!("[Workflow] 📝 Emitting workflow:response event to frontend...");
                    let mut response_payload = serde_json::json!({
                        "workflow_id": workflow_id_clone,
                        "response": response_summary,
                        "status": result.status,
                    });

                    // 🔥 包含 correlation_id（如果有），帮助前端匹配消息
                    if let Some(correlation_id) = &correlation_id {
                        response_payload["correlation_id"] =
                            serde_json::Value::String(correlation_id.clone());
                        println!(
                            "[Workflow] ✅ Included correlation_id in response: {}",
                            correlation_id
                        );
                    }

                    if let Err(e) = window.emit("workflow:response", &response_payload) {
                        println!("[Workflow] ⚠️ Failed to emit response event: {}", e);
                    } else {
                        println!("[Workflow] ✅ Successfully sent workflow:response event");
                    }

                    // 🔥 发送完成事件到前端
                    println!("[Workflow] 📤 Emitting workflow:completed event to frontend...");
                    if let Err(e) = window.emit("workflow:completed", &result) {
                        println!("[Workflow] ⚠️ Failed to emit completion event: {}", e);
                    } else {
                        println!("[Workflow] ✅ Successfully sent workflow:completed event");
                    }

                    // 清理
                    let mut manager = manager.lock().await;
                    manager.remove_workflow(&workflow_id_clone);
                }
                Err(e) => {
                    println!("[Workflow] ❌ Workflow {} failed: {}", workflow_id_clone, e);
                    println!("[Workflow] ❌ Error details: {:?}", e);

                    // 🔥 发送错误事件到前端
                    let error_payload = serde_json::json!({
                        "workflow_id": workflow_id_clone,
                        "error": e.to_string()
                    });
                    println!("[Workflow] 📤 Emitting workflow:error event to frontend...");
                    if let Err(err) = window.emit("workflow:error", &error_payload) {
                        println!("[Workflow] ⚠️ Failed to emit error event: {}", err);
                    } else {
                        println!("[Workflow] ✅ Successfully sent workflow:error event");
                    }

                    // 清理
                    let mut manager = manager.lock().await;
                    manager.remove_workflow(&workflow_id_clone);
                }
            }
        } else {
            println!(
                "[Workflow] ⚠️ Workflow {} not found in manager",
                workflow_id_clone
            );
        }
    });

    println!("[Workflow] ✅ Returning workflow_id: {}", workflow_id);
    Ok(workflow_id)
}

/// 取消工作流执行
#[tauri::command]
pub async fn cancel_workflow(workflow_id: String, window: tauri::Window) -> Result<(), String> {
    let manager = get_workflow_manager();
    let mut manager = manager.lock().await;

    if let Some(runner_arc) = manager.get_workflow(&workflow_id) {
        let mut runner = runner_arc.lock().await;
        runner
            .cancel()
            .await
            .map_err(|e| format!("取消失败: {}", e))?;

        manager.remove_workflow(&workflow_id);

        // 🔥 发送取消事件到前端
        println!("[Workflow] 📤 Emitting workflow:cancelled event to frontend...");
        let cancelled_event = serde_json::json!({
            "workflowId": workflow_id,
            "timestamp": chrono::Utc::now().timestamp_millis(),
        });
        if let Err(e) = window.emit("workflow:cancelled", &cancelled_event) {
            println!("[Workflow] ⚠️ Failed to emit cancelled event: {}", e);
        } else {
            println!("[Workflow] ✅ Successfully sent workflow:cancelled event");
        }

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
    let mut workflow = Workflow::new(&id, &name).with_description(&description);

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
    project_root: Option<String>, // 🔥 添加 project_root 参数
    provider_config: Option<serde_json::Value>, // 🔥 添加 provider_config 参数
    current_model: Option<String>, // 🔥 添加 current_model 参数
    correlation_id: Option<String>, // 🔥 添加 correlation_id 参数用于关联前端消息
    session_id: Option<String>,   // 🔥 添加 session_id 参数用于标签页隔离
    window: tauri::Window,
) -> Result<String, String> {
    println!("[Workflow] 🚀 execute_quick_workflow called");
    println!("[Workflow] 📋 Type: {}", workflow_type);
    println!("[Workflow] 📁 Target path: {}", target_path);
    println!("[Workflow] 📂 Project root: {:?}", project_root);
    println!(
        "[Workflow] ⚙️ Provider config: {:?}",
        provider_config.is_some()
    );
    println!("[Workflow] 🤖 Current model: {:?}", current_model);
    println!("[Workflow] 🔗 Correlation ID: {:?}", correlation_id);
    println!("[Workflow] 🏷️ Session ID: {:?}", session_id); // 🔥 日志 session_id

    let workflow = match workflow_type.as_str() {
        "code_review" => {
            println!("[Workflow] ✅ Creating code review workflow");
            create_quick_code_review_workflow(&target_path)
        }
        "exploration" => {
            println!("[Workflow] ✅ Creating exploration workflow");
            create_quick_exploration_workflow(&target_path)
        }
        "quality_check" => {
            println!("[Workflow] ✅ Creating quality check workflow");
            create_quick_quality_check_workflow(&target_path)
        }
        _ => {
            let error = format!("未知的工作流类型: {}", workflow_type);
            println!("[Workflow] ❌ {}", error);
            return Err(error);
        }
    };

    println!("[Workflow] 🎯 Workflow ID: {}", workflow.id);
    println!("[Workflow] 📝 Workflow name: {}", workflow.name);
    println!(
        "[Workflow] 📄 Nodes: {:?}",
        workflow.nodes.iter().map(|n| &n.id).collect::<Vec<_>>()
    );

    // 🔥 将配置存储到 workflow 变量中
    let mut workflow = workflow;

    // 存储 correlation_id（用于关联前端消息）
    if let Some(correlation_id) = &correlation_id {
        println!(
            "[Workflow] ✅ Stored correlation_id in workflow variables: {}",
            correlation_id
        );
        workflow
            .variables
            .insert("correlation_id".to_string(), correlation_id.clone());
    }

    // 🔥 存储 session_id（用于标签页隔离）
    if let Some(session_id) = &session_id {
        println!(
            "[Workflow] ✅ Stored session_id in workflow variables: {}",
            session_id
        );
        workflow
            .variables
            .insert("session_id".to_string(), session_id.clone());
    }

    // 存储 project_root
    if let Some(root) = project_root {
        println!(
            "[Workflow] ✅ Stored project_root in workflow variables: {}",
            root
        );
        workflow.variables.insert("project_root".to_string(), root);
    }

    // 存储 provider_config
    if let Some(config) = provider_config {
        // 🔥 FIX: 使用 serde_json::to_string 而不是 to_string，确保 JSON 格式正确
        let config_json = serde_json::to_string(&config)
            .map_err(|e| format!("Failed to serialize provider_config: {}", e))?;
        let json_len = config_json.len();
        workflow
            .variables
            .insert("provider_config".to_string(), config_json);
        println!(
            "[Workflow] ✅ Stored provider config in workflow variables (JSON: {} chars)",
            json_len
        );
    }

    // 🔥 存储 current_model（用户选择的模型）
    if let Some(model) = current_model {
        println!(
            "[Workflow] ✅ Stored current_model in workflow variables: {}",
            model
        );
        workflow
            .variables
            .insert("current_model".to_string(), model);
    }

    let result = execute_workflow(workflow, window, correlation_id, session_id).await?;

    println!("[Workflow] ✅ Workflow started successfully: {}", result);
    Ok(result)
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
        .add_node(WorkflowNode::new("explore", AgentType::Explore).with_label("探索代码"))
        .add_node(WorkflowNode::new("review", AgentType::Review).with_label("代码审查"))
        .add_node(WorkflowNode::new("refactor", AgentType::Refactor).with_label("重构建议"))
        .add_edge(WorkflowEdge::new("explore", "review"))
        .add_edge(WorkflowEdge::new("review", "refactor"));

    // 设置目标路径
    workflow
        .variables
        .insert("target_path".to_string(), target_path.to_string());

    workflow
}

fn create_quick_exploration_workflow(target_path: &str) -> Workflow {
    let mut workflow = Workflow::new("quick-exploration", "快速探索")
        .with_description("快速探索代码结构并生成分析报告");

    use crate::agent_system::workflow::types::AgentConfig;

    workflow
        // 单一探索节点：预扫描目录 + 并行读取关键文件
        .add_node(
            WorkflowNode::new("explore", AgentType::Explore)
                .with_label("探索项目")
                .with_config(AgentConfig {
                    target: Some(target_path.to_string()),
                    task_description: Some(
                        "快速探索项目结构并生成简洁分析报告。

**严格限制**：只读取最多 3 个最关键文件，控制上下文大小。
目录结构已在上下文中提供，无需调用 agent_scan_project。

**读取策略**（在同一次响应中并行发起，仅选最关键的）：
1. 项目配置文件（Cargo.toml / package.json / go.mod 等）— 判断技术栈和依赖
2. 入口文件（main.rs / main.ts / index.ts 等）— 了解程序入口
❌ 不要读取核心模块源码（内容太长），仅从目录结构推断架构。

**输出要求**（简洁报告，每项 1-2 句）：
- 项目概述
- 技术栈
- 关键目录（3-5个）
- 架构特点（3-5点）"
                            .to_string(),
                    ),
                    ..Default::default()
                }),
        );

    workflow
        .variables
        .insert("target_path".to_string(), target_path.to_string());

    workflow
}

fn create_quick_quality_check_workflow(target_path: &str) -> Workflow {
    let mut workflow =
        Workflow::new("quick-quality-check", "质量检查").with_description("快速质量检查");

    workflow
        .add_node(WorkflowNode::new("review", AgentType::Review).with_label("代码审查"))
        .add_node(WorkflowNode::new("security", AgentType::Review).with_label("安全检查"))
        .add_edge(WorkflowEdge::new("review", "security"));

    workflow
        .variables
        .insert("target_path".to_string(), target_path.to_string());

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
            "debug" => Some(AgentType::Debug),
            "task_breakdown" => Some(AgentType::TaskBreakdown),
            "proposal_generator" => Some(AgentType::ProposalGenerator),
            "general_purpose" => Some(AgentType::GeneralPurpose),
            _ => None,
        }
    }
}

// ==================== 工作流结果总结生成 ====================

/// 生成工作流执行结果的 Markdown 总结
fn generate_workflow_summary(
    result: &crate::agent_system::workflow::runner::WorkflowResult,
) -> String {
    use crate::agent_system::workflow::runner::{NodeStatus, WorkflowStatus};

    let mut summary = String::from("## ✅ 工作流执行完成\n\n");

    // 添加状态信息
    let status_text = match &result.status {
        WorkflowStatus::Completed => "已完成",
        WorkflowStatus::Failed(_) => "失败",
        WorkflowStatus::Running => "运行中",
        WorkflowStatus::Idle => "未开始",
        WorkflowStatus::Paused => "已暂停",
        WorkflowStatus::Cancelled => "已取消",
    };
    summary.push_str(&format!("**状态**: {}\n\n", status_text));

    // 添加节点执行概览
    summary.push_str("### 📊 节点执行概览\n\n");

    let completed_count = result
        .node_results
        .values()
        .filter(|r| matches!(r.status, NodeStatus::Completed))
        .count();
    let failed_count = result
        .node_results
        .values()
        .filter(|r| matches!(r.status, NodeStatus::Failed(_)))
        .count();
    let total_count = result.node_results.len();

    summary.push_str(&format!("- **总计**: {} 个节点\n", total_count));
    summary.push_str(&format!("- **成功**: {} 个\n", completed_count));
    summary.push_str(&format!("- **失败**: {} 个\n\n", failed_count));

    // 添加每个节点的详细信息
    summary.push_str("### 📋 节点详情\n\n");

    // 按节点顺序排列（不排序，保持原始顺序）
    for (node_id, node_result) in &result.node_results {
        let status_icon = match &node_result.status {
            NodeStatus::Completed => "✅",
            NodeStatus::Failed(_) => "❌",
            NodeStatus::Running => "🔄",
            NodeStatus::Pending => "⏳",
            NodeStatus::Skipped => "⏭️",
        };

        summary.push_str(&format!("#### {} {}\n\n", status_icon, node_id));

        // 添加输出内容（如果有）
        if let Some(output) = &node_result.output {
            summary.push_str(output);
            summary.push_str("\n\n");
        }

        // 添加错误信息（如果有）
        if let Some(error) = &node_result.error {
            summary.push_str(&format!("**错误**: {}\n\n", error));
        }
    }

    // 添加执行时间信息（时间戳是 i64，单位是毫秒）
    if let Some(end_time) = result.completed_at {
        let start_time = result.started_at;
        let duration_ms = end_time - start_time;
        let duration_sec = duration_ms / 1000;
        summary.push_str(&format!("**执行时间**: {} 秒\n", duration_sec));
    }

    summary
}

// ============================================================================
// 工作流单元测试
// ============================================================================

#[cfg(test)]
mod workflow_tests {
    use super::*;

    #[test]
    fn test_exploration_workflow_structure() {
        let workflow = create_quick_exploration_workflow(".");

        println!("\n=== 探索工作流结构测试 ===");
        println!("📊 工作流: {} ({})", workflow.name, workflow.id);
        println!("📄 节点数量: {}", workflow.nodes.len());
        println!("🔗 边数量: {}", workflow.edges.len());

        // 打印所有节点
        for (i, node) in workflow.nodes.iter().enumerate() {
            println!("  节点 {}: {} ({:?})", i + 1, node.id, node.agent_type);
            if let Some(ref label) = node.label {
                println!("    📋 标签: {}", label);
            }
        }

        // 打印所有边
        for (i, edge) in workflow.edges.iter().enumerate() {
            println!("  边 {}: {} -> {}", i + 1, edge.from, edge.to);
        }

        // ✅ 验证：应该有1个节点（explore）
        assert_eq!(workflow.nodes.len(), 1, "探索工作流应该有1个节点");

        // ✅ 验证：无额外边
        assert_eq!(workflow.edges.len(), 0, "探索工作流应该没有边");

        // ✅ 验证节点ID
        let node_ids: Vec<_> = workflow.nodes.iter().map(|n| n.id.as_str()).collect();
        assert!(node_ids.contains(&"explore"), "应该有 explore 节点");

        println!("\n✅ 探索工作流结构验证通过！");
        println!("   - 1个节点：explore");
        println!("   - 预扫描 + 并行读取，单轮完成");
    }

    #[test]
    fn test_code_review_workflow_structure() {
        let workflow = create_quick_code_review_workflow(".");

        println!("\n=== 代码审查工作流结构测试 ===");
        println!("📊 节点数量: {}", workflow.nodes.len());
        println!("🔗 边数量: {}", workflow.edges.len());

        assert!(workflow.nodes.len() >= 1, "代码审查工作流应该至少有1个节点");
        assert!(workflow.edges.len() >= 1, "代码审查工作流应该至少有1条边");

        println!("✅ 代码审查工作流验证通过！");
    }

    #[test]
    fn test_quality_check_workflow_structure() {
        let workflow = create_quick_quality_check_workflow(".");

        println!("\n=== 质量检查工作流结构测试 ===");
        println!("📊 节点数量: {}", workflow.nodes.len());
        println!("🔗 边数量: {}", workflow.edges.len());

        assert!(workflow.nodes.len() >= 1, "质量检查工作流应该至少有1个节点");
        assert!(workflow.edges.len() >= 1, "质量检查工作流应该至少有1条边");

        println!("✅ 质量检查工作流验证通过！");
    }
}
