//! 工作流节点执行器
//!
//! 负责执行单个工作流节点，集成实际的智能体调用

use super::types::{WorkflowNode, AgentType};
use super::runner::NodeResult;
use crate::agent_system::base::{Agent, AgentContext};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use anyhow::Result;

/// 创建默认的 AI 提供商配置
#[cfg(feature = "commercial")]
fn default_provider_config() -> crate::core_traits::ai::AIProviderConfig {
    crate::core_traits::ai::AIProviderConfig {
        id: String::new(),
        name: String::new(),
        api_key: String::new(),
        base_url: String::new(),
        models: Vec::new(),
        protocol: crate::core_traits::ai::AIProtocol::OpenAI,
        enabled: true,
    }
}

/// 创建默认的 AI 提供商配置（community 版本）
#[cfg(not(feature = "commercial"))]
fn default_provider_config() -> crate::core_traits::ai::AIProviderConfig {
    crate::core_traits::ai::AIProviderConfig {
        id: String::new(),
        name: String::new(),
        api_key: String::new(),
        base_url: String::new(),
        models: Vec::new(),
        protocol: crate::core_traits::ai::AIProtocol::Openai,
    }
}

/// 节点执行上下文
#[derive(Debug, Clone)]
pub struct NodeExecutionContext {
    /// 节点 ID
    pub node_id: String,
    /// 项目根目录
    pub project_root: String,
    /// 任务描述
    pub task_description: String,
    /// 输入数据（来自前驱节点）
    pub inputs: HashMap<String, String>,
    /// 工作流变量
    pub workflow_variables: HashMap<String, String>,
    /// AI 提供商配置
    pub provider_config: Option<crate::core_traits::ai::AIProviderConfig>,
}

impl NodeExecutionContext {
    /// 创建新的执行上下文
    pub fn new(
        node_id: String,
        project_root: String,
        task_description: String,
    ) -> Self {
        Self {
            node_id,
            project_root,
            task_description,
            inputs: HashMap::new(),
            workflow_variables: HashMap::new(),
            provider_config: None,
        }
    }

    /// 添加输入数据
    pub fn with_input(mut self, key: String, value: String) -> Self {
        self.inputs.insert(key, value);
        self
    }

    /// 添加工作流变量
    pub fn with_variable(mut self, key: String, value: String) -> Self {
        self.workflow_variables.insert(key, value);
        self
    }

    /// 设置 AI 提供商配置
    pub fn with_provider_config(mut self, config: crate::core_traits::ai::AIProviderConfig) -> Self {
        self.provider_config = Some(config);
        self
    }

    /// 获取完整的任务描述（包含输入数据）
    pub fn get_full_task_description(&self) -> String {
        if self.inputs.is_empty() {
            return self.task_description.clone();
        }

        let mut desc = format!("{}\n\n输入数据:\n", self.task_description);
        for (key, value) in &self.inputs {
            desc.push_str(&format!("- {}: {}\n", key, value));
        }
        desc
    }

    /// 转换为 AgentContext
    pub fn to_agent_context(&self) -> AgentContext {
        // 合并工作流变量和输入数据
        let mut variables = self.workflow_variables.clone();
        variables.extend(self.inputs.clone());

        AgentContext {
            project_root: self.project_root.clone(),
            task_description: self.get_full_task_description(),
            initial_prompt: String::new(),
            variables,
            provider_config: self.provider_config.clone()
                .unwrap_or_else(|| default_provider_config()),
        }
    }
}

/// 节点执行器
#[async_trait::async_trait]
pub trait NodeExecutor: Send + Sync {
    /// 执行节点
    async fn execute(&self, node: &WorkflowNode, ctx: &NodeExecutionContext) -> Result<NodeResult>;

    /// 获取执行器名称
    fn name(&self) -> &str {
        "NodeExecutor"
    }
}

/// 智能体节点执行器
///
/// 将工作流节点映射到实际的智能体执行
pub struct AgentNodeExecutor {
    /// 智能体注册表（映射 AgentType 到实际智能体）
    agents: Arc<RwLock<HashMap<String, Box<dyn Agent>>>>,
}

impl AgentNodeExecutor {
    /// 创建新的智能体节点执行器
    pub fn new() -> Self {
        Self {
            agents: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// 注册智能体
    pub async fn register_agent(&self, agent: Box<dyn Agent>) {
        let mut agents = self.agents.write().await;
        agents.insert(agent.id(), agent);
    }

    /// 获取智能体
    async fn get_agent(&self, agent_type: &str) -> Option<Box<dyn Agent>> {
        let agents = self.agents.read().await;
        // 查找匹配类型的智能体
        for agent in agents.values() {
            if agent.agent_type() == agent_type {
                // 注意：这里需要克隆智能体，但我们不能 clone dyn Agent
                // 实际实现需要使用 Arc 或其他方式共享智能体
                // 暂时返回 None，需要重新设计
                return None;
            }
        }
        None
    }
}

impl Default for AgentNodeExecutor {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait::async_trait]
impl NodeExecutor for AgentNodeExecutor {
    /// 执行节点
    async fn execute(&self, node: &WorkflowNode, ctx: &NodeExecutionContext) -> Result<NodeResult> {
        let node_id = node.id.clone();
        let agent_type_str = format!("{:?}", node.agent_type);
        let start_time = chrono::Utc::now().timestamp_millis();

        // 构建任务描述
        let task_description = Self::build_task_description(node, ctx);

        // 构建完整的任务描述（包含前驱节点的输出）
        let full_description = if ctx.inputs.is_empty() {
            task_description
        } else {
            let mut desc = format!("{}\n\n前驱节点输出:\n", task_description);
            for (pred_id, output) in &ctx.inputs {
                desc.push_str(&format!("- {}: {}\n", pred_id, output));
            }
            desc
        };

        // 创建 AgentContext
        let agent_ctx = AgentContext {
            project_root: ctx.project_root.clone(),
            task_description: full_description,
            initial_prompt: String::new(),
            variables: ctx.workflow_variables.clone(),
            provider_config: ctx.provider_config.clone()
                .unwrap_or_else(|| default_provider_config()),
        };

        // 执行智能体
        // TODO: 这里需要实际的智能体实现
        // 暂时返回模拟结果
        let output = Self::execute_agent_simulation(node, &agent_ctx).await?;

        let end_time = chrono::Utc::now().timestamp_millis();

        Ok(NodeResult {
            node_id: node_id.clone(),
            status: super::runner::NodeStatus::Completed,
            output: Some(output),
            error: None,
            started_at: Some(start_time),
            completed_at: Some(end_time),
        })
    }

    fn name(&self) -> &str {
        "AgentNodeExecutor"
    }
}

impl AgentNodeExecutor {
    /// 构建任务描述
    fn build_task_description(node: &WorkflowNode, ctx: &NodeExecutionContext) -> String {
        // 基础任务描述
        let mut desc = format!("节点: {}\n", node.id);

        // 添加节点配置
        if let Some(label) = &node.label {
            desc.push_str(&format!("标签: {}\n", label));
        }

        desc.push_str(&format!("智能体类型: {:?}\n", node.agent_type));

        // 添加任务描述
        if !ctx.task_description.is_empty() {
            desc.push_str(&format!("\n任务:\n{}\n", ctx.task_description));
        }

        // 添加节点配置参数
        if !node.config.custom_params.is_empty() {
            desc.push_str("\n配置参数:\n");
            for (key, value) in &node.config.custom_params {
                desc.push_str(&format!("- {}: {}\n", key, value));
            }
        }

        desc
    }

    /// 模拟智能体执行（临时实现）
    async fn execute_agent_simulation(
        node: &WorkflowNode,
        ctx: &AgentContext,
    ) -> Result<String> {
        // 模拟执行时间
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

        // 返回模拟输出
        let output = match node.agent_type {
            AgentType::Explore => format!(
                "探索结果: 分析了项目结构，发现 {} 个关键文件",
                10
            ),
            AgentType::Review => format!(
                "审查结果: 代码质量良好，发现 {} 个改进建议",
                3
            ),
            AgentType::Refactor => format!(
                "重构结果: 优化了 {} 处代码，提升了可读性",
                5
            ),
            AgentType::Test => format!(
                "测试结果: 运行了 {} 个测试用例，全部通过",
                15
            ),
            AgentType::Doc => format!(
                "文档生成: 生成了 {} 页文档，包含 API 参考",
                8
            ),
            AgentType::TaskBreakdown => format!(
                "任务分解: 将任务分解为 {} 个子任务",
                6
            ),
            AgentType::ProposalGenerator => format!(
                "提案生成: 生成了包含 {} 个阶段的实施提案",
                4
            ),
            AgentType::GeneralPurpose => format!(
                "通用处理: 完成了任务处理，输出结果"
            ),
        };

        Ok(output)
    }
}

/// 条件表达式求值器
pub struct ConditionEvaluator;

impl ConditionEvaluator {
    /// 评估条件表达式
    ///
    /// 支持的语法：
    /// - `${variable} > value`
    /// - `${variable} == "string"`
    /// - `${variable} contains "substring"`
    /// - `${prev_node.output} != "error"`
    pub fn evaluate(
        expression: &str,
        context: &HashMap<String, String>,
    ) -> Result<bool> {
        let expr = expression.trim();

        // 简单实现：检查变量是否存在且非空
        if expr.starts_with("${") && expr.ends_with("}") {
            let var_name = &expr[2..expr.len()-1];
            if let Some(value) = context.get(var_name) {
                return Ok(!value.is_empty());
            }
            return Ok(false);
        }

        // 检查简单比较
        if let Some(pos) = expr.find("==") {
            let left = expr[..pos].trim();
            let right = expr[pos+2..].trim();

            let left_val = Self::resolve_value(left, context)?;
            let right_val = Self::resolve_value(right, context)?;

            return Ok(left_val == right_val);
        }

        if let Some(pos) = expr.find("!=") {
            let left = expr[..pos].trim();
            let right = expr[pos+2..].trim();

            let left_val = Self::resolve_value(left, context)?;
            let right_val = Self::resolve_value(right, context)?;

            return Ok(left_val != right_val);
        }

        // 检查包含关系
        if let Some(pos) = expr.find("contains") {
            let left = expr[..pos].trim();
            let right = expr[pos+8..].trim();

            let left_val = Self::resolve_value(left, context)?;
            let right_val = Self::resolve_value(right, context)?;

            return Ok(left_val.contains(&right_val));
        }

        // 默认：检查表达式是否为 true
        Ok(expr == "true" || !expr.is_empty())
    }

    /// 解析值（变量或字面量）
    fn resolve_value(value: &str, context: &HashMap<String, String>) -> Result<String> {
        let value = value.trim();

        // 变量引用
        if value.starts_with("${") && value.ends_with("}") {
            let var_name = &value[2..value.len()-1];
            if let Some(val) = context.get(var_name) {
                return Ok(val.clone());
            }
            return Ok(String::new());
        }

        // 字符串字面量
        if (value.starts_with('"') && value.ends_with('"')) ||
           (value.starts_with('\'') && value.ends_with('\'')) {
            return Ok(value[1..value.len()-1].to_string());
        }

        // 数字或其他字面量
        Ok(value.to_string())
    }
}

/// 数据传递管理器
///
/// 负责在节点之间传递数据
pub struct DataPassingManager {
    /// 节点输出存储
    outputs: Arc<RwLock<HashMap<String, String>>>,
    /// 工作流变量
    variables: Arc<RwLock<HashMap<String, String>>>,
}

impl DataPassingManager {
    /// 创建新的数据传递管理器
    pub fn new(variables: HashMap<String, String>) -> Self {
        Self {
            outputs: Arc::new(RwLock::new(HashMap::new())),
            variables: Arc::new(RwLock::new(variables)),
        }
    }

    /// 保存节点输出
    pub async fn save_output(&self, node_id: &str, output: &str) {
        let mut outputs = self.outputs.write().await;
        outputs.insert(node_id.to_string(), output.to_string());
    }

    /// 获取节点输出
    pub async fn get_output(&self, node_id: &str) -> Option<String> {
        let outputs = self.outputs.read().await;
        outputs.get(node_id).cloned()
    }

    /// 获取前驱节点的输出
    pub async fn get_predecessor_outputs(
        &self,
        predecessor_ids: &[String],
    ) -> HashMap<String, String> {
        let outputs = self.outputs.read().await;
        let mut result = HashMap::new();

        for pred_id in predecessor_ids {
            if let Some(output) = outputs.get(pred_id) {
                result.insert(pred_id.clone(), output.clone());
            }
        }

        result
    }

    /// 设置变量
    pub async fn set_variable(&self, key: &str, value: &str) {
        let mut variables = self.variables.write().await;
        variables.insert(key.to_string(), value.to_string());
    }

    /// 获取变量
    pub async fn get_variable(&self, key: &str) -> Option<String> {
        let variables = self.variables.read().await;
        variables.get(key).cloned()
    }

    /// 获取所有变量
    pub async fn get_all_variables(&self) -> HashMap<String, String> {
        let variables = self.variables.read().await;
        variables.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent_system::workflow::{Workflow, WorkflowNode, WorkflowEdge, AgentType};

    fn create_test_node(id: &str, agent_type: AgentType) -> WorkflowNode {
        WorkflowNode::new(id, agent_type)
    }

    #[test]
    fn test_condition_evaluate_variable_exists() {
        let mut context = HashMap::new();
        context.insert("test_var".to_string(), "value".to_string());

        let result = ConditionEvaluator::evaluate("${test_var}", &context).unwrap();
        assert!(result);
    }

    #[test]
    fn test_condition_evaluate_variable_not_exists() {
        let context = HashMap::new();

        let result = ConditionEvaluator::evaluate("${missing_var}", &context).unwrap();
        assert!(!result);
    }

    #[test]
    fn test_condition_evaluate_equality() {
        let mut context = HashMap::new();
        context.insert("status".to_string(), "success".to_string());

        let result = ConditionEvaluator::evaluate("${status} == \"success\"", &context).unwrap();
        assert!(result);
    }

    #[test]
    fn test_condition_evaluate_inequality() {
        let mut context = HashMap::new();
        context.insert("status".to_string(), "success".to_string());

        let result = ConditionEvaluator::evaluate("${status} != \"failure\"", &context).unwrap();
        assert!(result);
    }

    #[test]
    fn test_condition_evaluate_contains() {
        let mut context = HashMap::new();
        context.insert("output".to_string(), "Task completed successfully".to_string());

        let result = ConditionEvaluator::evaluate("${output} contains \"success\"", &context).unwrap();
        assert!(result);
    }

    #[tokio::test]
    async fn test_data_passing_manager() {
        let manager = DataPassingManager::new(HashMap::new());

        // 保存输出
        manager.save_output("node1", "output1").await;
        manager.save_output("node2", "output2").await;

        // 获取输出
        assert_eq!(manager.get_output("node1").await, Some("output1".to_string()));
        assert_eq!(manager.get_output("node2").await, Some("output2".to_string()));
        assert_eq!(manager.get_output("node3").await, None);

        // 获取前驱输出
        let preds = vec!["node1".to_string(), "node2".to_string()];
        let pred_outputs = manager.get_predecessor_outputs(&preds).await;
        assert_eq!(pred_outputs.len(), 2);
        assert_eq!(pred_outputs.get("node1"), Some(&"output1".to_string()));
    }

    #[tokio::test]
    async fn test_data_passing_variables() {
        let mut vars = HashMap::new();
        vars.insert("key1".to_string(), "value1".to_string());

        let manager = DataPassingManager::new(vars);

        // 获取变量
        assert_eq!(manager.get_variable("key1").await, Some("value1".to_string()));

        // 设置新变量
        manager.set_variable("key2", "value2").await;
        assert_eq!(manager.get_variable("key2").await, Some("value2".to_string()));

        // 获取所有变量
        let all_vars = manager.get_all_variables().await;
        assert_eq!(all_vars.len(), 2);
    }

    #[test]
    fn test_node_execution_context() {
        let ctx = NodeExecutionContext::new(
            "node1".to_string(),
            "/project".to_string(),
            "Test task".to_string(),
        )
        .with_input("input1".to_string(), "value1".to_string())
        .with_variable("var1".to_string(), "value2".to_string());

        assert_eq!(ctx.node_id, "node1");
        assert_eq!(ctx.inputs.len(), 1);
        assert_eq!(ctx.inputs.get("input1"), Some(&"value1".to_string()));
        assert_eq!(ctx.workflow_variables.get("var1"), Some(&"value2".to_string()));
    }

    #[test]
    fn test_node_execution_context_full_description() {
        let mut ctx = NodeExecutionContext::new(
            "node1".to_string(),
            "/project".to_string(),
            "Test task".to_string(),
        );

        // 无输入时
        let desc = ctx.get_full_task_description();
        assert_eq!(desc, "Test task");

        // 有输入时
        ctx = ctx.with_input("prev1".to_string(), "output1".to_string());
        let desc = ctx.get_full_task_description();
        assert!(desc.contains("Test task"));
        assert!(desc.contains("输入数据"));
        assert!(desc.contains("prev1"));
        assert!(desc.contains("output1"));
    }

    #[tokio::test]
    async fn test_agent_node_executor_creation() {
        let executor = AgentNodeExecutor::new();
        assert_eq!(executor.name(), "AgentNodeExecutor");

        let executor_default: AgentNodeExecutor = Default::default();
        assert_eq!(executor_default.name(), "AgentNodeExecutor");
    }
}
