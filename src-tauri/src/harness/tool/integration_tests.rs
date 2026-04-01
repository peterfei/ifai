//! 工具系统集成测试
//!
//! 测试工具注册表、权限策略和执行器的集成功能。

#[cfg(test)]
mod integration_tests {
    use super::super::*;
    use crate::harness::permission::{PermissionPolicy, PermissionDecision};
    use crate::harness::tool::executor::SubagentToolExecutor;
    use serde_json::json;

    /// 测试完整的工具生命周期
    #[test]
    fn test_tool_lifecycle() {
        let registry = ToolRegistry::new();

        // 1. 验证工具注册
        let read_tool = registry.get("read_file").unwrap();
        assert_eq!(read_tool.name, "read_file");
        assert_eq!(
            read_tool.required_permission,
            ToolPermissionMode::ReadOnly
        );

        let write_tool = registry.get("write_file").unwrap();
        assert_eq!(write_tool.name, "write_file");
        assert_eq!(
            write_tool.required_permission,
            ToolPermissionMode::WorkspaceWrite
        );

        // 2. 验证权限过滤
        let readonly_tools = registry.filter_by_permission(ToolPermissionMode::ReadOnly);
        assert!(readonly_tools.iter().any(|t| t.name == "read_file"));
        assert!(!readonly_tools.iter().any(|t| t.name == "write_file"));
        assert!(!readonly_tools.iter().any(|t| t.name == "bash"));

        // 3. 验证白名单生成
        let whitelist = registry.get_whitelist_for_permission(ToolPermissionMode::ReadOnly);
        assert!(whitelist.contains(&"read_file".to_string()));
        assert!(!whitelist.contains(&"write_file".to_string()));
        assert!(!whitelist.contains(&"bash".to_string()));
    }

    /// 测试权限策略与工具执行器的集成
    #[test]
    fn test_permission_with_executor() {
        let policy = PermissionPolicy::new(ToolPermissionMode::ReadOnly);
        let registry = ToolRegistry::new();

        // 创建只读执行器
        let whitelist = registry.get_whitelist_for_permission(ToolPermissionMode::ReadOnly);
        let mut executor = SubagentToolExecutor::new(whitelist.into_iter().collect());

        // 测试允许的工具
        let result = executor
            .execute("read_file", &json!({"path": "/tmp/test"}))
            .unwrap();
        assert!(result.contains("Executed"));

        // 测试不允许的工具
        let result = executor.execute("write_file", &json!({"path": "/tmp/test", "content": "test"}));
        assert!(matches!(result, Err(ToolError::PermissionDenied { .. })));

        // 测试危险工具
        let result = executor.execute("bash", &json!({"command": "ls"}));
        assert!(matches!(result, Err(ToolError::PermissionDenied { .. })));
    }

    /// 测试权限提升场景
    #[test]
    fn test_permission_elevation_scenarios() {
        // 场景 1: 只读 -> 写入
        let policy = PermissionPolicy::new(ToolPermissionMode::ReadOnly);

        // 检查只读工具
        assert!(matches!(
            policy.check_permission("read_file", ToolPermissionMode::ReadOnly),
            PermissionDecision::Allowed
        ));

        // 检查写入工具（需要提升）
        let decision = policy.check_permission("write_file", ToolPermissionMode::WorkspaceWrite);
        assert!(matches!(
            decision,
            PermissionDecision::NeedsPrompt { .. }
        ));

        // 提升权限
        assert!(policy
            .elevate(ToolPermissionMode::WorkspaceWrite)
            .is_ok());

        // 现在写入工具应该被允许
        assert!(matches!(
            policy.check_permission("write_file", ToolPermissionMode::WorkspaceWrite),
            PermissionDecision::Allowed
        ));

        // 场景 2: 工具特定权限要求
        let policy = PermissionPolicy::new(ToolPermissionMode::WorkspaceWrite)
            .with_tool_requirement("bash", ToolPermissionMode::DangerFullAccess);

        // bash 工具需要危险权限
        assert!(matches!(
            policy.check_permission("bash", ToolPermissionMode::DangerFullAccess),
            PermissionDecision::NeedsPrompt { .. }
        ));

        // 其他写入工具应该被允许
        assert!(matches!(
            policy.check_permission("write_file", ToolPermissionMode::WorkspaceWrite),
            PermissionDecision::Allowed
        ));
    }

    /// 测试多级权限层次
    #[test]
    fn test_permission_hierarchy() {
        let levels = vec![
            ToolPermissionMode::ReadOnly,
            ToolPermissionMode::WorkspaceWrite,
            ToolPermissionMode::Prompt,
            ToolPermissionMode::DangerFullAccess,
            ToolPermissionMode::Allow,
        ];

        for (i, &level) in levels.iter().enumerate() {
            assert_eq!(level.level(), (i + 1) as u8, "Level hierarchy mismatch");

            // 检查每个级别是否充分自身
            assert!(level.is_sufficient(level), "Should be sufficient for itself");

            // 检查是否不充分于更高级别
            for &higher in &levels[i + 1..] {
                assert!(!level.is_sufficient(higher), "Should not be sufficient for higher level");
            }
        }
    }

    /// 测试工具白名单生成
    #[test]
    fn test_whitelist_generation() {
        let registry = ToolRegistry::new();

        // 只读白名单
        let readonly_whitelist = registry.get_whitelist_for_permission(ToolPermissionMode::ReadOnly);
        println!("ReadOnly whitelist: {:?}", readonly_whitelist);
        assert!(readonly_whitelist.len() > 0);
        assert!(readonly_whitelist.contains(&"read_file".to_string()));
        assert!(!readonly_whitelist.contains(&"bash".to_string()));

        // 写入白名单
        let write_whitelist = registry.get_whitelist_for_permission(ToolPermissionMode::WorkspaceWrite);
        println!("WorkspaceWrite whitelist: {:?}", write_whitelist);
        assert!(write_whitelist.len() > readonly_whitelist.len());
        assert!(write_whitelist.contains(&"write_file".to_string()));
        assert!(!write_whitelist.contains(&"bash".to_string()));

        // 完全权限白名单
        let full_whitelist = registry.get_whitelist_for_permission(ToolPermissionMode::DangerFullAccess);
        println!("DangerFullAccess whitelist: {:?}", full_whitelist);
        assert!(full_whitelist.len() > write_whitelist.len());
        assert!(full_whitelist.contains(&"bash".to_string()));
    }

    /// 测试工具输入验证
    #[test]
    fn test_tool_input_validation() {
        let registry = ToolRegistry::new();

        // 测试 read_file 输入验证
        let read_tool = registry.get("read_file").unwrap();
        let schema = &read_tool.input_schema;

        // 有效输入
        let valid_input = json!({"path": "/tmp/test.txt"});
        assert!(validate_input(schema, &valid_input));

        // 缺少必需参数
        let invalid_input = json!({});
        assert!(!validate_input(schema, &invalid_input));

        // 测试 write_file 输入验证
        let write_tool = registry.get("write_file").unwrap();
        let schema = &write_tool.input_schema;

        // 有效输入
        let valid_input = json!({"path": "/tmp/test.txt", "content": "Hello"});
        assert!(validate_input(schema, &valid_input));

        // 缺少 content 参数
        let invalid_input = json!({"path": "/tmp/test.txt"});
        assert!(!validate_input(schema, &invalid_input));
    }

    /// 简单的输入验证辅助函数
    fn validate_input(schema: &serde_json::Value, input: &serde_json::Value) -> bool {
        if let Some(required) = schema.get("required").and_then(|r| r.as_array()) {
            for field in required {
                if let Some(field_str) = field.as_str() {
                    if !input.get(field_str).is_some() {
                        return false;
                    }
                }
            }
        }
        true
    }

    /// 测试执行器工具数量统计
    #[test]
    fn test_executor_tool_count() {
        let registry = ToolRegistry::new();

        // 只读执行器
        let readonly_whitelist = registry.get_whitelist_for_permission(ToolPermissionMode::ReadOnly);
        let readonly_executor = SubagentToolExecutor::new(readonly_whitelist.into_iter().collect());
        println!("ReadOnly executor tool count: {}", readonly_executor.tool_count());

        // 写入执行器
        let write_whitelist = registry.get_whitelist_for_permission(ToolPermissionMode::WorkspaceWrite);
        let write_executor = SubagentToolExecutor::new(write_whitelist.into_iter().collect());
        println!("WorkspaceWrite executor tool count: {}", write_executor.tool_count());

        // 完全权限执行器
        let full_whitelist = registry.get_whitelist_for_permission(ToolPermissionMode::DangerFullAccess);
        let full_executor = SubagentToolExecutor::new(full_whitelist.into_iter().collect());
        println!("DangerFullAccess executor tool count: {}", full_executor.tool_count());

        assert!(readonly_executor.tool_count() < write_executor.tool_count());
        assert!(write_executor.tool_count() < full_executor.tool_count());
    }
}
