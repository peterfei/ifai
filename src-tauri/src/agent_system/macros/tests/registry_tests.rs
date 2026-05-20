// Agent 注册表测试
//
// 采用 TDD 方法，先定义测试用例，再实现功能。

use crate::agent_system::macros::{AgentRegistry, CallContext, CallChain};
// 宏通过 #[macro_export] 导出到 crate root
use crate::global_agent_registry;
use crate::agent_system::workflow::types::AgentType;
use serde_json::json;

#[cfg(test)]
mod registry_tests {
    use super::*;

    #[test]
    fn test_macro_expansion() {
        // 测试宏展开是否正确
        global_agent_registry! {
            agents: [
                Explore,
                Review,
                Refactor,
            ],
            max_depth: 5,
        };
        // 如果能编译通过，说明宏展开成功
    }

    #[test]
    fn test_registry_singleton() {
        // 验证全局注册表是单例
        let registry1 = AgentRegistry::global();
        let registry2 = AgentRegistry::global();

        // 应该是同一个实例
        assert!(std::ptr::eq(registry1, registry2));
    }

    #[test]
    fn test_registry_contains_all_agents() {
        let registry = AgentRegistry::global();

        // 验证所有 Agent 都已注册
        let expected_agents = vec![
            AgentType::Explore,
            AgentType::Review,
            AgentType::Refactor,
            AgentType::Test,
            AgentType::Doc,
            AgentType::Debug,
            AgentType::GitCommit,
            AgentType::TaskBreakdown,  // plan_agent 映射到 TaskBreakdown
            AgentType::ReAct,
        ];

        for agent_type in &expected_agents {
            assert!(registry.has_agent(agent_type), "Agent {:?} should be registered", agent_type);
        }
    }

    #[test]
    fn test_call_context_depth_tracking() {
        let mut ctx = CallContext::new();

        // 初始深度为 0
        assert_eq!(ctx.depth(), 0);

        // 增加深度
        ctx.increment_depth();
        assert_eq!(ctx.depth(), 1);

        ctx.increment_depth();
        assert_eq!(ctx.depth(), 2);

        // 减少深度
        ctx.decrement_depth();
        assert_eq!(ctx.depth(), 1);
    }

    #[test]
    fn test_call_chain_tracking() {
        let mut chain = CallChain::new();

        // 初始状态
        assert_eq!(chain.depth(), 0);
        assert!(!chain.is_at_max_depth(5));

        // 添加调用记录
        chain.push_call(AgentType::ReAct);
        chain.push_call(AgentType::Explore);

        assert_eq!(chain.depth(), 2);
        assert_eq!(chain.calls()[0], AgentType::ReAct);
        assert_eq!(chain.calls()[1], AgentType::Explore);
    }

    #[test]
    fn test_call_chain_max_depth() {
        let mut chain = CallChain::new();

        // 添加 5 个调用
        chain.push_call(AgentType::ReAct);
        chain.push_call(AgentType::Explore);
        chain.push_call(AgentType::Refactor);
        chain.push_call(AgentType::Test);
        chain.push_call(AgentType::GitCommit);

        assert_eq!(chain.depth(), 5);
        assert!(chain.is_at_max_depth(5));

        // 第 6 个调用应该返回错误
        let result = chain.try_push_call(AgentType::TaskBreakdown);
        assert!(result.is_err());
    }

    #[test]
    fn test_call_context_with_max_depth() {
        let config = serde_json::json!({
            "max_depth": 5
        });

        let mut ctx = CallContext::with_config(config);

        // 模拟深度增加
        for _ in 0..5 {
            ctx.increment_depth();
        }

        assert!(ctx.is_at_max_depth());
        assert!(ctx.should_stop());
    }
}
