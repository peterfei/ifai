//! 权限策略系统
//!
//! 管理工具的权限控制和安全策略。

use std::collections::HashMap;
use std::sync::RwLock;

use crate::harness::tool::spec::ToolPermissionMode;

/// 全局权限策略
pub struct PermissionPolicy {
    /// 当前激活的权限模式
    active_mode: RwLock<ToolPermissionMode>,

    /// 工具特定的权限要求
    tool_requirements: RwLock<HashMap<String, ToolPermissionMode>>,
}

impl PermissionPolicy {
    /// 创建新的权限策略（默认只读）
    pub fn new(default_mode: ToolPermissionMode) -> Self {
        Self {
            active_mode: RwLock::new(default_mode),
            tool_requirements: RwLock::new(HashMap::new()),
        }
    }

    /// 设置全局权限模式
    pub fn set_mode(&self, mode: ToolPermissionMode) {
        let mut active = self.active_mode.write().unwrap();
        *active = mode;
    }

    /// 获取当前权限模式
    pub fn current_mode(&self) -> ToolPermissionMode {
        *self.active_mode.read().unwrap()
    }

    /// 设置工具的权限要求
    pub fn with_tool_requirement(mut self, tool_name: &str, requirement: ToolPermissionMode) -> Self {
        {
            let mut requirements = self.tool_requirements.write().unwrap();
            requirements.insert(tool_name.to_string(), requirement);
        }
        self
    }

    /// 检查工具权限
    pub fn check_permission(&self, tool_name: &str, tool_required: ToolPermissionMode) -> PermissionDecision {
        let current = self.current_mode();

        // 检查工具特定的权限要求
        let requirements = self.tool_requirements.read().unwrap();
        let tool_requirement = requirements.get(tool_name).copied();

        // 确定所需的权限级别
        let required = match tool_requirement {
            Some(req) if req.level() > current.level() => req,
            Some(_) => current,
            None => tool_required,
        };

        if current.is_sufficient(required) {
            PermissionDecision::Allowed
        } else {
            PermissionDecision::NeedsPrompt {
                required,
                current,
                tool_name: tool_name.to_string(),
            }
        }
    }

    /// 提升权限模式
    pub fn elevate(&self, new_mode: ToolPermissionMode) -> Result<(), PermissionError> {
        let current = self.current_mode();

        if new_mode.level() > current.level() {
            // TODO: 在实际应用中，这里应该触发用户确认
            self.set_mode(new_mode);
            Ok(())
        } else {
            Err(PermissionError::InvalidElevation {
                from: current,
                to: new_mode,
            })
        }
    }
}

impl Default for PermissionPolicy {
    fn default() -> Self {
        Self::new(ToolPermissionMode::ReadOnly)
    }
}

/// 权限决策
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PermissionDecision {
    /// 允许执行
    Allowed,

    /// 需要用户确认
    NeedsPrompt {
        required: ToolPermissionMode,
        current: ToolPermissionMode,
        tool_name: String,
    },

    /// 拒绝执行
    Denied {
        reason: String,
    },
}

/// 权限错误
#[derive(Debug, thiserror::Error)]
pub enum PermissionError {
    #[error("无效的权限提升: 从 {:?} 到 {:?}", from, to)]
    InvalidElevation {
        from: ToolPermissionMode,
        to: ToolPermissionMode,
    },

    #[error("权限不足: 需要 {:?}, 当前 {:?}", required, current)]
    Insufficient {
        required: ToolPermissionMode,
        current: ToolPermissionMode,
    },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_permission_policy() {
        let policy = PermissionPolicy::new(ToolPermissionMode::ReadOnly);

        // 只读模式下，只读工具应该被允许
        assert!(matches!(
            policy.check_permission("read_file", ToolPermissionMode::ReadOnly),
            PermissionDecision::Allowed
        ));

        // 只读模式下，写入工具需要提示
        assert!(matches!(
            policy.check_permission("write_file", ToolPermissionMode::WorkspaceWrite),
            PermissionDecision::NeedsPrompt { .. }
        ));
    }

    #[test]
    fn test_permission_elevation() {
        let policy = PermissionPolicy::new(ToolPermissionMode::ReadOnly);

        // 可以提升权限
        assert!(policy.elevate(ToolPermissionMode::WorkspaceWrite).is_ok());

        // 不能降低权限
        assert!(policy.elevate(ToolPermissionMode::ReadOnly).is_err());
    }

    #[test]
    fn test_tool_specific_requirements() {
        let policy = PermissionPolicy::new(ToolPermissionMode::WorkspaceWrite)
            .with_tool_requirement("bash", ToolPermissionMode::DangerFullAccess);

        // 即使是写入模式，bash 也需要危险权限
        assert!(matches!(
            policy.check_permission("bash", ToolPermissionMode::DangerFullAccess),
            PermissionDecision::NeedsPrompt { .. }
        ));

        // 其他写入工具应该被允许
        assert!(matches!(
            policy.check_permission("write_file", ToolPermissionMode::WorkspaceWrite),
            PermissionDecision::Allowed
        ));
    }
}
