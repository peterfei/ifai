//! 工作流运行器
//!
//! 负责执行工作流，追踪节点状态，处理错误和重试

use super::types::{Workflow, WorkflowNode, AgentType, WorkflowValidationError};
use super::scheduler::{WorkflowScheduler, Schedule, ScheduleError};
use super::executor::{NodeExecutionContext, AgentNodeExecutor, NodeExecutor};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};
use anyhow::Result;
use serde::{Serialize, Deserialize};

/// 节点执行状态
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum NodeStatus {
    /// 等待执行
    Pending,
    /// 正在执行
    Running,
    /// 执行成功
    Completed,
    /// 执行失败
    Failed(String),
    /// 已跳过（条件不满足）
    Skipped,
}

impl NodeStatus {
    /// 检查状态是否为终态
    pub fn is_terminal(&self) -> bool {
        matches!(self, NodeStatus::Completed | NodeStatus::Failed(_) | NodeStatus::Skipped)
    }

    /// 检查状态是否为成功
    pub fn is_success(&self) -> bool {
        matches!(self, NodeStatus::Completed | NodeStatus::Skipped)
    }

    /// 检查状态是否为失败
    pub fn is_failure(&self) -> bool {
        matches!(self, NodeStatus::Failed(_))
    }
}

/// 节点执行结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeResult {
    /// 节点 ID
    pub node_id: String,
    /// 执行状态
    pub status: NodeStatus,
    /// 输出数据
    pub output: Option<String>,
    /// 错误信息
    pub error: Option<String>,
    /// 开始时间戳（毫秒）
    pub started_at: Option<i64>,
    /// 结束时间戳（毫秒）
    pub completed_at: Option<i64>,
}

impl NodeResult {
    /// 创建成功结果
    pub fn success(node_id: String, output: String) -> Self {
        let now = chrono::Utc::now().timestamp_millis();
        Self {
            node_id,
            status: NodeStatus::Completed,
            output: Some(output),
            error: None,
            started_at: Some(now),
            completed_at: Some(now),
        }
    }

    /// 创建失败结果
    pub fn failure(node_id: String, error: String) -> Self {
        let now = chrono::Utc::now().timestamp_millis();
        Self {
            node_id,
            status: NodeStatus::Failed(error.clone()),
            output: None,
            error: Some(error),
            started_at: Some(now),
            completed_at: Some(now),
        }
    }

    /// 创建跳过结果
    pub fn skipped(node_id: String, reason: String) -> Self {
        Self {
            node_id,
            status: NodeStatus::Skipped,
            output: Some(reason),
            error: None,
            started_at: None,
            completed_at: None,
        }
    }

    /// 获取执行时长（毫秒）
    pub fn duration_ms(&self) -> Option<i64> {
        match (self.started_at, self.completed_at) {
            (Some(start), Some(end)) => {
                Some(end - start)
            }
            _ => None,
        }
    }
}

/// 工作流执行状态
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum WorkflowStatus {
    /// 未开始
    Idle,
    /// 正在执行
    Running,
    /// 已暂停
    Paused,
    /// 执行成功
    Completed,
    /// 执行失败
    Failed(String),
    /// 已取消
    Cancelled,
}

/// 工作流执行配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunnerConfig {
    /// 最大并发节点数
    pub max_concurrent_nodes: usize,
    /// 节点执行超时（秒）
    pub node_timeout_secs: u64,
    /// 失败重试次数
    pub max_retries: usize,
    /// 是否在第一个失败时停止
    pub fail_fast: bool,
}

impl Default for RunnerConfig {
    fn default() -> Self {
        Self {
            max_concurrent_nodes: 3,
            node_timeout_secs: 300,  // 5 分钟
            max_retries: 5,  // 🔥 增加重试次数以更好地处理速率限制
            fail_fast: false,
        }
    }
}

/// 工作流执行结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowResult {
    /// 工作流 ID
    pub workflow_id: String,
    /// 执行状态
    pub status: WorkflowStatus,
    /// 节点执行结果
    pub node_results: HashMap<String, NodeResult>,
    /// 开始时间戳（毫秒）
    pub started_at: i64,
    /// 结束时间戳（毫秒）
    pub completed_at: Option<i64>,
    /// 错误信息
    pub error: Option<String>,
}

impl WorkflowResult {
    /// 创建新的执行结果
    pub fn new(workflow_id: String) -> Self {
        Self {
            workflow_id,
            status: WorkflowStatus::Idle,
            node_results: HashMap::new(),
            started_at: chrono::Utc::now().timestamp_millis(),
            completed_at: None,
            error: None,
        }
    }

    /// 获取执行时长（毫秒）
    pub fn duration_ms(&self) -> Option<i64> {
        self.completed_at
            .map(|end| end - self.started_at)
    }

    /// 获取成功节点数
    pub fn success_count(&self) -> usize {
        self.node_results.values()
            .filter(|r| r.status.is_success())
            .count()
    }

    /// 获取失败节点数
    pub fn failure_count(&self) -> usize {
        self.node_results.values()
            .filter(|r| r.status.is_failure())
            .count()
    }

    /// 检查是否全部成功
    pub fn is_all_success(&self) -> bool {
        self.node_results.values().all(|r| r.status.is_success())
    }
}

/// 工作流运行器
pub struct WorkflowRunner {
    /// 工作流
    workflow: Workflow,
    /// 执行配置
    config: RunnerConfig,
    /// 执行状态
    status: Arc<RwLock<WorkflowStatus>>,
    /// 调度结果
    schedule: Option<Schedule>,
    /// 节点执行结果
    node_results: Arc<RwLock<HashMap<String, NodeResult>>>,
    /// 🔥 进度回调（用于流式输出）
    progress_callback: Arc<RwLock<Option<Box<dyn Fn(ProgressEvent) + Send + Sync>>>>,
}

/// 🔥 工具调用详细信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCallDetails {
    pub tool_name: String,           // 工具名称
    pub tool_input: String,           // 工具输入（JSON字符串）
    pub tool_output: String,          // 工具输出
    pub output_length: usize,         // 输出字符数
    pub execution_time_ms: Option<i64>, // 执行时间（毫秒）
    pub is_error: bool,               // 是否出错
}

/// 🔥 计划节点信息（用于 workflow:started 事件）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlannedNode {
    pub id: String,
    pub label: String,
    pub agent_type: String,
}

/// 🔥 进度事件
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgressEvent {
    pub event_type: String,  // "node_started", "node_progress", "node_completed", "tool_call", "workflow:started"
    pub workflow_id: Option<String>,  // 🔥 添加 workflow_id 字段，前端用于匹配工作流
    pub node_id: Option<String>,
    pub message: Option<String>,
    pub timestamp: i64,
    /// 🔥 工具调用详细信息（仅当 event_type 为 "tool_call" 时存在）
    pub tool_details: Option<ToolCallDetails>,
    /// 🔥 计划节点列表（仅当 event_type 为 "workflow:started" 时存在）
    pub nodes: Option<Vec<PlannedNode>>,
}

impl WorkflowRunner {
    /// 创建新的工作流运行器
    pub fn new(workflow: Workflow, config: RunnerConfig) -> Result<Self, ScheduleError> {
        // 调度工作流
        let schedule = WorkflowScheduler::schedule(&workflow)?;

        Ok(Self {
            workflow,
            config,
            status: Arc::new(RwLock::new(WorkflowStatus::Idle)),
            schedule: Some(schedule),
            node_results: Arc::new(RwLock::new(HashMap::new())),
            progress_callback: Arc::new(RwLock::new(None)),
        })
    }

    /// 使用默认配置创建运行器
    pub fn with_default_config(workflow: Workflow) -> Result<Self, ScheduleError> {
        Self::new(workflow, RunnerConfig::default())
    }

    /// 🔥 设置进度回调
    pub fn with_progress_callback<F>(mut self, callback: F) -> Self
    where
        F: Fn(ProgressEvent) + Send + Sync + 'static,
    {
        println!("[WorkflowRunner] 🔧 with_progress_callback called, setting up callback...");
        let cb = self.progress_callback.clone();
        let mut cb_guard = tokio::task::block_in_place(|| {
            tokio::runtime::Handle::current().block_on(cb.write())
        });
        *cb_guard = Some(Box::new(callback));
        println!("[WorkflowRunner] ✅ Progress callback set successfully");
        self
    }

    /// 🔥 发送进度事件
    async fn emit_progress(&self, event_type: &str, workflow_id: Option<&str>, node_id: Option<&str>, message: Option<&str>) {
        if let Some(callback) = self.progress_callback.read().await.as_ref() {
            let event = ProgressEvent {
                event_type: event_type.to_string(),
                workflow_id: workflow_id.map(|s| s.to_string()),
                node_id: node_id.map(|s| s.to_string()),
                message: message.map(|s| s.to_string()),
                timestamp: chrono::Utc::now().timestamp_millis(),
                tool_details: None,
                nodes: None,
            };
            callback(event);
        }
    }

    /// 🔥 发送 workflow:started 事件（包含计划节点）
    async fn emit_workflow_started(&self) {
        if let Some(callback) = self.progress_callback.read().await.as_ref() {
            // 🔥 提取所有计划节点信息，用于前端立即显示
            let planned_nodes: Vec<PlannedNode> = self.workflow.nodes.iter().map(|node| {
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

            println!("[WorkflowRunner] 📋 Extracted {} planned nodes for workflow:started event", planned_nodes.len());
            for (i, node) in planned_nodes.iter().enumerate() {
                println!("  {}. {} ({})", i + 1, node.label, node.agent_type);
            }

            let event = ProgressEvent {
                event_type: "workflow:started".to_string(),
                workflow_id: Some(self.workflow.id.clone()),
                node_id: None,
                message: Some(format!("工作流开始执行: {}", self.workflow.name)),
                timestamp: chrono::Utc::now().timestamp_millis(),
                tool_details: None,
                nodes: Some(planned_nodes),  // 🔥 包含计划节点
            };
            println!("[WorkflowRunner] 📤 Calling callback with workflow:started event (with {} nodes)", event.nodes.as_ref().map(|n| n.len()).unwrap_or(0));
            callback(event);
            println!("[WorkflowRunner] ✅ workflow:started callback executed IMMEDIATELY");
        }
    }

    /// 执行工作流
    pub async fn run(&self) -> Result<WorkflowResult> {
        println!("[WorkflowRunner] 🚀 run() called, workflow_id: {}", self.workflow.id);
        println!("[WorkflowRunner] 📊 Total nodes: {}", self.workflow.nodes.len());
        println!("[WorkflowRunner] 🔗 Total edges: {}", self.workflow.edges.len());
        println!("[WorkflowRunner] 📋 Node IDs: {:?}", self.workflow.nodes.iter().map(|n| &n.id).collect::<Vec<_>>());

        // 更新状态为运行中
        {
            let mut status = self.status.write().await;
            *status = WorkflowStatus::Running;
        }

        // 🔥 CRITICAL FIX: 立即发送 workflow:started 事件（包含计划节点），确保前端能立即显示
        self.emit_workflow_started().await;

        let schedule = self.schedule.as_ref().expect("Schedule should exist");
        println!("[WorkflowRunner] 📅 Schedule created, execution_order: {:?}", schedule.execution_order);
        println!("[WorkflowRunner] 📅 Parallel groups: {:?}", schedule.parallel_groups);

        let mut result = WorkflowResult::new(self.workflow.id.clone());

        // 按并行组执行
        for group in &schedule.parallel_groups {
            // 检查是否已取消或失败
            {
                let status = self.status.read().await;
                if matches!(*status, WorkflowStatus::Cancelled | WorkflowStatus::Failed(_)) {
                    break;
                }
            }

            // 执行组内节点（并行）
            let group_results = self.execute_parallel_group(group).await?;

            // 检查是否需要失败快速停止（在消耗 group_results 之前）
            if self.config.fail_fast {
                let has_failure = group_results.values().any(|r| r.status.is_failure());
                if has_failure {
                    let mut status = self.status.write().await;
                    *status = WorkflowStatus::Failed("Node execution failed".to_string());
                    result.status = WorkflowStatus::Failed("Node execution failed".to_string());
                    result.completed_at = Some(chrono::Utc::now().timestamp_millis());

                    // 保存失败的结果
                    for (node_id, node_result) in group_results {
                        result.node_results.insert(node_id.clone(), node_result.clone());
                        let mut results = self.node_results.write().await;
                        results.insert(node_id, node_result);
                    }

                    return Ok(result);
                }
            }

            // 保存结果
            {
                let mut results = self.node_results.write().await;
                for (node_id, node_result) in group_results {
                    result.node_results.insert(node_id.clone(), node_result.clone());
                    results.insert(node_id, node_result);
                }
            }
        }

        // 更新最终状态
        {
            let mut status = self.status.write().await;
            if result.is_all_success() {
                *status = WorkflowStatus::Completed;
                result.status = WorkflowStatus::Completed;
            } else {
                *status = WorkflowStatus::Failed("Some nodes failed".to_string());
                result.status = WorkflowStatus::Failed("Some nodes failed".to_string());
            }
        }

        result.completed_at = Some(chrono::Utc::now().timestamp_millis());
        Ok(result)
    }

    /// 执行一个并行组
    async fn execute_parallel_group(&self, group: &[String]) -> Result<HashMap<String, NodeResult>> {
        println!("[WorkflowRunner] 🔧 execute_parallel_group called with nodes: {:?}", group);
        let mut results = HashMap::new();
        let mut tasks = Vec::new();

        // 🔥 克隆必要的数据以用于 'static task
        let workflow = self.workflow.clone();
        let node_results = self.node_results.clone();
        let config = self.config.clone();
        let progress_callback = self.progress_callback.clone();

        println!("[WorkflowRunner] 🔧 progress_callback cloned, checking if it exists...");
        {
            let cb_check = progress_callback.read().await;
            println!("[WorkflowRunner] 📊 progress_callback exists: {}", cb_check.is_some());
        }

        // 创建执行任务
        for node_id in group {
            let node = workflow.get_node(node_id)
                .expect("Node should exist");

            // 检查条件是否满足
            if let Some(true) = self.check_node_condition(node).await? {
                let node = node.clone();
                let node_id = node_id.clone();
                let workflow_clone = workflow.clone();
                let node_results_clone = node_results.clone();
                let config_clone = config.clone();
                let progress_callback_clone = progress_callback.clone();

                tasks.push(async move {
                    // 🔥 执行节点（内联版本，避免生命周期问题）
                    Self::execute_node_static(
                        node,
                        workflow_clone,
                        node_results_clone,
                        config_clone,
                        progress_callback_clone,
                    ).await
                });
            } else {
                // 条件不满足，跳过
                results.insert(
                    node_id.clone(),
                    NodeResult::skipped(node_id.clone(), "Condition not met".to_string())
                );
            }
        }

        // 🔥 真正的并行执行（参考 claw-code：不在正常请求间添加延迟，只在遇到 429 时重试）
        let mut handles = Vec::new();
        for task in tasks {
            handles.push(tokio::spawn(task));
        }

        // 等待所有任务完成
        for handle in handles {
            let (node_id, result) = handle.await.unwrap();
            results.insert(node_id, result);
        }

        Ok(results)
    }

    /// 检查节点条件
    async fn check_node_condition(&self, node: &WorkflowNode) -> Result<Option<bool>> {
        // TODO: 实现条件表达式解析
        // 暂时返回 Some(true) 表示总是执行
        Ok(Some(true))
    }

    /// 🔥 静态方法：执行单个节点（用于并行执行）
    /// 这个方法不依赖 self，因此可以在 'static task 中使用
    async fn execute_node_static(
        node: WorkflowNode,
        workflow: Workflow,
        node_results: Arc<RwLock<HashMap<String, NodeResult>>>,
        config: RunnerConfig,
        progress_callback: Arc<RwLock<Option<Box<dyn Fn(ProgressEvent) + Send + Sync>>>>,
    ) -> (String, NodeResult) {
        let node_id = node.id.clone();

        // 🔥 发送节点开始事件
        println!("[WorkflowRunner] 🔧 About to check progress_callback for node_started");
        let callback_guard = progress_callback.read().await;
        if let Some(callback) = callback_guard.as_ref() {
            println!("[WorkflowRunner] ✅ Progress callback exists, sending node_started event for node: {}", node_id);
            let event = ProgressEvent {
                event_type: "node_started".to_string(),
                workflow_id: Some(workflow.id.clone()),
                node_id: Some(node_id.clone()),
                message: Some(format!("开始执行节点: {}", node.label.as_ref().unwrap_or(&node_id))),
                timestamp: chrono::Utc::now().timestamp_millis(),
                tool_details: None,
                nodes: None,  // node_started 事件不包含计划节点
            };
            println!("[WorkflowRunner] 📤 Calling callback with event: {:?}", event);
            callback(event);
            println!("[WorkflowRunner] ✅ Callback executed successfully");
        } else {
            println!("[WorkflowRunner] ⚠️ Progress callback is None! No event will be sent for node: {}", node_id);
        }
        drop(callback_guard);  // 🔥 释放锁

        // 更新状态为运行中
        {
            let mut results = node_results.write().await;
            results.insert(node_id.clone(), NodeResult {
                node_id: node_id.clone(),
                status: NodeStatus::Running,
                output: None,
                error: None,
                started_at: Some(chrono::Utc::now().timestamp_millis()),
                completed_at: None,
            });
        }

        // 执行节点（带智能重试）
        let mut retry_count = 0;
        let result = loop {
            match Self::execute_node_once_static(&node, &workflow, progress_callback.clone()).await {
                Ok(result) => break result,
                Err(e) if retry_count < config.max_retries => {
                    retry_count += 1;

                    // 🔥 检查是否是速率限制错误
                    let error_str = e.to_string().to_lowercase();
                    let is_rate_limit = error_str.contains("429")
                        || error_str.contains("rate limit")
                        || error_str.contains("速率限制")
                        || error_str.contains("达到速率限制");

                    if is_rate_limit {
                        // 🔥 指数退避（参考 claw-code）：200ms 起始，每次翻倍，上限 2 秒
                        let delay_ms = std::cmp::min(2000, 200 * 2usize.pow(retry_count as u32));
                        println!("[WorkflowRunner] ⚠️ Rate limit detected (retry {}/{}), waiting {}ms before retry...",
                            retry_count, config.max_retries, delay_ms);
                        tokio::time::sleep(tokio::time::Duration::from_millis(delay_ms as u64)).await;
                        println!("[WorkflowRunner] 🔄 Retrying node {} now...", node_id);
                    } else {
                        // 其他错误，使用较短延迟
                        println!("[WorkflowRunner] ⚠️ Node {} failed (retry {}/{}): {}",
                            node_id, retry_count, config.max_retries, e);
                        tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
                    }
                    continue;
                }
                Err(e) => {
                    println!("[WorkflowRunner] ❌ Node {} failed after {} retries: {}",
                        node_id, config.max_retries, e);
                    break NodeResult::failure(node_id.clone(), e.to_string());
                }
            }
        };

        // 保存结果
        {
            let mut results = node_results.write().await;
            results.insert(node_id.clone(), result.clone());
        }

        (node_id, result)
    }

    /// 🔥 静态方法：执行节点一次（无重试）
    async fn execute_node_once_static(
        node: &WorkflowNode,
        workflow: &Workflow,
        progress_callback: Arc<RwLock<Option<Box<dyn Fn(ProgressEvent) + Send + Sync>>>>,
    ) -> Result<NodeResult> {
        println!("[WorkflowRunner] 🔧 Executing node: {} ({:?})", node.id, node.agent_type);

        // 🔥 构建执行上下文
        // 优先从 workflow 变量获取 project_root
        let project_root = workflow.variables.get("project_root")
            .cloned()
            .unwrap_or_else(|| {
                // 如果没有配置，使用当前工作目录
                std::env::current_dir()
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_else(|_| ".".to_string())
            });

        println!("[WorkflowRunner] 📂 Using project root: {}", project_root);

        // 获取目标路径（从工作流变量中）
        let target_path = workflow.variables.get("target_path")
            .unwrap_or(&".".to_string())  // 🔥 修复：默认使用当前目录
            .clone();

        // 🔥 构建完整的绝对路径并获取文件列表
        let full_path = std::path::Path::new(&project_root).join(&target_path);
        let file_list_info = if let Ok(entries) = std::fs::read_dir(&full_path) {
            let mut files: Vec<String> = Vec::new();
            let mut dirs: Vec<String> = Vec::new();

            for entry in entries.filter_map(|e| e.ok()) {
                let name = entry.file_name().into_string().ok();
                if let Some(name) = name {
                    if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                        dirs.push(name);
                    } else {
                        files.push(name);
                    }
                }
            }

            format!(
                "📁 实际目录结构:\n  目录: {}\n  文件: {}",
                dirs.join(", "),
                files.join(", ")
            )
        } else {
            "⚠️ 无法读取目录".to_string()
        };

        println!("[WorkflowRunner] 📂 Directory info: {}", file_list_info);

        // 🔥 获取 provider_config（从工作流变量中）
        let provider_config: Option<crate::core_traits::ai::AIProviderConfig> =
            workflow.variables.get("provider_config")
                .and_then(|config_str| serde_json::from_str(config_str).ok());

        // 如果没有配置，使用默认配置
        let provider_config = provider_config.unwrap_or_else(|| {
            println!("[WorkflowRunner] ⚠️ No provider config found, using default");
            crate::agent_system::workflow::executor::default_provider_config()
        });

        // 🔥 获取 current_model（从工作流变量中）
        let current_model = workflow.variables.get("current_model").cloned();
        println!("[WorkflowRunner] 🤖 Current model from workflow variables: {:?}", current_model);

        println!("[WorkflowRunner] ⚙️ Using provider: {} ({} models)",
            provider_config.name,
            provider_config.models.len()
        );

        // 构建任务描述（包含实际的文件列表）
        let task_description = format!(
            "请对以下路径进行代码{}: {}\n\n{}",
            match node.agent_type {
                AgentType::Explore => "探索",
                AgentType::Review => "审查",
                AgentType::Refactor => "重构分析",
                AgentType::Test => "测试分析",
                AgentType::Doc => "文档生成",
                AgentType::TaskBreakdown => "任务分解",
                AgentType::ProposalGenerator => "提案生成",
                AgentType::GeneralPurpose => "处理",
            },
            target_path,
            file_list_info  // 🔥 添加实际的文件列表信息
        );

        // 创建执行上下文
        let mut ctx = NodeExecutionContext::new(
            node.id.clone(),
            project_root,
            task_description,
        )
        .with_variable("target_path".to_string(), target_path)
        .with_provider_config(provider_config);  // 🔥 添加 provider_config

        // 🔥 如果存在 current_model，将其传递到执行上下文
        if let Some(model) = current_model {
            println!("[WorkflowRunner] ✅ Passing current_model to execution context: {}", model);
            ctx = ctx.with_variable("current_model".to_string(), model);
        }

        // 🔥 添加工具调用进度回调
        let progress_callback_for_tool = progress_callback.clone();
        let node_id_for_callback = node.id.clone();
        let workflow_id_for_callback = workflow.id.clone();  // 🔥 捕获 workflow_id
        ctx = ctx.with_tool_progress_callback(std::sync::Arc::new(move |tool_details| {
            // 当工具调用完成时，发送包含详细信息的进度事件
            let callback = progress_callback_for_tool.clone();
            let node_id_clone = node_id_for_callback.clone();
            let workflow_id_clone = workflow_id_for_callback.clone();  // 🔥 捕获 workflow_id
            tokio::spawn(async move {
                if let Some(cb) = callback.read().await.as_ref() {
                    let event = ProgressEvent {
                        event_type: "tool_call".to_string(),
                        workflow_id: Some(workflow_id_clone),  // 🔥 添加 workflow_id
                        node_id: Some(node_id_clone),
                        message: Some(format!("工具调用: {}", tool_details.tool_name)),
                        timestamp: chrono::Utc::now().timestamp_millis(),
                        tool_details: Some(tool_details),
                        nodes: None,  // tool_call 事件不包含计划节点
                    };
                    cb(event);
                }
            });
        }));

        // 🔥 使用真实的执行器
        let executor = AgentNodeExecutor::new();
        println!("[WorkflowRunner] 🎯 About to execute node {} with executor", node.id);
        let result = executor.execute(node, &ctx).await?;

        println!("[WorkflowRunner] ✅ Node {} completed with status: {:?}", node.id, result.status);
        if let Some(output) = &result.output {
            println!("[WorkflowRunner] 📝 Output length: {} chars", output.len());
            println!("[WorkflowRunner] 📝 Output preview: {}...", output.chars().take(100).collect::<String>());
        }
        if let Some(error) = &result.error {
            println!("[WorkflowRunner] ❌ Error: {}", error);
        }
        Ok(result)
    }

    /// 执行单个节点
    async fn execute_node(&self, node: WorkflowNode) -> NodeResult {
        let node_id = node.id.clone();

        // 更新状态为运行中
        {
            let mut results = self.node_results.write().await;
            results.insert(node_id.clone(), NodeResult {
                node_id: node_id.clone(),
                status: NodeStatus::Running,
                output: None,
                error: None,
                started_at: Some(chrono::Utc::now().timestamp_millis()),
                completed_at: None,
            });
        }

        // 执行节点（带智能重试）
        let mut retry_count = 0;
        let result = loop {
            match self.execute_node_once(&node).await {
                Ok(result) => break result,
                Err(e) if retry_count < self.config.max_retries => {
                    retry_count += 1;

                    // 🔥 检查是否是速率限制错误
                    let error_str = e.to_string().to_lowercase();
                    let is_rate_limit = error_str.contains("429")
                        || error_str.contains("rate limit")
                        || error_str.contains("速率限制")
                        || error_str.contains("达到速率限制");

                    if is_rate_limit {
                        // 🔥 指数退避（参考 claw-code）：200ms 起始，每次翻倍，上限 2 秒
                        let delay_ms = std::cmp::min(2000, 200 * 2usize.pow(retry_count as u32));
                        println!("[WorkflowRunner] ⚠️ Rate limit detected (retry {}/{}), waiting {}ms before retry...",
                            retry_count, self.config.max_retries, delay_ms);
                        tokio::time::sleep(tokio::time::Duration::from_millis(delay_ms as u64)).await;
                        println!("[WorkflowRunner] 🔄 Retrying node {} now...", node_id);
                    } else {
                        // 其他错误，使用较短延迟
                        println!("[WorkflowRunner] ⚠️ Node {} failed (retry {}/{}): {}",
                            node_id, retry_count, self.config.max_retries, e);
                        tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
                    }
                    continue;
                }
                Err(e) => {
                    println!("[WorkflowRunner] ❌ Node {} failed after {} retries: {}",
                        node_id, self.config.max_retries, e);
                    break NodeResult::failure(node_id.clone(), e.to_string());
                }
            }
        };

        // 保存结果
        {
            let mut results = self.node_results.write().await;
            results.insert(node_id.clone(), result.clone());
        }

        result
    }

    /// 执行节点一次（无重试）
    async fn execute_node_once(&self, node: &WorkflowNode) -> Result<NodeResult> {
        println!("[WorkflowRunner] 🔧 Executing node: {} ({:?})", node.id, node.agent_type);

        // 🔥 构建执行上下文
        // 优先从 workflow 变量获取 project_root
        let project_root = self.workflow.variables.get("project_root")
            .cloned()
            .unwrap_or_else(|| {
                // 如果没有配置，使用当前工作目录
                std::env::current_dir()
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_else(|_| ".".to_string())
            });

        println!("[WorkflowRunner] 📂 Using project root: {}", project_root);

        // 获取目标路径（从工作流变量中）
        let target_path = self.workflow.variables.get("target_path")
            .unwrap_or(&".".to_string())  // 🔥 修复：默认使用当前目录
            .clone();

        // 🔥 构建完整的绝对路径并获取文件列表
        let full_path = std::path::Path::new(&project_root).join(&target_path);
        let file_list_info = if let Ok(entries) = std::fs::read_dir(&full_path) {
            let mut files: Vec<String> = Vec::new();
            let mut dirs: Vec<String> = Vec::new();

            for entry in entries.filter_map(|e| e.ok()) {
                let name = entry.file_name().into_string().ok();
                if let Some(name) = name {
                    if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                        dirs.push(name);
                    } else {
                        files.push(name);
                    }
                }
            }

            format!(
                "📁 实际目录结构:\n  目录: {}\n  文件: {}",
                dirs.join(", "),
                files.join(", ")
            )
        } else {
            "⚠️ 无法读取目录".to_string()
        };

        println!("[WorkflowRunner] 📂 Directory info: {}", file_list_info);

        // 🔥 获取 provider_config（从工作流变量中）
        let provider_config: Option<crate::core_traits::ai::AIProviderConfig> =
            self.workflow.variables.get("provider_config")
                .and_then(|config_str| serde_json::from_str(config_str).ok());

        // 如果没有配置，使用默认配置
        let provider_config = provider_config.unwrap_or_else(|| {
            println!("[WorkflowRunner] ⚠️ No provider config found, using default");
            crate::agent_system::workflow::executor::default_provider_config()
        });

        // 🔥 获取 current_model（从工作流变量中）
        let current_model = self.workflow.variables.get("current_model").cloned();
        println!("[WorkflowRunner] 🤖 Current model from workflow variables: {:?}", current_model);

        println!("[WorkflowRunner] ⚙️ Using provider: {} ({} models)",
            provider_config.name,
            provider_config.models.len()
        );

        // 构建任务描述（包含实际的文件列表）
        let task_description = format!(
            "请对以下路径进行代码{}: {}\n\n{}",
            match node.agent_type {
                AgentType::Explore => "探索",
                AgentType::Review => "审查",
                AgentType::Refactor => "重构分析",
                AgentType::Test => "测试分析",
                AgentType::Doc => "文档生成",
                AgentType::TaskBreakdown => "任务分解",
                AgentType::ProposalGenerator => "提案生成",
                AgentType::GeneralPurpose => "处理",
            },
            target_path,
            file_list_info  // 🔥 添加实际的文件列表信息
        );

        // 创建执行上下文
        let mut ctx = NodeExecutionContext::new(
            node.id.clone(),
            project_root,
            task_description,
        )
        .with_variable("target_path".to_string(), target_path)
        .with_provider_config(provider_config);  // 🔥 添加 provider_config

        // 🔥 如果存在 current_model，将其传递到执行上下文
        if let Some(model) = current_model {
            println!("[WorkflowRunner] ✅ Passing current_model to execution context: {}", model);
            ctx = ctx.with_variable("current_model".to_string(), model);
        }

        // 🔥 使用真实的执行器
        let executor = AgentNodeExecutor::new();
        println!("[WorkflowRunner] 🎯 About to execute node {} with executor", node.id);
        let result = executor.execute(node, &ctx).await?;

        println!("[WorkflowRunner] ✅ Node {} completed with status: {:?}", node.id, result.status);
        if let Some(output) = &result.output {
            println!("[WorkflowRunner] 📝 Output length: {} chars", output.len());
            println!("[WorkflowRunner] 📝 Output preview: {}...", output.chars().take(100).collect::<String>());
        }
        if let Some(error) = &result.error {
            println!("[WorkflowRunner] ❌ Error: {}", error);
        }
        Ok(result)
    }

    /// 获取当前状态
    pub async fn get_status(&self) -> WorkflowStatus {
        self.status.read().await.clone()
    }

    /// 获取节点执行结果
    pub async fn get_node_results(&self) -> HashMap<String, NodeResult> {
        self.node_results.read().await.clone()
    }

    /// 取消执行
    pub async fn cancel(&self) -> Result<()> {
        let mut status = self.status.write().await;
        *status = WorkflowStatus::Cancelled;
        Ok(())
    }

    /// 暂停执行
    pub async fn pause(&self) -> Result<()> {
        let mut status = self.status.write().await;
        if matches!(*status, WorkflowStatus::Running) {
            *status = WorkflowStatus::Paused;
        }
        Ok(())
    }

    /// 恢复执行
    pub async fn resume(&self) -> Result<()> {
        let mut status = self.status.write().await;
        if matches!(*status, WorkflowStatus::Paused) {
            *status = WorkflowStatus::Running;
        }
        Ok(())
    }
}

/// 为 Workflow 添加辅助方法
impl Workflow {
    /// 获取节点
    pub fn get_node(&self, node_id: &str) -> Option<&WorkflowNode> {
        self.nodes.iter().find(|n| n.id == node_id)
    }

    /// 获取节点的前驱节点
    pub fn get_predecessors(&self, node_id: &str) -> Vec<&WorkflowNode> {
        let mut predecessors = Vec::new();
        for edge in &self.edges {
            if edge.to == node_id {
                if let Some(node) = self.get_node(&edge.from) {
                    predecessors.push(node);
                }
            }
        }
        predecessors
    }

    /// 获取节点的后继节点
    pub fn get_successors(&self, node_id: &str) -> Vec<&WorkflowNode> {
        let mut successors = Vec::new();
        for edge in &self.edges {
            if edge.from == node_id {
                if let Some(node) = self.get_node(&edge.to) {
                    successors.push(node);
                }
            }
        }
        successors
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent_system::workflow::{Workflow, WorkflowNode, WorkflowEdge, AgentType};

    fn create_simple_workflow() -> Workflow {
        let mut workflow = Workflow::new("test-workflow", "Test Workflow");
        workflow
            .add_node(WorkflowNode::new("a", AgentType::Explore))
            .add_node(WorkflowNode::new("b", AgentType::Review))
            .add_node(WorkflowNode::new("c", AgentType::Refactor))
            .add_edge(WorkflowEdge::new("a", "b"))
            .add_edge(WorkflowEdge::new("b", "c"));
        workflow
    }

    #[tokio::test]
    async fn test_runner_creation() {
        let workflow = create_simple_workflow();
        let runner = WorkflowRunner::with_default_config(workflow);
        assert!(runner.is_ok());
    }

    #[tokio::test]
    async fn test_runner_execution() {
        let workflow = create_simple_workflow();
        let runner = WorkflowRunner::with_default_config(workflow).unwrap();
        let result = runner.run().await.unwrap();

        assert_eq!(result.workflow_id, "test-workflow");
        assert_eq!(result.status, WorkflowStatus::Completed);
        assert_eq!(result.node_results.len(), 3);
        assert!(result.is_all_success());
    }

    #[tokio::test]
    async fn test_node_status_is_terminal() {
        assert!(NodeStatus::Completed.is_terminal());
        assert!(NodeStatus::Failed("error".to_string()).is_terminal());
        assert!(NodeStatus::Skipped.is_terminal());
        assert!(!NodeStatus::Pending.is_terminal());
        assert!(!NodeStatus::Running.is_terminal());
    }

    #[tokio::test]
    async fn test_node_result_creation() {
        let success = NodeResult::success("node1".to_string(), "output".to_string());
        assert_eq!(success.status, NodeStatus::Completed);
        assert_eq!(success.output, Some("output".to_string()));

        let failure = NodeResult::failure("node2".to_string(), "error".to_string());
        assert_eq!(failure.status, NodeStatus::Failed("error".to_string()));
        assert_eq!(failure.error, Some("error".to_string()));

        let skipped = NodeResult::skipped("node3".to_string(), "reason".to_string());
        assert_eq!(skipped.status, NodeStatus::Skipped);
    }

    #[tokio::test]
    async fn test_workflow_result_success_count() {
        let mut result = WorkflowResult::new("test".to_string());

        result.node_results.insert(
            "node1".to_string(),
            NodeResult::success("node1".to_string(), "output".to_string())
        );
        result.node_results.insert(
            "node2".to_string(),
            NodeResult::failure("node2".to_string(), "error".to_string())
        );

        assert_eq!(result.success_count(), 1);
        assert_eq!(result.failure_count(), 1);
        assert!(!result.is_all_success());
    }

    #[tokio::test]
    async fn test_runner_config_default() {
        let config = RunnerConfig::default();
        assert_eq!(config.max_concurrent_nodes, 3);
        assert_eq!(config.node_timeout_secs, 300);
        assert_eq!(config.max_retries, 2);
        assert!(!config.fail_fast);
    }

    #[tokio::test]
    async fn test_workflow_helpers() {
        let workflow = create_simple_workflow();

        // 获取节点
        let node_a = workflow.get_node("a");
        assert!(node_a.is_some());
        assert_eq!(node_a.unwrap().agent_type, AgentType::Explore);

        // 获取前驱
        let predecessors_b = workflow.get_predecessors("b");
        assert_eq!(predecessors_b.len(), 1);
        assert_eq!(predecessors_b[0].id, "a");

        // 获取后继
        let successors_a = workflow.get_successors("a");
        assert_eq!(successors_a.len(), 1);
        assert_eq!(successors_a[0].id, "b");
    }

    #[tokio::test]
    async fn test_parallel_execution() {
        // 菱形图：a -> (b, c) -> d
        let mut workflow = Workflow::new("parallel-test", "Parallel Test");
        workflow
            .add_node(WorkflowNode::new("a", AgentType::Explore))
            .add_node(WorkflowNode::new("b", AgentType::Review))
            .add_node(WorkflowNode::new("c", AgentType::Refactor))
            .add_node(WorkflowNode::new("d", AgentType::Test))
            .add_edge(WorkflowEdge::new("a", "b"))
            .add_edge(WorkflowEdge::new("a", "c"))
            .add_edge(WorkflowEdge::new("b", "d"))
            .add_edge(WorkflowEdge::new("c", "d"));

        let runner = WorkflowRunner::with_default_config(workflow).unwrap();
        let schedule = runner.schedule.as_ref().unwrap();

        // b 和 c 应该在同一组
        let group_b = schedule.get_node_group("b");
        let group_c = schedule.get_node_group("c");
        assert_eq!(group_b, group_c);

        let result = runner.run().await.unwrap();
        assert!(result.is_all_success());
        assert_eq!(result.node_results.len(), 4);
    }

    #[tokio::test]
    async fn test_runner_pause_resume() {
        let workflow = create_simple_workflow();
        let runner = WorkflowRunner::with_default_config(workflow).unwrap();

        // 初始状态是 Idle
        assert_eq!(runner.get_status().await, WorkflowStatus::Idle);

        // 从 Idle 状态暂停不会改变状态（只有 Running 可以暂停）
        assert!(runner.pause().await.is_ok());
        assert_eq!(runner.get_status().await, WorkflowStatus::Idle);

        // 模拟运行中状态（通过直接设置状态来测试）
        {
            let mut status = runner.status.write().await;
            *status = WorkflowStatus::Running;
        }
        assert_eq!(runner.get_status().await, WorkflowStatus::Running);

        // 从 Running 状态暂停
        assert!(runner.pause().await.is_ok());
        assert_eq!(runner.get_status().await, WorkflowStatus::Paused);

        // 恢复
        assert!(runner.resume().await.is_ok());
        assert_eq!(runner.get_status().await, WorkflowStatus::Running);
    }

    #[tokio::test]
    async fn test_runner_cancel() {
        let workflow = create_simple_workflow();
        let runner = WorkflowRunner::with_default_config(workflow).unwrap();

        // 取消
        assert!(runner.cancel().await.is_ok());
        assert_eq!(runner.get_status().await, WorkflowStatus::Cancelled);
    }
}
