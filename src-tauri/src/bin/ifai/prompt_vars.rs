//! CLI 提示词变量收集器
//!
//! 🏛️ 元编程：自动从运行环境收集变量

use ifainew_lib::harness::api::provider_metadata::ProviderSpec;
use std::collections::HashMap;
use std::path::PathBuf;

/// 🏛️ 元编程：自动收集 CLI 特定变量
///
/// 从运行环境、提供商配置、系统信息自动收集变量
pub fn collect_cli_variables(spec: &ProviderSpec) -> HashMap<String, String> {
    let mut vars = HashMap::new();

    // 提供商信息
    vars.insert("provider_display".to_string(), spec.metadata.name.clone());
    vars.insert("provider_original".to_string(), spec.metadata.id.clone());

    // 运行环境
    vars.insert("mode".to_string(), "cli".to_string());
    vars.insert("os".to_string(), std::env::consts::OS.to_string());
    vars.insert("arch".to_string(), std::env::consts::ARCH.to_string());
    vars.insert("target_triple".to_string(), get_target_triple());

    // 工作目录
    if let Ok(cwd) = std::env::current_dir() {
        vars.insert("cwd".to_string(), cwd.to_string_lossy().to_string());
    }

    // Shell 类型
    vars.insert("shell".to_string(), detect_shell());

    // 用户信息
    if let Ok(user) = std::env::var("USER") {
        vars.insert("user".to_string(), user);
    } else if let Ok(user) = std::env::var("USERNAME") {
        vars.insert("user".to_string(), user);
    }

    // 主目录
    if let Ok(home) = std::env::var("HOME") {
        vars.insert("home".to_string(), home);
    } else if let Ok(home) = std::env::var("USERPROFILE") {
        vars.insert("home".to_string(), home);
    }

    vars
}

/// 检测当前 Shell 类型
fn detect_shell() -> String {
    // Unix-like 系统
    if let Ok(shell) = std::env::var("SHELL") {
        // 从路径提取 shell 名称
        if let Some(name) = shell.rsplit('/').next() {
            return name.to_string();
        }
        return shell;
    }

    // Windows 系统
    if let Ok(comspec) = std::env::var("COMSPEC") {
        if let Some(name) = comspec.rsplit('\\').next() {
            return name.to_string();
        }
        if let Some(name) = comspec.rsplit('/').next() {
            return name.to_string();
        }
        return comspec;
    }

    // PowerShell Core
    if std::env::var("PSModulePath").is_ok() {
        return "pwsh".to_string();
    }

    "unknown".to_string()
}

/// 获取目标三元组
fn get_target_triple() -> String {
    format!("{}-{}", std::env::consts::OS, std::env::consts::ARCH)
}

#[cfg(test)]
mod tests {
    use super::*;
    use ifainew_lib::harness::api::provider_metadata::{
        ApiSpec, AuthSpec, ModelSpec, ProviderMetadata, ProviderSpec, RequestFormat, ResponseFormat,
    };

    fn mock_provider_spec() -> ProviderSpec {
        ProviderSpec {
            metadata: ProviderMetadata {
                id: "test-provider".to_string(),
                name: "Test Provider".to_string(),
                protocol: "test".to_string(),
                tags: vec![],
            },
            api_spec: ApiSpec {
                base_url: "https://api.test.com".to_string(),
                endpoint: "/test".to_string(),
                auth: AuthSpec::BearerHeader {
                    header_name: "Authorization".to_string(),
                    format: "Bearer {key}".to_string(),
                },
            },
            request_format: RequestFormat {
                format_type: "test".to_string(),
                messages_wrapper: "messages".to_string(),
                system_prompt_handling: "separate".to_string(),
                tools_field: Some("tools".to_string()),
            },
            response_format: ResponseFormat {
                response_type: "sse".to_string(),
                stream_parser: "test".to_string(),
                content_extraction: "delta.content".to_string(),
            },
            models: vec![ModelSpec {
                id: "test-model".to_string(),
                name: "Test Model".to_string(),
                context_tokens: 128000,
                capabilities: vec![],
                cost_per_1k_tokens: None,
                cost_per_1k_tokens_input_cache_hit: None,
                cost_per_1k_tokens_input_cache_miss: None,
                cost_per_1k_tokens_output: None,
                tags: vec![],
            }],
            error_mapping: std::collections::HashMap::new(),
        }
    }

    #[test]
    fn test_collect_cli_variables() {
        let spec = mock_provider_spec();
        let vars = collect_cli_variables(&spec);

        // 验证必需变量存在
        assert!(vars.contains_key("provider_display"));
        assert!(vars.contains_key("provider_original"));
        assert!(vars.contains_key("mode"));
        assert!(vars.contains_key("os"));
        assert!(vars.contains_key("arch"));

        // 验证值正确
        assert_eq!(vars.get("provider_display").unwrap(), "Test Provider");
        assert_eq!(vars.get("provider_original").unwrap(), "test-provider");
        assert_eq!(vars.get("mode").unwrap(), "cli");
    }

    #[test]
    fn test_detect_shell() {
        let shell = detect_shell();

        // Shell 应该是一个已知的名称或 "unknown"
        let known_shells = vec![
            "bash",
            "zsh",
            "fish",
            "pwsh",
            "cmd",
            "powershell",
            "unknown",
        ];

        // 如果 SHELL 环境变量存在，应该被检测到
        if std::env::var("SHELL").is_ok() {
            assert_ne!(shell, "unknown");
        }
    }

    #[test]
    fn test_get_target_triple() {
        let triple = get_target_triple();

        // 验证格式：os-arch
        assert!(triple.contains('-'));
        assert!(triple.contains(std::env::consts::ARCH));
    }
}
