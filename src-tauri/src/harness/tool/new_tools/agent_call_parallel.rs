//! call_agent_parallel 工具实现
//!
//! 让 LLM 可以并行调用多个 Agent

use crate::agent_system::workflow::types::AgentType;
#[cfg(feature = "commercial")]
use crate::agent_system::macros::{AgentRegistry, CallContext};
use crate::harness::tool::ToolError;
use serde_json::{json, Value};
use super::adapter::ToolLike;

/// 并行 Agent 调用工具
///
/// 允许 LLM 通过单个工具调用同时启动多个 Agent
#[derive(Debug, Clone)]
pub struct AgentCallParallelTool;

impl ToolLike for AgentCallParallelTool {
    fn schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "calls": {
                    "type": "array",
                    "description": "要并行调用的 Agent 列表",
                    "items": {
                        "type": "object",
                        "properties": {
                            "agent_type": {
                                "type": "string",
                                "enum": [
                                    "explore_agent",
                                    "review_agent",
                                    "refactor_agent",
                                    "test_agent",
                                    "doc_agent",
                                    "debug_agent",
                                    "plan_agent",
                                    "react_agent",
                                    "git_commit_agent"
                                ],
                                "description": "Agent 类型"
                            },
                            "task": {
                                "type": "string",
                                "description": "要传递给 Agent 的任务描述"
                            }
                        },
                        "required": ["agent_type", "task"]
                    }
                }
            },
            "required": ["calls"]
        })
    }

    #[cfg(feature = "commercial")]
    fn execute_tool(&self, args: &Value) -> Result<String, ToolError> {
        // 1. 解析参数
        let calls_array = args["calls"]
            .as_array()
            .ok_or_else(|| {
                ToolError::InvalidInput("缺少 'calls' 参数（应该是数组）".to_string())
            })?;

        // 检查调用数量限制
        const MAX_PARALLEL_CALLS: usize = 5;
        if calls_array.len() > MAX_PARALLEL_CALLS {
            eprintln!(
                "⚠️  并行调用数量 {} 超过限制 {}，将分批执行",
                calls_array.len(),
                MAX_PARALLEL_CALLS
            );
        }

        // 2. 解析每个调用
        let mut calls = Vec::new();
        for (idx, call) in calls_array.iter().enumerate() {
            let agent_type_str = call["agent_type"]
                .as_str()
                .ok_or_else(|| {
                    ToolError::InvalidInput(format!("第 {} 个调用缺少 'agent_type' 参数", idx + 1))
                })?;

            let task = call["task"]
                .as_str()
                .ok_or_else(|| {
                    ToolError::InvalidInput(format!("第 {} 个调用缺少 'task' 参数", idx + 1))
                })?;

            // 解析 Agent 类型
            let agent_type = parse_agent_type(agent_type_str)?;

            calls.push((agent_type, json!({"task": task})));
        }

        // 3. 并行调用 Agent
        // 注意：需要在独立的系统线程和 runtime 中执行，避免与现有 tokio runtime 冲突
        let registry = AgentRegistry::global();

        // 在独立线程中运行，避免与现有 tokio runtime 冲突
        let handle = std::thread::spawn(move || {
            let mut call_ctx = CallContext::new();

            // 创建独立的 runtime 用于并行调用
            let rt = tokio::runtime::Runtime::new()
                .map_err(|e| ToolError::Execution(format!("无法创建 tokio runtime: {}", e)))?;

            // 执行并行调用并返回结果
            let results = rt.block_on(async {
                registry.call_parallel_async(calls, &mut call_ctx).await
            });

            Ok::<_, ToolError>(results)
        });

        // 等待线程完成并获取结果
        let results = handle.join()
            .map_err(|e| ToolError::Execution(format!("并行 Agent 调用线程失败: {:?}", e)))??;

        // 4. 格式化结果
        let formatted = format_parallel_results(&results);

        Ok(formatted)
    }

    #[cfg(not(feature = "commercial"))]
    fn execute_tool(&self, _args: &Value) -> Result<String, ToolError> {
        Err(ToolError::InvalidInput(
            "call_agent_parallel 工具需要 commercial feature".to_string()
        ))
    }
}

/// 解析 Agent 类型字符串
fn parse_agent_type(s: &str) -> Result<AgentType, ToolError> {
    match s {
        "explore_agent" => Ok(AgentType::Explore),
        "review_agent" => Ok(AgentType::Review),
        "refactor_agent" => Ok(AgentType::Refactor),
        "test_agent" => Ok(AgentType::Test),
        "doc_agent" => Ok(AgentType::Doc),
        "debug_agent" => Ok(AgentType::Debug),
        "plan_agent" => Ok(AgentType::TaskBreakdown),
        "react_agent" => Ok(AgentType::ReAct),
        "git_commit_agent" => Ok(AgentType::GitCommit),
        _ => Err(ToolError::InvalidInput(format!("未知的 Agent 类型: {}", s))),
    }
}

/// 🔥 v2: 格式化并行调用结果（增强版 - 智能解析）
///
/// 根据 Agent 类型智能提取和展示关键信息
#[cfg(feature = "commercial")]
fn format_parallel_results(
    results: &[(AgentType, Result<Value, crate::agent_system::macros::AgentCallError>)],
) -> String {
    let total = results.len();
    let successful = results.iter().filter(|(_, r)| r.is_ok()).count();
    let failed = total - successful;

    let mut output = String::new();

    // 标题行
    output.push_str("多 Agent 协作执行\n");
    output.push_str(&format!("└─ {} 个 Agent 并行执行\n\n", total));

    // 结果树状结构（增强版）
    for (idx, (agent_type, result)) in results.iter().enumerate() {
        let is_last = idx == results.len() - 1;
        let prefix_main = if is_last { "└─" } else { "├─" };
        let prefix_sub = if is_last { "   " } else { "│  " };

        let agent_name = format_agent_name(agent_type);
        match result {
            Ok(value) => {
                let status = "[✔] 成功";
                output.push_str(&format!("{} {} {}\n", prefix_main, agent_name, status));

                // 提取任务描述
                if let Some(task) = value.get("task").and_then(|v| v.as_str()) {
                    output.push_str(&format!("{}├─ 任务: {}\n", prefix_sub, truncate(task, 70)));
                }

                // 🔥 智能提取和解析输出
                let agent_output = extract_agent_output(value);
                let parsed = parse_agent_content(agent_type, &agent_output.to_string());

                // 根据解析结果格式化（Agent 类型特定展示）
                format_parsed_content(&mut output, prefix_sub, parsed);
            }
            Err(err) => {
                output.push_str(&format!("{} {} [✘] 失败\n", prefix_main, agent_name));
                output.push_str(&format!("{}├─ 错误: {}\n", prefix_sub, err));

                // 尝试提取部分错误信息
                let error_detail = extract_error_detail(err);
                if !error_detail.is_empty() {
                    output.push_str(&format!("{}└─ 详情: {}\n", prefix_sub, error_detail));
                }
            }
        }
    }

    // 统计信息（失败时显示警告图标）
    output.push('\n');
    let status_icon = if failed > 0 { "⚠️" } else { "✔" };
    output.push_str(&format!("{} Done · {} 成功 · {} 失败 · {} 总计\n",
        status_icon, successful, failed, total));

    output
}

/// 🔥 v2: 从 Agent 返回的 Value 中提取实际输出内容
#[cfg(feature = "commercial")]
fn extract_agent_output(value: &Value) -> AgentOutput {
    // 优先级顺序：
    // 1. output 字段（execute_agent_sync 的默认包装）
    // 2. result 字段
    // 3. message 字段
    // 4. 直接的字符串值

    if let Some(output) = value.get("output").and_then(|v| v.as_str()) {
        AgentOutput::Text(output.to_string())
    } else if let Some(result) = value.get("result").and_then(|v| v.as_str()) {
        AgentOutput::Text(result.to_string())
    } else if let Some(message) = value.get("message").and_then(|v| v.as_str()) {
        AgentOutput::Text(message.to_string())
    } else if let Some(s) = value.as_str() {
        AgentOutput::Text(s.to_string())
    } else {
        // 回退：JSON 值
        AgentOutput::Json(value.clone())
    }
}

/// Agent 输出类型
#[cfg(feature = "commercial")]
enum AgentOutput {
    Text(String),
    Json(Value),
}

#[cfg(feature = "commercial")]
impl std::fmt::Display for AgentOutput {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AgentOutput::Text(s) => write!(f, "{}", s),
            AgentOutput::Json(v) => write!(f, "{}", serde_json::to_string_pretty(v).unwrap_or_default()),
        }
    }
}

/// 🔥 v2: 解析后的内容结构
#[cfg(feature = "commercial")]
enum ParsedContent {
    Review {
        files: Vec<String>,
        issues_count: usize,
        issues: Vec<String>,
        line_count: Option<usize>,
        full_output: String,
    },
    Test {
        files: Vec<TestFileInfo>,
        test_count: Option<usize>,
        coverage: Option<String>,
        full_output: String,
    },
    Refactor {
        files: Vec<String>,
        changes: Vec<String>,
        line_changes: Option<(usize, usize)>,
        full_output: String,
    },
    Explore {
        files: Vec<String>,
        directories: Vec<String>,
        file_count: usize,
        full_output: String,
    },
    Generic {
        summary: String,
        full_output: String,
    },
}

#[cfg(feature = "commercial")]
struct TestFileInfo {
    path: String,
    test_count: usize,
}

/// 🔥 v2: 根据 Agent 类型解析输出内容
#[cfg(feature = "commercial")]
fn parse_agent_content(agent_type: &AgentType, output: &str) -> ParsedContent {
    match agent_type {
        AgentType::Review => parse_review_output(output),
        AgentType::Test => parse_test_output(output),
        AgentType::Refactor => parse_refactor_output(output),
        AgentType::Explore => parse_explore_output(output),
        _ => ParsedContent::Generic {
            summary: truncate(output, 100),
            full_output: output.to_string(),
        },
    }
}

/// 解析 review_agent 输出
#[cfg(feature = "commercial")]
fn parse_review_output(output: &str) -> ParsedContent {
    let files = extract_file_paths(output);
    let issues = extract_issues(output);
    let line_count = extract_line_counts(output);
    let issues_count = issues.len();

    ParsedContent::Review {
        files,
        issues_count,
        issues,
        line_count,
        full_output: output.to_string(),
    }
}

/// 解析 test_agent 输出
#[cfg(feature = "commercial")]
fn parse_test_output(output: &str) -> ParsedContent {
    let files = extract_test_files(output);
    let test_count = extract_test_count(output);
    let coverage = extract_coverage(output);

    ParsedContent::Test {
        files,
        test_count,
        coverage,
        full_output: output.to_string(),
    }
}

/// 解析 refactor_agent 输出
#[cfg(feature = "commercial")]
fn parse_refactor_output(output: &str) -> ParsedContent {
    let files = extract_file_paths(output);
    let changes = extract_refactor_changes(output);
    let line_changes = extract_line_changes(output);

    ParsedContent::Refactor {
        files,
        changes,
        line_changes,
        full_output: output.to_string(),
    }
}

/// 解析 explore_agent 输出
#[cfg(feature = "commercial")]
fn parse_explore_output(output: &str) -> ParsedContent {
    let files = extract_file_paths(output);
    let directories = extract_directories(output);
    let file_count = files.len();

    ParsedContent::Explore {
        files,
        directories,
        file_count,
        full_output: output.to_string(),
    }
}

/// 格式化解析后的内容
#[cfg(feature = "commercial")]
fn format_parsed_content(output: &mut String, prefix: &str, parsed: ParsedContent) {
    match parsed {
        ParsedContent::Review { files, issues_count, issues, line_count, .. } => {
            if !files.is_empty() {
                output.push_str(&format!("{}├─ 审查文件: {} 个\n", prefix, files.len()));
                for (idx, file) in files.iter().enumerate().take(5) {
                    let is_last = idx == files.len().min(5) - 1;
                    let file_prefix = if is_last { "   └─" } else { "   ├─" };
                    output.push_str(&format!("{}{} {}\n", prefix, file_prefix, file));
                }
                if files.len() > 5 {
                    output.push_str(&format!("{}   │  ... 还有 {} 个文件\n", prefix, files.len() - 5));
                }
            }

            if issues_count > 0 {
                output.push_str(&format!("{}├─ 发现问题: {} 个\n", prefix, issues_count));
                for (idx, issue) in issues.iter().take(3).enumerate() {
                    let is_last = idx == 2 || idx == issues.len() - 1;
                    let issue_prefix = if is_last { "   └─" } else { "   ├─" };
                    output.push_str(&format!("{}{} {}\n", prefix, issue_prefix, truncate(issue, 60)));
                }
                if issues.len() > 3 {
                    output.push_str(&format!("{}   │  ... 还有 {} 个问题\n", prefix, issues.len() - 3));
                }
            }

            if let Some(lines) = line_count {
                output.push_str(&format!("{}├─ 代码行数: {} 行\n", prefix, lines));
            }

            output.push_str(&format!("{}└─ 完整报告 [▸] 展开查看\n", prefix));
        }

        ParsedContent::Test { files, test_count, coverage, .. } => {
            if !files.is_empty() {
                output.push_str(&format!("{}├─ 生成文件: {} 个\n", prefix, files.len()));
                for file in files.iter().take(3) {
                    output.push_str(&format!("{}│  ├─ {} ({} 个测试)\n", prefix, file.path, file.test_count));
                }
                if files.len() > 3 {
                    output.push_str(&format!("{}│  │  ... 还有 {} 个文件\n", prefix, files.len() - 3));
                }
            }

            if let Some(count) = test_count {
                output.push_str(&format!("{}├─ 测试数量: {} 个\n", prefix, count));
            }

            if let Some(cov) = coverage {
                output.push_str(&format!("{}├─ 覆盖率: {}\n", prefix, cov));
            }

            output.push_str(&format!("{}└─ 完整代码 [▸] 展开查看\n", prefix));
        }

        ParsedContent::Refactor { files, changes, line_changes, .. } => {
            if !files.is_empty() {
                output.push_str(&format!("{}├─ 修改文件: {} 个\n", prefix, files.len()));
                for file in files.iter().take(3) {
                    output.push_str(&format!("{}│  ├─ {}\n", prefix, file));
                }
                if files.len() > 3 {
                    output.push_str(&format!("{}│  │  ... 还有 {} 个文件\n", prefix, files.len() - 3));
                }
            }

            if !changes.is_empty() {
                output.push_str(&format!("{}├─ 改动内容:\n", prefix));
                for (idx, change) in changes.iter().take(3).enumerate() {
                    let is_last = idx == 2 || idx == changes.len() - 1;
                    let change_prefix = if is_last { "   └─" } else { "   ├─" };
                    output.push_str(&format!("{}{} {}\n", prefix, change_prefix, truncate(change, 50)));
                }
            }

            if let Some((added, removed)) = line_changes {
                output.push_str(&format!("{}├─ 改动统计: +{} -{} 行\n", prefix, added, removed));
            }

            output.push_str(&format!("{}└─ 完整代码 [▸] 展开查看\n", prefix));
        }

        ParsedContent::Explore { files, directories, file_count, .. } => {
            output.push_str(&format!("{}├─ 发现文件: {} 个\n", prefix, file_count));
            for file in files.iter().take(5) {
                output.push_str(&format!("{}│  ├─ {}\n", prefix, file));
            }
            if files.len() > 5 {
                output.push_str(&format!("{}│  │  ... 还有 {} 个文件\n", prefix, files.len() - 5));
            }

            if !directories.is_empty() {
                output.push_str(&format!("{}├─ 发现目录: {} 个\n", prefix, directories.len()));
                for dir in directories.iter().take(3) {
                    output.push_str(&format!("{}│  ├─ {}\n", prefix, dir));
                }
            }

            output.push_str(&format!("{}└─ 完整报告 [▸] 展开查看\n", prefix));
        }

        ParsedContent::Generic { summary, .. } => {
            output.push_str(&format!("{}└─ {}\n", prefix, summary));
        }
    }
}

/// 提取文件路径（简单字符串匹配）
#[cfg(feature = "commercial")]
fn extract_file_paths(text: &str) -> Vec<String> {
    let mut files = Vec::new();

    // 常见 Rust/TypeScript/Markdown 文件扩展名
    let extensions = [".rs", ".md", ".js", ".ts", ".json", ".toml", ".yaml", ".yml"];

    for line in text.lines() {
        for ext in &extensions {
            if line.contains(ext) {
                // 提取文件名部分
                if let Some(start) = line.find(ext) {
                    let mut file_start = start;
                    while file_start > 0 && !line.chars().nth(file_start - 1).map(|c| c.is_whitespace() || c == '"' || c == '(' || c == '[').unwrap_or(true) {
                        file_start -= 1;
                    }
                    let file = line[file_start..start + ext.len()].trim().trim_matches('"').trim_matches('\'').trim_matches('(').trim_matches(')').trim_matches('[').trim_matches(']');
                    if !files.contains(&file.to_string()) && !file.is_empty() {
                        files.push(file.to_string());
                    }
                }
            }
        }
    }

    files
}

/// 提取问题描述
#[cfg(feature = "commercial")]
fn extract_issues(text: &str) -> Vec<String> {
    let mut issues = Vec::new();

    for line in text.lines() {
        let line_lower = line.to_lowercase();
        if line_lower.contains("问题") || line_lower.contains("issue") || line.contains("⚠️") || line.contains("❌") || line.contains("error") {
            let trimmed = line.trim().to_string();
            if !trimmed.is_empty() && !issues.contains(&trimmed) {
                issues.push(trimmed);
            }
        } else if line.contains(".rs:") || line.contains(".js:") {
            // 文件路径:行号 格式
            let trimmed = line.trim().to_string();
            if !trimmed.is_empty() && !issues.contains(&trimmed) {
                issues.push(trimmed);
            }
        }
    }

    issues
}

/// 提取行数统计
#[cfg(feature = "commercial")]
fn extract_line_counts(text: &str) -> Option<usize> {
    for line in text.lines() {
        if line.contains("行") {
            // 查找 "xxx 行", "xxx lines" 等模式
            let words: Vec<&str> = line.split_whitespace().collect();
            for word in words {
                if let Ok(num) = word.parse::<usize>() {
                    return Some(num);
                }
            }
        }
    }
    None
}

/// 提取测试文件信息
#[cfg(feature = "commercial")]
fn extract_test_files(text: &str) -> Vec<TestFileInfo> {
    let mut files = Vec::new();

    for line in text.lines() {
        if line.contains("_test.rs") || line.contains("test.rs") {
            // 提取文件路径和测试数量
            let parts: Vec<&str> = line.split_whitespace().collect();
            let file_path = parts.iter().find(|p| p.contains(".rs")).map(|s| s.trim_matches('"').trim_matches('\'').to_string());

            // 查找测试数量
            let test_count = parts.iter().find_map(|p| {
                p.parse::<usize>().ok()
            }).unwrap_or(1);

            if let Some(path) = file_path {
                files.push(TestFileInfo { path, test_count });
            }
        }
    }

    files
}

/// 提取测试数量
#[cfg(feature = "commercial")]
fn extract_test_count(text: &str) -> Option<usize> {
    for line in text.lines() {
        let line_lower = line.to_lowercase();
        if line_lower.contains("test") || line_lower.contains("测试") {
            let words: Vec<&str> = line.split_whitespace().collect();
            for word in words {
                if let Ok(num) = word.parse::<usize>() {
                    if num > 0 && num < 1000 { // 合理的测试数量范围
                        return Some(num);
                    }
                }
            }
        }
    }
    None
}

/// 提取覆盖率
#[cfg(feature = "commercial")]
fn extract_coverage(text: &str) -> Option<String> {
    for line in text.lines() {
        if line.contains("%") {
            // 查找百分比
            let parts: Vec<&str> = line.split("%").collect();
            for part in parts {
                let trimmed = part.trim();
                if let Some(last_char) = trimmed.chars().last() {
                    if last_char.is_ascii_digit() || last_char == ' ' {
                        // 提取数字
                        let num_str = trimmed.split_whitespace().last()?;
                        if let Ok(_) = num_str.parse::<f64>() {
                            return Some(format!("{}%", num_str));
                        }
                    }
                }
            }
        }
    }
    None
}

/// 提取重构改动
#[cfg(feature = "commercial")]
fn extract_refactor_changes(text: &str) -> Vec<String> {
    let mut changes = Vec::new();

    for line in text.lines() {
        let line_lower = line.to_lowercase();
        if line_lower.contains("添加") || line_lower.contains("移除") || line_lower.contains("修改") || line_lower.contains("重构") {
            let trimmed = line.trim().to_string();
            if !trimmed.is_empty() && !changes.contains(&trimmed) {
                changes.push(trimmed);
            }
        }
    }

    changes
}

/// 提取行改动统计
#[cfg(feature = "commercial")]
fn extract_line_changes(text: &str) -> Option<(usize, usize)> {
    let mut added = None;
    let mut removed = None;

    for line in text.lines() {
        if line.contains("+") && (line.contains("添加") || line.contains("add")) {
            if let Some(num) = line.split("+").nth(1).and_then(|s| s.split_whitespace().next()) {
                if let Ok(n) = num.parse::<usize>() {
                    added = Some(n);
                }
            }
        }
        if line.contains("-") && (line.contains("删除") || line.contains("remove") || line.contains("移除")) {
            if let Some(num) = line.split("-").nth(1).and_then(|s| s.split_whitespace().next()) {
                if let Ok(n) = num.parse::<usize>() {
                    removed = Some(n);
                }
            }
        }
    }

    match (added, removed) {
        (Some(a), Some(r)) => Some((a, r)),
        _ => None,
    }
}

/// 提取目录路径
#[cfg(feature = "commercial")]
fn extract_directories(text: &str) -> Vec<String> {
    let mut dirs = Vec::new();

    for line in text.lines() {
        if line.contains('/') && (line.contains("目录") || line.contains("dir")) {
            let trimmed = line.trim().to_string();
            if !trimmed.is_empty() && !dirs.contains(&trimmed) {
                dirs.push(trimmed);
            }
        }
    }

    dirs
}

/// 提取错误详情
#[cfg(feature = "commercial")]
fn extract_error_detail(err: &crate::agent_system::macros::AgentCallError) -> String {
    err.to_string()
        .split("::")
        .last()
        .unwrap_or(&err.to_string())
        .to_string()
}

/// 智能截断文本
#[cfg(feature = "commercial")]
fn truncate(text: &str, max_len: usize) -> String {
    if text.len() <= max_len {
        text.to_string()
    } else {
        format!("{}...", &text[..max_len.max(3) - 3])
    }
}

/// 格式化 Agent 类型的友好名称
fn format_agent_name(agent_type: &AgentType) -> &'static str {
    match agent_type {
        AgentType::Explore => "explore",
        AgentType::Review => "review",
        AgentType::Refactor => "refactor",
        AgentType::Test => "test",
        AgentType::Doc => "doc",
        AgentType::Debug => "debug",
        AgentType::TaskBreakdown => "plan",
        AgentType::ProposalGenerator => "proposal",
        AgentType::WebSearch => "websearch",
        AgentType::GitCommit => "git_commit",
        AgentType::ReAct => "react",
        AgentType::GeneralPurpose => "general",
        AgentType::Parallel => "parallel",
        AgentType::Diamond => "diamond",
        AgentType::KnowledgeChain => "chain",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tool_schema() {
        let tool = AgentCallParallelTool;
        let schema = tool.schema();

        // 验证 schema 结构
        assert_eq!(schema["type"], "object");
        assert!(schema["properties"]["calls"].is_object());
        assert_eq!(schema["properties"]["calls"]["type"], "array");
        assert!(schema["required"].as_array().unwrap().contains(&"calls".into()));
    }

    #[test]
    fn test_parse_agent_type() {
        assert!(matches!(parse_agent_type("explore_agent"), Ok(AgentType::Explore)));
        assert!(matches!(parse_agent_type("review_agent"), Ok(AgentType::Review)));
        assert!(matches!(parse_agent_type("plan_agent"), Ok(AgentType::TaskBreakdown)));

        assert!(parse_agent_type("invalid_agent").is_err());
    }

    #[cfg(feature = "commercial")]
    #[test]
    fn test_execute_tool_missing_calls() {
        let tool = AgentCallParallelTool;
        let args = json!({}); // 缺少 calls

        let result = tool.execute_tool(&args);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("calls"));
    }

    #[cfg(feature = "commercial")]
    #[test]
    fn test_execute_tool_invalid_agent_type() {
        let tool = AgentCallParallelTool;
        let args = json!({
            "calls": [
                {"agent_type": "invalid_agent", "task": "测试"}
            ]
        });

        let result = tool.execute_tool(&args);
        assert!(result.is_err());
    }
}
