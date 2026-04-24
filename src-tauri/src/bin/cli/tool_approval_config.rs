//! 工具审批配置 — 自动生成
//!
//! 此文件由 scripts/build-approval-config.cjs 自动生成
//! 请勿手动编辑

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ToolConfig {
    pub name: String,
    pub aliases: Vec<String>,
    pub category: ToolCategory,
    pub risk_level: RiskLevel,
    pub requires_approval: bool,
    pub require_sandbox: bool,
    pub aggregatable: bool,
    pub max_iterations: usize,
    pub path_risk_rules: Vec<PathRiskRule>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PathRiskRule {
    pub pattern: String,
    pub risk: RiskLevel,
}

pub const TOOL_APPROVAL_CONFIG: &str = include_str!("tool_approval_config.json");
