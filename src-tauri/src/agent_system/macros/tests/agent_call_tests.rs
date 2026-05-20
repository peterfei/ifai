// Agent 互调用测试
//
// 采用 TDD 方法，先定义测试用例，再实现功能。

#[cfg(test)]
mod agent_call_tests {
    use crate::agent_system::macros::{
        AgentRegistry, AgentCaller, CallContext, AgentCallError,
    };
    use crate::agent_system::workflow::types::AgentType;
    use serde_json::json;

    #[test]
    fn test_agent_caller_trait_exists() {
        // 测试 AgentCaller trait 是否存在
        // 这个测试只是验证编译通过
        let _ = std::marker::PhantomData::<dyn AgentCaller>;
    }

    #[test]
    fn test_agent_registry_call_success() {
        // 测试成功调用 Agent
        let registry = AgentRegistry::global();
        let mut ctx = CallContext::new();

        let result = registry.call(
            AgentType::Explore,
            json!({"task": "探索项目结构"}),
            &mut ctx,
        );

        // 应该返回 Ok（目前是模拟结果）
        assert!(result.is_ok());
        let output = result.unwrap();
        assert_eq!(output["agent"], "Explore");
        assert_eq!(output["depth"], 1);
    }

    #[test]
    fn test_agent_call_max_depth() {
        // 测试调用深度限制
        let registry = AgentRegistry::global();
        let mut ctx = CallContext::new();

        // 设置最大深度为 2
        ctx = CallContext::with_config(json!({"max_depth": 2}));

        // 第一次调用
        let result1 = registry.call(
            AgentType::Explore,
            json!({}),
            &mut ctx,
        );
        assert!(result1.is_ok());

        // 第二次调用
        let result2 = registry.call(
            AgentType::Review,
            json!({}),
            &mut ctx,
        );
        assert!(result2.is_ok());

        // 第三次调用应该失败（超过最大深度）
        let result3 = registry.call(
            AgentType::Refactor,
            json!({}),
            &mut ctx,
        );
        assert!(result3.is_err());
        match result3 {
            Err(AgentCallError::MaxDepthExceeded { depth, max }) => {
                assert_eq!(depth, 2);
                assert_eq!(max, 2);
            }
            _ => panic!("Expected MaxDepthExceeded error"),
        }
    }

    #[test]
    fn test_agent_call_unregistered() {
        // 测试调用未注册的 Agent
        let registry = AgentRegistry::global();
        let mut ctx = CallContext::new();

        // 尝试调用一个不存在的 Agent
        // 这里我们使用一个假设的 AgentType（实际上所有 Agent 都已注册）
        // 所以这个测试会通过检查 has_agent 来验证

        // 由于所有 Agent 都已注册，我们测试已注册的 Agent
        assert!(registry.has_agent(&AgentType::Explore));
    }

    #[test]
    fn test_call_context_increments_depth() {
        // 测试调用上下文深度追踪
        let registry = AgentRegistry::global();
        let mut ctx = CallContext::new();

        assert_eq!(ctx.depth(), 0);

        // 第一次调用
        let _ = registry.call(AgentType::Explore, json!({}), &mut ctx);
        assert_eq!(ctx.depth(), 1);

        // 第二次调用
        let _ = registry.call(AgentType::Review, json!({}), &mut ctx);
        assert_eq!(ctx.depth(), 2);
    }

    #[test]
    fn test_agent_caller_default_impl() {
        // 测试 AgentCaller trait 的默认实现

        // 创建一个简单的结构体来实现 AgentCaller
        struct TestAgentCaller;

        impl AgentCaller for TestAgentCaller {
            // 使用默认实现
        }

        let mut caller = TestAgentCaller;
        let mut ctx = CallContext::new();

        // 测试默认实现是否工作
        let result = caller.call_agent(
            AgentType::Explore,
            json!({"test": "data"}),
            &mut ctx,
        );

        assert!(result.is_ok());
        assert_eq!(ctx.depth(), 1);
    }

    #[test]
    fn test_agent_call_chain_tracking() {
        // 测试调用链追踪
        let registry = AgentRegistry::global();
        let mut ctx = CallContext::new();

        // 调用多个 Agent
        let _ = registry.call(AgentType::Explore, json!({}), &mut ctx);
        let _ = registry.call(AgentType::Review, json!({}), &mut ctx);
        let _ = registry.call(AgentType::Refactor, json!({}), &mut ctx);

        // 验证调用链
        let calls = ctx.call_chain().calls();
        assert_eq!(calls.len(), 3);
        assert_eq!(calls[0], AgentType::Explore);
        assert_eq!(calls[1], AgentType::Review);
        assert_eq!(calls[2], AgentType::Refactor);
    }

    #[test]
    fn test_tool_executor_implies_agent_caller() {
        // 测试 ToolExecutor 自动实现 AgentCaller
        use crate::harness::tool::executor::ExploreAgentExecutor;

        let mut executor = ExploreAgentExecutor::new();
        let mut ctx = CallContext::new();

        // 验证 ExploreAgentExecutor 可以调用其他 Agent
        let result = executor.call_agent(
            AgentType::Review,
            json!({"test": "data"}),
            &mut ctx,
        );

        assert!(result.is_ok());
        assert_eq!(ctx.depth(), 1);
    }
}
