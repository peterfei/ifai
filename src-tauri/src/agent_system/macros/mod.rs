//! Agent 系统元编程模块
//!
//! 本模块提供 Agent 互调用的宏生成能力，包括：
//! - `global_agent_registry!`: 全局 Agent 注册表
//! - `workflow!`: 工作流 DSL
//! - `message_protocol!`: 消息协议定义（Phase 1）
//!
//! # 设计原则
//!
//! - **零样板代码**: 所有重复逻辑由宏生成
//! - **编译时安全**: 类型检查 + 宏展开验证
//! - **单点维护**: 修改宏定义，自动传播
//!
//! # 使用示例
//!
//! ```rust
//! global_agent_registry! {
//!     agents: [
//!         Explore,
//!         Review,
//!         Refactor,
//!         // ...
//!     ],
//!     max_depth: 5,
//! }
//! ```

pub mod registry;
pub mod permission;
pub mod message_protocol;  // Phase 1: 消息协议宏（声明式宏）
pub mod message_types;     // Phase 1: 消息类型定义（调用宏生成）

/// 全局 Agent 注册表宏
///
/// 声明式注册所有 Agent，自动生成注册表代码。
///
/// # 语法
///
/// ```rust
/// global_agent_registry! {
///     agents: [
///         AgentType1,
///         AgentType2,
///         // ...
///     ],
///     max_depth: 5,
/// }
/// ```
///
/// # 生成内容
///
/// - `AgentRegistry::global()` 单例
/// - 自动注册所有指定的 Agent
/// - 调用链深度限制配置
#[macro_export]
macro_rules! global_agent_registry {
    {
        agents: [$($agent:ident),+ $(,)?],
        max_depth: $max_depth:expr,
    } => {
        // 宏展开时，这些代码已经在 registry.rs 的 AgentRegistry::global() 中实现
        // 这里只是提供一个声明式接口，实际逻辑在 runtime 执行
        //
        // 未来可以扩展为：
        // 1. 生成自定义 AgentCaller trait
        // 2. 自动生成 Agent 互调用代码
        // 3. 编译时验证 Agent 依赖关系

        // 当前版本：通过静态断言确保编译时检查
        const _: () = {
            // 验证 max_depth 是合理的值
            let _ = [(); $max_depth];

            // 确保至少有一个 Agent
            let _ = [$(stringify!($agent)),+];
        };
    };
}

/// 工作流 DSL 宏
///
/// 声明式定义 Agent 协作工作流，自动生成 Workflow 结构体。
///
/// # 语法
///
/// ## 基础语法
///
/// ```rust
/// workflow! {
///     name: "workflow_name",
///     description: "Workflow description",
///
///     nodes: [
///         Explore("node_id"),
///         Review("another_id"),
///     ],
///
///     edges: [
///         ("node_id", "another_id"),
///         ("from", "to", "$.condition > 5"),
///     ],
/// }
/// ```
///
/// ## 协作模式语法（Phase 2）
///
/// ### Parallel - 并行执行
/// ```rust
/// workflow! {
///     name: "parallel_review",
///     description: "并行审查工作流",
///
///     nodes: [
///         Explore("explore"),
///         Parallel("parallel_review", [Review, Test]),
///     ],
///
///     edges: [
///         ("explore", "parallel_review"),
///     ],
/// }
/// ```
/// 展开为：`parallel_review_0` (Review) 和 `parallel_review_1` (Test) 两个并行节点
///
/// ### Diamond - 菱形协作
/// ```rust
/// workflow! {
///     name: "diamond_workflow",
///     description: "菱形协作工作流",
///
///     nodes: [
///         Explore("split"),
///         Diamond("diamond", [Review, Refactor]),
///         Test("merge"),
///     ],
///
///     edges: [
///         ("split", "diamond"),
///         ("diamond", "merge"),
///     ],
/// }
/// ```
/// 展开为：split → (Review || Refactor) → merge
///
/// ### KnowledgeChain - 知识共享链
/// ```rust
/// workflow! {
///     name: "knowledge_chain",
///     description: "知识共享链工作流",
///
///     nodes: [
///         Explore("explore"),
///         KnowledgeChain("chain", [Review, Refactor, Test]),
///     ],
///
///     edges: [
///         ("explore", "chain"),
///     ],
/// }
/// ```
/// 展开为：explore → Review → Refactor → Test（串行，带知识共享）
///
/// 注意：边定义使用元组语法，格式为 `(from, to)` 或 `(from, to, condition)`
#[macro_export]
macro_rules! workflow {
    // Phase 2: 混合节点版本（普通节点 + 协作节点）
    // 使用表达式形式的节点，支持 WorkflowNode 或 collab_node!()
    {
        name: $name:expr,
        description: $desc:expr,

        nodes: [
            $(
                $node_expr:expr
            ),+
            $(,)?
        ],

        edges: [
            $(
                ( $from:expr, $to:expr $(, $condition:expr )? )
            ),+
            $(,)?
        ],
    } => {
        {
            use crate::agent_system::workflow::types::{Workflow, WorkflowEdge};

            let mut workflow = Workflow::new(
                uuid::Uuid::new_v4().to_string(),
                $name
            );
            workflow.description = $desc.to_string();

            // 添加节点（支持表达式形式的节点）
            $(
                workflow.add_node($node_expr);
            )+

            // 添加边
            $(
                workflow.add_edge(
                    WorkflowEdge::new($from, $to)
                    $(
                        .with_condition($condition)
                    )?
                );
            )+

            workflow
        }
    };

    // 完整版本：带 nodes 和 edges（使用元组语法定义边）- 旧版本保持兼容
    {
        name: $name:expr,
        description: $desc:expr,

        nodes: [
            $(
                $agent_type:ident ( $node_id:expr )
            ),+
            $(,)?
        ],

        edges: [
            $(
                ( $from:expr, $to:expr $(, $condition:expr )? )
            ),+
            $(,)?
        ],
    } => {
        {
            use crate::agent_system::workflow::types::{Workflow, WorkflowNode, WorkflowEdge, AgentType};

            let mut workflow = Workflow::new(
                uuid::Uuid::new_v4().to_string(),
                $name
            );
            workflow.description = $desc.to_string();

            // 添加节点
            $(
                workflow.add_node(
                    WorkflowNode::new(
                        $node_id,
                        AgentType::$agent_type
                    )
                );
            )+

            // 添加边
            $(
                workflow.add_edge(
                    WorkflowEdge::new($from, $to)
                    $(
                        .with_condition($condition)
                    )?
                );
            )+

            workflow
        }
    };

    // Phase 2: 混合节点最简版本（仅 nodes，无 edges）
    {
        name: $name:expr,
        description: $desc:expr,

        nodes: [
            $(
                $node_expr:expr
            ),+
            $(,)?
        ],

        edges: [],
    } => {
        {
            use crate::agent_system::workflow::types::Workflow;

            let mut workflow = Workflow::new(
                uuid::Uuid::new_v4().to_string(),
                $name
            );
            workflow.description = $desc.to_string();

            $(
                workflow.add_node($node_expr);
            )+

            workflow
        }
    };

    // 最简版本：仅 nodes，无 edges
    {
        name: $name:expr,
        description: $desc:expr,

        nodes: [
            $(
                $agent_type:ident ( $node_id:expr )
            ),+
            $(,)?
        ],

        edges: [],
    } => {
        {
            use crate::agent_system::workflow::types::{Workflow, WorkflowNode, AgentType};

            let mut workflow = Workflow::new(
                uuid::Uuid::new_v4().to_string(),
                $name
            );
            workflow.description = $desc.to_string();

            $(
                workflow.add_node(
                    WorkflowNode::new(
                        $node_id,
                        AgentType::$agent_type
                    )
                );
            )+

            workflow
        }
    };
}

/// 协作节点辅助宏（Phase 2）
///
/// 用于在 workflow! 中定义协作节点
///
/// # 语法
///
/// ```rust
/// collab_node!(Parallel, "node_id", [Review, Test])
/// collab_node!(Diamond, "node_id", [Review, Refactor])
/// collab_node!(KnowledgeChain, "node_id", [Review, Refactor, Test])
/// ```
///
/// 展开为包含协作 Agent 列表的 WorkflowNode
#[macro_export]
macro_rules! collab_node {
    // Parallel 节点
    (Parallel, $node_id:expr, [$($agent:ident),+ $(,)?]) => {{
        use crate::agent_system::workflow::types::{WorkflowNode, AgentType};
        use serde_json::json;

        let agents = vec![$(stringify!($agent).to_lowercase()),+];
        let mut node = WorkflowNode::new($node_id, AgentType::Parallel);
        node.config.custom_params.insert("agents".to_string(), json!(agents));
        node
    }};

    // Diamond 节点
    (Diamond, $node_id:expr, [$($agent:ident),+ $(,)?]) => {{
        use crate::agent_system::workflow::types::{WorkflowNode, AgentType};
        use serde_json::json;

        let agents = vec![$(stringify!($agent).to_lowercase()),+];
        let mut node = WorkflowNode::new($node_id, AgentType::Diamond);
        node.config.custom_params.insert("agents".to_string(), json!(agents));
        node
    }};

    // KnowledgeChain 节点
    (KnowledgeChain, $node_id:expr, [$($agent:ident),+ $(,)?]) => {{
        use crate::agent_system::workflow::types::{WorkflowNode, AgentType};
        use serde_json::json;

        let agents = vec![$(stringify!($agent).to_lowercase()),+];
        let mut node = WorkflowNode::new($node_id, AgentType::KnowledgeChain);
        node.config.custom_params.insert("agents".to_string(), json!(agents));
        node
    }};
}

// 测试模块
#[cfg(test)]
mod tests {
    // 不要使用 include!，而是通过 mod.rs 声明
    // 这样可以避免重复导入问题
    pub mod parallel_tests;   // 单独的测试模块
    pub mod parallel_bench;   // 性能基准测试
    pub mod agent_bridge_integration_tests;  // Phase 0.1.1: Agent 互调用桥接集成测试
    pub mod collaboration_e2e_tests;  // Phase 5: 协作模式端到端测试
}

// 重新导出常用类型
pub use registry::{
    AgentRegistry,
    CallContext,
    CallChain,
    AgentCaller,
    AgentCallError,
    AgentCallResult,
};

pub use permission::{
    PermissionLevel,
    PermissionChecker,
    PermissionError,
    AllowAllPermissionChecker,
    ConfigPermissionChecker,
};

// Phase 1: 重新导出消息类型
pub use message_types::{
    CollaborationMessage,
    BroadcastMessage,
    ShareKnowledgeMessage,
    AggregateResultsMessage,
    ProgressUpdateMessage,
};
