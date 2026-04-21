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
 * - POST /api/ai/chat - AI 聊天（非流式）
 * - GET /api/ai/chat/stream - AI 聊天（SSE 流式）
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
use std::collections::HashMap;
use std::convert::Infallible;
use std::sync::Arc;
use tokio::sync::broadcast;
use tower_http::cors::{Any, CorsLayer};
use uuid::Uuid;

use crate::agent_system::workflow::{types::Workflow, runner::{WorkflowRunner, PlannedNode}};
use crate::core_traits::ai::{AIService, Message as CoreMessage, Content as CoreContent, AIProviderConfig as CoreAIProviderConfig};

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

/// AI Chat 的 HTTP API 请求
#[derive(Debug, Deserialize)]
pub struct AIChatRequest {
    pub messages: Vec<AIChatMessage>,
    pub provider_config: AIProviderConfig,
    pub model: String,
    pub project_root: Option<String>,
    pub enable_tools: Option<bool>,
    pub stream: Option<bool>,  // 是否使用流式输出（默认 false）
}

/// AI Chat 消息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIChatMessage {
    pub role: String,  // "user", "assistant", "system"
    pub content: String,
    pub tool_calls: Option<Vec<AIToolCall>>,
    pub tool_call_id: Option<String>,
}

/// AI Tool Call
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIToolCall {
    pub id: String,
    pub r#type: String,  // "function"
    pub function: AIToolCallFunction,
}

/// AI Tool Call Function
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIToolCallFunction {
    pub name: String,
    pub arguments: String,
}

/// AI Provider Config
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIProviderConfig {
    pub name: String,
    pub api_key: String,
    pub base_url: String,
}

/// AI Chat 的 HTTP API 响应（非流式）
#[derive(Debug, Serialize)]
pub struct AIChatResponse {
    pub content: String,
    pub role: String,
    pub finish_reason: Option<String>,
    pub tool_calls: Option<Vec<AIToolCall>>,
}

/// AI Chat 流式事件（SSE）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIChatStreamEvent {
    pub event_type: String,  // "content_delta", "tool_call", "error", "done"
    pub content_delta: Option<String>,
    pub tool_call: Option<AIToolCall>,
    pub error: Option<AIStreamError>,
    pub finish_reason: Option<String>,
}

/// AI Stream Error
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIStreamError {
    pub code: String,
    pub message: String,
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
    /// 🔥 新增：流式内容增量（仅在 content_delta 事件中包含）
    pub content_delta: Option<String>,
    /// 🔥 新增：流式输出是否完成（仅在 content_delta 事件中包含）
    pub content_finished: Option<bool>,
}

/// HTTP API 服务器状态
#[derive(Clone)]
pub struct HttpApiState {
    pub progress_sender: broadcast::Sender<WorkflowProgressEvent>,
    /// AI chat 事件的 broadcast channel（每个请求会创建一个唯一的 channel）
    pub ai_chat_senders: Arc<tokio::sync::Mutex<HashMap<String, broadcast::Sender<AIChatStreamEvent>>>>,
    /// AI 服务（用于实际的 AI chat 调用）
    pub ai_service: Option<Arc<dyn crate::core_traits::ai::AIService>>,
}

/// 创建 HTTP API 路由
fn create_routes(state: HttpApiState) -> Router {
    Router::new()
        .route("/api/workflow/execute", post(execute_workflow_http))
        .route("/api/workflow/progress", get(progress_stream))
        .route("/api/health", post(health_check))
        .route("/api/ai/chat", post(ai_chat_http))
        .route("/api/ai/chat/stream", post(ai_chat_stream_http))
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
                let sse_event = Event::default().data(json);
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
        content_delta: None,  // 默认为 None
        content_finished: None,  // 默认为 None
    };

    // 发送到所有订阅者（忽略错误，因为可能没有订阅者）
    let _ = sender.send(event);
}

/// 🔥 发送 content_delta 进度事件的辅助函数（用于流式输出）
pub async fn send_content_delta_event(
    sender: &broadcast::Sender<WorkflowProgressEvent>,
    workflow_id: &str,
    node_id: &str,
    content_delta: &str,
    content_finished: bool,
) {
    let event = WorkflowProgressEvent {
        event_type: "content_delta".to_string(),
        workflow_id: Some(workflow_id.to_string()),
        node_id: Some(node_id.to_string()),
        message: None,  // content_delta 事件不包含普通消息
        timestamp: chrono::Utc::now().timestamp_millis(),
        tool_details: None,
        nodes: None,
        content_delta: if content_delta.is_empty() { None } else { Some(content_delta.to_string()) },
        content_finished: Some(content_finished),
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
                content_delta: event.content_delta,  // 🔥 包含 content_delta 字段
                content_finished: event.content_finished,  // 🔥 包含 content_finished 字段
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
            // 🔥 更新为3节点版本：并行探索 + 总结（带流式输出）
            use crate::agent_system::workflow::types::AgentConfig;

            // 探索节点1：分析项目结构
            workflow.add_node(WorkflowNode::new("explore_structure", AgentType::Explore)
                .with_label("探索结构")
                .with_config(AgentConfig {
                    target: Some(req.target_path.clone()),
                    task_description: Some("分析项目的目录结构和文件组织方式".to_string()),
                    ..Default::default()
                }));

            // 探索节点2：分析依赖关系
            workflow.add_node(WorkflowNode::new("explore_deps", AgentType::Explore)
                .with_label("探索依赖")
                .with_config(AgentConfig {
                    target: Some(req.target_path.clone()),
                    task_description: Some("分析项目的依赖关系和模块之间的连接".to_string()),
                    ..Default::default()
                }));

            // 总结节点：综合两个探索节点的结果（使用流式输出）
            workflow.add_node(WorkflowNode::new("summarize", AgentType::Doc)
                .with_label("生成总结")
                .with_config(AgentConfig {
                    task_description: Some("综合前面的探索结果，生成一份完整的代码结构总结，包括：\n1. 项目整体架构\n2. 主要模块和功能\n3. 依赖关系图\n4. 关键发现和改进建议\n\n请用清晰的格式（如 Markdown）输出总结。".to_string()),
                    ..Default::default()
                }));

            // 两个探索节点都完成后才执行总结
            workflow.add_edge(WorkflowEdge::new("explore_structure", "summarize"));
            workflow.add_edge(WorkflowEdge::new("explore_deps", "summarize"));
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

/// ============================================================================
/// AI Chat HTTP API 端点
/// ============================================================================

/// AI Chat 非流式端点
async fn ai_chat_http(
    State(state): State<HttpApiState>,
    Json(req): Json<AIChatRequest>,
) -> Result<Json<ApiResponse<AIChatResponse>>, (StatusCode, String)> {
    println!("[HttpAPI] 📨 Received AI chat request (non-streaming)");
    println!("  model: {}", req.model);
    println!("  message count: {}", req.messages.len());
    println!("  enable_tools: {:?}", req.enable_tools);

    // 🔥 TODO: 实现非流式 AI chat
    // 这需要调用实际的 AI 服务
    // 暂时返回未实现错误
    Err((
        StatusCode::NOT_IMPLEMENTED,
        "Non-streaming AI chat not yet implemented. Please use /api/ai/chat/stream for streaming responses.".to_string()
    ))
}

/// AI Chat 流式端点（SSE）
async fn ai_chat_stream_http(
    State(state): State<HttpApiState>,
    Json(req): Json<AIChatRequest>,
) -> Result<Sse<impl Stream<Item = Result<Event, Infallible>>>, (StatusCode, String)> {
    println!("[HttpAPI] 📨 Received AI chat request (streaming)");
    println!("  model: {}", req.model);
    println!("  message count: {}", req.messages.len());
    println!("  enable_tools: {:?}", req.enable_tools);

    // 检查是否有 AI 服务
    let ai_service = state.ai_service.as_ref().ok_or_else(|| {
        (StatusCode::SERVICE_UNAVAILABLE, "AI service not available".to_string())
    })?.clone();

    // 生成唯一的 chat_id
    let chat_id = format!("chat_{}", Uuid::new_v4());

    // 创建 broadcast channel 用于此 chat 会话
    let (sender, _receiver) = broadcast::channel(100);

    // 注册 sender 到全局状态
    {
        let mut senders = state.ai_chat_senders.lock().await;
        senders.insert(chat_id.clone(), sender.clone());
    }

    // 🔥 转换请求格式：HTTP -> AI Service
    let core_messages: Vec<CoreMessage> = req.messages.into_iter().map(|msg| {
        let content = CoreContent::Text(msg.content);
        CoreMessage {
            role: msg.role,
            content,
            tool_calls: None,
            tool_call_id: None,
        }
    }).collect();

    use crate::core_traits::ai::AIProtocol;

    let core_provider_config = CoreAIProviderConfig {
        id: String::new(),
        name: req.provider_config.name,
        api_key: req.provider_config.api_key,
        base_url: req.provider_config.base_url,
        models: vec![req.model.clone()],
        protocol: AIProtocol::OpenAI,  // 默认使用 OpenAI 协议
        enabled: true,
    };

    // 创建工具列表（如果启用）
    let tools = if req.enable_tools.unwrap_or(false) {
        // TODO: 从工具注册表获取工具定义
        Some(vec![])
    } else {
        None
    };

    // 🔥 真实的 AI chat 调用
    let sender_clone = sender.clone();
    let state_clone = state.clone();
    let chat_id_for_spawn = chat_id.clone();

    // 创建 callback 来接收 AI 服务的事件
    let callback = move |event_json: String| {
        println!("[HttpAPI] 📨 Received AI event: {}", event_json);

        // 解析 AI 服务的事件
        if let Ok(event_value) = serde_json::from_str::<serde_json::Value>(&event_json) {
            // 转换为 SSE 事件
            let stream_event = if let Some(choices) = event_value.get("choices").and_then(|c| c.as_array()) {
                if let Some(first_choice) = choices.first() {
                    if let Some(delta) = first_choice.get("delta") {
                        // 内容增量事件
                        if let Some(content) = delta.get("content").and_then(|c| c.as_str()) {
                            AIChatStreamEvent {
                                event_type: "content_delta".to_string(),
                                content_delta: Some(content.to_string()),
                                tool_call: None,
                                error: None,
                                finish_reason: None,
                            }
                        } else {
                            return;  // 忽略空内容
                        }
                    } else if first_choice.get("finish_reason").is_some() {
                        // 完成事件
                        AIChatStreamEvent {
                            event_type: "done".to_string(),
                            content_delta: None,
                            tool_call: None,
                            error: None,
                            finish_reason: first_choice.get("finish_reason").and_then(|f| f.as_str()).map(|s| s.to_string()),
                        }
                    } else {
                        return;  // 忽略未知事件
                    }
                } else {
                    return;  // 忽略空 choices
                }
            } else if let Some(_error) = event_value.get("error") {
                // 错误事件
                AIChatStreamEvent {
                    event_type: "error".to_string(),
                    content_delta: None,
                    tool_call: None,
                    error: Some(AIStreamError {
                        code: "AI_ERROR".to_string(),
                        message: event_value.to_string(),
                    }),
                    finish_reason: None,
                }
            } else {
                // 忽略其他事件
                return;
            };

            // 发送 SSE 事件
            let _ = sender_clone.send(stream_event);
        }
    };

    // 在后台任务中调用 AI 服务
    tokio::spawn(async move {
        println!("[HttpAPI] 🚀 Calling AI service for chat: {}", chat_id_for_spawn);

        // 调用 AI 服务
        let result = ai_service.stream_chat(
            &core_provider_config,
            core_messages,
            &chat_id_for_spawn,
            tools,
            Box::new(callback),
        ).await;

        // 处理结果
        match result {
            Ok(_) => {
                println!("[HttpAPI] ✅ AI chat completed: {}", chat_id_for_spawn);
            }
            Err(e) => {
                eprintln!("[HttpAPI] ❌ AI chat failed: {} - {}", chat_id_for_spawn, e);

                // 发送错误事件
                let error_event = AIChatStreamEvent {
                    event_type: "error".to_string(),
                    content_delta: None,
                    tool_call: None,
                    error: Some(AIStreamError {
                        code: "AI_SERVICE_ERROR".to_string(),
                        message: e,
                    }),
                    finish_reason: None,
                };

                let senders = state_clone.ai_chat_senders.lock().await;
                if let Some(sender) = senders.get(&chat_id_for_spawn) {
                    let _ = sender.send(error_event);
                }
            }
        }

        // 清理：完成后移除 sender
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;  // 等待最后的消息被发送
        let mut senders = state_clone.ai_chat_senders.lock().await;
        senders.remove(&chat_id_for_spawn);
    });

    // 创建 SSE 流
    let sender_for_stream = {
        let senders = state.ai_chat_senders.lock().await;
        senders.get(&chat_id).cloned()
    };

    if let Some(sender) = sender_for_stream {
        let rx = sender.subscribe();
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

        Ok(Sse::new(stream).keep_alive(
            axum::response::sse::KeepAlive::new()
                .interval(std::time::Duration::from_secs(1))
                .text("keepalive"),
        ))
    } else {
        Err((StatusCode::INTERNAL_SERVER_ERROR, "Failed to create chat session".to_string()))
    }
}

/// HTTP API 服务器
pub struct HttpApiServer {
    port: u16,
    handle: Option<tokio::task::JoinHandle<()>>,
    ai_service: Option<Arc<dyn crate::core_traits::ai::AIService>>,
}

impl HttpApiServer {
    /// 创建新的 HTTP API 服务器
    pub fn new(port: u16) -> Self {
        Self {
            port,
            handle: None,
            ai_service: None,
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

    /// 设置 AI 服务
    pub fn with_ai_service(mut self, ai_service: Arc<dyn crate::core_traits::ai::AIService>) -> Self {
        self.ai_service = Some(ai_service);
        self
    }

    /// 启动 HTTP API 服务器
    pub async fn start(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        // 创建 broadcast channel 用于分发 progress 事件
        let (progress_sender, _receiver) = broadcast::channel(100);

        // 创建 AI chat senders 映射
        let ai_chat_senders = Arc::new(tokio::sync::Mutex::new(HashMap::new()));

        let state = HttpApiState {
            progress_sender,
            ai_chat_senders,
            ai_service: self.ai_service.clone(),
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
        println!("[HttpAPI]   - POST http://localhost:{}/api/ai/chat", self.port);
        println!("[HttpAPI]   - POST http://localhost:{}/api/ai/chat/stream (SSE)", self.port);

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
