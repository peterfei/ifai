//! 工作流节点执行器
//!
//! 负责执行单个工作流节点，集成实际的智能体调用

use super::types::{WorkflowNode, AgentType};
use super::runner::NodeResult;
use crate::agent_system::base::{Agent, AgentContext};
use crate::core_traits::ai::{Message, Content};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use anyhow::Result;
use crate::ai_utils;  // 🔥 添加 AI 工具导入

/// 创建默认的 AI 提供商配置
#[cfg(feature = "commercial")]
pub(crate) fn default_provider_config() -> crate::core_traits::ai::AIProviderConfig {
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
pub(crate) fn default_provider_config() -> crate::core_traits::ai::AIProviderConfig {
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

        // 🔥 从工作流变量中获取 current_model
        let current_model = self.workflow_variables.get("current_model").cloned();

        AgentContext {
            project_root: self.project_root.clone(),
            task_description: self.get_full_task_description(),
            initial_prompt: String::new(),
            variables,
            provider_config: self.provider_config.clone()
                .unwrap_or_else(|| default_provider_config()),
            current_model,  // 🔥 使用用户选择的模型
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
        // 🔥 从工作流变量中获取 current_model
        let current_model = ctx.workflow_variables.get("current_model").cloned();

        let agent_ctx = AgentContext {
            project_root: ctx.project_root.clone(),
            task_description: full_description,
            initial_prompt: String::new(),
            variables: ctx.workflow_variables.clone(),
            provider_config: ctx.provider_config.clone()
                .unwrap_or_else(|| default_provider_config()),
            current_model,  // 🔥 使用用户选择的模型
        };

        // 🔥 执行真实的智能体调用
        let output = Self::execute_agent_real(node, &agent_ctx).await?;

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

    /// 🔥 真实的智能体执行实现（带工具调用循环）
    async fn execute_agent_real(
        node: &WorkflowNode,
        ctx: &AgentContext,
    ) -> Result<String> {
        println!("[WorkflowExecutor] 🤖 Executing real agent: {:?}", node.agent_type);
        println!("[WorkflowExecutor] 📁 Project root: {}", ctx.project_root);
        println!("[WorkflowExecutor] 📝 Task: {}", ctx.task_description);
        println!("[WorkflowExecutor] 🤖 Current model from context: {:?}", ctx.current_model);
        println!("[WorkflowExecutor] 🔧 Provider models: {:?}", ctx.provider_config.models);

        // 构建系统提示词（根据不同的智能体类型）
        let system_prompt = Self::build_system_prompt(node, ctx);

        // 构建用户消息
        let user_message = ctx.task_description.clone();

        println!("[WorkflowExecutor] 📡 Starting tool-enabled AI call...");
        println!("[WorkflowExecutor] 📊 System prompt length: {} chars", system_prompt.len());
        println!("[WorkflowExecutor] 📊 User message length: {} chars", user_message.len());

        let start_time = std::time::Instant::now();

        // 🔥 关键修复：使用用户选择的模型
        let mut provider_config = ctx.provider_config.clone();

        // 如果用户指定了模型，优先使用它
        if let Some(ref model) = ctx.current_model {
            println!("[WorkflowExecutor] 🎯 Using user-selected model: {}", model);
            // 将用户选择的模型放到数组第一位
            let mut models = provider_config.models.clone();
            models.retain(|m| m != model); // 移除重复的
            models.insert(0, model.clone()); // 插入到第一位
            provider_config.models = models;
        } else {
            println!("[WorkflowExecutor] 📋 Using default model from config: {:?}",
                provider_config.models.first());
        }

        // 🔥 使用工具调用循环（参考 claw-code 的 ConversationRuntime）
        let tool_executor = super::tools::DefaultToolExecutor::new(ctx.project_root.clone());
        let tool_config = super::tool_loop::ToolLoopConfig::default();

        let response_text = super::tool_loop::execute_with_tools(
            provider_config,
            system_prompt,
            user_message,
            &tool_executor,
            tool_config,
        ).await.map_err(|e| {
            let elapsed = start_time.elapsed();
            println!("[WorkflowExecutor] ❌ Tool-enabled AI call failed after {:?}: {}", elapsed, e);
            anyhow::anyhow!("AI call failed: {}", e)
        })?;

        let elapsed = start_time.elapsed();
        println!("[WorkflowExecutor] ✅ Tool-enabled AI response received successfully (took {:?})", elapsed);
        println!("[WorkflowExecutor] ✅ Text response: {} chars", response_text.len());
        println!("[WorkflowExecutor] 📝 Response preview: {}...", response_text.chars().take(100).collect::<String>());

        println!("[WorkflowExecutor] ✅ Returning output to runner (total: {:?})", start_time.elapsed());
        Ok(response_text)
    }

    /// 构建系统提示词
    fn build_system_prompt(node: &WorkflowNode, ctx: &AgentContext) -> String {
        let base_prompt = match node.agent_type {
            AgentType::Explore => {
                format!(r#"你是一个高效的代码探索智能体。你可以访问实际文件系统。

**项目信息**：
- 项目根目录：{}
- 目标路径：{}

**可用工具**（按优先级排序）：
1. `agent_scan_project(rel_path, max_depth)` - **优先使用**，一次获取完整目录结构
   - rel_path: 要扫描的相对路径
   - max_depth: 最大扫描深度（默认3）
2. `agent_read_file(rel_path)` - 读取文件内容
   - rel_path: 要读取的文件相对路径

**工具使用策略**（性能优化）：
1. ✅ 第一步：使用 `agent_scan_project` 一次获取完整结构
2. ✅ 第二步：根据结构，**批量并行读取**关键文件（如 package.json, README.md, 主要源码）
3. ❌ 避免使用 `agent_list_dir`（scan_project 已包含完整信息）
4. ❌ 避免多次扫描相同路径

**性能提示**：
- 工具调用是**并行的**，可以一次性发起多个 `agent_read_file` 调用
- 例如：扫描后立即读取 3-5 个关键文件，而不是一个一个读取
- 优先读取配置文件、入口文件、核心模块

**你的任务**：
1. 使用 `agent_scan_project` 扫描路径："{}"（深度建议 2-3）
2. **一次性批量读取**关键文件：
   - 配置文件：package.json, Cargo.toml, pom.xml, build.gradle 等
   - 文档：README.md, CONTRIBUTING.md
   - 入口文件：index.js, main.rs, app.py 等
   - 核心模块：lib/, src/ 下的主要文件
3. 快速分析并输出结构化报告

**输出格式**（简洁实用）：
- 📊 **项目概述**（1-2句话）
- 🛠️ **技术栈**（列出框架、语言、工具）
- 📁 **关键目录**（3-5个最重要的）
- 🔑 **关键文件**（已读取的文件摘要）
- 🏗️ **架构特点**（3-5点）

**重要**：
- 快速完成，不需要过度分析
- 只读取真正必要的文件
- 输出简洁明了，避免冗长"#,
                    ctx.project_root,
                    ctx.task_description,
                    ctx.task_description
                )
            }
            AgentType::Review => {
                format!(r#"你是一个专业的代码审查智能体。

**项目信息**：
- 项目根目录：{}
- 审查目标：{}

你的任务是：
1. **提供审查建议**：基于项目类型，提供针对性的代码审查清单和建议
2. **常见问题检查**：列出该类型项目常见的代码问题和注意事项
3. **最佳实践**：建议适用的编码标准和最佳实践
4. **安全性检查**：提醒应该注意的安全问题
5. **性能优化**：建议性能优化的方向

输出格式：
- ✅ **应该优先检查的文件/模块**
- ⚠️ **需要特别注意的问题**
- 💡 **改进建议**
- 🔒 **安全注意事项**

注意：提供针对该项目的实用审查指南，而不是"模拟"审查过程。"#,
                    ctx.project_root,
                    ctx.task_description
                )
            }
            AgentType::Refactor => {
                format!(r#"你是一个专业的代码重构顾问。

**项目信息**：
- 项目根目录：{}
- 重构目标：{}

你的任务是：
1. **重构建议**：基于项目类型，提供针对性的重构建议和方向
2. **架构优化**：建议如何改进代码组织和模块化
3. **代码质量提升**：提供提高代码可读性和可维护性的具体建议
4. **性能优化**：建议性能优化的机会和方法
5. **技术债务**：提醒可能存在的技术债务及解决方案

输出格式：
- 🏗️ **架构优化建议**
- 📦 **模块化改进方案**
- ⚡ **性能优化机会**
- 🧹 **代码清理建议**
- 📋 **重构优先级清单**

注意：提供实用的重构指南和最佳实践，而不是"模拟"重构过程。"#,
                    ctx.project_root,
                    ctx.task_description
                )
            }
            AgentType::Test => {
                r#"你是一个专业的测试智能体。你的任务是：

1. 分析测试覆盖率和测试策略
2. 识别未测试的关键功能
3. 提供测试用例建议
4. 改进现有测试的质量

请关注：
- 单元测试
- 集成测试
- 边界条件测试
- 错误处理测试

请输出测试建议和示例测试代码。"#.to_string()
            }
            AgentType::Doc => {
                r#"你是一个专业的文档生成智能体。你的任务是：

1. 分析代码并生成清晰的文档
2. 编写 API 文档和使用说明
3. 创建代码示例和教程
4. 改善现有文档的质量

请确保文档：
- 准确且完整
- 易于理解
- 包含实用示例
- 遵循文档最佳实践

请输出结构化的文档内容。"#.to_string()
            }
            AgentType::TaskBreakdown => {
                r#"你是一个专业的任务分解智能体。你的任务是：

1. 将复杂任务分解为可管理的子任务
2. 定义任务的依赖关系
3. 估算任务的复杂度和工作量
4. 提供任务执行的优先级建议

请确保任务分解：
- 具体且可执行
- 逻辑清晰
- 依赖关系明确
- 考虑了风险和不确定性

请输出结构化的任务列表和执行计划。"#.to_string()
            }
            AgentType::ProposalGenerator => {
                r#"你是一个专业的提案生成智能体。你的任务是：

1. 分析需求并生成技术提案
2. 设计实施方案和架构
3. 评估风险和资源需求
4. 提供时间表和里程碑

请确保提案：
- 全面且可行
- 考虑了技术选型
- 包含风险评估
- 有清晰的交付物

请输出结构化的技术提案。"#.to_string()
            }
            AgentType::GeneralPurpose => {
                r#"你是一个专业的通用智能体。你的任务是：

1. 理解用户的需求
2. 提供准确、有用的信息
3. 帮助解决问题
4. 给出切实可行的建议

请使用清晰、友好的语言，提供高质量的回应。"#.to_string()
            }
        };

        // 添加项目上下文
        let full_prompt = format!(
            "{}\n\n# 项目上下文\n\n项目根目录: {}\n\n请基于以上信息完成任务。",
            base_prompt,
            ctx.project_root
        );

        full_prompt
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
