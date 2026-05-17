//! call_agent_parallel 工具实现
//!
//! 让 LLM 可以并行调用多个 Agent

use crate::agent_system::workflow::types::AgentType;
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
        let registry = AgentRegistry::global();
        let mut call_ctx = CallContext::new();

        // 使用 tokio runtime
        let handle = tokio::runtime::Handle::try_current()
            .unwrap_or_else(|_| tokio::runtime::Handle::current());

        let results = handle.block_on(async {
            registry.call_parallel_async(calls, &mut call_ctx).await
        });

        // 4. 格式化结果
        let formatted = format_parallel_results(&results);

        Ok(formatted)
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

/// 格式化并行调用结果
fn format_parallel_results(
    results: &[(AgentType, Result<Value, crate::agent_system::macros::AgentCallError>)],
) -> String {
    let mut output = String::from("🚀 并行 Agent 调用结果\n\n");

    for (idx, (agent_type, result)) in results.iter().enumerate() {
        output.push_str(&format!("{}. {:?}\n", idx + 1, agent_type));

        match result {
            Ok(value) => {
                output.push_str(&format!("   ✅ 成功\n"));
                if let Some(task) = value.get("task") {
                    output.push_str(&format!("   任务: {}\n", task));
                }
                if let Some(agent) = value.get("agent") {
                    output.push_str(&format!("   Agent: {}\n", agent));
                }
            }
            Err(e) => {
                output.push_str(&format!("   ❌ 失败: {}\n", e));
            }
        }
        output.push('\n');
    }

    output.push_str(&format!("总计: {} 个 Agent 并行调用", results.len()));
    output
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

    #[test]
    fn test_execute_tool_missing_calls() {
        let tool = AgentCallParallelTool;
        let args = json!({}); // 缺少 calls

        let result = tool.execute_tool(&args);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("calls"));
    }

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
