//! Provider Registry & Dispatch Table
//!
//! 🏛️ 元编程：复用 GUI 端 provider_metadata.rs，添加 CLI 特定功能

use ifainew_lib::harness::api::provider_metadata::{get_provider_spec, ProviderSpec};
use std::collections::HashMap;
use std::sync::OnceLock;

// ============================================================================
// Provider Dispatch Table (OnceLock<HashMap>)
// ============================================================================

/// Provider 注册表（别名，复用 GUI 端基础设施）
pub type ProviderRegistry = HashMap<String, ProviderSpec>;

/// 全局 Provider 注册表（单例）
static REGISTRY: OnceLock<ProviderRegistry> = OnceLock::new();

/// 初始化注册表（从 GUI 端复用）
fn init_registry() -> &'static ProviderRegistry {
    REGISTRY.get_or_init(|| {
        // 复用 GUI 端的 get_all_provider_specs()
        ifainew_lib::harness::api::provider_metadata::get_all_provider_specs()
            .iter()
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect()
    })
}

/// 解析 provider（按短名称）
/// 支持: "openai", "deepseek", "zhipu", "kimi", "gemini"
pub fn resolve_provider(name: &str) -> Result<&'static ProviderSpec, String> {
    let registry = init_registry();

    // 标准化短名称到完整 ID
    let full_id = match normalize_provider_id(name) {
        Ok(id) => id,
        Err(_) => {
            // 未知短名称，返回包含可用列表的错误
            let available: Vec<&str> = registry.keys().map(|s| s.as_str()).collect();
            return Err(format!(
                "unknown provider \"{}\". Available: {}",
                name,
                available.join(", ")
            ));
        }
    };

    registry.get(&full_id).ok_or_else(|| {
        let available: Vec<&str> = registry.keys().map(|s| s.as_str()).collect();
        format!(
            "unknown provider \"{}\". Available: {}",
            name,
            available.join(", ")
        )
    })
}

/// 标准化短名称到完整 ID
fn normalize_provider_id(name: &str) -> Result<String, String> {
    match name.to_lowercase().as_str() {
        "openai" | "gpt" => Ok("openai-official".to_string()),
        "deepseek" => Ok("deepseek-official".to_string()),
        "zhipu" | "glm" | "智谱" => Ok("zhipu-official".to_string()),
        "kimi" | "moonshot" => Ok("kimi-official".to_string()),
        "gemini" => Ok("gemini-official".to_string()),
        _ => Err(format!("unknown provider short name: \"{}\"", name)),
    }
}

/// 从 ProviderSpec 派生环境变量名
/// 例: "openai-official" → "OPENAI_API_KEY"
pub fn resolve_env_key(spec: &ProviderSpec) -> String {
    // 从 metadata.name 提取短名称
    let short_name: &str = match spec.metadata.id.as_str() {
        "openai-official" => "OPENAI",
        "deepseek-official" => "DEEPSEEK",
        "zhipu-official" => "ZHIPU",
        "kimi-official" => "KIMI", // 或 MOONSHOT
        "gemini-official" => "GEMINI",
        _ => {
            // 回退：从 id 中提取短名称（去除 -official 后缀）
            spec.metadata
                .id
                .strip_suffix("-official")
                .unwrap_or(&spec.metadata.id)
        }
    };

    format!("{}_API_KEY", short_name)
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolve_provider_openai() {
        let spec = resolve_provider("openai").unwrap();
        assert_eq!(spec.metadata.id, "openai-official");
        assert_eq!(spec.metadata.name, "OpenAI");
    }

    #[test]
    fn test_resolve_provider_deepseek() {
        let spec = resolve_provider("deepseek").unwrap();
        assert_eq!(spec.metadata.id, "deepseek-official");
        assert_eq!(spec.metadata.name, "DeepSeek");
    }

    #[test]
    fn test_resolve_provider_zhipu() {
        let spec = resolve_provider("zhipu").unwrap();
        assert_eq!(spec.metadata.id, "zhipu-official");
    }

    #[test]
    fn test_resolve_provider_aliases() {
        // openai 别名
        let spec1 = resolve_provider("openai").unwrap();
        let spec2 = resolve_provider("gpt").unwrap();
        assert_eq!(spec1.metadata.id, spec2.metadata.id);

        // zhipu 别名
        let spec3 = resolve_provider("zhipu").unwrap();
        let spec4 = resolve_provider("glm").unwrap();
        assert_eq!(spec3.metadata.id, spec4.metadata.id);
    }

    #[test]
    fn test_resolve_provider_unknown() {
        let result = resolve_provider("nonexistent");
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("unknown provider"));
        assert!(err.contains("openai-official")); // 包含可用列表
    }

    #[test]
    fn test_normalize_provider_id() {
        assert_eq!(normalize_provider_id("openai").unwrap(), "openai-official");
        assert_eq!(
            normalize_provider_id("deepseek").unwrap(),
            "deepseek-official"
        );
        assert_eq!(normalize_provider_id("zhipu").unwrap(), "zhipu-official");
        assert_eq!(normalize_provider_id("kimi").unwrap(), "kimi-official");
        assert_eq!(normalize_provider_id("gemini").unwrap(), "gemini-official");
    }

    #[test]
    fn test_resolve_env_key_openai() {
        let spec = get_provider_spec("openai-official").unwrap();
        let env_key = resolve_env_key(spec);
        assert_eq!(env_key, "OPENAI_API_KEY");
    }

    #[test]
    fn test_resolve_env_key_deepseek() {
        let spec = get_provider_spec("deepseek-official").unwrap();
        let env_key = resolve_env_key(spec);
        assert_eq!(env_key, "DEEPSEEK_API_KEY");
    }

    #[test]
    fn test_resolve_env_key_zhipu() {
        let spec = get_provider_spec("zhipu-official").unwrap();
        let env_key = resolve_env_key(spec);
        assert_eq!(env_key, "ZHIPU_API_KEY");
    }

    #[test]
    fn test_registry_initialization() {
        // 测试注册表可以初始化（零 panic）
        let registry = init_registry();
        assert!(registry.len() >= 5); // 至少有 5 个官方提供商
    }

    #[test]
    fn test_registry_idempotency() {
        // 多次调用 init_registry 应该返回同一个实例
        let r1 = init_registry();
        let r2 = init_registry();
        assert_eq!(r1.len(), r2.len());
        // 指针相同（同一个实例）
        assert!(std::ptr::eq(r1, r2));
    }
}
