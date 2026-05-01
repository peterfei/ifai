//! 工具规范定义
//!
//! 定义工具的元数据、输入 schema 和权限要求。

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// 工具规范
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolSpec {
    /// 工具名称
    pub name: &'static str,

    /// 工具描述
    pub description: &'static str,

    /// 输入 JSON Schema
    pub input_schema: Value,

    /// 所需权限级别
    pub required_permission: ToolPermissionMode,
}

/// 权限模式
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ToolPermissionMode {
    /// 只读操作（安全）
    ReadOnly,

    /// 工作区写入（中等风险）
    WorkspaceWrite,

    /// 完全访问（高风险）
    DangerFullAccess,

    /// 需要用户提示
    Prompt,

    /// 允许所有操作
    Allow,
}

impl ToolPermissionMode {
    /// 获取权限级别的数值（用于比较）
    pub fn level(&self) -> u8 {
        match self {
            ToolPermissionMode::ReadOnly => 1,
            ToolPermissionMode::WorkspaceWrite => 2,
            ToolPermissionMode::Prompt => 3,
            ToolPermissionMode::DangerFullAccess => 4,
            ToolPermissionMode::Allow => 5,
        }
    }

    /// 检查权限是否足够
    pub fn is_sufficient(&self, required: ToolPermissionMode) -> bool {
        self.level() >= required.level()
    }
}

/// 工具分类（用于 UI 展示）
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ToolCategory {
    /// 文件操作
    File,

    /// 搜索和查询
    Search,

    /// 命令执行
    Command,

    /// 网络
    Network,

    /// 系统
    System,

    /// 其他
    Other,
}

/// 工具统计信息
#[derive(Debug, Clone, Default)]
pub struct ToolStats {
    /// 调用次数
    pub call_count: u64,

    /// 最后调用时间
    pub last_called: Option<chrono::DateTime<chrono::Utc>>,

    /// 平均执行时间（毫秒）
    pub avg_duration_ms: Option<f64>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_permission_mode_hierarchy() {
        // 只读 < 写入 < 提示 < 危险 < 允许
        assert!(ToolPermissionMode::ReadOnly.level() < ToolPermissionMode::WorkspaceWrite.level());
        assert!(ToolPermissionMode::WorkspaceWrite.level() < ToolPermissionMode::Prompt.level());
        assert!(ToolPermissionMode::Prompt.level() < ToolPermissionMode::DangerFullAccess.level());
        assert!(ToolPermissionMode::DangerFullAccess.level() < ToolPermissionMode::Allow.level());
    }

    #[test]
    fn test_permission_sufficiency() {
        // 高权限可以覆盖低权限
        assert!(ToolPermissionMode::Allow.is_sufficient(ToolPermissionMode::ReadOnly));
        assert!(
            ToolPermissionMode::DangerFullAccess.is_sufficient(ToolPermissionMode::WorkspaceWrite)
        );

        // 低权限不能覆盖高权限
        assert!(!ToolPermissionMode::ReadOnly.is_sufficient(ToolPermissionMode::WorkspaceWrite));
        assert!(
            !ToolPermissionMode::WorkspaceWrite.is_sufficient(ToolPermissionMode::DangerFullAccess)
        );
    }
}
