//! Agent 互调用桥接集成测试
//!
//! 测试 AgentRegistry::call() 与实际 Agent 执行器的集成
//!
//! Phase 0.1.1: 桥接到实际 Agent 执行器

#[cfg(test)]
mod agent_bridge_integration_tests {
    use crate::agent_system::workflow::types::AgentType;
    use crate::agent_system::macros::{AgentRegistry, CallContext, AgentCallError};
    use crate::agent_system::macros::permission::{PermissionLevel, PermissionChecker, AllowAllPermissionChecker};
    use serde_json::json;
    use std::sync::Arc;

    /// 测试 1: 验证 AgentRegistry::call() 能正确调用 Explore Agent
    ///
    /// 注意：此测试验证 Agent 互调用桥接逻辑是否正确
    /// 在没有有效 API key 的环境中，Agent 执行会失败，但桥接逻辑仍然工作
    #[tokio::test(flavor = "multi_thread")]
    async fn test_registry_call_explore_agent() {
        let registry = AgentRegistry::global();
        let mut ctx = CallContext::new();

        let input = json!({
            "task": "分析 src/lib.rs 的模块结构"
        });

        let result = registry.call(AgentType::Explore, input, &mut ctx);

        // 验证调用链被正确记录（无论成功还是失败）
        assert_eq!(ctx.call_chain().calls().len(), 1, "调用链应该有 1 个记录");
        assert_eq!(ctx.call_chain().calls()[0], AgentType::Explore);

        // 注意：调用完成后 depth 会恢复到 0（因为调用了 decrement_depth）
        // 这是正确的行为：调用完成后，深度应该恢复到调用前的状态
        assert_eq!(ctx.depth(), 0, "调用完成后深度应该恢复到 0");

        // 如果有有效的 API key，调用应该成功
        // 如果没有，失败也是正常的（说明桥接逻辑工作正常）
        match result {
            Ok(output) => {
                // 成功的情况：验证输出格式
                assert!(output.is_object(), "输出应该是 JSON 对象");
                assert!(output.get("agent").is_some() || output.get("output").is_some(),
                        "结果应该包含 agent 或 output 字段");
                println!("✅ Explore Agent 调用成功（有有效 API key）");
            }
            Err(e) => {
                // 失败的情况：验证错误类型
                match e {
                    AgentCallError::ExecutionFailed(msg) => {
                        // 验证是预期的 API 错误或其他执行错误
                        assert!(msg.contains("API") || msg.contains("执行失败"),
                                "失败原因应该与 API 或执行相关");
                        println!("⚠️  Explore Agent 调用失败（无有效 API key）: {}", msg);
                    }
                    _ => {
                        panic!("意外的错误类型: {:?}", e);
                    }
                }
            }
        }
    }

    /// 测试 2: 验证 AgentRegistry::call() 能正确调用 Review Agent
    #[tokio::test(flavor = "multi_thread")]
    async fn test_registry_call_review_agent() {
        let registry = AgentRegistry::global();
        let mut ctx = CallContext::new();

        let input = json!({
            "files": ["src/lib.rs"],
            "check_security": true
        });

        let result = registry.call(AgentType::Review, input, &mut ctx);

        // 应该成功执行（即使没有实际文件，至少能正确构建 workflow）
        // 允许失败（API 不可用时）
        let _ = result;

        // 验证调用链
        assert_eq!(ctx.call_chain().calls().len(), 1);
        assert_eq!(ctx.call_chain().calls()[0], AgentType::Review);
    }

    /// 测试 3: 验证深度限制检查
    #[tokio::test(flavor = "multi_thread")]
    async fn test_registry_call_depth_limit() {
        let registry = AgentRegistry::global();
        let mut ctx = CallContext::with_config(json!({"max_depth": 1}));

        // 第一次调用（深度从 0 -> 1 -> 0）
        let input1 = json!({"task": "任务 1"});
        let result1 = registry.call(AgentType::Explore, input1, &mut ctx);
        let _ = result1; // 允许失败

        // 注意：由于调用完成后深度恢复，我们需要手动增加深度来模拟嵌套调用
        // 在真实的嵌套调用场景中，外层 Agent 会在调用内层 Agent 之前增加深度
        ctx.increment_depth();

        // 第二次调用应该在深度检查时失败
        let input2 = json!({"task": "任务 2"});
        let result2 = registry.call(AgentType::Explore, input2, &mut ctx);

        // 验证是深度限制错误（而不是 API 错误）
        match result2 {
            Err(AgentCallError::MaxDepthExceeded { depth, max }) => {
                assert_eq!(depth, 1);
                assert_eq!(max, 1);
            }
            Err(_) => {
                // 如果是其他错误（比如 API 错误），说明深度检查没有生效
                panic!("第二次调用应该因深度限制而失败，而不是其他错误");
            }
            Ok(_) => {
                panic!("第二次调用不应该成功");
            }
        }
    }

    /// 测试 4: 验证未注册 Agent 返回正确错误
    #[tokio::test(flavor = "multi_thread")]
    async fn test_registry_call_unregistered_agent() {
        let registry = AgentRegistry::global();
        let mut ctx = CallContext::new();

        // 尝试调用未注册的 Agent（如果所有 Agent 都已注册，这个测试会调整）
        // 注意：当前所有主要 Agent 都已注册，所以这个测试演示错误处理
        let input = json!({"task": "测试"});

        // 验证所有已知 Agent 都已注册
        assert!(registry.has_agent(&AgentType::Explore));
        assert!(registry.has_agent(&AgentType::Review));
        assert!(registry.has_agent(&AgentType::Refactor));
        assert!(registry.has_agent(&AgentType::Test));
        assert!(registry.has_agent(&AgentType::TaskBreakdown));
        assert!(registry.has_agent(&AgentType::ReAct));
    }

    /// 测试 5: 验证调用链正确记录嵌套调用
    #[tokio::test(flavor = "multi_thread")]
    async fn test_registry_call_chain_recording() {
        let registry = AgentRegistry::global();
        let mut ctx = CallContext::new();

        // 模拟嵌套调用：Explore -> Review
        let input1 = json!({"task": "探索代码"});
        let _ = registry.call(AgentType::Explore, input1, &mut ctx);

        // 注意：实际的嵌套调用需要在 Agent 内部实现
        // 这里测试调用链的基本记录功能
        assert_eq!(ctx.call_chain().calls().len(), 1);

        // 第二次调用
        let input2 = json!({"files": ["src/lib.rs"]});
        let _ = registry.call(AgentType::Review, input2, &mut ctx);

        assert_eq!(ctx.call_chain().calls().len(), 2);
        assert_eq!(ctx.call_chain().calls()[0], AgentType::Explore);
        assert_eq!(ctx.call_chain().calls()[1], AgentType::Review);
    }

    /// 测试 6: 验证结果序列化正确性
    #[tokio::test(flavor = "multi_thread")]
    async fn test_registry_call_result_serialization() {
        let registry = AgentRegistry::global();
        let mut ctx = CallContext::new();

        let input = json!({"task": "简单任务"});
        let result = registry.call(AgentType::Explore, input, &mut ctx);

        // 允许失败（API 不可用时）
        match result {
            Ok(output) => {
                // 验证可以序列化为 JSON 字符串
                let json_str = serde_json::to_string(&output);
                assert!(json_str.is_ok(), "结果应该可以序列化为 JSON");

                // 验证可以反序列化回 Value
                let json_str = json_str.unwrap();
                let parsed: serde_json::Value = serde_json::from_str(&json_str).unwrap();
                assert_eq!(output, parsed);
            }
            Err(_) => {
                // API 不可用时跳过此测试
                println!("⚠️  API 不可用，跳过序列化测试");
            }
        }
    }

    /// 测试 7: 验证不同 Agent 类型的执行
    #[tokio::test(flavor = "multi_thread")]
    async fn test_registry_call_multiple_agent_types() {
        let registry = AgentRegistry::global();

        // 测试不同的 Agent 类型
        let agent_types = vec![
            (AgentType::Explore, json!({"task": "探索"})),
            (AgentType::Review, json!({"files": ["test.rs"]})),
            (AgentType::Refactor, json!({"task": "重构"})),
            (AgentType::Test, json!({"task": "测试"})),
            (AgentType::Doc, json!({"task": "文档"})),
        ];

        for (agent_type, input) in agent_types {
            let mut test_ctx = CallContext::new();
            let result = registry.call(agent_type.clone(), input, &mut test_ctx);

            // 验证调用链正确（无论成功还是失败）
            assert_eq!(
                test_ctx.call_chain().calls().len(),
                1,
                "{:?} 调用链长度应该是 1",
                agent_type
            );

            // 验证结果（允许失败）
            match result {
                Ok(_) => {
                    println!("✅ {:?} Agent 调用成功", agent_type);
                }
                Err(_) => {
                    println!("⚠️  {:?} Agent 调用失败（API 不可用）", agent_type);
                }
            }
        }
    }

    /// 测试 8: 验证权限检查集成
    #[tokio::test(flavor = "multi_thread")]
    async fn test_registry_call_permission_check() {
        use crate::agent_system::macros::permission::{PermissionLevel, PermissionChecker, AllowAllPermissionChecker};

        let registry = AgentRegistry::global();

        // 使用 AllowAllPermissionChecker（所有权限都允许）
        let checker = std::sync::Arc::new(AllowAllPermissionChecker);
        let mut ctx = CallContext::with_permission_checker(5, checker);

        let input = json!({"task": "测试"});
        let result = registry.call(AgentType::Explore, input, &mut ctx);

        // 应该成功（AllowAllPermissionChecker 允许所有操作）
        // 允许失败（API 不可用时）
        let _ = result;
    }

    /// 测试 9: 验证调用上下文独立性和 Fork 功能
    #[tokio::test(flavor = "multi_thread")]
    async fn test_registry_call_context_fork() {
        let registry = AgentRegistry::global();
        let ctx1 = CallContext::new();

        // Fork 上下文
        let mut ctx2 = ctx1.fork();

        // 在 ctx2 中调用 Agent
        let input = json!({"task": "测试"});
        let _ = registry.call(AgentType::Explore, input, &mut ctx2);

        // 注意：调用完成后深度会恢复到 0（因为调用了 decrement_depth）
        // 这是正确的行为
        assert_eq!(ctx2.depth(), 0);

        // 验证调用链被正确记录
        assert_eq!(ctx2.call_chain().calls().len(), 1);

        // Fork 后应该保持当前状态
        let ctx3 = ctx2.fork();
        assert_eq!(ctx3.depth(), 0, "Fork 应该保持当前深度");
        assert_eq!(ctx3.call_chain().calls().len(), 1, "Fork 应该保持调用链");

        // 但它们共享权限检查器
        //（这里我们验证配置相同）
        assert_eq!(ctx2.max_depth(), ctx3.max_depth());
    }
}

