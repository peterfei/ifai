// Workflow DSL 宏测试
//
// 采用 TDD 方法，先定义测试用例，再实现功能。

#[cfg(test)]
mod workflow_tests {
    use crate::agent_system::workflow::types::{Workflow, AgentType};
    // 宏通过 #[macro_export] 导出到 crate root
    use crate::workflow;

    #[test]
    fn test_workflow_macro_basic() {
        // 测试基础工作流宏展开
        workflow! {
            name: "test_workflow",
            description: "A basic test workflow",

            nodes: [
                Explore("scan"),
                Review("check"),
            ],

            edges: [
                ("scan", "check"),
            ],
        };

        // 如果能编译通过，说明宏展开成功
    }

    #[test]
    fn test_workflow_macro_with_condition() {
        // 测试带条件的工作流
        workflow! {
            name: "conditional_workflow",
            description: "Workflow with conditions",

            nodes: [
                Review("review"),
                Refactor("refactor"),
            ],

            edges: [
                ("review", "refactor", "$.severity > 5"),
            ],
        };
    }

    #[test]
    fn test_workflow_macro_complex() {
        // 测试复杂工作流（代码审查流程）
        workflow! {
            name: "code_review_pipeline",
            description: "完整的代码审查与修复流程",

            nodes: [
                Explore("scan"),
                Review("check"),
                Refactor("fix"),
                Test("verify"),
                GitCommit("commit"),
            ],

            edges: [
                ("scan", "check"),
                ("check", "fix", "$.severity > 5"),
                ("fix", "verify"),
                ("verify", "commit"),
            ],
        };
    }

    #[test]
    fn test_workflow_to_struct() {
        // 测试宏生成的 Workflow 结构体
        let workflow: Workflow = workflow! {
            name: "test",
            description: "Test workflow",

            nodes: [
                Explore("node1"),
                Review("node2"),
            ],

            edges: [
                ("node1", "node2"),
            ],
        };

        assert_eq!(workflow.name, "test");
        assert_eq!(workflow.description, "Test workflow");
        assert_eq!(workflow.nodes.len(), 2);
        assert_eq!(workflow.edges.len(), 1);

        // 验证节点
        assert_eq!(workflow.nodes[0].id, "node1");
        assert_eq!(workflow.nodes[0].agent_type, AgentType::Explore);
        assert_eq!(workflow.nodes[1].id, "node2");
        assert_eq!(workflow.nodes[1].agent_type, AgentType::Review);

        // 验证边
        assert_eq!(workflow.edges[0].from, "node1");
        assert_eq!(workflow.edges[0].to, "node2");
    }

    #[test]
    fn test_workflow_edge_condition() {
        // 测试边的条件表达式
        let workflow: Workflow = workflow! {
            name: "test",
            description: "Test",

            nodes: [
                Review("a"),
                Refactor("b"),
            ],

            edges: [
                ("a", "b", "$.severity > 5"),
            ],
        };

        assert_eq!(workflow.edges[0].condition, Some("$.severity > 5".to_string()));
    }

    #[test]
    fn test_workflow_chain_syntax() {
        // TODO: 链式语法暂不支持，使用显式 edges 定义
        let workflow: Workflow = workflow! {
            name: "chain_test",
            description: "Test chain syntax",

            nodes: [
                Explore("a"),
                Review("b"),
                Refactor("c"),
            ],

            edges: [
                ("a", "b"),
                ("b", "c"),
            ],
        };

        assert_eq!(workflow.nodes.len(), 3);
        assert_eq!(workflow.edges.len(), 2);
        assert_eq!(workflow.edges[0].from, "a");
        assert_eq!(workflow.edges[0].to, "b");
        assert_eq!(workflow.edges[1].from, "b");
        assert_eq!(workflow.edges[1].to, "c");
    }

    #[test]
    fn test_workflow_serialization() {
        // 测试工作流序列化
        let workflow: Workflow = workflow! {
            name: "serialize_test",
            description: "Test serialization",

            nodes: [
                Explore("node1"),
            ],

            edges: [],
        };

        // 序列化为 JSON
        let json_str = serde_json::to_string(&workflow).unwrap();
        let json_value: serde_json::Value = serde_json::from_str(&json_str).unwrap();

        assert_eq!(json_value["name"], "serialize_test");
        assert_eq!(json_value["nodes"].as_array().unwrap().len(), 1);
    }
}
