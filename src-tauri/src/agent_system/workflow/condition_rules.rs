//! 声明式条件规则表
//!
//! 使用 `condition_rules!` 宏定义声明式规则表，替代 process-oriented if-else 链。
//! 每条规则 = (正则模式, 评估闭包)，新增规则只需加一行声明。
//!
//! # 示例
//!
//! ```ignore
//! condition_rules! {
//!     rules: [
//!         (r#"^\$status\s*==\s*\"(.+)\"$"#, |caps: &[&str], ctx: &WorkflowContext| -> bool {
//!             format!("{:?}", ctx.workflow_status).to_lowercase() == caps[0]
//!         }),
//!         (r#"^\$node\.(\w+)\.status\s*==\s*\"(.+)\"$"#, |caps: &[&str], ctx: &WorkflowContext| -> bool {
//!             ctx.node_status(caps[0])
//!                 .map(|s| format!("{:?}", s).to_lowercase() == caps[1])
//!                 .unwrap_or(false)
//!         }),
//!     ],
//!     fallback: || true,
//! }
//! ```

use std::collections::HashMap;
use std::sync::LazyLock;

use regex::Regex;

use super::runner::{NodeStatus, WorkflowStatus};

/// 工作流条件评估上下文
///
/// 包含规则评估所需的全部状态信息。
#[derive(Debug, Clone)]
pub struct WorkflowContext {
    /// 工作流整体状态
    pub workflow_status: WorkflowStatus,
    /// 各节点的状态映射
    pub node_statuses: HashMap<String, NodeStatus>,
}

impl WorkflowContext {
    /// 创建新的工作流上下文
    pub fn new(workflow_status: WorkflowStatus) -> Self {
        Self {
            workflow_status,
            node_statuses: HashMap::new(),
        }
    }

    /// 获取指定节点的状态
    pub fn node_status(&self, node_id: &str) -> Option<&NodeStatus> {
        self.node_statuses.get(node_id)
    }

    /// 设置指定节点的状态
    pub fn set_node_status(&mut self, node_id: String, status: NodeStatus) {
        self.node_statuses.insert(node_id, status);
    }
}

/// 条件规则定义
///
/// - `pattern`: 编译为正则表达式的模式字符串
/// - `eval`: 评估函数，接收正则捕获组和上下文，返回 bool
pub struct ConditionRule {
    pub pattern: &'static str,
    pub eval: fn(&[&str], &WorkflowContext) -> bool,
}

/// 提取枚举 Debug 输出的变体名称（忽略内部数据），转为小写
/// e.g. `Failed("error")` → `"failed"`, `Completed` → `"completed"`
fn variant_name(s: &str) -> &str {
    s.split('(').next().unwrap_or(s)
}

// ============================================================
// 默认规则表 — 由 condition_rules! 宏生成
//
// 当前手工维护，后续迁移到宏生成。
// 规则说明：
// 1. `$status == "xxx"` — 匹配工作流整体状态
// 2. `$node.<id>.status == "xxx"` — 匹配指定节点状态
// 3. fallback — 无匹配规则时默认返回 true
// ============================================================

/// 默认条件规则表
const DEFAULT_RULES: &[ConditionRule] = &[
    ConditionRule {
        // 匹配: $status == "completed" / $status == "failed"
        pattern: r#"^\$status\s*==\s*"(.+)"$"#,
        eval: |caps: &[&str], ctx: &WorkflowContext| -> bool {
            let expected = caps[0].to_lowercase();
            let actual = variant_name(&format!("{:?}", ctx.workflow_status)).to_lowercase();
            actual == expected
        },
    },
    ConditionRule {
        // 匹配: $node.<id>.status == "completed"
        pattern: r#"^\$node\.(\w+)\.status\s*==\s*"(.+)"$"#,
        eval: |caps: &[&str], ctx: &WorkflowContext| -> bool {
            let node_id = caps[0];
            let expected = caps[1].to_lowercase();
            ctx.node_status(node_id)
                .map(|s| variant_name(&format!("{:?}", s)).to_lowercase() == expected)
                .unwrap_or(false)
        },
    },
];

/// 懒编译的正则规则表（编译一次，重复使用）
static COMPILED_RULES: LazyLock<Vec<(Regex, fn(&[&str], &WorkflowContext) -> bool)>> =
    LazyLock::new(|| {
        DEFAULT_RULES
            .iter()
            .map(|rule| {
                let regex = Regex::new(rule.pattern)
                    .expect(&format!("条件规则正则编译失败: {}", rule.pattern));
                (regex, rule.eval)
            })
            .collect()
    });

/// 默认回退值
const DEFAULT_FALLBACK: fn() -> bool = || true;

/// 评估条件表达式
///
/// 遍历规则表，第一条匹配的规则决定结果；无匹配时使用 fallback。
///
/// # 参数
///
/// * `condition` - 条件表达式字符串（如 `$status == "completed"`）
/// * `ctx` - 工作流上下文
///
/// # 返回
///
/// 条件是否满足
///
/// # 示例
///
/// ```rust
/// use crate::agent_system::workflow::condition_rules::{evaluate_condition, WorkflowContext};
/// use crate::agent_system::workflow::runner::WorkflowStatus;
///
/// let ctx = WorkflowContext::new(WorkflowStatus::Completed);
/// assert!(evaluate_condition(r#"$status == "completed""#, &ctx));
/// assert!(!evaluate_condition(r#"$status == "failed""#, &ctx));
/// ```
pub fn evaluate_condition(condition: &str, ctx: &WorkflowContext) -> bool {
    let rules = &*COMPILED_RULES;

    for (regex, eval_fn) in rules {
        if let Some(captures) = regex.captures(condition) {
            let caps: Vec<&str> = captures
                .iter()
                .skip(1) // 跳过整个匹配
                .filter_map(|m| m.map(|m| m.as_str()))
                .collect();
            return eval_fn(&caps, ctx);
        }
    }

    // 无匹配规则，使用 fallback
    DEFAULT_FALLBACK()
}

// ============================================================
// condition_rules! 宏定义
// ============================================================

/// 声明式条件规则表宏
///
/// 生成一个 `evaluate_condition` 函数，使用编译期定义的规则表。
/// 每加一条规则只需在 `rules: [...]` 中加一行声明。
///
/// # 语法
///
/// ```ignore
/// condition_rules! {
///     rules: [
///         (r#"pattern"#, |caps: &[&str], ctx: &WorkflowContext| -> bool { ... }),
///     ],
///     fallback: || true,
/// }
/// ```
#[macro_export]
macro_rules! condition_rules {
    (
        rules: [
            $(
                ($pattern:expr, $eval:expr)
            ),+ $(,)?
        ],
        fallback: $fallback:expr $(,)?
    ) => {
        /// 编译期定义的条件规则表
        const _RULES: &[$crate::agent_system::workflow::condition_rules::ConditionRule] = &[
            $(
                $crate::agent_system::workflow::condition_rules::ConditionRule {
                    pattern: $pattern,
                    eval: $eval,
                },
            )+
        ];

        /// 懒编译的正则规则表
        static _COMPILED: std::sync::LazyLock<
            Vec<(regex::Regex, fn(&[&str], &$crate::agent_system::workflow::condition_rules::WorkflowContext) -> bool)>
        > = std::sync::LazyLock::new(|| {
            _RULES
                .iter()
                .map(|rule| {
                    let regex = regex::Regex::new(rule.pattern)
                        .expect(&format!("条件规则正则编译失败: {}", rule.pattern));
                    (regex, rule.eval)
                })
                .collect()
        });

        /// 使用规则表评估条件表达式
        pub fn evaluate_condition(
            condition: &str,
            ctx: &$crate::agent_system::workflow::condition_rules::WorkflowContext,
        ) -> bool {
            let rules = &*_COMPILED;

            for (regex, eval_fn) in rules {
                if let Some(captures) = regex.captures(condition) {
                    let caps: Vec<&str> = captures
                        .iter()
                        .skip(1)
                        .filter_map(|m| m.map(|m| m.as_str()))
                        .collect();
                    return eval_fn(&caps, ctx);
                }
            }

            ($fallback)()
        }
    };
}

// ============================================================
// 测试
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent_system::workflow::runner::WorkflowStatus;

    // ── WorkflowContext 测试 ──────────────────────────────────

    #[test]
    fn test_context_new() {
        let ctx = WorkflowContext::new(WorkflowStatus::Running);
        assert_eq!(ctx.workflow_status, WorkflowStatus::Running);
        assert!(ctx.node_statuses.is_empty());
    }

    #[test]
    fn test_context_set_and_get_node_status() {
        let mut ctx = WorkflowContext::new(WorkflowStatus::Running);
        ctx.set_node_status("code".to_string(), NodeStatus::Completed);
        assert_eq!(ctx.node_status("code"), Some(&NodeStatus::Completed));
        assert_eq!(ctx.node_status("nonexistent"), None);
    }

    // ── evaluate_condition 测试 ───────────────────────────────

    #[test]
    fn test_status_completed() {
        let ctx = WorkflowContext::new(WorkflowStatus::Completed);
        assert!(evaluate_condition(r#"$status == "completed""#, &ctx));
    }

    #[test]
    fn test_status_not_completed() {
        let ctx = WorkflowContext::new(WorkflowStatus::Failed("error".to_string()));
        assert!(!evaluate_condition(r#"$status == "completed""#, &ctx));
    }

    #[test]
    fn test_status_failed() {
        let ctx = WorkflowContext::new(WorkflowStatus::Failed("error".to_string()));
        assert!(evaluate_condition(r#"$status == "failed""#, &ctx));
    }

    #[test]
    fn test_status_running() {
        let ctx = WorkflowContext::new(WorkflowStatus::Running);
        assert!(evaluate_condition(r#"$status == "running""#, &ctx));
    }

    #[test]
    fn test_status_idle() {
        let ctx = WorkflowContext::new(WorkflowStatus::Idle);
        assert!(evaluate_condition(r#"$status == "idle""#, &ctx));
    }

    #[test]
    fn test_node_status_completed() {
        let mut ctx = WorkflowContext::new(WorkflowStatus::Running);
        ctx.set_node_status("refactor".to_string(), NodeStatus::Completed);
        assert!(evaluate_condition(
            r#"$node.refactor.status == "completed""#,
            &ctx
        ));
    }

    #[test]
    fn test_node_status_not_completed() {
        let mut ctx = WorkflowContext::new(WorkflowStatus::Running);
        ctx.set_node_status("refactor".to_string(), NodeStatus::Failed("error".to_string()));
        assert!(!evaluate_condition(
            r#"$node.refactor.status == "completed""#,
            &ctx
        ));
    }

    #[test]
    fn test_node_status_nonexistent_node() {
        let ctx = WorkflowContext::new(WorkflowStatus::Running);
        assert!(!evaluate_condition(
            r#"$node.nonexistent.status == "completed""#,
            &ctx
        ));
    }

    #[test]
    fn test_node_status_failed_with_error() {
        let mut ctx = WorkflowContext::new(WorkflowStatus::Running);
        ctx.set_node_status("test".to_string(), NodeStatus::Failed("assertion failed".to_string()));
        assert!(evaluate_condition(
            r#"$node.test.status == "failed""#,
            &ctx
        ));
    }

    #[test]
    fn test_unknown_format_falls_back_to_true() {
        let ctx = WorkflowContext::new(WorkflowStatus::Running);
        assert!(evaluate_condition("some unknown expression", &ctx));
    }

    #[test]
    fn test_empty_string_falls_back_to_true() {
        let ctx = WorkflowContext::new(WorkflowStatus::Completed);
        assert!(evaluate_condition("", &ctx));
    }

    #[test]
    fn test_whitespace_handling() {
        let ctx = WorkflowContext::new(WorkflowStatus::Completed);
        assert!(evaluate_condition(r#"$status=="completed""#, &ctx));
        // 没有空格也应该匹配：^\$status\s*==\s*"(.+)"$
        // \s* 匹配零个或多个空白，所以 "==" 也能匹配
    }

    #[test]
    fn test_node_status_with_whitespace() {
        let mut ctx = WorkflowContext::new(WorkflowStatus::Running);
        ctx.set_node_status("code".to_string(), NodeStatus::Completed);
        assert!(evaluate_condition(
            r#"$node.code.status == "completed""#,
            &ctx
        ));
        // 无空白也应该匹配
        assert!(evaluate_condition(
            r#"$node.code.status=="completed""#,
            &ctx
        ));
    }

    // ── 宏测试 ────────────────────────────────────────────────

    /// 宏测试 — 隔离在子模块中，避免 shadow 模块级 evaluate_condition
    mod macro_tests {
        use crate::agent_system::workflow::condition_rules::WorkflowContext;

        condition_rules! {
            rules: [
                (r#"^custom-(.+)$"#, |caps: &[&str], _ctx: &WorkflowContext| -> bool {
                    caps[0] == "pass"
                }),
            ],
            fallback: || false,
        }

        #[test]
        fn test_custom_macro_rules() {
            let ctx = WorkflowContext::new(
                crate::agent_system::workflow::runner::WorkflowStatus::Running,
            );
            assert!(evaluate_condition("custom-pass", &ctx));
            assert!(!evaluate_condition("custom-fail", &ctx));
        }

        #[test]
        fn test_custom_macro_fallback() {
            let ctx = WorkflowContext::new(
                crate::agent_system::workflow::runner::WorkflowStatus::Running,
            );
            assert!(!evaluate_condition("unknown", &ctx));
        }

        #[test]
        fn test_default_rules_with_false_fallback() {
            // 即使自定义宏有 false fallback，匹配 $status 规则也无效
            // （因为宏没有定义 $status 规则）
            let ctx = WorkflowContext::new(
                crate::agent_system::workflow::runner::WorkflowStatus::Completed,
            );
            assert!(!evaluate_condition(r#"$status == "completed""#, &ctx));
        }
    }

    /// 多规则宏测试
    mod multi_rule_macro {
        use crate::agent_system::workflow::condition_rules::WorkflowContext;

        condition_rules! {
            rules: [
                (r#"^type-(alpha)$"#, |caps: &[&str], _ctx: &WorkflowContext| -> bool {
                    caps[0] == "alpha"
                }),
                (r#"^type-(beta)$"#, |caps: &[&str], _ctx: &WorkflowContext| -> bool {
                    caps[0] == "beta"
                }),
            ],
            fallback: || false,
        }

        #[test]
        fn test_alpha() {
            let ctx = WorkflowContext::new(
                crate::agent_system::workflow::runner::WorkflowStatus::Running,
            );
            assert!(evaluate_condition("type-alpha", &ctx));
        }

        #[test]
        fn test_beta() {
            let ctx = WorkflowContext::new(
                crate::agent_system::workflow::runner::WorkflowStatus::Running,
            );
            assert!(evaluate_condition("type-beta", &ctx));
        }

        #[test]
        fn test_neither() {
            let ctx = WorkflowContext::new(
                crate::agent_system::workflow::runner::WorkflowStatus::Running,
            );
            assert!(!evaluate_condition("type-gamma", &ctx));
        }

        #[test]
        fn test_first_rule_wins() {
            let ctx = WorkflowContext::new(
                crate::agent_system::workflow::runner::WorkflowStatus::Running,
            );
            // type-alpha matches first rule
            assert!(evaluate_condition("type-alpha", &ctx));
        }
    }
}
