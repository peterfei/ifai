//! 声明式快速工作流定义宏
//!
//! 使用 `quick_workflows!` 宏一行声明一个工作流，自动生成工厂函数。
//! 消除 9 个手写工厂函数的重复模板代码。
//!
//! # 示例
//!
//! ```ignore
//! quick_workflows! {
//!     ("code_review", "quick-code-review", "快速代码审查", "自动代码审查") => {
//!         nodes: [
//!             ("explore", Explore, "探索代码"),
//!             ("review", Review, "代码审查"),
//!             ("refactor", Refactor, "重构建议"),
//!         ],
//!         edges: [
//!             ("explore", "review"),
//!             ("review", "refactor"),
//!         ],
//!     },
//! }
//! ```

// ============================================================
// quick_workflows! 宏定义
// ============================================================

use super::types::{AgentConfig, AgentType, Workflow, WorkflowEdge, WorkflowNode};

/// 声明式快速工作流定义宏
///
/// 从声明式配置生成工厂函数。每个工作流一条声明：
///
/// ```ignore
/// (workflow_type, id, display_name, description) => {
///     nodes: [
///         (node_id, AgentTypeVariant, label),
///         (node_id, AgentTypeVariant, label, task_description),  // 有任务描述的版本
///     ],
///     edges: [
///         (from_node, to_node),
///     ],
/// }
/// ```
///
/// 自动：
/// - 设置 target_path 到 workflow.variables
/// - 为有 task_description 的节点创建 AgentConfig
/// - 生成 `pub fn create_quick_{type}_workflow(target_path: &str) -> Workflow`
#[macro_export]
macro_rules! quick_workflows {
    // ──────── 顶层：分发到 @factory ────────
    (
        $(
            ($workflow_type:expr, $workflow_id:expr, $name:expr, $description:expr) => {
                nodes: [
                    $(
                        ($node_id:expr, $agent_type:ident, $label:expr $(, $task_desc:expr)?)
                    ),+ $(,)?
                ],
                edges: [
                    $(
                        ($from:expr, $to:expr)
                    ),* $(,)?
                ],
            }
        ),+ $(,)?
    ) => {
        $(
            // 使用 [] 包装 $task_desc 以解决重复深度问题
            quick_workflows! { @factory $workflow_type, $workflow_id, $name, $description,
                [$(
                    ($node_id, $agent_type, $label, [$($task_desc)?])
                ),+],
                [$(
                    ($from, $to)
                ),*]
            }
        )+
    };

    // ──────── @factory：生成单个工厂函数 ────────
    (
        @factory $workflow_type:expr, $workflow_id:expr, $name:expr, $description:expr,
        [$(
            ($node_id:expr, $agent_type:ident, $label:expr, [$($task_desc:expr)?])
        ),+],
        [$(
            ($from:expr, $to:expr)
        ),*]
    ) => {
        paste::paste! {
            #[doc = "创建 " $name " 工作流"]
            pub fn [<create_quick_ $workflow_type _workflow>](target_path: &str) -> $crate::agent_system::workflow::types::Workflow {
                let mut workflow = $crate::agent_system::workflow::types::Workflow::new($workflow_id, $name)
                    .with_description($description);

                $(
                    // [$($task_desc)?] 在此时是 [] 或 [expr]
                    // 我们需要将其转发给 @node
                    quick_workflows! { @node workflow, $node_id, $agent_type, $label, [$($task_desc)?] }
                )+

                $(
                    workflow.add_edge($crate::agent_system::workflow::types::WorkflowEdge::new($from, $to));
                )*

                workflow.variables.insert("target_path".to_string(), target_path.to_string());

                workflow
            }
        }
    };

    // ──────── @node：有 task_description ────────
    (
        @node $workflow:ident, $node_id:expr, $agent_type:ident, $label:expr, [$task_desc:expr]
    ) => {
        $workflow.add_node(
            $crate::agent_system::workflow::types::WorkflowNode::new(
                $node_id,
                $crate::agent_system::workflow::types::AgentType::$agent_type,
            )
            .with_label($label)
            .with_config($crate::agent_system::workflow::types::AgentConfig {
                target: ::std::option::Option::Some(::std::string::String::new()),
                task_description: ::std::option::Option::Some(::std::string::ToString::to_string(&$task_desc)),
                ..Default::default()
            })
        );
    };

    // ──────── @node：无 task_description ────────
    (
        @node $workflow:ident, $node_id:expr, $agent_type:ident, $label:expr, []
    ) => {
        $workflow.add_node(
            $crate::agent_system::workflow::types::WorkflowNode::new(
                $node_id,
                $crate::agent_system::workflow::types::AgentType::$agent_type,
            )
            .with_label($label)
        );
    };
}

// ============================================================
// 测试
// ============================================================

#[cfg(test)]
mod tests {
    use crate::agent_system::workflow::types::*;

    // ── 在子模块中使用宏定义测试工作流 ────────────────────────

    mod test_workflows {
        quick_workflows! {
            ("test_simple", "quick-test-simple", "测试简单工作流", "单一节点测试") => {
                nodes: [
                    ("explore", Explore, "探索代码"),
                ],
                edges: [],
            },
            ("test_chain", "quick-test-chain", "测试链式工作流", "链式节点测试") => {
                nodes: [
                    ("first", Explore, "第一步"),
                    ("second", Review, "第二步"),
                ],
                edges: [
                    ("first", "second"),
                ],
            },
            ("test_with_task", "quick-test-task", "测试任务描述", "带任务描述的工作流") => {
                nodes: [
                    ("worker", Refactor, "工作节点", "执行重构任务，修改代码文件"),
                ],
                edges: [],
            },
        }
    }

    // ── 测试生成的工厂函数 ────────────────────────────────────

    #[test]
    fn test_simple_workflow_structure() {
        let wf = test_workflows::create_quick_test_simple_workflow("/test/path");
        assert_eq!(wf.id, "quick-test-simple");
        assert_eq!(wf.name, "测试简单工作流");
        assert_eq!(wf.description, "单一节点测试");
    }

    #[test]
    fn test_simple_workflow_has_target_path() {
        let wf = test_workflows::create_quick_test_simple_workflow("/my/project");
        assert_eq!(
            wf.variables.get("target_path"),
            Some(&"/my/project".to_string())
        );
    }

    #[test]
    fn test_simple_workflow_nodes() {
        let wf = test_workflows::create_quick_test_simple_workflow("/path");
        assert_eq!(wf.nodes.len(), 1);
        assert_eq!(wf.nodes[0].id, "explore");
        assert_eq!(wf.nodes[0].agent_type, AgentType::Explore);
        assert_eq!(wf.nodes[0].label, Some("探索代码".to_string()));
    }

    #[test]
    fn test_simple_workflow_no_edges() {
        let wf = test_workflows::create_quick_test_simple_workflow("/path");
        assert!(wf.edges.is_empty());
    }

    #[test]
    fn test_chain_workflow_nodes() {
        let wf = test_workflows::create_quick_test_chain_workflow("/path");
        assert_eq!(wf.nodes.len(), 2);
        assert_eq!(wf.nodes[0].id, "first");
        assert_eq!(wf.nodes[0].agent_type, AgentType::Explore);
        assert_eq!(wf.nodes[1].id, "second");
        assert_eq!(wf.nodes[1].agent_type, AgentType::Review);
    }

    #[test]
    fn test_chain_workflow_edges() {
        let wf = test_workflows::create_quick_test_chain_workflow("/path");
        assert_eq!(wf.edges.len(), 1);
        assert_eq!(wf.edges[0].from, "first");
        assert_eq!(wf.edges[0].to, "second");
    }

    #[test]
    fn test_workflow_with_task_description() {
        let wf = test_workflows::create_quick_test_with_task_workflow("/path");
        assert_eq!(wf.nodes.len(), 1);
        assert_eq!(wf.nodes[0].id, "worker");
        assert_eq!(wf.nodes[0].agent_type, AgentType::Refactor);

        // 有 task_description 的节点应有 AgentConfig
        let config = &wf.nodes[0].config;
        assert!(
            config.task_description.is_some(),
            "有 task_description 的节点应自动设置 AgentConfig"
        );
        assert_eq!(
            config.task_description.as_deref(),
            Some("执行重构任务，修改代码文件")
        );
    }

    #[test]
    fn test_workflow_returns_valid() {
        let wf = test_workflows::create_quick_test_chain_workflow("/path");
        // 验证工作流结构有效
        assert!(wf.validate().is_ok(), "生成的工作流应通过验证");
    }

    #[test]
    fn test_all_workflows_have_unique_ids() {
        let workflows = vec![
            test_workflows::create_quick_test_simple_workflow("/p"),
            test_workflows::create_quick_test_chain_workflow("/p"),
            test_workflows::create_quick_test_with_task_workflow("/p"),
        ];

        let ids: Vec<&str> = workflows.iter().map(|w| w.id.as_str()).collect();
        let mut unique_ids = ids.clone();
        unique_ids.sort();
        unique_ids.dedup();
        assert_eq!(ids.len(), unique_ids.len(), "所有工作流 ID 应唯一");
    }
}
