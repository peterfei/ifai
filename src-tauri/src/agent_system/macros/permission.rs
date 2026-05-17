//! Agent 权限检查系统
//!
//! 在 Agent 互调用时检查权限，确保安全的工作区访问。

use serde::{Deserialize, Serialize};
use std::fmt;

/// 权限级别
///
/// 定义 Agent 访问工作区所需的权限级别
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum PermissionLevel {
    /// 无需权限
    ///
    /// 用于纯计算类 Agent（如 Plan, TaskBreakdown）
    None = 0,

    /// 工作区读取权限
    ///
    /// 用于只读操作（如 Explore, Review, Doc）
    WorkspaceRead = 1,

    /// 工作区写入权限
    ///
    /// 用于修改操作（如 Refactor, Test, GitCommit）
    WorkspaceWrite = 2,
}

impl fmt::Display for PermissionLevel {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            PermissionLevel::None => write!(f, "无需权限"),
            PermissionLevel::WorkspaceRead => write!(f, "工作区读取"),
            PermissionLevel::WorkspaceWrite => write!(f, "工作区写入"),
        }
    }
}

/// 权限错误
#[derive(Debug, Clone, thiserror::Error)]
pub enum PermissionError {
    /// 权限不足
    #[error("权限不足: 需要 {required}, 但当前只有 {current}")]
    Insufficient {
        required: PermissionLevel,
        current: PermissionLevel,
    },

    /// 未知权限级别
    #[error("未知的权限级别: {0:?}")]
    UnknownLevel(PermissionLevel),
}

/// 权限检查器
///
/// 负责验证 Agent 是否有足够权限执行操作
pub trait PermissionChecker: fmt::Debug {
    /// 检查权限是否满足要求
    ///
    /// # 参数
    ///
    /// * `required` - 所需的权限级别
    ///
    /// # 返回
    ///
    /// - `Ok(())` - 权限满足
    /// - `Err(PermissionError)` - 权限不足
    fn check_permission(
        &self,
        required: PermissionLevel,
    ) -> Result<(), PermissionError>;

    /// 获取当前权限级别
    fn current_level(&self) -> PermissionLevel;
}

/// 默认权限检查器（总是允许）
///
/// 用于测试和开发环境
#[derive(Debug, Clone, Copy)]
pub struct AllowAllPermissionChecker;

impl PermissionChecker for AllowAllPermissionChecker {
    fn check_permission(
        &self,
        _required: PermissionLevel,
    ) -> Result<(), PermissionError> {
        Ok(())
    }

    fn current_level(&self) -> PermissionLevel {
        PermissionLevel::WorkspaceWrite // 假设拥有最高权限
    }
}

/// 基于配置的权限检查器
///
/// 根据配置文件或环境变量决定权限级别
#[derive(Debug, Clone)]
pub struct ConfigPermissionChecker {
    level: PermissionLevel,
}

impl ConfigPermissionChecker {
    /// 创建新的权限检查器
    pub fn new(level: PermissionLevel) -> Self {
        Self { level }
    }

    /// 从环境变量创建
    ///
    /// 环境变量 `IFAI_PERMISSION_LEVEL`:
    /// - "none" -> PermissionLevel::None
    /// - "read" -> PermissionLevel::WorkspaceRead
    /// - "write" -> PermissionLevel::WorkspaceWrite
    pub fn from_env() -> Self {
        let level = match std::env::var("IFAI_PERMISSION_LEVEL")
            .unwrap_or_default()
            .to_lowercase()
            .as_str()
        {
            s if s.contains("write") => PermissionLevel::WorkspaceWrite,
            s if s.contains("read") => PermissionLevel::WorkspaceRead,
            _ => PermissionLevel::None,
        };

        Self { level }
    }
}

impl PermissionChecker for ConfigPermissionChecker {
    fn check_permission(
        &self,
        required: PermissionLevel,
    ) -> Result<(), PermissionError> {
        if self.level >= required {
            Ok(())
        } else {
            Err(PermissionError::Insufficient {
                required,
                current: self.level,
            })
        }
    }

    fn current_level(&self) -> PermissionLevel {
        self.level
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_permission_level_ordering() {
        assert!(PermissionLevel::None < PermissionLevel::WorkspaceRead);
        assert!(PermissionLevel::WorkspaceRead < PermissionLevel::WorkspaceWrite);
        assert!(PermissionLevel::None < PermissionLevel::WorkspaceWrite);
    }

    #[test]
    fn test_allow_all_checker() {
        let checker = AllowAllPermissionChecker;

        assert!(checker.check_permission(PermissionLevel::None).is_ok());
        assert!(checker.check_permission(PermissionLevel::WorkspaceRead).is_ok());
        assert!(checker.check_permission(PermissionLevel::WorkspaceWrite).is_ok());
    }

    #[test]
    fn test_config_checker_with_sufficient_permission() {
        let checker = ConfigPermissionChecker::new(PermissionLevel::WorkspaceWrite);

        assert!(checker.check_permission(PermissionLevel::None).is_ok());
        assert!(checker.check_permission(PermissionLevel::WorkspaceRead).is_ok());
        assert!(checker.check_permission(PermissionLevel::WorkspaceWrite).is_ok());
    }

    #[test]
    fn test_config_checker_with_insufficient_permission() {
        let checker = ConfigPermissionChecker::new(PermissionLevel::WorkspaceRead);

        assert!(checker.check_permission(PermissionLevel::None).is_ok());
        assert!(checker.check_permission(PermissionLevel::WorkspaceRead).is_ok());

        // 写入权限应该失败
        let result = checker.check_permission(PermissionLevel::WorkspaceWrite);
        assert!(result.is_err());
        match result.unwrap_err() {
            PermissionError::Insufficient { required, current } => {
                assert_eq!(required, PermissionLevel::WorkspaceWrite);
                assert_eq!(current, PermissionLevel::WorkspaceRead);
            }
            _ => panic!("Expected Insufficient error"),
        }
    }

    #[test]
    fn test_permission_level_display() {
        assert_eq!(format!("{}", PermissionLevel::None), "无需权限");
        assert_eq!(format!("{}", PermissionLevel::WorkspaceRead), "工作区读取");
        assert_eq!(format!("{}", PermissionLevel::WorkspaceWrite), "工作区写入");
    }
}
