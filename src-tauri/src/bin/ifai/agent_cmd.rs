use ifainew_lib::agent_system::workflow::types::{AgentType, Workflow, WorkflowNode};

/// 支持的智能体类型
const AGENT_TYPES: &[(&str, AgentType)] = &[
    ("explore", AgentType::Explore),
    ("review", AgentType::Review),
    ("refactor", AgentType::Refactor),
    ("test", AgentType::Test),
    ("doc", AgentType::Doc),
    ("debug", AgentType::Debug),
    ("taskbreakdown", AgentType::TaskBreakdown),
    ("proposal", AgentType::ProposalGenerator),
    ("react", AgentType::ReAct),
    ("general", AgentType::GeneralPurpose),
];

/// 获取所有可用智能体类型名称
pub fn available_agent_types() -> Vec<&'static str> {
    AGENT_TYPES.iter().map(|(name, _)| *name).collect()
}

/// 解析 agent 命令参数：`"explore 分析项目"` → ("explore", "分析项目")
pub fn parse_agent_args(arg: &str) -> Result<(&str, &str), String> {
    let trimmed = arg.trim();
    if trimmed.is_empty() {
        return Err(format!("用法: /agent <type> <task>\n可用类型: {}", available_agent_types().join(", ")));
    }
    let parts: Vec<&str> = trimmed.splitn(2, char::is_whitespace).collect();
    if parts.len() < 2 {
        return Err(format!("缺少任务描述\n用法: /agent <type> <task>\n可用类型: {}", available_agent_types().join(", ")));
    }
    let (agent_type, task) = (parts[0], parts[1].trim());
    // 验证类型（大小写不敏感）
    if !AGENT_TYPES.iter().any(|(name, _)| name.eq_ignore_ascii_case(agent_type)) {
        return Err(format!(
            "未知智能体类型: {}\n可用类型: {}",
            agent_type,
            available_agent_types().join(", ")
        ));
    }
    Ok((agent_type, task))
}

/// 根据类型名称查找 AgentType 枚举
fn resolve_agent_type(name: &str) -> AgentType {
    let lower = name.to_lowercase();
    match lower.as_str() {
        "explore" => AgentType::Explore,
        "review" => AgentType::Review,
        "refactor" => AgentType::Refactor,
        "test" => AgentType::Test,
        "doc" => AgentType::Doc,
        "debug" => AgentType::Debug,
        "taskbreakdown" => AgentType::TaskBreakdown,
        "proposal" => AgentType::ProposalGenerator,
        "react" => AgentType::ReAct,
        _ => AgentType::GeneralPurpose,
    }
}

/// 构造单节点 Workflow struct（零 YAML 序列化）
pub fn build_agent_workflow(agent_type_name: &str, task: &str) -> Workflow {
    let at = resolve_agent_type(agent_type_name);
    Workflow {
        id: format!("agent-{}", uuid_simple()),
        name: format!("Agent: {}", agent_type_name),
        description: String::new(),
        nodes: vec![WorkflowNode {
            id: "agent-1".into(),
            agent_type: at,
            config: Default::default(),
            label: None,
            condition: None,
        }],
        edges: vec![],
        variables: std::collections::HashMap::new(),
    }
}

/// 执行 agent 命令（CLI 模式，进度输出到 stdout）
/// `provider_config_json`: 可选的 AIProviderConfig JSON，注入到 workflow.variables
pub fn run_agent(agent_type_name: &str, task: &str, provider_config_json: Option<&str>) -> Result<(), String> {
    let handle = tokio::runtime::Handle::current();
    tokio::task::block_in_place(|| {
        handle.block_on(run_agent_with_channel(agent_type_name, task, provider_config_json, None))
    })
}

/// 执行 agent 命令（TUI 模式，进度通过 channel 发送到内容区）
pub async fn run_agent_with_channel(
    agent_type_name: &str,
    task: &str,
    provider_config_json: Option<&str>,
    progress_tx: Option<tokio::sync::mpsc::UnboundedSender<String>>,
) -> Result<(), String> {
    let mut workflow = build_agent_workflow(agent_type_name, task);

    // 设置 task_description 到节点 config
    if let Some(node) = workflow.nodes.first_mut() {
        node.config.task_description = Some(task.to_string());
    }

    // 注入 provider_config 到 workflow variables
    if let Some(config_json) = provider_config_json {
        workflow.variables.insert("provider_config".to_string(), config_json.to_string());
    }

    let config = ifainew_lib::agent_system::workflow::runner::RunnerConfig::default();
    let runner = ifainew_lib::agent_system::workflow::runner::WorkflowRunner::new(workflow, config)
        .map_err(|e| format!("工作流初始化失败: {}", e))?
        .with_progress_callback(match progress_tx {
            Some(tx) => Box::new(crate::workflow_cmd::channel_progress_callback(tx))
                as Box<dyn Fn(ifainew_lib::agent_system::workflow::runner::ProgressEvent) + Send + Sync>,
            None => Box::new(crate::workflow_cmd::tui_progress_callback())
                as Box<dyn Fn(ifainew_lib::agent_system::workflow::runner::ProgressEvent) + Send + Sync>,
        });

    runner.run().await.map_err(|e| format!("智能体执行失败: {}", e))?;

    Ok(())
}

/// 极简 UUID（仅用于生成唯一 ID）
fn uuid_simple() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("{:x}", nanos % 1_000_000_000)
}

// ── 测试 ──

#[cfg(test)]
mod tests {
    use super::*;

    // ── 参数解析测试 ──

    #[test]
    fn test_parse_agent_explore() {
        let (atype, task) = parse_agent_args("explore 分析项目架构").unwrap();
        assert_eq!(atype, "explore");
        assert_eq!(task, "分析项目架构");
    }

    #[test]
    fn test_parse_agent_review() {
        let (atype, task) = parse_agent_args("review 检查代码质量").unwrap();
        assert_eq!(atype, "review");
        assert_eq!(task, "检查代码质量");
    }

    #[test]
    fn test_parse_agent_empty() {
        let result = parse_agent_args("");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("可用类型"));
    }

    #[test]
    fn test_parse_agent_no_task() {
        let result = parse_agent_args("explore");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("缺少任务描述"));
    }

    #[test]
    fn test_parse_agent_unknown_type() {
        let result = parse_agent_args("foobar some task");
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("foobar"));
        assert!(err.contains("可用类型"));
        // 验证列出了所有可用类型
        for t in &["explore", "review", "refactor", "test", "doc"] {
            assert!(err.contains(t), "错误信息应包含 {}", t);
        }
    }

    #[test]
    fn test_parse_agent_case_insensitive() {
        let (atype, _) = parse_agent_args("EXPLORE 分析").unwrap();
        assert_eq!(atype, "EXPLORE");
        // 大写也行
        let (atype, _) = parse_agent_args("Explore 分析").unwrap();
        assert_eq!(atype, "Explore");
    }

    // ── Workflow 构造测试 ──

    #[test]
    fn test_build_agent_workflow_explore() {
        let wf = build_agent_workflow("explore", "分析项目");
        assert_eq!(wf.nodes.len(), 1);
        assert_eq!(wf.nodes[0].agent_type, AgentType::Explore);
        assert_eq!(wf.nodes[0].id, "agent-1");
    }

    #[test]
    fn test_build_agent_workflow_review() {
        let wf = build_agent_workflow("review", "代码审查");
        assert_eq!(wf.nodes[0].agent_type, AgentType::Review);
    }

    #[test]
    fn test_build_agent_workflow_all_types_match_parser() {
        // parser 使用 snake_case 的 YAML key，AGENT_TYPES 用短名
        // 验证 resolve_agent_type 映射正确
        let type_mapping: &[(&str, AgentType)] = &[
            ("explore", AgentType::Explore),
            ("review", AgentType::Review),
            ("refactor", AgentType::Refactor),
            ("test", AgentType::Test),
            ("doc", AgentType::Doc),
            ("debug", AgentType::Debug),
            ("taskbreakdown", AgentType::TaskBreakdown),
            ("proposal", AgentType::ProposalGenerator),
            ("react", AgentType::ReAct),
            ("general", AgentType::GeneralPurpose),
        ];
        for (name, expected_at) in type_mapping {
            let wf = build_agent_workflow(name, "test");
            assert_eq!(wf.nodes[0].agent_type, *expected_at, "类型不匹配: {}", name);
        }
    }

    #[test]
    fn test_build_agent_workflow_empty_task() {
        let wf = build_agent_workflow("review", "");
        assert_eq!(wf.nodes[0].id, "agent-1");
        // 空任务允许构造
    }

    // ── 可用类型列表测试 ──

    #[test]
    fn test_available_agent_types_not_empty() {
        let types = available_agent_types();
        assert!(!types.is_empty());
        assert!(types.len() >= 6);
    }

    #[test]
    fn test_available_agent_types_contains_core() {
        let types = available_agent_types();
        for expected in &["explore", "review", "refactor", "test", "doc"] {
            assert!(types.contains(expected), "应包含 {}", expected);
        }
    }
}
