//! Agent 协作模式端到端测试（Phase 5）
//!
//! 测试三种协作模式的完整工作流：
//! - Parallel: 并行执行多个 Agent
//! - Diamond: 分叉后聚合的菱形协作
//! - KnowledgeChain: 知识共享链式协作

#[cfg(test)]
mod collaboration_e2e_tests {
    use crate::agent_system::workflow::types::{AgentType, Workflow, WorkflowNode};
    // 宏通过 #[macro_export] 导出到 crate root
    use crate::{collab_node, workflow};
    use crate::harness::tool::new_tools::{
        AggregateResultsTool, ShareKnowledgeTool, MonitorProgressTool,
    };
    use crate::harness::tool::new_tools::adapter::ToolLike;
    use serde_json::json;

    /// 测试 Parallel 协作模式工作流
    #[test]
    fn test_parallel_workflow_creation() {
        let workflow = workflow! {
            name: "parallel_review_workflow",
            description: "并行审查和测试工作流",

            nodes: [
                WorkflowNode::new("explore", AgentType::Explore),
                collab_node!(Parallel, "parallel_review", [Review, Test]),
            ],

            edges: [
                ("explore", "parallel_review"),
            ],
        };

        assert_eq!(workflow.name, "parallel_review_workflow");
        assert_eq!(workflow.description, "并行审查和测试工作流");
        assert_eq!(workflow.nodes.len(), 2);

        // 验证 explore 节点
        let explore_node = &workflow.nodes[0];
        assert_eq!(explore_node.id, "explore");
        assert_eq!(explore_node.agent_type, AgentType::Explore);

        // 验证 parallel_review 节点
        let parallel_node = &workflow.nodes[1];
        assert_eq!(parallel_node.id, "parallel_review");
        assert_eq!(parallel_node.agent_type, AgentType::Parallel);

        // 验证 agents 参数
        let agents = parallel_node.config.custom_params.get("agents")
            .and_then(|v| v.as_array())
            .expect("应该包含 agents 数组");
        assert_eq!(agents.len(), 2);
        assert_eq!(agents[0].as_str(), Some("review"));
        assert_eq!(agents[1].as_str(), Some("test"));

        // 验证边
        assert_eq!(workflow.edges.len(), 1);
        assert_eq!(workflow.edges[0].from, "explore");
        assert_eq!(workflow.edges[0].to, "parallel_review");
    }

    /// 测试 Diamond 协作模式工作流
    #[test]
    fn test_diamond_workflow_creation() {
        let workflow = workflow! {
            name: "diamond_refactor_workflow",
            description: "菱形协作重构工作流",

            nodes: [
                WorkflowNode::new("split", AgentType::Explore),
                collab_node!(Diamond, "diamond", [Review, Refactor]),
                WorkflowNode::new("merge", AgentType::Test),
            ],

            edges: [
                ("split", "diamond"),
                ("diamond", "merge"),
            ],
        };

        assert_eq!(workflow.name, "diamond_refactor_workflow");
        assert_eq!(workflow.description, "菱形协作重构工作流");
        assert_eq!(workflow.nodes.len(), 3);

        // 验证 split 节点
        let split_node = &workflow.nodes[0];
        assert_eq!(split_node.id, "split");
        assert_eq!(split_node.agent_type, AgentType::Explore);

        // 验证 diamond 节点
        let diamond_node = &workflow.nodes[1];
        assert_eq!(diamond_node.id, "diamond");
        assert_eq!(diamond_node.agent_type, AgentType::Diamond);

        // 验证 agents 参数
        let agents = diamond_node.config.custom_params.get("agents")
            .and_then(|v| v.as_array())
            .expect("应该包含 agents 数组");
        assert_eq!(agents.len(), 2);
        assert_eq!(agents[0].as_str(), Some("review"));
        assert_eq!(agents[1].as_str(), Some("refactor"));

        // 验证 merge 节点
        let merge_node = &workflow.nodes[2];
        assert_eq!(merge_node.id, "merge");
        assert_eq!(merge_node.agent_type, AgentType::Test);

        // 验证边
        assert_eq!(workflow.edges.len(), 2);
        assert_eq!(workflow.edges[0].from, "split");
        assert_eq!(workflow.edges[0].to, "diamond");
        assert_eq!(workflow.edges[1].from, "diamond");
        assert_eq!(workflow.edges[1].to, "merge");
    }

    /// 测试 KnowledgeChain 协作模式工作流
    #[test]
    fn test_knowledge_chain_workflow_creation() {
        let workflow = workflow! {
            name: "knowledge_chain_workflow",
            description: "知识共享链协作工作流",

            nodes: [
                WorkflowNode::new("explore", AgentType::Explore),
                collab_node!(KnowledgeChain, "chain", [Review, Refactor, Test]),
            ],

            edges: [
                ("explore", "chain"),
            ],
        };

        assert_eq!(workflow.name, "knowledge_chain_workflow");
        assert_eq!(workflow.description, "知识共享链协作工作流");
        assert_eq!(workflow.nodes.len(), 2);

        // 验证 explore 节点
        let explore_node = &workflow.nodes[0];
        assert_eq!(explore_node.id, "explore");
        assert_eq!(explore_node.agent_type, AgentType::Explore);

        // 验证 chain 节点
        let chain_node = &workflow.nodes[1];
        assert_eq!(chain_node.id, "chain");
        assert_eq!(chain_node.agent_type, AgentType::KnowledgeChain);

        // 验证 agents 参数
        let agents = chain_node.config.custom_params.get("agents")
            .and_then(|v| v.as_array())
            .expect("应该包含 agents 数组");
        assert_eq!(agents.len(), 3);
        assert_eq!(agents[0].as_str(), Some("review"));
        assert_eq!(agents[1].as_str(), Some("refactor"));
        assert_eq!(agents[2].as_str(), Some("test"));

        // 验证边
        assert_eq!(workflow.edges.len(), 1);
        assert_eq!(workflow.edges[0].from, "explore");
        assert_eq!(workflow.edges[0].to, "chain");
    }

    /// 测试混合工作流（普通节点 + 协作节点）
    #[test]
    fn test_mixed_workflow() {
        let workflow = workflow! {
            name: "mixed_collaboration_workflow",
            description: "混合协作工作流",

            nodes: [
                WorkflowNode::new("start", AgentType::Explore),
                collab_node!(Parallel, "parallel_step", [Review, Test]),
                WorkflowNode::new("end", AgentType::Doc),
            ],

            edges: [
                ("start", "parallel_step"),
                ("parallel_step", "end"),
            ],
        };

        assert_eq!(workflow.name, "mixed_collaboration_workflow");
        assert_eq!(workflow.nodes.len(), 3);

        // 验证节点类型
        assert_eq!(workflow.nodes[0].agent_type, AgentType::Explore);
        assert_eq!(workflow.nodes[1].agent_type, AgentType::Parallel);
        assert_eq!(workflow.nodes[2].agent_type, AgentType::Doc);
    }

    /// 测试协作节点的 agents 参数正确性
    #[test]
    fn test_collab_node_agents_parameter() {
        // 测试单个 agent
        let single_diamond = collab_node!(Diamond, "single", [Review]);
        let agents = single_diamond.config.custom_params.get("agents")
            .and_then(|v| v.as_array())
            .expect("应该包含 agents 数组");
        assert_eq!(agents.len(), 1);
        assert_eq!(agents[0].as_str(), Some("review"));

        // 测试多个 agents
        let multi_chain = collab_node!(KnowledgeChain, "multi", [Review, Refactor, Test, Doc]);
        let agents = multi_chain.config.custom_params.get("agents")
            .and_then(|v| v.as_array())
            .expect("应该包含 agents 数组");
        assert_eq!(agents.len(), 4);
        assert_eq!(agents[0].as_str(), Some("review"));
        assert_eq!(agents[1].as_str(), Some("refactor"));
        assert_eq!(agents[2].as_str(), Some("test"));
        assert_eq!(agents[3].as_str(), Some("doc"));
    }

    /// 测试协作节点的 AgentType 正确性
    #[test]
    fn test_collab_node_agent_types() {
        let parallel = collab_node!(Parallel, "p", [Review]);
        assert_eq!(parallel.agent_type, AgentType::Parallel);

        let diamond = collab_node!(Diamond, "d", [Review]);
        assert_eq!(diamond.agent_type, AgentType::Diamond);

        let chain = collab_node!(KnowledgeChain, "k", [Review]);
        assert_eq!(chain.agent_type, AgentType::KnowledgeChain);
    }

    /// 测试复杂协作工作流（多个协作节点）
    #[test]
    fn test_complex_collaboration_workflow() {
        let workflow = workflow! {
            name: "complex_collaboration",
            description: "包含多个协作阶段的复杂工作流",

            nodes: [
                WorkflowNode::new("explore", AgentType::Explore),
                collab_node!(Parallel, "parallel_1", [Review, Test]),
                collab_node!(Diamond, "diamond", [Refactor, Doc]),
                collab_node!(KnowledgeChain, "chain", [Review, Test]),
            ],

            edges: [
                ("explore", "parallel_1"),
                ("parallel_1", "diamond"),
                ("diamond", "chain"),
            ],
        };

        assert_eq!(workflow.nodes.len(), 4);
        assert_eq!(workflow.edges.len(), 3);

        // 验证所有协作节点
        assert_eq!(workflow.nodes[1].agent_type, AgentType::Parallel);
        assert_eq!(workflow.nodes[2].agent_type, AgentType::Diamond);
        assert_eq!(workflow.nodes[3].agent_type, AgentType::KnowledgeChain);
    }

    /// 测试工作流边的条件（支持协作节点）
    #[test]
    fn test_collaboration_workflow_with_conditions() {
        let workflow = workflow! {
            name: "conditional_collaboration",
            description: "带条件的协作工作流",

            nodes: [
                WorkflowNode::new("explore", AgentType::Explore),
                collab_node!(Parallel, "parallel", [Review, Test]),
            ],

            edges: [
                ("explore", "parallel", "$.result.success == true"),
            ],
        };

        assert_eq!(workflow.edges.len(), 1);
        assert!(workflow.edges[0].condition.is_some());
        let condition = workflow.edges[0].condition.as_ref().unwrap();
        assert!(condition.contains("success"));
    }

    /// 测试协作工具的 schema 可用性
    #[test]
    fn test_collaboration_tools_schemas() {
        // 测试 aggregate_results schema
        let aggregate_tool = AggregateResultsTool;
        let aggregate_schema = aggregate_tool.schema();
        assert_eq!(aggregate_schema["type"], "object");
        assert!(aggregate_schema["properties"]["results"].is_object());
        assert!(aggregate_schema["properties"]["strategy"].is_object());

        // 测试 share_knowledge schema
        let share_tool = ShareKnowledgeTool;
        let share_schema = share_tool.schema();
        assert_eq!(share_schema["type"], "object");
        assert!(share_schema["properties"]["from_agent"].is_object());
        assert!(share_schema["properties"]["to_agent"].is_object());
        assert!(share_schema["properties"]["knowledge"].is_object());

        // 测试 monitor_progress schema
        let monitor_tool = MonitorProgressTool;
        let monitor_schema = monitor_tool.schema();
        assert_eq!(monitor_schema["type"], "object");
        assert!(monitor_schema["properties"]["workflow_id"].is_object());
        assert!(monitor_schema["properties"]["action"].is_object());
    }

    /// 测试协作工具的执行（模拟）
    #[test]
    fn test_collaboration_tools_execution() {
        use crate::harness::tool::ToolError;

        // 测试 share_knowledge 执行
        let share_tool = ShareKnowledgeTool;
        let share_args = json!({
            "from_agent": "explore_agent",
            "to_agent": "review_agent",
            "knowledge": "认证模块位于 src/auth/ 目录"
        });
        let share_result = share_tool.execute_tool(&share_args);
        assert!(share_result.is_ok());
        assert!(share_result.unwrap().contains("知识已共享"));

        // 测试 aggregate_results 执行（merge 策略）
        let aggregate_tool = AggregateResultsTool;
        let aggregate_args = json!({
            "results": ["结果1", "结果2"],
            "strategy": "merge"
        });
        let aggregate_result = aggregate_tool.execute_tool(&aggregate_args);
        assert!(aggregate_result.is_ok());
        assert!(aggregate_result.unwrap().contains("结果 1"));

        // 测试 monitor_progress 执行（status 操作）
        let monitor_tool = MonitorProgressTool;
        let monitor_args = json!({
            "workflow_id": "test-workflow-123",
            "action": "status"
        });
        let monitor_result = monitor_tool.execute_tool(&monitor_args);
        assert!(monitor_result.is_ok());
        assert!(monitor_result.unwrap().contains("test-workflow-123"));
    }
}
