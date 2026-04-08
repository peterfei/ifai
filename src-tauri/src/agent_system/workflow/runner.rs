//! 工作流运行器
//!
//! 负责执行工作流，追踪节点状态，处理错误和重试

use super::types::{Workflow, WorkflowNode, AgentType, WorkflowValidationError};
use super::scheduler::{WorkflowScheduler, Schedule, ScheduleError};
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
            max_retries: 2,
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
        })
    }

    /// 使用默认配置创建运行器
    pub fn with_default_config(workflow: Workflow) -> Result<Self, ScheduleError> {
        Self::new(workflow, RunnerConfig::default())
    }

    /// 执行工作流
    pub async fn run(&self) -> Result<WorkflowResult> {
        // 更新状态为运行中
        {
            let mut status = self.status.write().await;
            *status = WorkflowStatus::Running;
        }

        let schedule = self.schedule.as_ref().expect("Schedule should exist");
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
        let mut results = HashMap::new();
        let mut tasks = Vec::new();

        // 创建执行任务
        for node_id in group {
            let node = self.workflow.get_node(node_id)
                .expect("Node should exist");

            // 检查条件是否满足
            if let Some(true) = self.check_node_condition(node).await? {
                let node = node.clone();
                let node_id = node_id.clone();
                tasks.push(async move {
                    let result = self.execute_node(node).await;
                    (node_id, result)
                });
            } else {
                // 条件不满足，跳过
                results.insert(
                    node_id.clone(),
                    NodeResult::skipped(node_id.clone(), "Condition not met".to_string())
                );
            }
        }

        // 串行执行（暂时简化，TODO: 实现真正的并行执行）
        for task in tasks {
            let (node_id, result) = task.await;
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

        // 执行节点（带重试）
        let mut retry_count = 0;
        let result = loop {
            match self.execute_node_once(&node).await {
                Ok(result) => break result,
                Err(e) if retry_count < self.config.max_retries => {
                    retry_count += 1;
                    // TODO: 添加延迟（指数退避）
                    continue;
                }
                Err(e) => {
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
        // TODO: 实际执行智能体
        // 暂时返回模拟结果

        // 根据节点类型模拟不同执行时间
        let duration = std::time::Duration::from_millis(match node.agent_type {
            AgentType::Explore => 100,
            AgentType::Review => 50,
            AgentType::Refactor => 150,
            AgentType::Test => 200,
            AgentType::Doc => 80,
            AgentType::TaskBreakdown => 120,
            AgentType::ProposalGenerator => 180,
            AgentType::GeneralPurpose => 100,
        });

        tokio::time::sleep(duration).await;

        // 模拟成功结果
        let output = format!("Executed {:?} agent", node.agent_type);
        Ok(NodeResult::success(node.id.clone(), output))
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
