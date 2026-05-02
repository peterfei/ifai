//! 多智能体协作系统集成测试
//!
//! 验证工作流引擎的完整功能

use super::super::workflow::{
    AgentType, NodeStatus, RunnerConfig, Workflow, WorkflowEdge, WorkflowNode, WorkflowParser,
    WorkflowRunner, WorkflowScheduler, WorkflowStatus, WorkflowValidator,
};

/// 创建完整的工作流示例
fn create_complete_workflow() -> Workflow {
    let mut workflow = Workflow::new("code-review-workflow", "代码审查工作流")
        .with_description("自动代码审查和重构建议");

    // 添加节点
    workflow
        .add_node(WorkflowNode::new("explore", AgentType::Explore).with_label("探索代码结构"))
        .add_node(WorkflowNode::new("analyze", AgentType::Review).with_label("代码质量分析"))
        .add_node(WorkflowNode::new("refactor", AgentType::Refactor).with_label("生成重构建议"))
        .add_node(WorkflowNode::new("test", AgentType::Test).with_label("生成测试用例"))
        .add_node(WorkflowNode::new("document", AgentType::Doc).with_label("生成文档"));

    // 添加边（依赖关系）
    workflow
        .add_edge(WorkflowEdge::new("explore", "analyze"))
        .add_edge(WorkflowEdge::new("analyze", "refactor"))
        .add_edge(WorkflowEdge::new("analyze", "test"))
        .add_edge(WorkflowEdge::new("refactor", "document"))
        .add_edge(WorkflowEdge::new("test", "document"));

    // 设置工作流变量
    let mut variables = std::collections::HashMap::new();
    variables.insert("project_path".to_string(), "/src".to_string());
    variables.insert("severity_threshold".to_string(), "warning".to_string());
    workflow.variables = variables;

    workflow
}

#[cfg(test)]
mod integration_tests {
    use super::*;

    #[test]
    fn test_complete_workflow_creation_and_validation() {
        let workflow = create_complete_workflow();

        // 验证工作流
        let result = workflow.validate();
        assert!(result.is_ok(), "工作流验证应该成功");

        // 检查节点数量
        assert_eq!(workflow.nodes.len(), 5);

        // 检查边数量
        assert_eq!(workflow.edges.len(), 5);

        // 检查变量
        assert_eq!(workflow.variables.len(), 2);
    }

    #[test]
    fn test_workflow_yaml_parsing() {
        let yaml_content = r#"
id: "test-workflow"
name: "测试工作流"
description: "这是一个测试工作流"

variables:
  target: "src"
  timeout: "300"

nodes:
  - id: "explore"
    agentType: "explore"
    label: "探索代码"
    config:
      target: "${target}"

  - id: "review"
    agentType: "review"
    label: "代码审查"
    config:
      severity_threshold: 2

edges:
  - from: "explore"
    to: "review"
    condition: "${output} != \"empty\""
"#;

        // 解析 YAML
        let workflow = WorkflowParser::from_str(yaml_content);
        assert!(workflow.is_ok(), "YAML 解析应该成功");

        let workflow = workflow.unwrap();

        // 验证
        let result = workflow.validate();
        assert!(result.is_ok(), "解析的工作流应该有效");

        // 检查节点
        assert_eq!(workflow.nodes.len(), 2);

        // 检查变量
        assert_eq!(workflow.variables.get("target"), Some(&"src".to_string()));
    }

    #[test]
    fn test_workflow_scheduling() {
        let workflow = create_complete_workflow();

        // 调度工作流
        let schedule = WorkflowScheduler::schedule(&workflow);
        assert!(schedule.is_ok(), "调度应该成功");

        let schedule = schedule.unwrap();

        // 验证执行顺序
        assert_eq!(schedule.execution_order.len(), 5);
        assert_eq!(schedule.execution_order[0], "explore");
        assert_eq!(schedule.execution_order[4], "document");

        // 验证并行组
        // analyze -> (refactor, test) 是并行的
        let refactor_group = schedule.get_node_group("refactor");
        let test_group = schedule.get_node_group("test");
        assert_eq!(refactor_group, test_group);

        // verify 在 refactor 和 test 之后
        let refactor_idx = schedule.get_node_index("refactor").unwrap();
        let test_idx = schedule.get_node_index("test").unwrap();
        let document_idx = schedule.get_node_index("document").unwrap();

        assert!(refactor_idx < document_idx);
        assert!(test_idx < document_idx);
    }

    #[tokio::test]
    #[ignore = "需要 AI API 配置，集成测试应手动运行"]
    async fn test_workflow_execution() {
        let workflow = create_complete_workflow();

        // 创建运行器
        let runner = WorkflowRunner::with_default_config(workflow);
        assert!(runner.is_ok(), "运行器创建应该成功");

        let runner = runner.unwrap();

        // 执行工作流
        let result = runner.run().await;
        assert!(result.is_ok(), "执行应该成功");

        let result = result.unwrap();

        // 验证结果
        assert_eq!(result.status, WorkflowStatus::Completed);
        assert_eq!(result.node_results.len(), 5);
        assert!(result.is_all_success());

        // 检查每个节点的结果
        for (node_id, node_result) in &result.node_results {
            assert_eq!(node_result.status, NodeStatus::Completed);
            assert!(node_result.output.is_some());
            println!("节点 {}: {:?}", node_id, node_result.output);
        }
    }

    #[test]
    fn test_parallel_workflow() {
        // 菱形工作流：explore -> (analyze, review) -> merge
        let mut workflow = Workflow::new("parallel-test", "并行测试");
        workflow
            .add_node(WorkflowNode::new("explore", AgentType::Explore))
            .add_node(WorkflowNode::new("analyze", AgentType::Review))
            .add_node(WorkflowNode::new("review", AgentType::Refactor))
            .add_node(WorkflowNode::new("merge", AgentType::Doc))
            .add_edge(WorkflowEdge::new("explore", "analyze"))
            .add_edge(WorkflowEdge::new("explore", "review"))
            .add_edge(WorkflowEdge::new("analyze", "merge"))
            .add_edge(WorkflowEdge::new("review", "merge"));

        // 调度
        let schedule = WorkflowScheduler::schedule(&workflow).unwrap();

        // analyze 和 review 应该可以并行
        assert!(schedule.can_execute_in_parallel("analyze", "review"));

        // explore 必须在 analyze 和 review 之前
        let explore_idx = schedule.get_node_index("explore").unwrap();
        let analyze_idx = schedule.get_node_index("analyze").unwrap();
        let review_idx = schedule.get_node_index("review").unwrap();
        assert!(explore_idx < analyze_idx);
        assert!(explore_idx < review_idx);
    }

    #[test]
    fn test_diamond_workflow() {
        // 菱形图：a -> (b, c) -> d
        let mut workflow = Workflow::new("diamond", "菱形图");
        workflow
            .add_node(WorkflowNode::new("a", AgentType::Explore))
            .add_node(WorkflowNode::new("b", AgentType::Review))
            .add_node(WorkflowNode::new("c", AgentType::Refactor))
            .add_node(WorkflowNode::new("d", AgentType::Test))
            .add_edge(WorkflowEdge::new("a", "b"))
            .add_edge(WorkflowEdge::new("a", "c"))
            .add_edge(WorkflowEdge::new("b", "d"))
            .add_edge(WorkflowEdge::new("c", "d"));

        // 验证
        workflow.validate().unwrap();

        // 调度
        let schedule = WorkflowScheduler::schedule(&workflow).unwrap();

        // b 和 c 应该在同一组（并行）
        let group_b = schedule.get_node_group("b");
        let group_c = schedule.get_node_group("c");
        assert_eq!(group_b, group_c);

        // a 必须在 b 和 c 之前
        let pos_a = schedule.get_node_index("a").unwrap();
        let pos_b = schedule.get_node_index("b").unwrap();
        let pos_c = schedule.get_node_index("c").unwrap();
        assert!(pos_a < pos_b);
        assert!(pos_a < pos_c);

        // b 和 c 必须在 d 之前
        let pos_d = schedule.get_node_index("d").unwrap();
        assert!(pos_b < pos_d);
        assert!(pos_c < pos_d);
    }

    #[test]
    fn test_workflow_with_cycle_detection() {
        // 有环的工作流
        let mut workflow = Workflow::new("cycle-test", "循环检测");
        workflow
            .add_node(WorkflowNode::new("a", AgentType::Explore))
            .add_node(WorkflowNode::new("b", AgentType::Review))
            .add_node(WorkflowNode::new("c", AgentType::Refactor))
            .add_edge(WorkflowEdge::new("a", "b"))
            .add_edge(WorkflowEdge::new("b", "c"))
            .add_edge(WorkflowEdge::new("c", "a")); // 形成环！

        // 验证应该失败
        let result = workflow.validate();
        assert!(result.is_err(), "有环的工作流应该验证失败");
    }

    #[tokio::test]
    #[ignore = "需要 AI API 配置，集成测试应手动运行"]
    async fn test_runner_with_custom_config() {
        let workflow = create_complete_workflow();

        // 自定义配置
        let config = RunnerConfig {
            max_concurrent_nodes: 10,
            node_timeout_secs: 600,
            max_retries: 5,
            fail_fast: true,
        };

        let runner = WorkflowRunner::new(workflow, config);
        assert!(runner.is_ok());

        let runner = runner.unwrap();
        let result = runner.run().await;

        assert!(result.is_ok());
        assert_eq!(result.unwrap().status, WorkflowStatus::Completed);
    }

    #[tokio::test]
    async fn test_runner_pause_cancel() {
        let workflow = create_complete_workflow();
        let runner = WorkflowRunner::with_default_config(workflow).unwrap();

        // 测试暂停
        let pause_result = runner.pause().await;
        assert!(pause_result.is_ok());

        // 恢复
        let resume_result = runner.resume().await;
        assert!(resume_result.is_ok());

        // 取消
        let cancel_result = runner.cancel().await;
        assert!(cancel_result.is_ok());

        // 验证状态
        assert_eq!(runner.get_status().await, WorkflowStatus::Cancelled);
    }

    #[test]
    fn test_all_agent_types() {
        // 测试所有智能体类型
        let agent_types = vec![
            (AgentType::Explore, "explore"),
            (AgentType::Review, "review"),
            (AgentType::Refactor, "refactor"),
            (AgentType::Test, "test"),
            (AgentType::Doc, "doc"),
            (AgentType::TaskBreakdown, "task_breakdown"),
            (AgentType::ProposalGenerator, "proposal_generator"),
            (AgentType::GeneralPurpose, "general_purpose"),
        ];

        for (agent_type, expected_str) in agent_types {
            assert_eq!(agent_type.as_str(), expected_str);

            // 创建包含该类型的节点
            let node = WorkflowNode::new(format!("node_{}", expected_str), agent_type.clone());
            assert_eq!(node.agent_type, agent_type);
        }
    }
}
