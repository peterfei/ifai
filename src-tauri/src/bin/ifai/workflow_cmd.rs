use ifainew_lib::agent_system::workflow::{
    parser::WorkflowParser,
    parallel::{self, progress_symbols as sym},
    runner::ProgressEvent,
    types::{AgentType, Workflow, WorkflowEdge, WorkflowNode},
};
use std::fs;
use std::path::Path;

// ── 内置模板注册表 ──

/// 内置模板：名称 → 相对于 workflows/ 目录的文件名
const BUILTIN_TEMPLATES: &[(&str, &str, &str)] = &[
    ("code-review",  "default-code-review.yml", "代码审查（5节点：探索→审查→测试+重构→文档）"),
    ("explore",      "simple-exploration.yml",  "代码探索（2节点：结构分析→依赖分析）"),
    ("quality-check","quality-check.yml",        "质量检查（3节点：代码审查→安全扫描→性能检查）"),
];

/// 工作流模板目录（项目根下的 workflows/）
fn workflows_dir() -> Result<std::path::PathBuf, String> {
    let cwd = std::env::current_dir()
        .map_err(|e| format!("无法获取当前目录: {}", e))?;
    let candidates: Vec<std::path::PathBuf> = [
        cwd.join("workflows"),
        cwd.join("../workflows"),
        cwd.join("../../workflows"),
    ]
    .into_iter()
    .filter_map(|p| p.canonicalize().ok())
    .collect();
    for dir in &candidates {
        if dir.is_dir() {
            return Ok(dir.clone());
        }
    }
    Err("未找到 workflows/ 目录".to_string())
}

/// 根据模板名解析 YAML 文件路径
/// 支持三种输入：
///   1. 内置模板名：`"explore"` → `workflows/simple-exploration.yml`
///   2. 相对路径：`"my-flow.yml"` → 当前目录
///   3. 绝对路径：`"/tmp/test.yml"` → 原样
pub fn resolve_template_path(name_or_path: &str) -> Result<String, String> {
    // 1. 尝试内置模板
    for (tmpl_name, filename, _) in BUILTIN_TEMPLATES {
        if name_or_path == *tmpl_name {
            let dir = workflows_dir()?;
            let full = dir.join(filename);
            if full.exists() {
                return Ok(full.to_string_lossy().to_string());
            }
            return Err(format!("内置模板文件不存在: {}", full.display()));
        }
    }

    // 2. 已有 .yml/.yaml 后缀 → 当作文件路径
    if name_or_path.ends_with(".yml") || name_or_path.ends_with(".yaml") {
        if Path::new(name_or_path).exists() {
            return Ok(name_or_path.to_string());
        }
        // 尝试 workflows/ 目录下
        let dir = workflows_dir()?;
        let under_workflows = dir.join(name_or_path);
        if under_workflows.exists() {
            return Ok(under_workflows.to_string_lossy().to_string());
        }
        return Err(format!("工作流文件未找到: {}", name_or_path));
    }

    // 3. 不是已知模板名也不是文件路径 → 报错并提示可用模板
    let available: Vec<&str> = BUILTIN_TEMPLATES.iter().map(|(n, _, _)| *n).collect();
    Err(format!(
        "未知模板或文件: {}\n可用模板: {}\n提示: 也可直接指定 .yml 文件路径",
        name_or_path,
        available.join(", ")
    ))
}

// ── 公共函数 ──

/// 解析 workflow 子命令参数：`"run path.yaml"` → ("run", Some("path.yaml"))
pub fn parse_workflow_args(arg: &str) -> (&str, Option<&str>) {
    let trimmed = arg.trim();
    if trimmed.is_empty() {
        return ("run", None);
    }
    let parts: Vec<&str> = trimmed.splitn(2, char::is_whitespace).collect();
    match parts.as_slice() {
        [sub] => (*sub, None),
        [sub, rest] => (*sub, Some(rest.trim())),
        _ => ("run", None),
    }
}

/// 列出内置工作流模板
pub fn list_templates() -> Vec<WorkflowTemplate> {
    BUILTIN_TEMPLATES
        .iter()
        .map(|(name, _, desc)| WorkflowTemplate {
            name: (*name).to_string(),
            description: (*desc).to_string(),
        })
        .collect()
}

/// 执行 YAML 工作流文件
/// `provider_config_json`: 可选的 AIProviderConfig JSON，注入到 workflow.variables
pub fn run_workflow(path: &str, provider_config_json: Option<&str>) -> Result<(), String> {
    // 0. 解析路径（支持模板名 / 相对路径 / 绝对路径）
    let resolved = resolve_template_path(path)?;

    // 1. 读取文件
    let yaml = fs::read_to_string(&resolved)
        .map_err(|e| format!("文件读取失败: {} - {}", resolved, e))?;

    // 2. 解析 YAML
    let mut workflow = WorkflowParser::from_str(&yaml)
        .map_err(|e| format!("YAML 解析失败: {}", e))?;

    // 3. 注入 provider_config 到 workflow variables（TUI session 的 API 配置）
    if let Some(config_json) = provider_config_json {
        workflow.variables.insert("provider_config".to_string(), config_json.to_string());
    }

    // 4. 构建 runner + TUI callback
    let config = ifainew_lib::agent_system::workflow::runner::RunnerConfig::default();
    let runner = ifainew_lib::agent_system::workflow::runner::WorkflowRunner::new(workflow, config)
        .map_err(|e| format!("工作流初始化失败: {}", e))?
        .with_progress_callback(tui_progress_callback());

    // 5. 执行（TUI 已在 tokio runtime 内，用 block_in_place 避免嵌套 panic）
    let handle = tokio::runtime::Handle::current();
    tokio::task::block_in_place(|| {
        handle.block_on(runner.run())
    })
    .map_err(|e| format!("工作流执行失败: {}", e))?;

    Ok(())
}

/// 🔥 异步版本：注册到 WorkflowManager 并返回 workflow_id（用于 TUI 取消）
pub async fn run_workflow_async(
    path: &str,
    provider_config_json: Option<String>,
) -> Result<String, String> {
    use ifainew_lib::commands::workflow_commands;

    // 0. 解析路径（支持模板名 / 相对路径 / 绝对路径）
    let resolved = resolve_template_path(path)?;

    // 1. 读取文件
    let yaml = fs::read_to_string(&resolved)
        .map_err(|e| format!("文件读取失败: {} - {}", resolved, e))?;

    // 2. 解析 YAML
    let mut workflow = WorkflowParser::from_str(&yaml)
        .map_err(|e| format!("YAML 解析失败: {}", e))?;

    // 3. 注入 provider_config 到 workflow variables
    if let Some(ref config_json) = provider_config_json {
        workflow.variables.insert("provider_config".to_string(), config_json.clone());
    }

    // 4. 生成 workflow_id
    let workflow_id = format!("tui-{}", uuid::Uuid::new_v4());

    // 5. 构建 runner + TUI callback
    let config = ifainew_lib::agent_system::workflow::runner::RunnerConfig::default();
    let runner = ifainew_lib::agent_system::workflow::runner::WorkflowRunner::new(workflow, config)
        .map_err(|e| format!("工作流初始化失败: {}", e))?
        .with_progress_callback(tui_progress_callback());

    // 5. 注册到 WorkflowManager
    let manager = workflow_commands::get_workflow_manager();
    let mut manager = manager.lock().await;
    manager.start_workflow(workflow_id.clone(), runner)?;
    drop(manager); // 释放锁

    // 6. 在后台执行
    let manager_for_run = workflow_commands::get_workflow_manager();
    let workflow_id_clone = workflow_id.clone();
    tokio::spawn(async move {
        let manager = manager_for_run.lock().await;
        if let Some(runner_arc) = manager.get_workflow(&workflow_id_clone) {
            let mut runner = runner_arc.lock().await;
            match runner.run().await {
                Ok(_) => {
                    println!("[TUI] ✅ Workflow {} completed", workflow_id_clone);
                }
                Err(e) => {
                    eprintln!("[TUI] ❌ Workflow {} failed: {}", workflow_id_clone, e);
                }
            }
        }
    });

    Ok(workflow_id)
}

/// TUI 进度 callback — 将 ProgressEvent 格式化为文本行（用于 channel 发送到 TUI 内容区）
///
/// 返回的闭包将每个 ProgressEvent 转换为一行或多行 String，
/// 通过 sender 发送到 TUI 主循环，由主循环调用 app.push_line() 渲染到内容区。
pub fn channel_progress_callback(
    sender: tokio::sync::mpsc::UnboundedSender<String>,
) -> impl Fn(ProgressEvent) + Send + Sync + 'static {
    move |event: ProgressEvent| {
        let lines = format_progress_event(&event);
        for line in lines {
            let _ = sender.send(line);
        }
    }
}

/// 将 ProgressEvent 格式化为文本行向量（纯逻辑，不含 IO）
pub fn format_progress_event(event: &ProgressEvent) -> Vec<String> {
    let mut lines = Vec::new();
    match event.event_type.as_str() {
        "workflow:started" => {
            if let Some(msg) = &event.message {
                lines.push(format!("{} {}", sym::RUNNING, msg));
            }
            if let Some(nodes) = &event.nodes {
                for (i, node) in nodes.iter().enumerate() {
                    let label = if node.label.is_empty() { &node.id } else { &node.label };
                    let tree = if i == nodes.len() - 1 { sym::LEAF } else { sym::BRANCH };
                    lines.push(format!("  {} {} [{}]", tree, label, node.agent_type));
                }
                lines.push(String::new());
            }
        }
        "node_started" => {
            if let Some(msg) = &event.message {
                lines.push(format!("{} {}", sym::RUNNING, msg));
            } else {
                lines.push(format!("{} [{}]", sym::RUNNING, event.node_id.as_deref().unwrap_or("?")));
            }
        }
        "node_completed" => {
            lines.push(String::new()); // 分隔线

            // 🔥 总是显示 message（如果有的话）
            if let Some(msg) = &event.message {
                // message 包含完整输出，按行推送
                for line in msg.split('\n') {
                    lines.push(line.to_string());
                }
            }

            // 🔥 显示统计信息或默认 Done
            if let Some(stats) = &event.completion_stats {
                let stats_str = parallel::format_stats(
                    stats.duration_ms,
                    stats.tool_count,
                    stats.token_count,
                );
                if stats_str.is_empty() {
                    lines.push(format!("{} Done", sym::DONE));
                } else {
                    lines.push(format!("{} Done                                {}", sym::DONE, stats_str));
                }
            } else {
                // 没有 stats 时显示默认 Done
                lines.push(format!("{} Done", sym::DONE));
            }
        }
        "tool_call" => {
            if let Some(details) = &event.tool_details {
                // 并行派发通知（tool_name 为空，tool_output 以 "parallel:" 开头）
                if details.tool_name.is_empty() && details.tool_output.starts_with("parallel:") {
                    let names = &details.tool_output[9..]; // 去掉 "parallel:" 前缀
                    let count = names.split(',').count();
                    lines.push(format!("  {} {} 个工具并行执行...", sym::RUNNING, count));
                } else {
                    let icon = if details.is_error { sym::FAIL } else { sym::DONE };
                    let time = details
                        .execution_time_ms
                        .map(|ms| format!(" ({})", parallel::format_duration(ms as u64)))
                        .unwrap_or_default();
                    let output_info = if details.output_length > 200 {
                        format!(" {} {} chars", sym::ARROW, details.output_length)
                    } else if !details.tool_output.is_empty() && !details.tool_output.starts_with("parallel:") {
                        let preview = parallel::truncate_preview(
                            details.tool_output.lines().next().unwrap_or(""), 80);
                        format!(" {} {}", sym::ARROW, preview)
                    } else if details.output_length > 0 {
                        format!(" {} {} chars", sym::ARROW, details.output_length)
                    } else {
                        String::new()
                    };
                    lines.push(format!("  {} {} {}{}{}", sym::BRANCH, icon, details.tool_name, time, output_info));
                }
            } else if let Some(msg) = &event.message {
                lines.push(format!("  {} {}", sym::BRANCH, msg));
            }
        }
        "content_delta" => {
            if let Some(delta) = &event.content_delta {
                // content_delta 直接作为单行追加
                lines.push(delta.clone());
            }
        }
        "content_finished" => {
            lines.push(String::new());
        }
        "workflow:completed" => {
            // 🔥 使用 completion_stats 格式化输出
            if let Some(stats) = &event.completion_stats {
                let stats_str = parallel::format_stats(
                    stats.duration_ms,
                    stats.tool_count,
                    stats.token_count,
                );
                if stats_str.is_empty() {
                    lines.push(format!("{} Workflow complete", sym::DONE));
                } else {
                    lines.push(format!("{} Workflow complete                   {}", sym::DONE, stats_str));
                }
            } else {
                lines.push(format!("{} Workflow complete", sym::DONE));
            }
            lines.push(String::new());
        }
        "workflow:error" => {
            if let Some(msg) = &event.message {
                lines.push(format!("{} {}", sym::FAIL, msg));
            }
        }
        _ => {}
    }
    lines
}

/// TUI 进度 callback — 将 ProgressEvent 格式化输出到终端（非 TUI 模式 / CLI 直接运行）
///
/// 使用统一的 Unicode 符号系统（▸ ✔ ✘ ⊘），替代 Emoji 混用风格
pub fn tui_progress_callback() -> impl Fn(ProgressEvent) + Send + Sync + 'static {
    move |event: ProgressEvent| {
        let lines = format_progress_event(&event);
        for line in lines {
            if event.event_type.as_str() == "workflow:error" {
                eprintln!("{}", line);
            } else {
                println!("{}", line);
            }
        }
    }
}

/// 工作流模板描述
#[derive(Debug, Clone)]
pub struct WorkflowTemplate {
    pub name: String,
    pub description: String,
}

// ── 测试 ──

#[cfg(test)]
mod tests {
    use super::*;

    // ── 参数解析测试 ──

    #[test]
    fn test_parse_workflow_run_with_path() {
        let (sub, arg) = parse_workflow_args("run review.yaml");
        assert_eq!(sub, "run");
        assert_eq!(arg, Some("review.yaml"));
    }

    #[test]
    fn test_parse_workflow_templates() {
        let (sub, arg) = parse_workflow_args("templates");
        assert_eq!(sub, "templates");
        assert_eq!(arg, None);
    }

    #[test]
    fn test_parse_workflow_empty() {
        let (sub, arg) = parse_workflow_args("");
        assert_eq!(sub, "run");
        assert_eq!(arg, None);
    }

    #[test]
    fn test_parse_workflow_bare_run() {
        let (sub, arg) = parse_workflow_args("run");
        assert_eq!(sub, "run");
        assert_eq!(arg, None);
    }

    #[test]
    fn test_parse_workflow_run_with_spaces_in_path() {
        let (sub, arg) = parse_workflow_args("run /path/to/my workflow.yaml");
        assert_eq!(sub, "run");
        assert_eq!(arg, Some("/path/to/my workflow.yaml"));
    }

    // ── 模板列表测试 ──

    #[test]
    fn test_list_templates_not_empty() {
        let templates = list_templates();
        assert!(!templates.is_empty());
        assert!(templates.len() >= 3);
    }

    #[test]
    fn test_list_templates_contains_core() {
        let templates = list_templates();
        let names: Vec<&str> = templates.iter().map(|t| t.name.as_str()).collect();
        assert!(names.contains(&"code-review"));
        assert!(names.contains(&"explore"));
        assert!(names.contains(&"quality-check"));
    }

    #[test]
    fn test_list_templates_has_descriptions() {
        let templates = list_templates();
        for t in &templates {
            assert!(!t.description.is_empty(), "模板 {} 应有描述", t.name);
        }
    }

    // ── resolve_template_path 测试 ──

    #[test]
    fn test_resolve_unknown_template() {
        let result = resolve_template_path("nonexistent-tmpl");
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("nonexistent-tmpl"));
        assert!(err.contains("可用模板"));
    }

    #[test]
    fn test_resolve_nonexistent_yaml_file() {
        let result = resolve_template_path("/nonexistent/path/review.yaml");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("未找到"));
    }

    #[test]
    fn test_resolve_actual_template_file() {
        // 使用绝对路径测试实际存在的 YAML 文件
        let yaml_path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../workflows/simple-exploration.yml");
        // 可能 canonicalize 失败（路径不存在），跳过如果不存在
        let canonical = std::path::Path::new(yaml_path).canonicalize();
        if let Ok(path) = canonical {
            let result = resolve_template_path(path.to_str().unwrap());
            assert!(result.is_ok());
        }
    }

    #[test]
    fn test_resolve_explore_template_name() {
        let result = resolve_template_path("explore");
        // 可能找不到 workflows/ 目录（CI 环境），但不应 panic
        // 在本地开发环境应成功
        match result {
            Ok(path) => assert!(path.contains("simple-exploration"), "路径: {}", path),
            Err(e) => assert!(e.contains("workflows"), "错误: {}", e),
        }
    }

    // ── YAML 解析测试 ──

    #[test]
    fn test_parse_valid_simple_workflow() {
        let yaml = r#"
id: test-1
name: Simple Workflow
nodes:
  - id: n1
    agentType: explore
edges: []
"#;
        let result = WorkflowParser::from_str(yaml);
        assert!(result.is_ok());
        let wf = result.unwrap();
        assert_eq!(wf.id, "test-1");
        assert_eq!(wf.nodes.len(), 1);
        assert_eq!(wf.nodes[0].agent_type, AgentType::Explore);
    }

    #[test]
    fn test_parse_invalid_yaml() {
        let result = WorkflowParser::from_str("{{{{invalid yaml!!!");
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_invalid_agent_type() {
        let yaml = r#"
id: test-2
name: Bad Agent
nodes:
  - id: n1
    agentType: NonExistentAgent
edges: []
"#;
        let result = WorkflowParser::from_str(yaml);
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_empty_nodes() {
        let yaml = r#"
id: test-3
name: Empty
nodes: []
edges: []
"#;
        let result = WorkflowParser::from_str(yaml);
        assert!(result.is_ok());
        let wf = result.unwrap();
        assert_eq!(wf.nodes.len(), 0);
    }

    // ── run_workflow 通过 resolve 集成测试 ──

    #[test]
    fn test_run_workflow_file_not_found() {
        // 不带 .yml 后缀 + 非模板名 → 走 resolve 错误路径
        let result = run_workflow("absolutely-not-a-template", None);
        assert!(result.is_err());
    }

    #[test]
    fn test_run_workflow_yaml_not_found() {
        let result = run_workflow("/nonexistent/path/review.yaml", None);
        assert!(result.is_err());
    }

    // ── TUI callback 测试 ──

    fn make_event(event_type: &str) -> ProgressEvent {
        ProgressEvent {
            event_type: event_type.into(),
            timestamp: 0,
            workflow_id: None,
            node_id: None,
            message: None,
            tool_details: None,
            nodes: None,
            content_delta: None,
            content_finished: None,
            completion_stats: None,
        }
    }

    #[test]
    fn test_tui_progress_callback_creates_closure() {
        let _cb = tui_progress_callback();
        let cb = tui_progress_callback();
        let mut e = make_event("workflow:started");
        e.message = Some("Test Workflow".into());
        cb(e);
        cb(make_event("workflow:completed"));
    }
}
