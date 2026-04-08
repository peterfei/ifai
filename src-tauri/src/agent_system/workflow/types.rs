//! 工作流数据结构定义
//!
//! 定义多智能体工作流的核心数据类型

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// 工作流定义
///
/// 表示一个完整的多智能体协作工作流
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Workflow {
    /// 工作流唯一标识符
    pub id: String,

    /// 工作流名称
    pub name: String,

    /// 工作流描述
    #[serde(default)]
    pub description: String,

    /// 工作流节点（智能体）
    pub nodes: Vec<WorkflowNode>,

    /// 工作流边（依赖关系）
    #[serde(default)]
    pub edges: Vec<WorkflowEdge>,

    /// 工作流变量（用于模板替换）
    #[serde(default)]
    pub variables: HashMap<String, String>,
}

impl Workflow {
    /// 创建新的工作流
    pub fn new(id: impl Into<String>, name: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            name: name.into(),
            description: String::new(),
            nodes: Vec::new(),
            edges: Vec::new(),
            variables: HashMap::new(),
        }
    }

    /// 添加节点
    pub fn add_node(&mut self, node: WorkflowNode) -> &mut Self {
        self.nodes.push(node);
        self
    }

    /// 添加边
    pub fn add_edge(&mut self, edge: WorkflowEdge) -> &mut Self {
        self.edges.push(edge);
        self
    }

    /// 设置描述
    pub fn with_description(mut self, description: impl Into<String>) -> Self {
        self.description = description.into();
        self
    }

    /// 验证工作流结构
    ///
    /// 使用 WorkflowValidator 进行完整验证，包括：
    /// - 节点 ID 唯一性检查
    /// - 边引用的节点存在性检查
    /// - 循环依赖检测
    pub fn validate(&self) -> Result<(), WorkflowValidationError> {
        crate::agent_system::workflow::validator::WorkflowValidator::validate(self)
    }
}

/// 工作流节点
///
/// 表示工作流中的一个智能体节点
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowNode {
    /// 节点唯一标识符
    pub id: String,

    /// 智能体类型
    #[serde(rename = "agentType")]
    pub agent_type: AgentType,

    /// 节点配置
    #[serde(default)]
    pub config: AgentConfig,

    /// 节点标签（用于显示）
    #[serde(default)]
    pub label: Option<String>,
}

impl WorkflowNode {
    /// 创建新的节点
    pub fn new(id: impl Into<String>, agent_type: AgentType) -> Self {
        Self {
            id: id.into(),
            agent_type,
            config: AgentConfig::default(),
            label: None,
        }
    }

    /// 设置标签
    pub fn with_label(mut self, label: impl Into<String>) -> Self {
        self.label = Some(label.into());
        self
    }

    /// 设置配置
    pub fn with_config(mut self, config: AgentConfig) -> Self {
        self.config = config;
        self
    }
}

/// 智能体类型
///
/// 支持的智能体类型枚举
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AgentType {
    /// 代码探索智能体
    Explore,

    /// 代码审查智能体
    Review,

    /// 重构智能体
    Refactor,

    /// 测试生成智能体
    Test,

    /// 文档生成智能体
    Doc,

    /// 任务分解智能体
    TaskBreakdown,

    /// 提案生成智能体
    ProposalGenerator,

    /// 通用智能体
    GeneralPurpose,
}

impl AgentType {
    /// 获取智能体类型的字符串表示
    pub fn as_str(&self) -> &str {
        match self {
            AgentType::Explore => "explore",
            AgentType::Review => "review",
            AgentType::Refactor => "refactor",
            AgentType::Test => "test",
            AgentType::Doc => "doc",
            AgentType::TaskBreakdown => "task_breakdown",
            AgentType::ProposalGenerator => "proposal_generator",
            AgentType::GeneralPurpose => "general_purpose",
        }
    }
}

/// 智能体配置
///
/// 智能体运行时的配置参数
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AgentConfig {
    /// 目标文件或目录
    #[serde(default)]
    pub target: Option<String>,

    /// 任务描述
    #[serde(default)]
    pub task_description: Option<String>,

    /// 严重性阈值（用于审查智能体）
    #[serde(default)]
    pub severity_threshold: Option<u8>,

    /// 超时时间（秒）
    #[serde(default)]
    pub timeout_secs: Option<u64>,

    /// 自定义参数
    #[serde(flatten)]
    pub custom_params: HashMap<String, serde_json::Value>,
}

/// 工作流边
///
/// 表示节点之间的依赖关系
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowEdge {
    /// 源节点 ID
    pub from: String,

    /// 目标节点 ID
    pub to: String,

    /// 条件表达式（可选）
    ///
    /// 如果指定，只有条件满足时才会执行目标节点
    #[serde(rename = "condition", default)]
    pub condition: Option<String>,
}

impl WorkflowEdge {
    /// 创建新的边
    pub fn new(from: impl Into<String>, to: impl Into<String>) -> Self {
        Self {
            from: from.into(),
            to: to.into(),
            condition: None,
        }
    }

    /// 设置条件
    pub fn with_condition(mut self, condition: impl Into<String>) -> Self {
        self.condition = Some(condition.into());
        self
    }
}

/// 工作流验证错误
#[derive(Debug, Clone, thiserror::Error)]
pub enum WorkflowValidationError {
    /// 节点 ID 重复
    #[error("Duplicate node ID: {0}")]
    DuplicateNode(String),

    /// 节点不存在
    #[error("Node not found: {0}")]
    NodeNotFound(String),

    /// 检测到循环依赖
    #[error("Cyclic dependency detected")]
    CyclicDependency,

    /// 无效的条件表达式
    #[error("Invalid condition expression: {0}")]
    InvalidCondition(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_workflow_creation() {
        let workflow = Workflow::new("test-workflow", "Test Workflow")
            .with_description("A test workflow");

        assert_eq!(workflow.id, "test-workflow");
        assert_eq!(workflow.name, "Test Workflow");
        assert_eq!(workflow.description, "A test workflow");
    }

    #[test]
    fn test_workflow_builder() {
        let mut workflow = Workflow::new("test", "Test");

        workflow
            .add_node(WorkflowNode::new("node1", AgentType::Explore))
            .add_node(WorkflowNode::new("node2", AgentType::Review))
            .add_edge(WorkflowEdge::new("node1", "node2"));

        assert_eq!(workflow.nodes.len(), 2);
        assert_eq!(workflow.edges.len(), 1);
    }

    #[test]
    fn test_workflow_validate_duplicate_nodes() {
        let mut workflow = Workflow::new("test", "Test");

        workflow
            .add_node(WorkflowNode::new("node1", AgentType::Explore))
            .add_node(WorkflowNode::new("node1", AgentType::Review)); // 重复 ID

        let result = workflow.validate();
        assert!(result.is_err());
        assert!(matches!(
            result.unwrap_err(),
            WorkflowValidationError::DuplicateNode(_)
        ));
    }

    #[test]
    fn test_workflow_validate_missing_nodes() {
        let mut workflow = Workflow::new("test", "Test");

        workflow
            .add_node(WorkflowNode::new("node1", AgentType::Explore))
            .add_edge(WorkflowEdge::new("node1", "node2")); // node2 不存在

        let result = workflow.validate();
        assert!(result.is_err());
        assert!(matches!(
            result.unwrap_err(),
            WorkflowValidationError::NodeNotFound(_)
        ));
    }

    #[test]
    fn test_agent_type_to_string() {
        assert_eq!(AgentType::Explore.as_str(), "explore");
        assert_eq!(AgentType::Review.as_str(), "review");
        assert_eq!(AgentType::Refactor.as_str(), "refactor");
    }
}
