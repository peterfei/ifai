//! Agent 工具执行器
//!
//! 实现 explore_agent, review_agent 等专用 agent 工具。

use serde_json::Value;
use std::collections::HashSet;
use std::time::{SystemTime, UNIX_EPOCH};

use super::super::{ToolError, ToolExecutor};
use crate::agent_system::workflow::types::{AgentType, Workflow, WorkflowNode};
use crate::agent_system::workflow::runner::{RunnerConfig, WorkflowRunner};
use crate::wf_log;

/// 极简 UUID（仅用于生成唯一 ID）
fn uuid_simple() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("{:x}", nanos % 1_000_000_000)
}

/// 🔥 读取 provider 配置（优先级：全局 > 环境变量 > config.toml）
fn load_provider_config() -> Option<String> {
    wf_log!("[AgentExecutor] 🔍 load_provider_config() - Starting...");

    // 优先从全局配置读取（由 Session 设置）
    if let Some(config) = crate::harness::tool::get_global_provider_config() {
        wf_log!("[AgentExecutor] ✅ Found global config: {} (enabled: {})", config.name, config.enabled);
        let json_result = serde_json::to_string(&config);
        match &json_result {
            Ok(json) => wf_log!("[AgentExecutor] ✅ Serialized to JSON ({} chars)", json.len()),
            Err(e) => wf_log!("[AgentExecutor] ❌ Failed to serialize: {}", e),
        }
        return json_result.ok();
    }

    wf_log!("[AgentExecutor] ⚠️ No global config, trying env...");
    // 回退到环境变量
    let result = load_provider_config_from_env();
    match &result {
        Some(json) => wf_log!("[AgentExecutor] ✅ Loaded from env ({} chars)", json.len()),
        None => wf_log!("[AgentExecutor] ❌ Failed to load from env"),
    }
    result
}

/// 读取 provider 配置（仅从环境变量或 config.toml）
fn load_provider_config_from_env() -> Option<String> {
    // 检测 provider 类型（从环境变量或默认）
    let provider = std::env::var("IFAI_PROVIDER").ok()
        .unwrap_or_else(||
            // 尝试从常见的环境变量推断
            if std::env::var("ZHIPU_API_KEY").is_ok() { "zhipu".to_string() }
            else if std::env::var("DEEPSEEK_API_KEY").is_ok() { "deepseek".to_string() }
            else if std::env::var("OPENAI_API_KEY").is_ok() { "openai".to_string() }
            else if std::env::var("ANTHROPIC_API_KEY").is_ok() { "anthropic".to_string() }
            else { "zhipu".to_string() }  // 默认使用智谱
        );

    let env_key = match provider.as_str() {
        "anthropic-official" | "anthropic" => "ANTHROPIC_API_KEY",
        "deepseek-official" | "deepseek" => "DEEPSEEK_API_KEY",
        "openai-official" | "openai" => "OPENAI_API_KEY",
        "zhipu-official" | "zhipu" => "ZHIPU_API_KEY",
        "kimi-official" | "kimi" => "KIMI_API_KEY",
        "gemini-official" | "gemini" => "GEMINI_API_KEY",
        _ => "API_KEY",
    };

    // 读取 API key
    let api_key = std::env::var(env_key).ok()?;
    if api_key.is_empty() {
        return None;
    }

    // 读取 base_url
    let base_url = std::env::var("IFAI_API_BASE").ok().unwrap_or_else(|| {
        match provider.as_str() {
            p if p.contains("deepseek") => "https://api.deepseek.com/chat/completions".to_string(),
            p if p.contains("openai") => "https://api.openai.com/v1/chat/completions".to_string(),
            p if p.contains("anthropic") => "https://api.anthropic.com/v1/messages".to_string(),
            // 🔥 智谱 coding endpoint（官方 coding plan）
            p if p.contains("zhipu") => "https://open.bigmodel.cn/api/coding/paas/v4/chat/completions".to_string(),
            p if p.contains("kimi") => "https://api.moonshot.cn/v1/chat/completions".to_string(),
            p if p.contains("gemini") => "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions".to_string(),
            _ => String::new(),
        }
    });

    // 读取 model
    let model = std::env::var("IFAI_MODEL").ok()
        .unwrap_or_else(|| {
            match provider.as_str() {
                p if p.contains("deepseek") => "deepseek-chat".to_string(),
                p if p.contains("openai") => "gpt-4o-mini".to_string(),
                p if p.contains("anthropic") => "claude-sonnet-4-20250514".to_string(),
                p if p.contains("zhipu") => "glm-4.6".to_string(),
                p if p.contains("kimi") => "moonshot-v1-8k".to_string(),
                p if p.contains("gemini") => "gemini-2.0-flash-exp".to_string(),
                _ => "gpt-4o-mini".to_string(),
            }
        });

    let config = serde_json::json!({
        "id": provider,
        "name": provider,
        "apiKey": api_key,
        "baseUrl": base_url,
        "models": [model],
        "protocol": "openai",
        "enabled": true
    });

    serde_json::to_string(&config).ok()
}

/// 构造单节点 Workflow struct
fn build_agent_workflow(agent_type: AgentType, task: &str) -> Workflow {
    // 获取当前工作目录作为 project_root
    let project_root = std::env::current_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| ".".to_string());

    let mut variables = std::collections::HashMap::new();
    variables.insert("project_root".to_string(), project_root);
    variables.insert("target_path".to_string(), ".".to_string());

    // 🔥 关键修复：添加 provider_config 到 workflow.variables
    wf_log!("[AgentExecutor] 🔍 build_agent_workflow() - Loading provider_config...");
    if let Some(provider_config) = load_provider_config() {
        wf_log!("[AgentExecutor] ✅ Inserting provider_config into variables ({} chars)", provider_config.len());
        variables.insert("provider_config".to_string(), provider_config);
    } else {
        wf_log!("[AgentExecutor] ⚠️ No provider_config loaded, using defaults");
    }
    wf_log!("[AgentExecutor] 📋 Final variables keys: {:?}", variables.keys().collect::<Vec<_>>());

    Workflow {
        id: format!("agent-{}", uuid_simple()),
        name: format!("Agent: {:?}", agent_type),
        description: String::new(),
        nodes: vec![WorkflowNode {
            id: "agent-1".into(),
            agent_type,
            config: Default::default(),
            label: None,
        }],
        edges: vec![],
        variables,
    }
}

/// 执行 agent 并返回结果
fn execute_agent_sync(agent_type: AgentType, task: &str) -> Result<String, ToolError> {
    wf_log!("[AgentExecutor] 🚀 execute_agent_sync() - agent_type={:?}, task={}", agent_type, task);

    // 设置 task_description 到节点 config 和 workflow variables
    let mut workflow = build_agent_workflow(agent_type, task);
    if let Some(node) = workflow.nodes.first_mut() {
        node.config.task_description = Some(task.to_string());
    }

    // 🔥 关键修复：将用户的任务也传递到 workflow.variables
    // 这样 runner 就会使用我们的任务而不是重新构建
    workflow.variables.insert("task_override".to_string(), task.to_string());

    wf_log!("[AgentExecutor] 📋 Workflow created: id={}, variables={:?}", workflow.id, workflow.variables.keys().collect::<Vec<_>>());

    let config = RunnerConfig::default();
    let mut runner = WorkflowRunner::new(workflow, config)
        .map_err(|e| ToolError::Execution(format!("工作流初始化失败: {}", e)))?;

    // 🔥 从全局配置获取进度回调，传递给 WorkflowRunner
    // 关键：不设置回调时（非 TUI 路径），等同于现有行为，不影响 `/agent explore`
    if let Some(callback) = crate::harness::tool::try_get_progress_callback_wrapper() {
        runner = runner.with_progress_callback(callback);
    }

    // 在同步上下文中执行异步代码
    let handle = tokio::runtime::Handle::try_current()
        .map_err(|e| ToolError::Execution(format!("获取 Tokio runtime 失败: {}", e)))?;

    let result = tokio::task::block_in_place(|| {
        handle.block_on(async {
            runner.run().await
        })
    });

    match result {
        Ok(wf_result) => {
            // 🔥 检查是否有失败节点
            let has_failure = wf_result.node_results.values().any(|r| r.status.is_failure());
            if has_failure {
                // 收集所有错误信息
                let errors: Vec<_> = wf_result.node_results.values()
                    .filter_map(|r| {
                        if r.status.is_failure() {
                            Some(format!(
                                "节点 {} 失败: {:?}",
                                r.node_id,
                                r.error.as_ref().unwrap_or(&"未知错误".to_string())
                            ))
                        } else {
                            None
                        }
                    })
                    .collect();

                let error_msg = format!("❌ Agent 执行失败\n{}", errors.join("\n"));
                return Err(ToolError::Execution(error_msg));
            }

            // 提取 agent 执行结果
            let outputs: Vec<_> = wf_result.node_results.values()
                .filter_map(|r| r.output.as_ref())
                .map(|s| s.as_str())
                .collect();

            let output = outputs.join("\n\n");

            if output.is_empty() {
                Err(ToolError::Execution(format!(
                    "✅ Agent 执行完成，但无输出\n节点状态: {:?}\n节点数量: {}",
                    wf_result.status,
                    wf_result.node_results.len()
                )))
            } else {
                Ok(output)
            }
        }
        Err(e) => {
            Err(ToolError::Execution(format!("Agent 执行失败: {}", e)))
        }
    }
}

/// Explore Agent 执行器
/// 深度分析项目结构、模块依赖、设计模式
pub struct ExploreAgentExecutor {
    allowed_tools: HashSet<String>,
}

impl ExploreAgentExecutor {
    pub fn new() -> Self {
        let mut allowed_tools = HashSet::new();
        allowed_tools.insert("explore_agent".to_string());

        Self { allowed_tools }
    }

    fn handle_explore(&self, input: &Value) -> Result<String, ToolError> {
        let task = input
            .get("task")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ToolError::InvalidInput(
                "Missing 'task' parameter".to_string()
            ))?;

        // 直接执行 explore agent
        execute_agent_sync(AgentType::Explore, task)
    }
}

impl ToolExecutor for ExploreAgentExecutor {
    fn execute(&mut self, name: &str, input: &Value) -> Result<String, ToolError> {
        match name {
            "explore_agent" => self.handle_explore(input),
            _ => Err(ToolError::NotFound {
                name: name.to_string(),
            }),
        }
    }

    fn allowed_tools(&self) -> &HashSet<String> {
        &self.allowed_tools
    }
}

/// Review Agent 配置
#[derive(Debug, Clone)]
pub struct ReviewConfig {
    /// 是否检查安全性（XSS/SQL注入/CSRF等）
    pub check_security: bool,
    /// 是否检查性能
    pub check_performance: bool,
    /// 是否检查代码质量
    pub check_quality: bool,
    /// 函数长度阈值
    pub max_function_length: usize,
    /// 排除模式（glob模式）
    pub exclude_patterns: Vec<String>,
}

impl Default for ReviewConfig {
    fn default() -> Self {
        Self {
            check_security: true,
            check_performance: true,
            check_quality: true,
            max_function_length: 50,
            exclude_patterns: vec!["*.generated.rs".into(), "*.pb.rs".into()],
        }
    }
}

/// Review Agent 执行器
/// 代码审查（质量、安全性、性能）
pub struct ReviewAgentExecutor {
    allowed_tools: HashSet<String>,
    config: ReviewConfig,
}

impl ReviewAgentExecutor {
    pub fn new() -> Self {
        let mut allowed_tools = HashSet::new();
        allowed_tools.insert("review_agent".to_string());
        allowed_tools.insert("code_review".to_string());

        Self {
            allowed_tools,
            config: ReviewConfig::default(),
        }
    }

    /// 使用自定义配置创建
    pub fn with_config(config: ReviewConfig) -> Self {
        let mut allowed_tools = HashSet::new();
        allowed_tools.insert("review_agent".to_string());
        allowed_tools.insert("code_review".to_string());

        Self {
            allowed_tools,
            config,
        }
    }

    fn handle_review(&self, input: &Value) -> Result<String, ToolError> {
        let files_value = input
            .get("files")
            .ok_or_else(|| ToolError::InvalidInput(
                "Missing 'files' parameter".to_string()
            ))?;

        let files: Vec<String> = serde_json::from_value(files_value.clone())
            .map_err(|_| ToolError::InvalidInput(
                "'files' must be an array of strings".to_string()
            ))?;

        // 根据配置构建多维度审查任务
        let mut dimensions = Vec::new();

        if self.config.check_security {
            dimensions.push("安全");
        }
        if self.config.check_performance {
            dimensions.push("性能");
        }
        if self.config.check_quality {
            dimensions.push("代码质量");
        }

        let dimension_str = if dimensions.is_empty() {
            "全面".to_string()
        } else {
            dimensions.join("、")
        };

        // 构造包含配置的任务描述
        let task = format!(
            "审查以下文件（{}维度）:\n{}\n\n审查配置:\n- 函数长度阈值: {} 行\n- 排除模式: {:?}",
            dimension_str,
            files.join("\n"),
            self.config.max_function_length,
            self.config.exclude_patterns,
        );

        // 直接执行 review agent
        execute_agent_sync(AgentType::Review, &task)
    }

    /// 执行基于 git diff 的代码审查
    ///
    /// 直接返回 diff 上下文 + 审查指令，由外层 LLM 完成审查分析。
    /// 不嵌套 execute_agent_sync，避免两层 workflow 竞争 UI。
    fn handle_code_review(&self, input: &Value) -> Result<String, ToolError> {
        let base = input
            .get("base")
            .and_then(|v| v.as_str())
            .unwrap_or("HEAD~1");

        let path_filter = input
            .get("path_filter")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        // 获取 git diff 信息
        let diff_context = match self.get_git_diff(base, path_filter) {
            Ok(diff) => diff,
            Err(e) => format!("无法获取 diff: {}", e),
        };

        // 可选：获取复杂度分析
        let complexity_info = self.get_complexity_hint(&diff_context);

        // 构建审查维度
        let mut dimensions = Vec::new();
        if self.config.check_security { dimensions.push("安全性（SQL注入、XSS、CSRF、权限检查、敏感数据）"); }
        if self.config.check_performance { dimensions.push("性能（算法复杂度、资源泄漏、不必要的克隆、内存分配）"); }
        if self.config.check_quality { dimensions.push("代码质量（函数长度、嵌套深度、错误处理、unwrap 使用）"); }

        let dimension_str = if dimensions.is_empty() {
            "全面审查".to_string()
        } else {
            dimensions.iter().map(|d| format!("- {}", d)).collect::<Vec<_>>().join("\n")
        };

        // 直接返回上下文 + 审查指令，外层 LLM 会完成分析
        Ok(format!(
            "\
## 代码变更 (base: {base})

{diff}

{complexity}

## 审查要求

请从以下维度审查上述代码变更:
{dimensions}

## 报告格式
请输出结构化报告，按严重程度排序:
[CRITICAL] 问题描述 | 位置 | 修复建议
[WARNING] 问题描述 | 位置 | 修复建议
[INFO] 建议 | 描述",
            base = base,
            diff = diff_context,
            complexity = complexity_info,
            dimensions = dimension_str,
        ))
    }

    /// 从 diff 中提取文件路径，给出复杂度提示
    fn get_complexity_hint(&self, diff: &str) -> String {
        let files: Vec<&str> = diff
            .lines()
            .filter(|l| l.starts_with("diff --git"))
            .filter_map(|l| l.split(" b/").nth(1))
            .filter(|f| f.ends_with(".rs"))
            .take(5)
            .collect();

        if files.is_empty() {
            return String::new();
        }

        let analyzer = crate::harness::tool::new_tools::complexity_analyzer::ComplexityAnalyzer::new(10, 0);
        let mut hints = Vec::new();

        for file in files {
            if let Ok(report) = analyzer.execute_complexity_analyzer(file, 3) {
                if report.total_functions > 0 {
                    hints.push(format!(
                        "  - {}: {} 个函数, {} 个高复杂度",
                        file, report.total_functions, report.high_complexity.len()
                    ));
                }
            }
        }

        if hints.is_empty() {
            String::new()
        } else {
            format!("## 复杂度提示\n{}\n", hints.join("\n"))
        }
    }

    /// 获取 git diff（使用 GitDiffTool）
    fn get_git_diff(&self, base: &str, path_filter: &str) -> Result<String, ToolError> {
        let tool = crate::harness::tool::new_tools::git_diff::GitDiffTool::new(5, 0);
        let result = tool.diff_with_filter(base, path_filter)
            .map_err(|e| ToolError::Execution(format!("Git diff failed: {}", e)))?;
        Ok(result.to_output_string())
    }
}

impl ToolExecutor for ReviewAgentExecutor {
    fn execute(&mut self, name: &str, input: &Value) -> Result<String, ToolError> {
        match name {
            "review_agent" => self.handle_review(input),
            "code_review" => self.handle_code_review(input),
            _ => Err(ToolError::NotFound {
                name: name.to_string(),
            }),
        }
    }

    fn allowed_tools(&self) -> &HashSet<String> {
        &self.allowed_tools
    }
}

/// WebSearch Agent 执行器
/// 网络搜索 Agent（使用 web_search 工具）
pub struct WebSearchAgentExecutor {
    allowed_tools: HashSet<String>,
}

impl WebSearchAgentExecutor {
    pub fn new() -> Self {
        let mut allowed_tools = HashSet::new();
        allowed_tools.insert("websearch_agent".to_string());

        Self { allowed_tools }
    }

    fn handle_websearch(&self, input: &Value) -> Result<String, ToolError> {
        let query = input
            .get("query")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ToolError::InvalidInput(
                "Missing 'query' parameter".to_string()
            ))?;

        // 构造任务描述
        let task = format!("搜索: {}", query);

        // 直接执行 websearch agent
        execute_agent_sync(crate::agent_system::workflow::types::AgentType::WebSearch, &task)
    }
}

impl ToolExecutor for WebSearchAgentExecutor {
    fn execute(&mut self, name: &str, input: &Value) -> Result<String, ToolError> {
        match name {
            "websearch_agent" => self.handle_websearch(input),
            _ => Err(ToolError::NotFound {
                name: name.to_string(),
            }),
        }
    }

    fn allowed_tools(&self) -> &HashSet<String> {
        &self.allowed_tools
    }
}

/// Test Agent 执行器
/// 自动生成测试用例、分析测试覆盖率、建议测试策略
pub struct TestAgentExecutor {
    allowed_tools: HashSet<String>,
}

impl TestAgentExecutor {
    pub fn new() -> Self {
        let mut allowed_tools = HashSet::new();
        allowed_tools.insert("test_agent".to_string());

        Self { allowed_tools }
    }

    fn handle_test(&self, input: &Value) -> Result<String, ToolError> {
        let task = input
            .get("task")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ToolError::InvalidInput(
                "Missing 'task' parameter".to_string()
            ))?;

        execute_agent_sync(AgentType::Test, task)
    }
}

impl ToolExecutor for TestAgentExecutor {
    fn execute(&mut self, name: &str, input: &Value) -> Result<String, ToolError> {
        match name {
            "test_agent" => self.handle_test(input),
            _ => Err(ToolError::NotFound {
                name: name.to_string(),
            }),
        }
    }

    fn allowed_tools(&self) -> &HashSet<String> {
        &self.allowed_tools
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_explore_executor_creation() {
        let executor = ExploreAgentExecutor::new();
        assert_eq!(executor.tool_count(), 1);
        assert!(executor.allowed_tools().contains("explore_agent"));
    }

    #[test]
    fn test_review_executor_creation() {
        let executor = ReviewAgentExecutor::new();
        assert_eq!(executor.tool_count(), 2);
        assert!(executor.allowed_tools().contains("review_agent"));
        assert!(executor.allowed_tools().contains("code_review"));
    }

    #[test]
    fn test_review_executor_with_config() {
        let config = ReviewConfig {
            check_security: true,
            check_performance: false,
            check_quality: true,
            max_function_length: 30,
            exclude_patterns: vec!["*.test.rs".into()],
        };
        let executor = ReviewAgentExecutor::with_config(config);
        assert_eq!(executor.tool_count(), 2);
        assert!(executor.allowed_tools().contains("code_review"));
    }

    #[test]
    fn test_review_config_default() {
        let config = ReviewConfig::default();
        assert!(config.check_security);
        assert!(config.check_performance);
        assert!(config.check_quality);
        assert_eq!(config.max_function_length, 50);
    }

    #[test]
    fn test_review_executor_code_review_missing_params() {
        // code_review 支持无参数调用（使用默认值）
        let mut executor = ReviewAgentExecutor::new();
        let result = executor.execute("code_review", &json!({}));
        // 应该能执行（使用默认值 HEAD~1 和空过滤）
        assert!(!matches!(result, Err(ToolError::InvalidInput(_))));
    }

    #[test]
    fn test_review_executor_code_review_tool() {
        // 测试 code_review 工具名被识别
        let executor = ReviewAgentExecutor::new();
        assert!(executor.allowed_tools().contains("code_review"));
    }

    #[test]
    fn test_explore_executor_missing_task() {
        let mut executor = ExploreAgentExecutor::new();
        let result = executor.execute("explore_agent", &json!({}));
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("Missing 'task' parameter") || err.contains("task"));
    }

    #[test]
    fn test_review_executor_missing_files() {
        let mut executor = ReviewAgentExecutor::new();
        let result = executor.execute("review_agent", &json!({}));
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("files"));
    }

    #[test]
    fn test_explore_executor_invalid_tool() {
        let mut executor = ExploreAgentExecutor::new();
        let result = executor.execute("unknown_tool", &json!({}));
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("unknown_tool") || err.contains("不存在"));
    }

    #[test]
    fn test_websearch_executor_creation() {
        let executor = WebSearchAgentExecutor::new();
        assert_eq!(executor.tool_count(), 1);
        assert!(executor.allowed_tools().contains("websearch_agent"));
    }

    #[test]
    fn test_websearch_executor_missing_query() {
        let mut executor = WebSearchAgentExecutor::new();
        let result = executor.execute("websearch_agent", &json!({}));
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("Missing 'query' parameter") || err.contains("query"));
    }

    #[test]
    fn test_websearch_executor_invalid_tool() {
        let mut executor = WebSearchAgentExecutor::new();
        let result = executor.execute("unknown_tool", &json!({}));
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("unknown_tool") || err.contains("不存在"));
    }

    // ========== TestAgentExecutor 测试 ==========

    #[test]
    fn test_executor_creation() {
        let executor = TestAgentExecutor::new();
        assert_eq!(executor.tool_count(), 1);
        assert!(executor.allowed_tools().contains("test_agent"));
    }

    #[test]
    fn test_executor_missing_task() {
        let mut executor = TestAgentExecutor::new();
        let result = executor.execute("test_agent", &json!({}));
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("Missing 'task' parameter") || err.contains("task"));
    }

    #[test]
    fn test_executor_invalid_tool() {
        let mut executor = TestAgentExecutor::new();
        let result = executor.execute("unknown_tool", &json!({}));
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("unknown_tool") || err.contains("不存在"));
    }

    #[test]
    fn test_executor_valid_task() {
        let mut executor = TestAgentExecutor::new();
        // 传入 task 参数应能进入执行路径（可能因无 runtime 而失败，但不应是 InvalidInput）
        let result = executor.execute("test_agent", &json!({"task": "为 src/lib.rs 生成测试"}));
        // 不检查成功/失败（依赖 runtime），只检查不是 InvalidInput
        if let Err(e) = &result {
            let err_str = e.to_string();
            assert!(!err_str.contains("Missing 'task' parameter"), "不应因缺少 task 报错: {}", err_str);
        }
    }
}
