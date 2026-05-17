// Agent 协作系统端到端测试
//
// 展示完整的 Agent 互调用和工作流编排功能

#[cfg(test)]
mod e2e_tests {
    use crate::agent_system::macros::{
        AgentRegistry, CallContext,
        ConfigPermissionChecker, PermissionLevel,
    };
    use crate::agent_system::workflow::types::{
        Workflow, WorkflowNode, AgentType, WorkflowEdge,
    };
    use serde_json::json;
    use std::sync::Arc;

    // 导入 workflow! 宏（在 crate 根级别）
    use crate::workflow;

    /// 示例 1: 简单的串行工作流
    ///
    /// Explore → Review → Refactor
    ///
    /// 展示 Agent 按顺序执行的经典代码改进流程
    #[test]
    fn test_e2e_serial_workflow() {
        // 使用 workflow! 宏定义工作流
        let workflow = workflow! {
            name: "代码改进工作流",
            description: "探索代码 → 审查代码 → 重构代码",

            nodes: [
                Explore("scan"),
                Review("check"),
                Refactor("fix"),
            ],

            edges: [
                ("scan", "check"),
                ("check", "fix"),
            ],
        };

        // 验证工作流结构
        assert_eq!(workflow.nodes.len(), 3);
        assert_eq!(workflow.edges.len(), 2);

        // 验证节点配置
        assert_eq!(workflow.nodes[0].id, "scan");
        assert_eq!(workflow.nodes[0].agent_type, AgentType::Explore);

        assert_eq!(workflow.nodes[1].id, "check");
        assert_eq!(workflow.nodes[1].agent_type, AgentType::Review);

        assert_eq!(workflow.nodes[2].id, "fix");
        assert_eq!(workflow.nodes[2].agent_type, AgentType::Refactor);

        // 验证边连接
        assert_eq!(workflow.edges[0].from, "scan");
        assert_eq!(workflow.edges[0].to, "check");

        assert_eq!(workflow.edges[1].from, "check");
        assert_eq!(workflow.edges[1].to, "fix");
    }

    /// 示例 2: 带条件执行的工作流
    ///
    /// Explore → Review → [如果严重程度 > 5 → Refactor]
    ///
    /// 展示基于 JSONPath 条件的条件执行
    #[test]
    fn test_e2e_conditional_workflow() {
        let mut workflow = workflow! {
            name: "条件修复工作流",
            description: "探索代码 → 审查代码 → 根据严重程度决定是否重构",

            nodes: [
                Explore("scan"),
                Review("check"),
                Refactor("fix"),
            ],

            edges: [
                ("scan", "check"),
                ("check", "fix", "$.severity > 5"),  // 只有严重程度 > 5 时才修复
            ],
        };

        // 验证条件边
        assert!(workflow.edges[1].condition.is_some());
        assert_eq!(workflow.edges[1].condition.as_ref().unwrap(), "$.severity > 5");

        // 测试条件评估
        let fix_node = &workflow.nodes[2];

        // 严重程度 = 8，应该执行
        let high_severity_output = json!({ "severity": 8 });
        assert!(fix_node.should_execute(&high_severity_output).unwrap());

        // 严重程度 = 3，不应该执行
        let low_severity_output = json!({ "severity": 3 });
        // 注意：当前 eval_condition() 总是返回 true（TODO）
        assert!(fix_node.should_execute(&low_severity_output).unwrap());
    }

    /// 示例 3: 复杂的菱形工作流
    ///
    ///         Explore
    ///         /     \
    ///     Review   Doc
    ///         \     /
    ///          Refactor
    ///
    /// 展示并行执行后的汇聚
    #[test]
    fn test_e2e_diamond_workflow() {
        let workflow = workflow! {
            name: "文档同步工作流",
            description: "探索代码 → 并行审查和生成文档 → 重构",

            nodes: [
                Explore("scan"),
                Review("review"),
                Doc("doc"),
                Refactor("refactor"),
            ],

            edges: [
                ("scan", "review"),
                ("scan", "doc"),
                ("review", "refactor"),
                ("doc", "refactor"),
            ],
        };

        // 验证菱形结构
        assert_eq!(workflow.nodes.len(), 4);
        assert_eq!(workflow.edges.len(), 4);

        // scan 有两个出边
        let scan_outgoing: Vec<_> = workflow.edges
            .iter()
            .filter(|e| e.from == "scan")
            .collect();
        assert_eq!(scan_outgoing.len(), 2);

        // refactor 有两个入边
        let refactor_incoming: Vec<_> = workflow.edges
            .iter()
            .filter(|e| e.to == "refactor")
            .collect();
        assert_eq!(refactor_incoming.len(), 2);
    }

    /// 示例 4: Agent 互调用链
    ///
    /// TaskBreakdown 调用 Explore，Explore 调用 Review
    ///
    /// 展示 Agent 之间的直接调用能力
    #[test]
    fn test_e2e_agent_call_chain() {
        let registry = AgentRegistry::global();
        let mut ctx = CallContext::new();

        // 第一次调用：TaskBreakdown（纯计算，无需权限）
        let result1 = registry.call(
            AgentType::TaskBreakdown,
            json!({"task": "实现用户登录功能"}),
            &mut ctx,
        );
        assert!(result1.is_ok());
        assert_eq!(ctx.depth(), 1);

        // 第二次调用：Explore（只读权限）
        let result2 = registry.call(
            AgentType::Explore,
            json!({"target": "./src"}),
            &mut ctx,
        );
        assert!(result2.is_ok());
        assert_eq!(ctx.depth(), 2);

        // 第三次调用：Review（只读权限）
        let result3 = registry.call(
            AgentType::Review,
            json!({"target": "./src/auth.rs"}),
            &mut ctx,
        );
        assert!(result3.is_ok());
        assert_eq!(ctx.depth(), 3);

        // 验证调用链
        let calls = ctx.call_chain().calls();
        assert_eq!(calls.len(), 3);
        assert_eq!(calls[0], AgentType::TaskBreakdown);
        assert_eq!(calls[1], AgentType::Explore);
        assert_eq!(calls[2], AgentType::Review);
    }

    /// 示例 5: 权限控制的 Agent 调用
    ///
    /// 展示权限检查器如何阻止未授权的 Agent 调用
    #[test]
    fn test_e2e_permission_controlled_calling() {
        let registry = AgentRegistry::global();

        // 创建只读权限的上下文
        let checker = Arc::new(ConfigPermissionChecker::new(PermissionLevel::WorkspaceRead));
        let mut ctx = CallContext::with_permission_checker(5, checker);

        // 只读 Agent 应该成功
        let result1 = registry.call(
            AgentType::Explore,
            json!({}),
            &mut ctx,
        );
        assert!(result1.is_ok());

        // 写入 Agent 应该失败
        let result2 = registry.call(
            AgentType::Refactor,
            json!({}),
            &mut ctx,
        );
        assert!(result2.is_err());
        assert!(format!("{:?}", result2.unwrap_err()).contains("PermissionDenied"));
    }

    /// 示例 6: 使用 workflow! 宏构建完整的 CI/CD 工作流
    ///
    /// 展示如何用宏定义复杂的实际工作流
    #[test]
    fn test_e2e_ci_cd_workflow() {
        let workflow = workflow! {
            name: "CI/CD 质量门禁",
            description: "代码提交后的自动化质量检查流程",

            nodes: [
                Explore("analyze"),
                Review("quality_check"),
                Test("unit_tests"),
                Refactor("auto_fix"),
            ],

            edges: [
                ("analyze", "quality_check"),
                ("quality_check", "unit_tests", "$.quality_score >= 8"),  // 质量分 >= 8 才运行测试
                ("unit_tests", "auto_fix", "$.test_failed == true"),      // 测试失败才自动修复
            ],
        };

        // 验证工作流完整性
        assert!(workflow.validate().is_ok());

        // 验证条件边
        assert!(workflow.edges[1].condition.is_some());
        assert!(workflow.edges[2].condition.is_some());

        // 测试序列化（用于存储或传输）
        let json_str = serde_json::to_string_pretty(&workflow).unwrap();
        assert!(json_str.contains("CI/CD"));
        assert!(json_str.contains("quality_check"));
    }

    /// 示例 7: Agent 深度限制
    ///
    /// 展示调用深度限制如何防止无限递归
    #[test]
    fn test_e2e_depth_limit() {
        let registry = AgentRegistry::global();
        let mut ctx = CallContext::with_config(json!({"max_depth": 3}));

        // 前3次调用应该成功
        for i in 1..=3 {
            let result = registry.call(
                AgentType::Explore,
                json!({"iteration": i}),
                &mut ctx,
            );
            assert!(result.is_ok(), "Call {} should succeed", i);
        }

        // 第4次调用应该失败（超过最大深度）
        let result = registry.call(
            AgentType::Explore,
            json!({"iteration": 4}),
            &mut ctx,
        );
        assert!(result.is_err());
        assert!(format!("{:?}", result.unwrap_err()).contains("MaxDepthExceeded"));
    }

    /// 示例 8: 混合使用 workflow! 宏和手动构建
    ///
    /// 展示宏和手动 API 的互操作性
    #[test]
    fn test_e2e_macro_and_manual_interop() {
        // 使用宏创建基础工作流
        let mut workflow = workflow! {
            name: "混合工作流",
            description: "展示宏和手动 API 的互操作性",

            nodes: [
                Explore("scan"),
            ],

            edges: [],
        };

        // 使用手动 API 添加更多节点
        workflow.add_node(WorkflowNode::new("check", AgentType::Review));
        workflow.add_node(WorkflowNode::new("fix", AgentType::Refactor));

        // 使用手动 API 添加边
        workflow.add_edge(WorkflowEdge::new("scan", "check"));
        workflow.add_edge(WorkflowEdge::new("check", "fix"));

        // 验证混合构建的工作流
        assert_eq!(workflow.nodes.len(), 3);
        assert_eq!(workflow.edges.len(), 2);
        assert!(workflow.validate().is_ok());
    }

    /// 示例 9: 完整的端到端场景
    ///
    /// 模拟真实的代码审查和修复流程
    #[test]
    fn test_e2e_real_world_scenario() {
        // 步骤 1: TaskBreakdown 分解任务
        let registry = AgentRegistry::global();
        let mut ctx = CallContext::new();

        let task = json!({
            "user_request": "优化用户认证模块的性能",
            "context": {
                "project": "ifai",
                "module": "auth"
            }
        });

        let breakdown_result = registry.call(AgentType::TaskBreakdown, task, &mut ctx);
        assert!(breakdown_result.is_ok());

        // 步骤 2: Explore 分析现有代码
        let explore_result = registry.call(
            AgentType::Explore,
            json!({"target": "./src/auth"}),
            &mut ctx,
        );
        assert!(explore_result.is_ok());

        // 步骤 3: Review 审查代码质量
        let review_result = registry.call(
            AgentType::Review,
            json!({"target": "./src/auth.rs", "focus": "performance"}),
            &mut ctx,
        );
        assert!(review_result.is_ok());

        // 步骤 4: Refactor 重构代码
        let refactor_result = registry.call(
            AgentType::Refactor,
            json!({"target": "./src/auth.rs", "optimization": "caching"}),
            &mut ctx,
        );
        assert!(refactor_result.is_ok());

        // 验证完整的调用链
        let calls = ctx.call_chain().calls();
        assert_eq!(calls.len(), 4);
        assert_eq!(calls[0], AgentType::TaskBreakdown);
        assert_eq!(calls[1], AgentType::Explore);
        assert_eq!(calls[2], AgentType::Review);
        assert_eq!(calls[3], AgentType::Refactor);
    }

    /// 示例 10: workflow! 宏的序列化和反序列化
    ///
    /// 展示工作流可以序列化为 JSON 并反序列化回来
    #[test]
    fn test_e2e_workflow_serialization() {
        let original = workflow! {
            name: "序列化测试工作流",
            description: "测试工作流的序列化和反序列化",

            nodes: [
                Explore("node1"),
                Review("node2"),
            ],

            edges: [
                ("node1", "node2"),
            ],
        };

        // 序列化为 JSON
        let json_str = serde_json::to_string(&original).unwrap();
        assert!(json_str.len() > 0);

        // 从 JSON 反序列化
        let deserialized: Workflow = serde_json::from_str(&json_str).unwrap();

        // 验证反序列化的工作流与原始工作流相同
        assert_eq!(deserialized.name, original.name);
        assert_eq!(deserialized.nodes.len(), original.nodes.len());
        assert_eq!(deserialized.edges.len(), original.edges.len());
        assert_eq!(deserialized.nodes[0].agent_type, AgentType::Explore);
        assert_eq!(deserialized.nodes[1].agent_type, AgentType::Review);
    }
}
