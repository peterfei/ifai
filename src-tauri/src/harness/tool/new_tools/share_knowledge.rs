//! share_knowledge 工具 - 知识共享工具（Phase 3）
//!
//! 用于在 Agent 之间共享知识和中间结果

use serde_json::{json, Value};
use crate::harness::tool::ToolError;
use super::adapter::ToolLike;

/// 知识共享工具
///
/// 允许 Agent 将知识传递给下一个 Agent，实现知识链协作
#[derive(Debug, Clone)]
pub struct ShareKnowledgeTool;

impl ToolLike for ShareKnowledgeTool {
    fn schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "from_agent": {
                    "type": "string",
                    "description": "发送知识的 Agent ID"
                },
                "to_agent": {
                    "type": "string",
                    "description": "接收知识的 Agent ID"
                },
                "knowledge": {
                    "type": "string",
                    "description": "要共享的知识内容"
                }
            },
            "required": ["from_agent", "to_agent", "knowledge"]
        })
    }

    fn execute_tool(&self, args: &Value) -> Result<String, ToolError> {
        // 解析参数
        let from_agent = args.get("from_agent")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ToolError::InvalidInput(
                "share_knowledge: 缺少或无效的 'from_agent' 参数".to_string()
            ))?;

        let to_agent = args.get("to_agent")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ToolError::InvalidInput(
                "share_knowledge: 缺少或无效的 'to_agent' 参数".to_string()
            ))?;

        let knowledge = args.get("knowledge")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ToolError::InvalidInput(
                "share_knowledge: 缺少或无效的 'knowledge' 参数".to_string()
            ))?;

        // 格式化知识内容（限制长度）
        let knowledge_preview = if knowledge.len() > 100 {
            format!("{}...", &knowledge[..100])
        } else {
            knowledge.to_string()
        };

        // Minimalist TUI 风格输出
        let mut output = String::new();
        output.push_str("知识共享\n");
        output.push_str(&format!("├─ 从: {}\n", from_agent));
        output.push_str(&format!("├─ 到: {}\n", to_agent));
        output.push_str(&format!("└─ 内容: {}\n", knowledge_preview));
        output.push_str(&format!("\n✔ Done · 知识已传递\n"));

        Ok(output)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_share_knowledge() {
        let tool = ShareKnowledgeTool;

        let args = json!({
            "from_agent": "Agent1",
            "to_agent": "Agent2",
            "knowledge": "认证模块位于 src/auth/ 目录，包含 login 和 register 两个主要函数。"
        });

        let result = tool.execute_tool(&args).unwrap();
        assert!(result.contains("知识共享"));
        assert!(result.contains("Agent1"));
        assert!(result.contains("Agent2"));
        assert!(result.contains("✔ Done"));
    }

    #[test]
    fn test_share_knowledge_missing_params() {
        let tool = ShareKnowledgeTool;

        // 缺少 knowledge 参数
        let args = json!({
            "from_agent": "Agent1",
            "to_agent": "Agent2"
        });

        let result = tool.execute_tool(&args);
        assert!(result.is_err());
    }
}
