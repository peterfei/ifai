#!/usr/bin/env node
/**
 * 元编程：从 TypeScript 配置生成 Rust JSON 配置
 *
 * 运行：node scripts/build-approval-config.cjs
 */

const fs = require('fs');
const path = require('path');

// 读取 TypeScript 配置
const tsConfigPath = path.join(__dirname, '../src/core/approval/toolApprovalConfig.ts');
const tsConfigContent = fs.readFileSync(tsConfigPath, 'utf-8');

// 提取配置对象（简单的正则提取，生产环境可用 AST）
const match = tsConfigContent.match(/export const toolApprovalConfig.*?=\s*({[\s\S]*?});\s*$/m);
if (!match) {
    console.error('Failed to extract toolApprovalConfig');
    process.exit(1);
}

// 使用 Function 构造函数安全解析（避免 eval）
const configExtractor = new Function(`return ${match[1]}`);
let config;
try {
    config = configExtractor();
} catch (e) {
    console.error('Failed to parse config:', e.message);
    process.exit(1);
}

// 转换为 Rust 友好的格式
const rustConfig = {
    tools: config.tools.map(tool => ({
        name: tool.name,
        aliases: tool.aliases || [],
        category: tool.category,
        riskLevel: tool.riskLevel,
        requiresApproval: tool.requiresApproval ?? false,
        requireSandbox: tool.requireSandbox ?? false,
        aggregatable: tool.aggregatable ?? false,
        maxIterations: tool.category === 'destructive' ? 3 : 5,
        pathRiskRules: (tool.pathRiskRules || []).map(rule => ({
            pattern: rule.pattern.source,
            risk: rule.risk,
        })),
    })),
    autoApprovalRules: config.autoApprovalRules.map(rule => ({
        priority: rule.priority,
        name: rule.name,
        when: rule.when,
        then: rule.then,
    })),
    globalPathRiskRules: (config.globalPathRiskRules || []).map(rule => ({
        pattern: rule.pattern.source,
        risk: rule.risk,
    })),
};

// 输出路径
const outputPath = path.join(__dirname, '../src-tauri/src/bin/cli/tool_approval_config.json');

// 写入 JSON 文件
fs.writeFileSync(outputPath, JSON.stringify(rustConfig, null, 2));
console.log(`✅ Generated: ${outputPath}`);
console.log(`   - ${rustConfig.tools.length} tools`);
console.log(`   - ${rustConfig.autoApprovalRules.length} auto-approval rules`);

// 生成 Rust 常量代码（可选）
const rustCodePath = path.join(__dirname, '../src-tauri/src/bin/cli/tool_approval_config.rs');
const rustCode = `//! 工具审批配置 — 自动生成
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
`;

fs.writeFileSync(rustCodePath, rustCode);
console.log(`✅ Generated: ${rustCodePath}`);
