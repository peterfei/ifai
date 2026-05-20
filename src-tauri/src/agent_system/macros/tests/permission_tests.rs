// Agent 权限检查测试
//
// 测试 Agent 互调用时的权限验证机制

#[cfg(test)]
mod permission_tests {
    use crate::agent_system::macros::{
        AgentRegistry, CallContext, AgentCallError,
        PermissionChecker, PermissionLevel,
        ConfigPermissionChecker, AllowAllPermissionChecker,
    };
    use crate::agent_system::workflow::types::AgentType;
    use serde_json::json;
    use std::sync::Arc;

    #[test]
    fn test_allow_all_checker_permits_all_agents() {
        // AllowAllPermissionChecker 应该允许所有 Agent 调用
        let registry = AgentRegistry::global();
        let ctx = CallContext::new(); // 默认使用 AllowAllPermissionChecker

        // 测试不同权限级别的 Agent
        let agents_to_test = vec![
            (AgentType::TaskBreakdown, "None permission"),
            (AgentType::Explore, "Read permission"),
            (AgentType::Refactor, "Write permission"),
        ];

        for (agent_type, description) in agents_to_test {
            let result = registry.call(agent_type, json!({}), &mut ctx.clone());
            assert!(
                result.is_ok(),
                "{} should be allowed with AllowAllPermissionChecker",
                description
            );
        }
    }

    #[test]
    fn test_config_checker_read_only() {
        // 测试只读权限配置
        let registry = AgentRegistry::global();
        let checker = Arc::new(ConfigPermissionChecker::new(PermissionLevel::WorkspaceRead));
        let mut ctx = CallContext::with_permission_checker(5, checker);

        // 只读 Agent 应该成功
        let read_only_agents = vec![
            AgentType::Explore,
            AgentType::Review,
            AgentType::Doc,
        ];

        for agent_type in &read_only_agents {
            let result = registry.call(agent_type.clone(), json!({}), &mut ctx);
            assert!(
                result.is_ok(),
                "{:?} should be allowed with Read permission",
                agent_type
            );
        }

        // 写入 Agent 应该失败
        let write_agents = vec![
            AgentType::Refactor,
            AgentType::Test,
            AgentType::GitCommit,
        ];

        for agent_type in &write_agents {
            let result = registry.call(agent_type.clone(), json!({}), &mut ctx);
            assert!(
                result.is_err(),
                "{:?} should be denied with Read permission",
                agent_type
            );

            match result.unwrap_err() {
                AgentCallError::PermissionDenied { required, current } => {
                    assert!(required.contains("Write"), "Required should be Write permission");
                    assert!(current.contains("Read"), "Current should be Read permission");
                }
                _ => panic!("Expected PermissionDenied error"),
            }
        }
    }

    #[test]
    fn test_config_checker_no_permission() {
        // 测试无权限配置
        let registry = AgentRegistry::global();
        let checker = Arc::new(ConfigPermissionChecker::new(PermissionLevel::None));
        let mut ctx = CallContext::with_permission_checker(5, checker);

        // 无权限 Agent 应该成功
        let result = registry.call(AgentType::TaskBreakdown, json!({}), &mut ctx);
        assert!(result.is_ok(), "TaskBreakdown should be allowed with No permission");

        // 读取 Agent 应该失败
        let result = registry.call(AgentType::Explore, json!({}), &mut ctx);
        assert!(result.is_err(), "Explore should be denied with No permission");
    }

    #[test]
    fn test_permission_check_in_call_chain() {
        // 测试权限检查在调用链中的作用
        let registry = AgentRegistry::global();

        // 创建一个只读权限的上下文
        let checker = Arc::new(ConfigPermissionChecker::new(PermissionLevel::WorkspaceRead));
        let mut ctx = CallContext::with_permission_checker(5, checker);

        // 第一次调用：只读 Agent（成功）
        let result1 = registry.call(AgentType::Review, json!({}), &mut ctx);
        assert!(result1.is_ok(), "First call (Review) should succeed");
        assert_eq!(ctx.depth(), 1);

        // 第二次调用：只读 Agent（成功）
        let result2 = registry.call(AgentType::Explore, json!({}), &mut ctx);
        assert!(result2.is_ok(), "Second call (Explore) should succeed");
        assert_eq!(ctx.depth(), 2);

        // 第三次调用：写入 Agent（失败）
        let result3 = registry.call(AgentType::Refactor, json!({}), &mut ctx);
        assert!(result3.is_err(), "Third call (Refactor) should fail due to permission");
    }

    #[test]
    fn test_agent_type_permission_mapping() {
        // 测试所有 Agent 类型的权限映射
        use PermissionLevel;

        // None 权限
        assert_eq!(AgentType::TaskBreakdown.required_permission(), PermissionLevel::None);
        assert_eq!(AgentType::ReAct.required_permission(), PermissionLevel::None);

        // Read 权限
        assert_eq!(AgentType::Explore.required_permission(), PermissionLevel::WorkspaceRead);
        assert_eq!(AgentType::Review.required_permission(), PermissionLevel::WorkspaceRead);
        assert_eq!(AgentType::Doc.required_permission(), PermissionLevel::WorkspaceRead);

        // Write 权限
        assert_eq!(AgentType::Refactor.required_permission(), PermissionLevel::WorkspaceWrite);
        assert_eq!(AgentType::Test.required_permission(), PermissionLevel::WorkspaceWrite);
        assert_eq!(AgentType::GitCommit.required_permission(), PermissionLevel::WorkspaceWrite);
        assert_eq!(AgentType::Debug.required_permission(), PermissionLevel::WorkspaceWrite);
    }

    #[test]
    fn test_custom_permission_checker() {
        // 测试自定义权限检查器

        // 创建一个只允许 Explore Agent 的检查器
        #[derive(Debug)]
        struct ExploreOnlyChecker;

        impl PermissionChecker for ExploreOnlyChecker {
            fn check_permission(&self, required: PermissionLevel) -> Result<(), crate::agent_system::macros::PermissionError> {
                use crate::agent_system::macros::PermissionError;
                // 只允许 None 和 Read 权限
                if required <= PermissionLevel::WorkspaceRead {
                    Ok(())
                } else {
                    Err(PermissionError::Insufficient {
                        required,
                        current: PermissionLevel::WorkspaceRead,
                    })
                }
            }

            fn current_level(&self) -> PermissionLevel {
                PermissionLevel::WorkspaceRead
            }
        }

        let registry = AgentRegistry::global();
        let checker = Arc::new(ExploreOnlyChecker);
        let mut ctx = CallContext::with_permission_checker(5, checker);

        // Explore 应该成功
        let result = registry.call(AgentType::Explore, json!({}), &mut ctx);
        assert!(result.is_ok(), "Explore should be allowed");

        // Refactor 应该失败
        let result = registry.call(AgentType::Refactor, json!({}), &mut ctx);
        assert!(result.is_err(), "Refactor should be denied");
    }
}
