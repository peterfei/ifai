//! 元编程权限引擎
//!
//! 从 tool_approval_config.json 自动生成权限判断逻辑
//! 零重复代码，配置驱动。

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::RwLock;

// ═══════════════════════════════════════════════════════════
// 类型定义（与 UI 对齐）
// ═══════════════════════════════════════════════════════════

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ToolCategory {
    Safe,
    Dangerous,
    Destructive,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum RiskLevel {
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]  // 🔥 FIX: 匹配 TypeScript 的驼峰命名
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

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]  // 🔥 FIX: 匹配 TypeScript 的驼峰命名
pub struct AutoApprovalRule {
    pub priority: i32,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub when: Option<RuleCondition>,
    pub then: RuleAction,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]  // 🔥 FIX: 匹配 TypeScript 的驼峰命名
pub struct RuleCondition {
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(default, deserialize_with = "deserialize_optional_vec")]
    pub category: Option<Vec<ToolCategory>>,

    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(default, deserialize_with = "deserialize_optional_vec")]
    pub risk_level: Option<Vec<RiskLevel>>,

    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(default)]
    pub require_sandbox: Option<bool>,
}

// 🔥 辅助函数：支持从字符串或数组反序列化
fn deserialize_optional_vec<'de, D, T>(deserializer: D) -> Result<Option<Vec<T>>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: serde::Deserialize<'de>,
{
    use serde::de::{Error, Visitor};
    use std::fmt;
    use std::marker::PhantomData;

    struct StringOrVecVisitor<T>(PhantomData<T>);

    impl<'de, T> Visitor<'de> for StringOrVecVisitor<T>
    where
        T: serde::Deserialize<'de>,
    {
        type Value = Option<Vec<T>>;

        fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
            formatter.write_str("string or array")
        }

        fn visit_str<E>(self, s: &str) -> Result<Self::Value, E>
        where
            E: Error,
        {
            // 从单字符串转换为包含该元素的数组
            // 使用 serde_json::Value 作为中间类型
            let json_value = serde_json::Value::String(s.to_string());
            T::deserialize(json_value)
                .map(|item| Some(vec![item]))
                .map_err(|_| Error::custom(format!("failed to parse string: {}", s)))
        }

        fn visit_seq<A>(self, seq: A) -> Result<Self::Value, A::Error>
        where
            A: serde::de::SeqAccess<'de>,
        {
            use serde::Deserialize;
            // 解析数组
            Deserialize::deserialize(serde::de::value::SeqAccessDeserializer::new(seq))
                .map(Some)
        }
    }

    deserializer.deserialize_any(StringOrVecVisitor(PhantomData))
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct RuleAction {
    pub approve: bool,
    pub reason: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]  // 🔥 FIX: 匹配 TypeScript 的驼峰命名
pub struct ApprovalConfig {
    pub tools: Vec<ToolConfig>,
    pub auto_approval_rules: Vec<AutoApprovalRule>,
}

// ═══════════════════════════════════════════════════════════
// 元编程引擎：从配置生成运行时索引
// ═══════════════════════════════════════════════════════════

pub struct ToolApprovalEngine {
    // 运行时索引（O(1) 查询）
    tool_by_name: HashMap<String, ToolConfig>,
    tools_by_category: HashMap<ToolCategory, Vec<ToolConfig>>,
    max_iterations_by_category: HashMap<ToolCategory, usize>,

    // 排序后的规则链
    sorted_rules: Vec<AutoApprovalRule>,
}

impl ToolApprovalEngine {
    /// 从配置文件加载
    pub fn from_config(config: ApprovalConfig) -> Self {
        let mut tool_by_name = HashMap::new();
        let mut tools_by_category = HashMap::new();
        let mut max_iterations_by_category = HashMap::new();

        // 构建索引
        for tool in config.tools {
            // 注册主名称
            tool_by_name.insert(tool.name.clone(), tool.clone());

            // 注册别名
            for alias in &tool.aliases {
                tool_by_name.insert(alias.clone(), tool.clone());
            }

            // 按类别分组
            tools_by_category
                .entry(tool.category)
                .or_insert_with(Vec::new)
                .push(tool.clone());

            // 记录最大迭代次数
            max_iterations_by_category.insert(tool.category, tool.max_iterations);
        }

        // 排序规则链
        let mut sorted_rules = config.auto_approval_rules;
        sorted_rules.sort_by_key(|r| r.priority);

        Self {
            tool_by_name,
            tools_by_category,
            max_iterations_by_category,
            sorted_rules,
        }
    }

    /// 🔥 元编程 API：工具分类（O(1) 查询）
    pub fn categorize_tool(&self, name: &str) -> ToolCategory {
        self.tool_by_name
            .get(name)
            .map(|t| t.category)
            .unwrap_or(ToolCategory::Dangerous)  // 默认：未知工具为危险
    }

    /// 🔥 元编程 API：风险计算（O(1) 查询）
    pub fn calculate_risk(&self, name: &str, _args: &serde_json::Value) -> RiskLevel {
        self.tool_by_name
            .get(name)
            .map(|t| t.risk_level)
            .unwrap_or(RiskLevel::Medium)  // 默认：中等风险
    }

    /// 🔥 元编程 API：自动审批判断（规则链求值）
    pub fn should_auto_approve(&self, tool_name: &str, is_sandbox: bool) -> bool {
        let tool = self.tool_by_name.get(tool_name);

        for rule in &self.sorted_rules {
            // 规则条件检查
            if let Some(when) = &rule.when {
                // 类别过滤
                if let Some(categories) = &when.category {
                    let tool_category = tool.map(|t| t.category).unwrap_or(ToolCategory::Dangerous);
                    if !categories.contains(&tool_category) {
                        continue;
                    }
                }

                // 沙箱条件
                if when.require_sandbox.unwrap_or(false) && !is_sandbox {
                    continue;
                }
            }

            // 规则命中
            return rule.then.approve;
        }

        false  // 默认：需要手动审批
    }

    /// 🔥 元编程 API：最大迭代次数（按类别）
    pub fn max_iterations(&self, category: ToolCategory) -> usize {
        *self.max_iterations_by_category
            .get(&category)
            .unwrap_or(&5)  // 默认：5 次
    }

    /// 获取工具完整配置
    pub fn get_config(&self, name: &str) -> Option<&ToolConfig> {
        self.tool_by_name.get(name)
    }
}

// ═══════════════════════════════════════════════════════════
// 全局单例（延迟加载）
// ═══════════════════════════════════════════════════════════

use once_cell::sync::Lazy;

static APPROVAL_ENGINE: Lazy<ToolApprovalEngine> = Lazy::new(|| {
    let config_json = include_str!("tool_approval_config.json");
    let config: ApprovalConfig = serde_json::from_str(config_json)
        .expect("Failed to parse tool_approval_config.json");

    ToolApprovalEngine::from_config(config)
});

// ═══════════════════════════════════════════════════════════
// 便捷 API（直接调用全局单例）
// ═══════════════════════════════════════════════════════════

pub fn categorize_tool(name: &str) -> ToolCategory {
    APPROVAL_ENGINE.categorize_tool(name)
}

pub fn calculate_risk(name: &str, args: &serde_json::Value) -> RiskLevel {
    APPROVAL_ENGINE.calculate_risk(name, args)
}

pub fn should_auto_approve(tool_name: &str, is_sandbox: bool) -> bool {
    APPROVAL_ENGINE.should_auto_approve(tool_name, is_sandbox)
}

pub fn max_iterations(category: ToolCategory) -> usize {
    APPROVAL_ENGINE.max_iterations(category)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_categorize_safe_tools() {
        assert_eq!(categorize_tool("read_file"), ToolCategory::Safe);
        assert_eq!(categorize_tool("TodoWrite"), ToolCategory::Safe);
    }

    #[test]
    fn test_categorize_destructive_tools() {
        assert_eq!(categorize_tool("bash"), ToolCategory::Destructive);
        assert_eq!(categorize_tool("delete_file"), ToolCategory::Destructive);
    }

    #[test]
    fn test_unknown_tool_is_dangerous() {
        assert_eq!(categorize_tool("unknown_tool"), ToolCategory::Dangerous);
    }

    #[test]
    fn test_max_iterations() {
        assert_eq!(max_iterations(ToolCategory::Safe), 5);
        assert_eq!(max_iterations(ToolCategory::Destructive), 3);
    }
}
