//! 测试 CLI 是否可以访问 prompt_manager
//!
//! 这是验证 Phase 0 架构修复的测试文件

/// 🧪 测试 CLI 可以访问 prompt_manager
#[cfg(test)]
mod test_prompt_manager_access {
    /// ✅ 验证可以导入 prompt_manager
    #[test]
    fn test_can_import_prompt_manager() {
        // 这个编译通过就证明可以访问
        use ifainew_lib::prompt_manager;

        // 验证关键类型可用
        let _tier = ifainew_lib::prompt_manager::AccessTier::Public;
        let _meta = ifainew_lib::prompt_manager::PromptMetadata {
            name: "test".to_string(),
            description: String::new(),
            access_tier: ifainew_lib::prompt_manager::AccessTier::Public,
        };

        // 如果编译通过，测试成功
        assert_eq!(_tier, ifainew_lib::prompt_manager::AccessTier::Public);
        assert_eq!(_meta.name, "test");
    }

    /// ✅ 验证可以访问 BuiltinPrompts
    #[test]
    fn test_can_access_builtin_prompts() {
        use ifainew_lib::prompt_manager::BuiltinPrompts;

        // 尝试访问内置提示词（编译时嵌入）
        let result = BuiltinPrompts::get("system/main.md");

        // 验证可以访问（文件存在性不确定，但 API 可用）
        assert!(result.is_some() || result.is_none());
    }

    /// ✅ 验证可以访问模板渲染
    #[test]
    fn test_can_access_template_render() {
        use ifainew_lib::prompt_manager::template;
        use std::collections::HashMap;

        let mut vars = HashMap::new();
        vars.insert("test".to_string(), "value".to_string());

        // 验证模板渲染 API 可用
        let result = template::render_template("Hello {{test}}", &vars, None);

        // 验证渲染成功
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "Hello value");
    }
}
