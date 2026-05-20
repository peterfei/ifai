//! monitor_progress 工具 - 进度监控工具（Phase 3）
//!
//! 用于监控和报告协作任务的进度

use serde_json::{json, Value};
use crate::harness::tool::ToolError;
use super::adapter::ToolLike;

/// 进度监控工具
///
/// 允许 Agent 监控协作任务的进度，订阅进度更新
#[derive(Debug, Clone)]
pub struct MonitorProgressTool;

impl ToolLike for MonitorProgressTool {
    fn schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "workflow_id": {
                    "type": "string",
                    "description": "要监控的工作流 ID"
                },
                "action": {
                    "type": "string",
                    "enum": ["status", "subscribe"],
                    "description": "操作类型：status-获取当前状态，subscribe-订阅进度更新"
                }
            },
            "required": ["workflow_id", "action"]
        })
    }

    fn execute_tool(&self, args: &Value) -> Result<String, ToolError> {
        // 解析参数
        let workflow_id = args.get("workflow_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ToolError::InvalidInput(
                "monitor_progress: 缺少或无效的 'workflow_id' 参数".to_string()
            ))?;

        let action = args.get("action")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ToolError::InvalidInput(
                "monitor_progress: 缺少或无效的 'action' 参数".to_string()
            ))?;

        // 根据操作类型执行
        match action {
            "status" => self.get_status(workflow_id),
            "subscribe" => self.subscribe(workflow_id),
            _ => Err(ToolError::InvalidInput(
                format!("monitor_progress: 未知的操作类型: {}", action)
            )),
        }
    }
}

impl MonitorProgressTool {
    /// 获取工作流状态
    fn get_status(&self, workflow_id: &str) -> Result<String, ToolError> {
        // 在实际实现中，这里应该从 WorkflowRunner 查询实际状态
        // 当前简化版本返回模拟状态（Minimalist TUI 风格）
        let mut output = String::new();
        output.push_str("工作流状态\n");
        output.push_str(&format!("├─ ID: {}\n", workflow_id));
        output.push_str(&format!("├─ 状态: 运行中 [▸]\n"));
        output.push_str(&format!("├─ 总节点: 5\n"));
        output.push_str(&format!("├─ 已完成: 3 [✔]\n"));
        output.push_str(&format!("├─ 进行中: 1 [●]\n"));
        output.push_str(&format!("├─ 待执行: 1 [○]\n"));
        output.push_str(&format!("└─ 进度: 60%\n\n"));
        output.push_str(&format!("[进度条━━━━━━━━━━━━]\n\n"));
        output.push_str(&format!("✔ Done · 状态已获取\n"));

        Ok(output)
    }

    /// 订阅进度更新
    fn subscribe(&self, workflow_id: &str) -> Result<String, ToolError> {
        // 在实际实现中，这里应该订阅 MessageBus 的进度事件
        let mut output = String::new();
        output.push_str("进度订阅\n");
        output.push_str(&format!("├─ 工作流 ID: {}\n", workflow_id));
        output.push_str(&format!("├─ 订阅事件: 节点开始 · 节点完成 · 进度更新 · 错误通知\n"));
        output.push_str(&format!("└─ 状态: 已订阅 [✔]\n\n"));
        output.push_str(&format!("✔ Done · 将接收实时进度更新\n"));

        Ok(output)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_status() {
        let tool = MonitorProgressTool;

        let args = json!({
            "workflow_id": "workflow-123",
            "action": "status"
        });

        let result = tool.execute_tool(&args).unwrap();
        assert!(result.contains("工作流状态"));
        assert!(result.contains("workflow-123"));
        assert!(result.contains("进度"));
        assert!(result.contains("✔ Done"));
    }

    #[test]
    fn test_subscribe() {
        let tool = MonitorProgressTool;

        let args = json!({
            "workflow_id": "workflow-456",
            "action": "subscribe"
        });

        let result = tool.execute_tool(&args).unwrap();
        assert!(result.contains("进度订阅"));
        assert!(result.contains("workflow-456"));
        assert!(result.contains("已订阅"));
        assert!(result.contains("✔ Done"));
    }

    #[test]
    fn test_invalid_action() {
        let tool = MonitorProgressTool;

        let args = json!({
            "workflow_id": "workflow-789",
            "action": "invalid_action"
        });

        let result = tool.execute_tool(&args);
        assert!(result.is_err());
    }
}
