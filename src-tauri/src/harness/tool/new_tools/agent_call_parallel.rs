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

/// 格式化并行调用结果（Minimalist TUI 风格）
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

    // 结果树状结构
    for (idx, (agent_type, result)) in results.iter().enumerate() {
        let is_last = idx == results.len() - 1;
        let prefix = if is_last { "└─" } else { "├─" };

        let agent_name = format_agent_name(agent_type);
        match result {
            Ok(value) => {
                output.push_str(&format!("{} {} [✔] 成功\n", prefix, agent_name));

                // 提取任务描述
                if let Some(task) = value.get("task").and_then(|v| v.as_str()) {
                    let task_preview = if task.len() > 50 {
                        format!("{}...", &task[..50])
                    } else {
                        task.to_string()
                    };
                    output.push_str(&format!("   │  任务: {}\n", task_preview));
                }

                // 提取结果摘要
                if let Some(result) = value.get("result").and_then(|v| v.as_str()) {
                    let result_preview = if result.len() > 60 {
                        format!("{}...", &result[..60])
                    } else {
                        result.to_string()
                    };
                    output.push_str(&format!("   │  结果: {}\n", result_preview));
                }
            }
            Err(err) => {
                output.push_str(&format!("{} {} [✘] 失败\n", prefix, agent_name));
                output.push_str(&format!("   │  错误: {}\n", err));
            }
        }
    }

    // 统计信息
    output.push('\n');
    output.push_str(&format!("✔ Done · {} 成功 · {} 失败 · {} 总计\n",
        successful, failed, total));

    output
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
