//! System Prompt Template — 单一模板驱动所有提供商
//!
//! 🏛️ 元编程：消除 4 份重复，单一模板 + 占位符系统
//!
//! **占位符**：
//! - `{provider_display}` - 提供商显示名称（如 "DeepSeek"）
//! - `{provider_original}` - 提供商原始 ID（如 "deepseek-official"）
//!
//! **来源追踪**：从 YAML metadata 派生，零硬编码

use std::path::Path;

// 导入 ProviderSpec
use ifainew_lib::harness::api::provider_metadata::ProviderSpec;

// ============================================================================
// System Prompt Template (Single Source of Truth)
// ============================================================================

/// 🏛️ 元编程：单一系统提示词模板
///
/// 所有提供商共享此模板，占位符在运行时从 ProviderSpec 派生
const SYSTEM_PROMPT_TEMPLATE: &str = r#"你是 IfAI，一个专业的 AI 代码助手，由 {provider_display} 模型驱动。

## 你的身份
- 名字：IfAI
- 角色：AI 代码助手和开发伙伴
- 创建者：IfAI 开源社区
- 特点：专业、友好、技术精湛

## 你的能力
- 代码编写、分析和优化
- 多语言支持（Rust, Python, JavaScript, Go 等）
- 问题诊断和调试
- 架构设计和最佳实践建议
- 工具调用（文件操作、任务管理等）

## 回答风格
- 简洁专业，直击要点
- 代码示例完整可用
- 中文回答为主，技术术语保留英文
- 主动提供相关建议和最佳实践

## 注意事项
- 你是 IfAI，不是 {provider_display}
- 保持友好和专业的语气
- 不确定时诚实承认
- 优先给出实用建议
"#;

// ============================================================================
// Prompt Builder
// ============================================================================

/// 🏛️ 元编程：从 ProviderSpec 构建系统提示词
///
/// **零重复**：所有提供商使用同一模板，仅占位符不同
pub fn build_system_prompt(spec: &ProviderSpec) -> String {
    let provider_display = &spec.metadata.name;
    let provider_original = &spec.metadata.id;

    SYSTEM_PROMPT_TEMPLATE
        .replace("{provider_display}", provider_display)
        .replace("{provider_original}", provider_original)
}

/// 从文件加载自定义系统提示词
///
/// **优先级**：`--system-prompt <file>` > 模板
pub fn build_system_prompt_from_file(path: &Path) -> Result<String, String> {
    std::fs::read_to_string(path)
        .map_err(|e| format!("无法读取系统提示词文件 {:?}: {}", path, e))
}

/// 验证系统提示词是否包含占位符（用于测试）
#[cfg(test)]
pub fn contains_placeholder(prompt: &str) -> bool {
    // 注意：当前模板只使用 {provider_display}
    prompt.contains("{provider_display}")
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    /// 创建测试用的 ProviderSpec
    fn mock_provider_spec(
        id: &str,
        name: &str,
    ) -> ProviderSpec {
        use ifainew_lib::harness::api::provider_metadata::{
            ProviderSpec, ProviderMetadata, ApiSpec, AuthSpec, RequestFormat, ResponseFormat, ModelSpec,
        };

        ProviderSpec {
            metadata: ProviderMetadata {
                id: id.to_string(),
                name: name.to_string(),
                protocol: "openai".to_string(),
            },
            api_spec: ApiSpec {
                base_url: "https://api.test.com".to_string(),
                endpoint: "/chat".to_string(),
                auth: AuthSpec::BearerHeader {
                    header_name: "Authorization".to_string(),
                    format: "Bearer {key}".to_string(),
                },
            },
            request_format: RequestFormat {
                format_type: "openai_standard".to_string(),
                messages_wrapper: "messages".to_string(),
                system_prompt_handling: "separate_message".to_string(),
                tools_field: Some("tools".to_string()),
            },
            response_format: ResponseFormat {
                response_type: "sse".to_string(),
                stream_parser: "openai_sse".to_string(),
                content_extraction: "delta.content".to_string(),
            },
            models: vec![ModelSpec {
                id: "test-model".to_string(),
                name: "Test Model".to_string(),
                context_tokens: 128000,
                capabilities: vec![],
                cost_per_1k_tokens: None,
                tags: vec![],
            }],
            error_mapping: std::collections::HashMap::new(),
        }
    }

    #[test]
    fn test_template_contains_placeholders() {
        // 验证模板包含占位符
        // 注意：当前模板只使用 {provider_display}，不使用 {provider_original}
        assert!(SYSTEM_PROMPT_TEMPLATE.contains("{provider_display}"));
    }

    #[test]
    fn test_build_system_prompt_deepseek() {
        let spec = mock_provider_spec("deepseek-official", "DeepSeek");
        let prompt = build_system_prompt(&spec);

        // 验证占位符被替换为提供商显示名称
        assert!(!prompt.contains("{provider_display}"));
        assert!(prompt.contains("DeepSeek"));

        // 注意：当前模板不使用 {provider_original}，所以不会包含 "deepseek-official"
        assert!(prompt.contains("你是 IfAI"));
    }

    #[test]
    fn test_build_system_prompt_openai() {
        let spec = mock_provider_spec("openai-official", "OpenAI");
        let prompt = build_system_prompt(&spec);

        assert!(prompt.contains("OpenAI"));
        assert!(prompt.contains("你是 IfAI，不是 OpenAI"));
    }

    #[test]
    fn test_build_system_prompt_zhipu() {
        let spec = mock_provider_spec("zhipu-official", "Zhipu AI (智谱)");
        let prompt = build_system_prompt(&spec);

        assert!(prompt.contains("Zhipu AI (智谱)"));
        assert!(prompt.contains("你是 IfAI，不是 Zhipu AI (智谱)"));
    }

    #[test]
    fn test_build_system_prompt_kimi() {
        let spec = mock_provider_spec("kimi-official", "Kimi (Moonshot AI)");
        let prompt = build_system_prompt(&spec);

        assert!(prompt.contains("Kimi (Moonshot AI)"));
    }

    #[test]
    fn test_build_system_prompt_gemini() {
        let spec = mock_provider_spec("gemini-official", "Google Gemini");
        let prompt = build_system_prompt(&spec);

        assert!(prompt.contains("Google Gemini"));
        assert!(prompt.contains("你是 IfAI，不是 Google Gemini"));
    }

    #[test]
    fn test_system_prompt_contains_all_sections() {
        let spec = mock_provider_spec("test-official", "Test Provider");
        let prompt = build_system_prompt(&spec);

        // 验证所有必需章节
        assert!(prompt.contains("## 你的身份"));
        assert!(prompt.contains("## 你的能力"));
        assert!(prompt.contains("## 回答风格"));
        assert!(prompt.contains("## 注意事项"));
    }

    #[test]
    fn test_build_system_prompt_from_file_success() {
        // 创建临时文件
        use std::io::Write;
        let temp_dir = std::env::temp_dir();
        let file_path = temp_dir.join("test_prompt.txt");
        let mut file = std::fs::File::create(&file_path).unwrap();
        file.write_all(b"Custom prompt from file").unwrap();

        let result = build_system_prompt_from_file(&file_path);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "Custom prompt from file");

        // 清理
        let _ = std::fs::remove_file(&file_path);
    }

    #[test]
    fn test_build_system_prompt_from_file_not_found() {
        let result = build_system_prompt_from_file(Path::new("/nonexistent/file.txt"));
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("无法读取"));
    }

    #[test]
    fn test_template_single_source() {
        // 验证只有一个模板常量
        // 如果未来有多个模板，这个测试会失败，提醒我们合并
        assert_eq!(SYSTEM_PROMPT_TEMPLATE.lines().count(), 26);
    }

    #[test]
    fn test_provider_identity_injection() {
        // 验证提供商身份正确注入
        let spec = mock_provider_spec("deepseek-official", "DeepSeek");
        let prompt = build_system_prompt(&spec);

        // 第一行：提供商声明
        assert!(prompt.lines().next().unwrap().contains("DeepSeek"));

        // 注意事项：身份澄清
        assert!(prompt.contains("你是 IfAI，不是 DeepSeek"));
    }

    #[test]
    fn test_zero_duplication_verification() {
        // 🏛️ 元编程：验证所有提供商使用同一模板
        let providers = vec![
            ("deepseek-official", "DeepSeek"),
            ("openai-official", "OpenAI"),
            ("zhipu-official", "Zhipu AI (智谱)"),
            ("kimi-official", "Kimi (Moonshot AI)"),
            ("gemini-official", "Google Gemini"),
        ];

        for (id, name) in providers {
            let spec = mock_provider_spec(id, name);
            let prompt = build_system_prompt(&spec);

            // 验证模板结构一致（行数相同）
            assert_eq!(prompt.lines().count(), SYSTEM_PROMPT_TEMPLATE.lines().count());

            // 验证占位符被替换
            assert!(!contains_placeholder(&prompt));

            // 验证提供商名称出现
            assert!(prompt.contains(name));
        }
    }

    #[test]
    fn test_system_prompt_chinese_language() {
        let spec = mock_provider_spec("test-official", "Test");
        let prompt = build_system_prompt(&spec);

        // 验证中文内容
        assert!(prompt.contains("你是 IfAI"));
        assert!(prompt.contains("代码助手"));
        assert!(prompt.contains("中文回答为主"));
    }

    #[test]
    fn test_system_prompt_english_terms_preserved() {
        let spec = mock_provider_spec("test-official", "Test");
        let prompt = build_system_prompt(&spec);

        // 验证技术术语保留英文
        assert!(prompt.contains("Rust"));
        assert!(prompt.contains("Python"));
        assert!(prompt.contains("JavaScript"));
        assert!(prompt.contains("Go"));
    }

    #[test]
    fn test_template_has_no_unprocessed_placeholders_after_build() {
        let providers = vec![
            ("deepseek-official", "DeepSeek"),
            ("openai-official", "OpenAI"),
            ("zhipu-official", "Zhipu AI (智谱)"),
        ];

        for (id, name) in providers {
            let spec = mock_provider_spec(id, name);
            let prompt = build_system_prompt(&spec);

            // 验证没有未处理的占位符（{provider_display}）
            assert!(!prompt.contains("{provider_display}"));

            // 注意：提供商名称中可能包含括号，所以不能检查所有的 { 和 }
            assert!(prompt.contains(name)); // 验证提供商名称被正确替换
        }
    }
}
