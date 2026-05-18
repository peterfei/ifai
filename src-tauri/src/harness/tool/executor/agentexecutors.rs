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

use regex::Regex;

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
            condition: None,
        }],
        edges: vec![],
        variables,
    }
}

/// 🔥 Phase 0.1.1: 执行 agent 并返回结果（公开函数）
///
/// 此函数被 AgentRegistry::call() 调用，用于实现 Agent 互调用
pub fn execute_agent_sync(agent_type: AgentType, task: &str) -> Result<String, ToolError> {
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

/// Doc Agent 执行器
/// 生成文档、API 文档、README、代码注释等
pub struct DocAgentExecutor {
    allowed_tools: HashSet<String>,
}

impl DocAgentExecutor {
    pub fn new() -> Self {
        let mut allowed_tools = HashSet::new();
        allowed_tools.insert("doc_agent".to_string());

        Self { allowed_tools }
    }

    fn handle_doc(&self, input: &Value) -> Result<String, ToolError> {
        let task = input
            .get("task")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ToolError::InvalidInput(
                "Missing 'task' parameter".to_string()
            ))?;

        execute_agent_sync(AgentType::Doc, task)
    }
}

impl ToolExecutor for DocAgentExecutor {
    fn execute(&mut self, name: &str, input: &Value) -> Result<String, ToolError> {
        match name {
            "doc_agent" => self.handle_doc(input),
            _ => Err(ToolError::NotFound {
                name: name.to_string(),
            }),
        }
    }

    fn allowed_tools(&self) -> &HashSet<String> {
        &self.allowed_tools
    }
}

/// Debug Agent 执行器
///
/// 调试智能体：根据错误信息定位问题、分析根因、提供修复方案。
pub struct DebugAgentExecutor {
    allowed_tools: HashSet<String>,
}

impl DebugAgentExecutor {
    pub fn new() -> Self {
        let mut allowed_tools = HashSet::new();
        allowed_tools.insert("debug_agent".to_string());

        Self { allowed_tools }
    }

    fn handle_debug(&self, input: &Value) -> Result<String, ToolError> {
        let task = input
            .get("task")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ToolError::InvalidInput(
                "Missing 'task' parameter".to_string()
            ))?;

        execute_agent_sync(AgentType::Debug, task)
    }
}

impl ToolExecutor for DebugAgentExecutor {
    fn execute(&mut self, name: &str, input: &Value) -> Result<String, ToolError> {
        match name {
            "debug_agent" => self.handle_debug(input),
            _ => Err(ToolError::NotFound {
                name: name.to_string(),
            }),
        }
    }

    fn allowed_tools(&self) -> &HashSet<String> {
        &self.allowed_tools
    }
}

/// Refactor Agent 执行器
///
/// 重构智能体：分析代码结构，生成重构建议，提取重复逻辑。
pub struct RefactorAgentExecutor {
    allowed_tools: HashSet<String>,
}

impl RefactorAgentExecutor {
    pub fn new() -> Self {
        let mut allowed_tools = HashSet::new();
        allowed_tools.insert("refactor_agent".to_string());

        Self { allowed_tools }
    }

    fn handle_refactor(&self, input: &Value) -> Result<String, ToolError> {
        let task = input
            .get("task")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ToolError::InvalidInput(
                "Missing 'task' parameter".to_string()
            ))?;

        execute_agent_sync(AgentType::Refactor, task)
    }
}

impl ToolExecutor for RefactorAgentExecutor {
    fn execute(&mut self, name: &str, input: &Value) -> Result<String, ToolError> {
        match name {
            "refactor_agent" => self.handle_refactor(input),
            _ => Err(ToolError::NotFound {
                name: name.to_string(),
            }),
        }
    }

    fn allowed_tools(&self) -> &HashSet<String> {
        &self.allowed_tools
    }
}

/// Git Commit Agent 执行器（直接执行模式）
///
/// 绕过 Workflow 多轮 LLM 循环，直接执行 git 命令 + 一次 LLM 调用。
/// Co-authored-by 在代码层硬追加，不会被 LLM 绕过。
pub struct GitCommitAgentExecutor {
    allowed_tools: HashSet<String>,
}

impl GitCommitAgentExecutor {
    pub fn new() -> Self {
        let mut allowed_tools = HashSet::new();
        allowed_tools.insert("git_commit_agent".to_string());

        Self { allowed_tools }
    }

    fn handle_git_commit(&self, input: &Value) -> Result<String, ToolError> {
        let task = input
            .get("task")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ToolError::InvalidInput(
                "Missing 'task' parameter".to_string()
            ))?;

        // Step 1: Check git status
        let status_output = std::process::Command::new("git")
            .args(["status", "--porcelain"])
            .output()
            .map_err(|e| ToolError::Execution(format!("git status 失败: {}", e)))?;

        if !status_output.status.success() {
            let stderr = String::from_utf8_lossy(&status_output.stderr);
            return Err(ToolError::Execution(format!("git status 失败: {}", stderr)));
        }

        let status_stdout = String::from_utf8_lossy(&status_output.stdout).to_string();
        if status_stdout.trim().is_empty() {
            return Ok("工作区干净，没有变更需要提交。".to_string());
        }

        // Step 2: Get full diff content
        let mut diff_parts = Vec::new();
        diff_parts.push(format!(">>> git status --porcelain\n{}", status_stdout.trim()));

        let staged = run_git_cmd(&["diff", "--cached"]);
        if !staged.is_empty() {
            diff_parts.push(format!("\n>>> git diff --cached\n{}", staged));
        }

        let unstaged = run_git_cmd(&["diff"]);
        if !unstaged.is_empty() {
            diff_parts.push(format!("\n>>> git diff\n{}", unstaged));
        }

        let untracked = run_git_cmd(&["ls-files", "--others", "--exclude-standard"]);
        if !untracked.is_empty() {
            diff_parts.push(format!("\n>>> untracked files\n{}", untracked));
        }

        let all_diff = diff_parts.join("\n");

        // Step 3: Scan for secrets
        let secret_findings = scan_for_secrets(&all_diff);
        if !secret_findings.is_empty() {
            return Ok(format!(
                "⚠️ 发现可能的敏感信息，已阻止提交:\n{}\n\n请检查并移除敏感信息后再提交。",
                secret_findings.join("\n")
            ));
        }

        // Step 4: Call LLM to generate commit message
        let config = crate::harness::tool::get_global_provider_config()
            .ok_or_else(|| ToolError::Execution(
                "无法获取 AI 配置，请在设置中配置 AI 提供商后再使用提交功能。".to_string()
            ))?;

        let system_prompt = r#"你是一个专业的 Git 提交助手。分析代码变更并生成高质量的 commit message。

## 规则
1. 使用 Conventional Commits 格式：type(scope): subject
   - type: feat | fix | refactor | docs | test | chore | perf
   - scope: 可选的模块名
   - subject: 简短描述（不超过 50 字符），使用祈使语气
2. 语言匹配：commit message 的 subject 必须使用用户请求的语言
3. body 可选，解释为什么而非做了什么
4. 不要包含 Co-authored-by 行（工具会自动追加）
5. 只输出 commit message，不要包含其他内容，不要用代码块包裹"#;

        let user_prompt = format!(
            "变更内容：\n{}\n\n任务描述：{}\n\n请生成 Conventional Commits 格式的 commit message。",
            all_diff,
            task
        );

        let messages = vec![
            crate::core_traits::ai::Message {
                role: "system".to_string(),
                content: crate::core_traits::ai::Content::Text(system_prompt.to_string()),
                tool_calls: None,
                tool_call_id: None,
            },
            crate::core_traits::ai::Message {
                role: "user".to_string(),
                content: crate::core_traits::ai::Content::Text(user_prompt),
                tool_calls: None,
                tool_call_id: None,
            },
        ];

        // 🔇 临时静音 stderr（ai_utils 的 eprintln! 调试日志会污染 TUI 输入区）
        let _stderr_mute = StderrMute::new();

        let handle = tokio::runtime::Handle::try_current()
            .map_err(|e| ToolError::Execution(format!("获取 Tokio runtime 失败: {}", e)))?;

        let response_msg = tokio::task::block_in_place(|| {
            handle.block_on(async {
                crate::ai_utils::fetch_ai_completion_simple(&config, messages).await
            })
        }).map_err(|e| ToolError::Execution(format!("AI 调用失败: {}", e)))?;

        // stderr 在 _stderr_mute drop 时自动恢复

        let commit_message = match &response_msg.content {
            crate::core_traits::ai::Content::Text(s) => s.trim().to_string(),
            _ => return Err(ToolError::Execution("AI 返回格式错误".to_string())),
        };

        if commit_message.is_empty() {
            return Err(ToolError::Execution("AI 生成的 commit message 为空".to_string()));
        }

        // Step 5: git add -A
        let add_output = std::process::Command::new("git")
            .args(["add", "-A"])
            .output()
            .map_err(|e| ToolError::Execution(format!("git add 失败: {}", e)))?;

        if !add_output.status.success() {
            let stderr = String::from_utf8_lossy(&add_output.stderr);
            return Err(ToolError::Execution(format!("git add 失败: {}", stderr)));
        }

        // Step 6: git commit with Co-authored-by (hard-coded, cannot be bypassed)
        let full_message = format!(
            "{}\n\nCo-authored-by: IfAI CLI <noreply@ifai.today>",
            commit_message
        );
        let commit_output = std::process::Command::new("git")
            .args(["commit", "-m", &full_message])
            .output()
            .map_err(|e| ToolError::Execution(format!("git commit 失败: {}", e)))?;

        if !commit_output.status.success() {
            let stderr = String::from_utf8_lossy(&commit_output.stderr);
            if stderr.contains("nothing to commit") || stderr.contains("no changes") {
                return Ok("nothing to commit, working tree clean".to_string());
            }
            return Err(ToolError::Execution(format!("git commit 失败: {}", stderr)));
        }

        let stdout = String::from_utf8_lossy(&commit_output.stdout).to_string();
        Ok(stdout.trim().to_string())
    }
}

/// 执行 git 命令并返回 stdout
fn run_git_cmd(args: &[&str]) -> String {
    std::process::Command::new("git")
        .args(args)
        .output()
        .ok()
        .and_then(|o| {
            if o.status.success() {
                Some(String::from_utf8_lossy(&o.stdout).to_string())
            } else {
                None
            }
        })
        .unwrap_or_default()
}

/// 扫描内容中的敏感信息
fn scan_for_secrets(content: &str) -> Vec<String> {
    let patterns = [
        ("Generic API Key", r#"(?i)(api[_-]?key|apikey)\s*[=:]\s*['"]?[a-zA-Z0-9]{20,}"#),
        ("Password", r#"(?i)(password|passwd|pwd)\s*[=:]\s*['"]?[^\s'"]{8,}"#),
        ("Token", r#"(?i)(token|secret|auth)\s*[=:]\s*['"]?[a-zA-Z0-9_\-]{20,}"#),
        ("Private Key", r"-----BEGIN\s+(RSA|EC|DSA|OPENSSH)\s+PRIVATE\s+KEY-----"),
        ("JWT Token", r"eyJ[a-zA-Z0-9_\-]+\.eyJ[a-zA-Z0-9_\-]+\.[a-zA-Z0-9_\-]+"),
        ("AWS Key", r"(?i)AKIA[0-9A-Z]{16}"),
        ("GitHub Token", r"(?i)gh[ps]_[a-zA-Z0-9_]{36,}"),
        ("Slack Token", r"(?i)xox[baprs]-[a-zA-Z0-9_\-]{10,}"),
        ("npm token", r"(?i)npm_[a-zA-Z0-9]{36,}"),
    ];

    let mut findings = Vec::new();
    for (name, pattern) in &patterns {
        if let Ok(re) = Regex::new(pattern) {
            for line in content.lines() {
                if re.find(line).is_some() {
                    let masked: String = line.chars()
                        .map(|c| if c.is_alphanumeric() { '*' } else { c })
                        .collect();
                    findings.push(format!("[{}] {}", name, masked));
                    break;
                }
            }
        }
    }
    findings
}

impl ToolExecutor for GitCommitAgentExecutor {
    fn execute(&mut self, name: &str, input: &Value) -> Result<String, ToolError> {
        match name {
            "git_commit_agent" => self.handle_git_commit(input),
            _ => Err(ToolError::NotFound {
                name: name.to_string(),
            }),
        }
    }

    fn allowed_tools(&self) -> &HashSet<String> {
        &self.allowed_tools
    }
}

/// Plan Agent 执行器
///
/// 对外工具名 `plan_agent`，内部映射到 `AgentType::TaskBreakdown`。
/// 复用 TaskBreakdown 的执行逻辑，无需新代码路径。
pub struct PlanAgentExecutor {
    allowed_tools: HashSet<String>,
}

impl PlanAgentExecutor {
    pub fn new() -> Self {
        let mut allowed_tools = HashSet::new();
        allowed_tools.insert("plan_agent".to_string());
        Self { allowed_tools }
    }

    fn handle_plan(&self, input: &Value) -> Result<String, ToolError> {
        let task = input
            .get("task")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ToolError::InvalidInput(
                "Missing 'task' parameter".to_string()
            ))?;

        execute_agent_sync(AgentType::TaskBreakdown, task)
    }
}

impl ToolExecutor for PlanAgentExecutor {
    fn execute(&mut self, name: &str, input: &Value) -> Result<String, ToolError> {
        match name {
            "plan_agent" => self.handle_plan(input),
            _ => Err(ToolError::NotFound {
                name: name.to_string(),
            }),
        }
    }

    fn allowed_tools(&self) -> &HashSet<String> {
        &self.allowed_tools
    }
}

/// ReAct Agent 执行器
///
/// 对外工具名 `react_agent`，内部映射到 `AgentType::ReAct`。
/// ReAct 的 Thought-Action-Observation 格式约束通过 system prompt 注入实现，
/// 复用 execute_with_tools 的已有循环，无需新代码路径。
pub struct ReActAgentExecutor {
    allowed_tools: HashSet<String>,
}

impl ReActAgentExecutor {
    pub fn new() -> Self {
        let mut allowed_tools = HashSet::new();
        allowed_tools.insert("react_agent".to_string());
        Self { allowed_tools }
    }

    fn handle_react(&self, input: &Value) -> Result<String, ToolError> {
        let task = input
            .get("task")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ToolError::InvalidInput(
                "Missing 'task' parameter".to_string()
            ))?;

        execute_agent_sync(AgentType::ReAct, task)
    }
}

impl ToolExecutor for ReActAgentExecutor {
    fn execute(&mut self, name: &str, input: &Value) -> Result<String, ToolError> {
        match name {
            "react_agent" => self.handle_react(input),
            _ => Err(ToolError::NotFound {
                name: name.to_string(),
            }),
        }
    }

    fn allowed_tools(&self) -> &HashSet<String> {
        &self.allowed_tools
    }
}

/// 🔇 Stderr 静音守卫（RAII）
///
/// 临时将 stderr 重定向到 /dev/null，drop 时自动恢复。
/// 用于屏蔽 ai_utils 的 eprintln! 调试日志污染 TUI。
#[cfg(unix)]
struct StderrMute {
    saved_fd: i32,
}

#[cfg(unix)]
impl StderrMute {
    fn new() -> Self {
        use std::os::fd::AsRawFd;
        let saved_fd = unsafe { libc::dup(2) };
        if saved_fd >= 0 {
            if let Ok(devnull) = std::fs::File::create("/dev/null") {
                unsafe { libc::dup2(devnull.as_raw_fd(), 2) };
            }
        }
        Self { saved_fd }
    }
}

#[cfg(unix)]
impl Drop for StderrMute {
    fn drop(&mut self) {
        if self.saved_fd >= 0 {
            unsafe { libc::dup2(self.saved_fd, 2) };
            unsafe { libc::close(self.saved_fd) };
        }
    }
}

/// 非 Unix 平台空实现
#[cfg(not(unix))]
struct StderrMute;
#[cfg(not(unix))]
impl StderrMute {
    fn new() -> Self { Self }
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

    // ========== DocAgentExecutor 测试 ==========

    #[test]
    fn test_doc_executor_creation() {
        let executor = DocAgentExecutor::new();
        assert_eq!(executor.tool_count(), 1);
        assert!(executor.allowed_tools().contains("doc_agent"));
    }

    #[test]
    fn test_doc_executor_missing_task() {
        let mut executor = DocAgentExecutor::new();
        let result = executor.execute("doc_agent", &json!({}));
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("Missing 'task' parameter") || err.contains("task"));
    }

    #[test]
    fn test_doc_executor_invalid_tool() {
        let mut executor = DocAgentExecutor::new();
        let result = executor.execute("unknown_tool", &json!({}));
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("unknown_tool") || err.contains("不存在"));
    }

    #[test]
    fn test_doc_executor_valid_task() {
        let mut executor = DocAgentExecutor::new();
        let result = executor.execute("doc_agent", &json!({"task": "为 src/lib.rs 生成 API 文档"}));
        if let Err(e) = &result {
            let err_str = e.to_string();
            assert!(!err_str.contains("Missing 'task' parameter"), "不应因缺少 task 报错: {}", err_str);
        }
    }

    // ========== DebugAgentExecutor 测试 ==========

    #[test]
    fn test_debug_executor_creation() {
        let executor = DebugAgentExecutor::new();
        assert_eq!(executor.tool_count(), 1);
        assert!(executor.allowed_tools().contains("debug_agent"));
    }

    #[test]
    fn test_debug_executor_missing_task() {
        let mut executor = DebugAgentExecutor::new();
        let result = executor.execute("debug_agent", &json!({}));
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("Missing 'task' parameter") || err.contains("task"));
    }

    #[test]
    fn test_debug_executor_invalid_tool() {
        let mut executor = DebugAgentExecutor::new();
        let result = executor.execute("unknown_tool", &json!({}));
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("unknown_tool") || err.contains("不存在"));
    }

    #[test]
    fn test_debug_executor_valid_task() {
        let mut executor = DebugAgentExecutor::new();
        let result = executor.execute("debug_agent", &json!({"task": "调试 src/main.rs 编译错误"}));
        if let Err(e) = &result {
            let err_str = e.to_string();
            assert!(!err_str.contains("Missing 'task' parameter"), "不应因缺少 task 报错: {}", err_str);
        }
    }

    // ========== RefactorAgentExecutor 测试 ==========

    #[test]
    fn test_refactor_executor_creation() {
        let executor = RefactorAgentExecutor::new();
        assert_eq!(executor.tool_count(), 1);
        assert!(executor.allowed_tools().contains("refactor_agent"));
    }

    #[test]
    fn test_refactor_executor_missing_task() {
        let mut executor = RefactorAgentExecutor::new();
        let result = executor.execute("refactor_agent", &json!({}));
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("Missing 'task' parameter") || err.contains("task"));
    }

    #[test]
    fn test_refactor_executor_invalid_tool() {
        let mut executor = RefactorAgentExecutor::new();
        let result = executor.execute("unknown_tool", &json!({}));
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("unknown_tool") || err.contains("不存在"));
    }

    #[test]
    fn test_refactor_executor_valid_task() {
        let mut executor = RefactorAgentExecutor::new();
        let result = executor.execute("refactor_agent", &json!({"task": "重构 session.rs 提取重复逻辑"}));
        if let Err(e) = &result {
            let err_str = e.to_string();
            assert!(!err_str.contains("Missing 'task' parameter"), "不应因缺少 task 报错: {}", err_str);
        }
    }

    // ========== GitCommitAgentExecutor 测试 ==========

    #[test]
    fn test_git_commit_executor_creation() {
        let executor = GitCommitAgentExecutor::new();
        assert_eq!(executor.tool_count(), 1);
        assert!(executor.allowed_tools().contains("git_commit_agent"));
    }

    #[test]
    fn test_git_commit_executor_missing_task() {
        let mut executor = GitCommitAgentExecutor::new();
        let result = executor.execute("git_commit_agent", &json!({}));
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("Missing 'task' parameter") || err.contains("task"));
    }

    #[test]
    fn test_git_commit_executor_invalid_tool() {
        let mut executor = GitCommitAgentExecutor::new();
        let result = executor.execute("unknown_tool", &json!({}));
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("unknown_tool") || err.contains("不存在"));
    }

    #[test]
    fn test_git_commit_executor_valid_task() {
        let mut executor = GitCommitAgentExecutor::new();
        let result = executor.execute("git_commit_agent", &json!({"task": "提交当前变更"}));
        if let Err(e) = &result {
            let err_str = e.to_string();
            assert!(!err_str.contains("Missing 'task' parameter"), "不应因缺少 task 报错: {}", err_str);
        }
    }

    // === Phase 6C: Plan Agent ===

    #[test]
    fn test_plan_executor_creation() {
        let executor = PlanAgentExecutor::new();
        assert_eq!(executor.tool_count(), 1);
        assert!(executor.allowed_tools().contains("plan_agent"));
    }

    #[test]
    fn test_plan_executor_missing_task() {
        let mut executor = PlanAgentExecutor::new();
        let result = executor.execute("plan_agent", &json!({}));
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("Missing 'task' parameter") || err.contains("task"));
    }

    #[test]
    fn test_plan_executor_invalid_tool() {
        let mut executor = PlanAgentExecutor::new();
        let result = executor.execute("unknown_tool", &json!({}));
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("unknown_tool") || err.contains("不存在"));
    }

    #[test]
    fn test_plan_executor_valid_task() {
        let mut executor = PlanAgentExecutor::new();
        let result = executor.execute("plan_agent", &json!({"task": "拆解这个任务为子任务"}));
        if let Err(e) = &result {
            let err_str = e.to_string();
            assert!(!err_str.contains("Missing 'task' parameter"), "不应因缺少 task 报错: {}", err_str);
        }
    }
}
