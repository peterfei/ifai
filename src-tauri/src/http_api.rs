/**
 * HTTP API 服务器 - 为 E2E 测试提供真实后端访问
 *
 * 在 Tauri v2 架构中，Playwright 无法直接访问 Tauri IPC bridge。
 * 这个 HTTP 服务器作为代理，让 E2E 测试可以通过 HTTP API 调用真实后端逻辑。
 *
 * 端口：3333 (可通过环境变量 HTTP_API_PORT 配置)
 *
 * 功能：
 * - POST /api/health - 健康检查
 * - POST /api/workflow/execute - 执行工作流（调用真实后端逻辑）
 * - GET /api/workflow/progress - SSE progress 事件流
 */

use axum::{
    extract::State,
    http::StatusCode,
    response::{sse::Event, IntoResponse, Response, Sse},
    routing::{get, post},
    Json, Router,
};
use futures::stream::{self, Stream, StreamExt};
use serde::{Deserialize, Serialize};
use std::convert::Infallible;
use std::sync::Arc;
use tokio::sync::broadcast;
use tower_http::cors::{Any, CorsLayer};

use crate::agent_system::workflow::{types::Workflow, runner::{WorkflowRunner, PlannedNode}};

/// HTTP API 响应
#[derive(Debug, Serialize)]
pub struct ApiResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

impl<T> ApiResponse<T> {
    pub fn success(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
        }
    }

    pub fn error(message: String) -> Self {
        Self {
            success: false,
            data: None,
            error: Some(message),
        }
    }
}

/// execute_quick_workflow 的 HTTP API 请求
#[derive(Debug, Deserialize)]
pub struct ExecuteWorkflowRequest {
    pub workflow_type: String,
    pub target_path: String,
    pub project_root: Option<String>,
    pub provider_config: Option<serde_json::Value>,
    pub current_model: Option<String>,
    pub correlation_id: Option<String>,
}

/// execute_quick_workflow 的 HTTP API 响应
#[derive(Debug, Serialize)]
pub struct ExecuteWorkflowResponse {
    pub workflow_id: String,
    pub status: String,
}

/// 🔥 使用 workflow::runner::PlannedNode，避免重复定义
/// use crate::agent_system::workflow::runner::PlannedNode;

/// Progress 事件（与 Tauri 的 workflow:progress 事件格式一致）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowProgressEvent {
    pub event_type: String,
    pub workflow_id: Option<String>,
    pub node_id: Option<String>,
    pub message: Option<String>,
    pub timestamp: i64,
    pub tool_details: Option<serde_json::Value>,
    /// 🔥 新增：计划节点列表（仅在 workflow:started 事件中包含）
    pub nodes: Option<Vec<PlannedNode>>,
}

/// HTTP API 服务器状态
#[derive(Clone)]
pub struct HttpApiState {
    pub progress_sender: broadcast::Sender<WorkflowProgressEvent>,
}

/// 创建 HTTP API 路由
fn create_routes(state: HttpApiState) -> Router {
    Router::new()
        .route("/api/workflow/execute", post(execute_workflow_http))
        .route("/api/workflow/progress", get(progress_stream))
        .route("/api/health", post(health_check))
        .with_state(state)
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any),
        )
}

/// 健康检查端点
async fn health_check() -> impl IntoResponse {
    Json(ApiResponse::success(serde_json::json!({
        "status": "ok",
        "timestamp": chrono::Utc::now().timestamp_millis()
    })))
}

/// SSE Progress 事件流端点
async fn progress_stream(State(state): State<HttpApiState>) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    // 创建新的接收器
    let rx = state.progress_sender.subscribe();

    // 使用 futures::stream::unfold 转换 broadcast::Receiver 为 Stream
    let stream = stream::unfold(rx, |mut rx| async move {
        match rx.recv().await {
            Ok(event) => {
                let json = serde_json::to_string(&event).unwrap_or_else(|_| "{}".to_string());
                let sse_event = Event::default()
                    .json_data(&json)
                    .unwrap_or_else(|_| Event::default().data(json));
                Some((Ok(sse_event), rx))
            }
            Err(_) => {
                // Channel closed, end stream
                None
            }
        }
    });

    Sse::new(stream).keep_alive(
        axum::response::sse::KeepAlive::new()
            .interval(std::time::Duration::from_secs(1))
            .text("keepalive"),
    )
}

/// 发送 progress 事件的辅助函数
pub async fn send_progress_event(
    sender: &broadcast::Sender<WorkflowProgressEvent>,
    event_type: &str,
    workflow_id: Option<&str>,
    node_id: Option<&str>,
    message: Option<&str>,
) {
    send_progress_event_with_nodes(sender, event_type, workflow_id, node_id, message, None).await
}

/// 🔥 发送 progress 事件的辅助函数（带节点信息）
pub async fn send_progress_event_with_nodes(
    sender: &broadcast::Sender<WorkflowProgressEvent>,
    event_type: &str,
    workflow_id: Option<&str>,
    node_id: Option<&str>,
    message: Option<&str>,
    nodes: Option<Vec<PlannedNode>>,
) {
    let event = WorkflowProgressEvent {
        event_type: event_type.to_string(),
        workflow_id: workflow_id.map(|s| s.to_string()),
        node_id: node_id.map(|s| s.to_string()),
        message: message.map(|s| s.to_string()),
        timestamp: chrono::Utc::now().timestamp_millis(),
        tool_details: None,
        nodes,  // 🔥 包含计划节点信息
    };

    // 发送到所有订阅者（忽略错误，因为可能没有订阅者）
    let _ = sender.send(event);
}

/// HTTP API 端点：执行工作流
async fn execute_workflow_http(
    State(state): State<HttpApiState>,
    Json(req): Json<ExecuteWorkflowRequest>,
) -> Result<Json<ApiResponse<ExecuteWorkflowResponse>>, (StatusCode, String)> {
    println!("[HttpAPI] 📨 Received workflow execution request:");
    println!("  workflow_type: {}", req.workflow_type);
    println!("  target_path: {}", req.target_path);
    println!("  project_root: {:?}", req.project_root);
    println!("  correlation_id: {:?}", req.correlation_id);

    // 🔥 根据请求类型创建真实的工作流
    let workflow = create_workflow_from_request(&req)?;

    let workflow_id = workflow.id.clone();
    println!("[HttpAPI] 🚀 Starting workflow execution: {}", workflow_id);

    // 🔥 FIX: 提取所有计划节点信息，用于 workflow:started 事件
    // 这样前端可以在工作流开始时就显示所有节点，而不是等待节点执行
    let planned_nodes: Vec<PlannedNode> = workflow.nodes.iter().map(|node| {
        use crate::agent_system::workflow::types::AgentType;
        // 将 AgentType 转换为字符串
        let agent_type_str = match node.agent_type {
            AgentType::Explore => "explore".to_string(),
            AgentType::Review => "review".to_string(),
            AgentType::Refactor => "refactor".to_string(),
            AgentType::Test => "test".to_string(),
            AgentType::Doc => "doc".to_string(),
            AgentType::TaskBreakdown => "task_breakdown".to_string(),
            AgentType::ProposalGenerator => "proposal_generator".to_string(),
            AgentType::GeneralPurpose => "general_purpose".to_string(),
        };

        PlannedNode {
            id: node.id.clone(),
            label: node.label.clone().unwrap_or_else(|| node.id.clone()),
            agent_type: agent_type_str,
        }
    }).collect();

    println!("[HttpAPI] 📋 Extracted {} planned nodes for frontend", planned_nodes.len());
    for (i, node) in planned_nodes.iter().enumerate() {
        println!("  {}. {} ({})", i + 1, node.label, node.agent_type);
    }

    // 🔥 克隆 sender 用于 progress callback
    let sender_for_callback = state.progress_sender.clone();

    // 🔥 创建真实的 WorkflowRunner 并设置 progress callback
    let runner = WorkflowRunner::with_default_config(workflow)
        .map_err(|e| {
            let error = format!("创建工作流运行器失败: {}", e);
            println!("[HttpAPI] ❌ {}", error);
            (StatusCode::INTERNAL_SERVER_ERROR, error)
        })?
        .with_progress_callback(move |event| {
            println!("[HttpAPI] 📤 Progress Event:");
            println!("  - event_type: {}", event.event_type);
            println!("  - workflow_id: {:?}", event.workflow_id);
            println!("  - node_id: {:?}", event.node_id);
            println!("  - message: {:?}", event.message);

            // 转换为 SSE 格式并发送
            let sse_event = WorkflowProgressEvent {
                event_type: event.event_type,
                workflow_id: event.workflow_id,
                node_id: event.node_id,
                message: event.message,
                timestamp: chrono::Utc::now().timestamp_millis(),
                tool_details: event.tool_details.map(|d| serde_json::to_value(d).unwrap_or_else(|_| serde_json::json!(null))),
                nodes: event.nodes,  // 🔥 包含 nodes 字段（从 runner.rs 传递过来）
            };

            let _ = sender_for_callback.send(sse_event);
        });

    // 🔥 注册并执行工作流
    let manager = crate::commands::workflow_commands::get_workflow_manager();
    {
        let mut manager = manager.lock().await;
        manager.start_workflow(workflow_id.clone(), runner)
            .map_err(|e| {
                let error = format!("启动工作流失败: {}", e);
                println!("[HttpAPI] ❌ {}", error);
                (StatusCode::INTERNAL_SERVER_ERROR, error)
            })?;
    }

    println!("[HttpAPI] ✅ Workflow registered: {}", workflow_id);

    // 在后台执行工作流
    let workflow_id_clone = workflow_id.clone();
    let sender_clone = state.progress_sender.clone();
    tokio::spawn(async move {
        println!("[HttpAPI] 🔄 Starting background execution for {}", workflow_id_clone);

        // 🔥 FIX: 移除 workflow:started 事件发送（现在由 runner.rs 在 run() 开始时立即发送）
        // 这样可以确保事件顺序正确，避免事件丢失

        let manager = crate::commands::workflow_commands::get_workflow_manager();
        if let Some(runner_arc) = {
            let mgr = manager.lock().await;
            mgr.get_workflow(&workflow_id_clone)
        } {
            let mut runner = runner_arc.lock().await;
            match runner.run().await {
                Ok(result) => {
                    println!("[HttpAPI] ✅ Workflow {} completed", workflow_id_clone);

                    // 发送完成事件
                    send_progress_event(
                        &sender_clone,
                        "workflow:completed",
                        Some(&workflow_id_clone),
                        None,
                        Some("工作流执行完成"),
                    ).await;

                    // 清理
                    let mut manager = manager.lock().await;
                    manager.remove_workflow(&workflow_id_clone);
                }
                Err(e) => {
                    println!("[HttpAPI] ❌ Workflow {} failed: {}", workflow_id_clone, e);

                    // 发送错误事件
                    send_progress_event(
                        &sender_clone,
                        "workflow:error",
                        Some(&workflow_id_clone),
                        None,
                        Some(&format!("执行失败: {}", e)),
                    ).await;

                    // 清理
                    let mut manager = manager.lock().await;
                    manager.remove_workflow(&workflow_id_clone);
                }
            }
        } else {
            println!("[HttpAPI] ⚠️ Workflow {} not found", workflow_id_clone);
        }
    });

    Ok(Json(ApiResponse::success(ExecuteWorkflowResponse {
        workflow_id: workflow_id.clone(),
        status: "running".to_string(),
    })))
}

/// 根据请求创建工作流
fn create_workflow_from_request(req: &ExecuteWorkflowRequest) -> Result<Workflow, (StatusCode, String)> {
    use crate::agent_system::workflow::types::{Workflow, WorkflowNode, WorkflowEdge, AgentType};

    let mut workflow = match req.workflow_type.as_str() {
        "code_review" => Workflow::new("quick-code-review", "快速代码审查")
                .with_description("自动代码审查和改进建议"),
        "exploration" => Workflow::new("quick-exploration", "快速探索")
                .with_description("快速探索代码结构"),
        "quality_check" => Workflow::new("quick-quality-check", "质量检查")
                .with_description("快速质量检查"),
        _ => {
            return Err((
                StatusCode::BAD_REQUEST,
                format!("未知的工作流类型: {}", req.workflow_type)
            ));
        }
    };

    // 添加节点和边
    match req.workflow_type.as_str() {
        "code_review" => {
            workflow.add_node(WorkflowNode::new("explore", AgentType::Explore).with_label("探索代码"));
            workflow.add_node(WorkflowNode::new("review", AgentType::Review).with_label("代码审查"));
            workflow.add_node(WorkflowNode::new("refactor", AgentType::Refactor).with_label("重构建议"));
            workflow.add_edge(WorkflowEdge::new("explore", "review"));
            workflow.add_edge(WorkflowEdge::new("review", "refactor"));
        }
        "exploration" => {
            workflow.add_node(WorkflowNode::new("explore", AgentType::Explore).with_label("快速探索"));
        }
        "quality_check" => {
            workflow.add_node(WorkflowNode::new("review", AgentType::Review).with_label("代码审查"));
            workflow.add_node(WorkflowNode::new("security", AgentType::Review).with_label("安全检查"));
            workflow.add_edge(WorkflowEdge::new("review", "security"));
        }
        _ => {}
    }

    workflow.variables.insert("target_path".to_string(), req.target_path.clone());

    // 添加额外的配置
    if let Some(project_root) = &req.project_root {
        workflow.variables.insert("project_root".to_string(), project_root.clone());
    }

    if let Some(correlation_id) = &req.correlation_id {
        workflow.variables.insert("correlation_id".to_string(), correlation_id.clone());
    }

    if let Some(provider_config) = &req.provider_config {
        if let Ok(config_json) = serde_json::to_string(provider_config) {
            workflow.variables.insert("provider_config".to_string(), config_json);
        }
    }

    if let Some(current_model) = &req.current_model {
        workflow.variables.insert("current_model".to_string(), current_model.clone());
    }

    Ok(workflow.clone())
}

/// HTTP API 服务器
pub struct HttpApiServer {
    port: u16,
    handle: Option<tokio::task::JoinHandle<()>>,
}

impl HttpApiServer {
    /// 创建新的 HTTP API 服务器
    pub fn new(port: u16) -> Self {
        Self {
            port,
            handle: None,
        }
    }

    /// 从环境变量获取端口，默认 3333
    pub fn from_env() -> Self {
        let port = std::env::var("HTTP_API_PORT")
            .ok()
            .and_then(|p| p.parse().ok())
            .unwrap_or(3333);

        Self::new(port)
    }

    /// 启动 HTTP API 服务器
    pub async fn start(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        // 创建 broadcast channel 用于分发 progress 事件
        let (progress_sender, _receiver) = broadcast::channel(100);

        let state = HttpApiState {
            progress_sender,
        };

        let app = create_routes(state);

        let addr = format!("0.0.0.0:{}", self.port);
        println!("[HttpAPI] 🚀 Starting HTTP API server on {}", addr);

        let listener = tokio::net::TcpListener::bind(&addr).await?;
        println!("[HttpAPI] ✅ Server listening on {}", addr);
        println!("[HttpAPI] 📡 Available endpoints:");
        println!("[HttpAPI]   - POST http://localhost:{}/api/workflow/execute", self.port);
        println!("[HttpAPI]   - GET  http://localhost:{}/api/workflow/progress (SSE)", self.port);
        println!("[HttpAPI]   - POST http://localhost:{}/api/health", self.port);

        // 保存服务器句柄
        let handle = tokio::spawn(async move {
            if let Err(e) = axum::serve(listener, app).await {
                eprintln!("[HttpAPI] ❌ Server error: {}", e);
            }
        });

        self.handle = Some(handle);

        Ok(())
    }

    /// 停止服务器
    pub async fn stop(&mut self) {
        if let Some(handle) = self.handle.take() {
            handle.abort();
        }
    }
}
