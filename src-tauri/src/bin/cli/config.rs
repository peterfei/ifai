//! Configuration System — 4-Layer Precedence
//!
//! 🏛️ 元编程：声明式配置，零手写解析
//!
//! Precedence Chain (highest to lowest):
//! 1. CLI arguments (--provider, --model, --api-key)
//! 2. Environment variables ({PROVIDER}_API_KEY, IFAI_PROVIDER, IFAI_MODEL)
//! 3. Config file (~/.ifai/config.toml)
//! 4. YAML defaults (from provider metadata)

use std::path::{Path, PathBuf};
use std::fs;
use std::collections::HashMap;

// ============================================================================
// Config Source Tracking
// ============================================================================

/// 配置值来源追踪
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ConfigSource {
    /// CLI 命令行参数（最高优先级）
    CliArg,
    /// 环境变量
    EnvVar,
    /// 配置文件 (~/.ifai/config.toml)
    ConfigFile,
    /// YAML 默认值（最低优先级）
    YamlDefault,
}

impl ConfigSource {
    pub fn as_str(&self) -> &'static str {
        match self {
            ConfigSource::CliArg => "cli-arg",
            ConfigSource::EnvVar => "env-var",
            ConfigSource::ConfigFile => "file",
            ConfigSource::YamlDefault => "default",
        }
    }
}

/// 带来源追踪的配置值
#[derive(Debug, Clone)]
struct TracedValue<T> {
    value: T,
    source: ConfigSource,
}

impl<T> TracedValue<T> {
    fn new(value: T, source: ConfigSource) -> Self {
        Self { value, source }
    }
}

// ============================================================================
// Effective Config (4-Layer Precedence)
// ============================================================================

/// 有效配置（4 层优先级解析结果）
#[derive(Debug, Clone)]
pub struct EffectiveConfig {
    /// Provider 名称（带来源追踪）
    provider: TracedValue<String>,
    /// Model 名称（带来源追踪）
    model: TracedValue<String>,
    /// API Key（带来源追踪）
    api_key: TracedValue<Option<String>>,
    /// Base URL（可选，带来源追踪）
    base_url: TracedValue<Option<String>>,
}

impl EffectiveConfig {
    /// 创建新的有效配置（应用 4 层优先级）
    pub fn resolve(
        // CLI args
        cli_provider: Option<&str>,
        cli_model: Option<&str>,
        cli_api_key: Option<&str>,
        cli_base_url: Option<&str>,
    ) -> Result<Self, String> {
        // Layer 1: CLI args (highest priority)
        let provider = Self::resolve_provider(cli_provider)?;
        let model = Self::resolve_model(&provider.value, cli_model)?;
        let api_key = Self::resolve_api_key(&provider.value, cli_api_key)?;
        let base_url = Self::resolve_base_url(cli_base_url, &provider.value);

        Ok(Self {
            provider,
            model,
            api_key,
            base_url,
        })
    }

    /// 解析 provider（CLI > env > TOML > default "deepseek"）
    fn resolve_provider(cli_arg: Option<&str>) -> Result<TracedValue<String>, String> {
        if let Some(p) = cli_arg {
            return Ok(TracedValue::new(p.to_string(), ConfigSource::CliArg));
        }

        // 检查环境变量 IFAI_PROVIDER
        if let Ok(p) = std::env::var("IFAI_PROVIDER") {
            return Ok(TracedValue::new(p, ConfigSource::EnvVar));
        }

        // 检查 TOML 配置文件
        if let Some(p) = read_provider_from_toml() {
            return Ok(TracedValue::new(p, ConfigSource::ConfigFile));
        }

        // 默认值
        Ok(TracedValue::new("deepseek".to_string(), ConfigSource::YamlDefault))
    }

    /// 解析 model（CLI > env > TOML > provider default）
    fn resolve_model(provider: &str, cli_arg: Option<&str>) -> Result<TracedValue<String>, String> {
        if let Some(m) = cli_arg {
            return Ok(TracedValue::new(m.to_string(), ConfigSource::CliArg));
        }

        // 检查环境变量 IFAI_MODEL
        if let Ok(m) = std::env::var("IFAI_MODEL") {
            return Ok(TracedValue::new(m, ConfigSource::EnvVar));
        }

        // 检查 TOML 配置文件
        if let Some(m) = read_model_from_toml() {
            return Ok(TracedValue::new(m, ConfigSource::ConfigFile));
        }

        // 从 provider metadata 获取默认模型
        let spec = crate::provider::resolve_provider(provider)?;
        let default_model = spec.models.first()
            .map(|m| m.id.clone())
            .unwrap_or_else(|| "unknown".to_string());

        Ok(TracedValue::new(default_model, ConfigSource::YamlDefault))
    }

    /// 解析 api_key（CLI > env > TOML > None）
    fn resolve_api_key(provider: &str, cli_arg: Option<&str>) -> Result<TracedValue<Option<String>>, String> {
        if let Some(key) = cli_arg {
            return Ok(TracedValue::new(Some(key.to_string()), ConfigSource::CliArg));
        }

        // 从 provider spec 派生环境变量名
        let spec = crate::provider::resolve_provider(provider)?;
        let env_key = crate::provider::resolve_env_key(spec);

        if let Ok(key) = std::env::var(&env_key) {
            return Ok(TracedValue::new(Some(key), ConfigSource::EnvVar));
        }

        // 检查 TOML 配置文件
        if let Some(key) = read_provider_api_key_from_toml(provider) {
            return Ok(TracedValue::new(Some(key), ConfigSource::ConfigFile));
        }

        Ok(TracedValue::new(None, ConfigSource::YamlDefault))
    }

    /// 解析 base_url（CLI > TOML > None）
    fn resolve_base_url(cli_arg: Option<&str>, provider: &str) -> TracedValue<Option<String>> {
        if let Some(url) = cli_arg {
            return TracedValue::new(Some(url.to_string()), ConfigSource::CliArg);
        }

        // 检查 TOML 配置文件
        if let Some(url) = read_provider_base_url_from_toml(provider) {
            return TracedValue::new(Some(url), ConfigSource::ConfigFile);
        }

        TracedValue::new(None, ConfigSource::YamlDefault)
    }

    /// 获取 provider 值
    pub fn provider(&self) -> &str {
        &self.provider.value
    }

    /// 获取 model 值
    pub fn model(&self) -> &str {
        &self.model.value
    }

    /// 获取 api_key 值
    pub fn api_key(&self) -> Option<&str> {
        self.api_key.value.as_deref()
    }

    /// 获取 base_url 值
    pub fn base_url(&self) -> Option<&str> {
        self.base_url.value.as_deref()
    }

    /// 获取 provider 来源
    pub fn provider_source(&self) -> ConfigSource {
        self.provider.source
    }

    /// 可视化配置来源链
    pub fn visualize_sources(&self) -> String {
        format!(
            "provider: {} ({})\nmodel: {} ({})\napi_key: {} ({})\nbase_url: {} ({})",
            self.provider.value,
            self.provider.source.as_str(),
            self.model.value,
            self.model.source.as_str(),
            self.api_key.value.as_deref().unwrap_or("None"),
            self.api_key.source.as_str(),
            self.base_url.value.as_deref().unwrap_or("None"),
            self.base_url.source.as_str(),
        )
    }
}

// ============================================================================
// Config File I/O
// ============================================================================

/// 配置文件路径 (~/.ifai/config.toml)
pub fn config_file_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".ifai")
        .join("config.toml")
}

/// 检查配置文件是否存在
pub fn config_file_exists() -> bool {
    config_file_path().exists()
}

// ============================================================================
// TOML Config File (元编程：从 YAML spec 生成)
// ============================================================================

/// 🔥 TOML 配置文件结构（100% 复用 GUI 端字段）
#[derive(Debug, Clone, serde::Deserialize)]
struct TomlConfig {
    /// 默认配置
    #[serde(default)]
    default: TomlDefaultSection,

    /// Provider 覆盖配置
    #[serde(default)]
    providers: HashMap<String, TomlProviderConfig>,
}

/// 默认配置段
#[derive(Debug, Clone, serde::Deserialize, Default)]
struct TomlDefaultSection {
    /// 默认 provider ID
    #[serde(default)]
    provider: Option<String>,

    /// 默认 model ID
    #[serde(default)]
    model: Option<String>,
}

/// Provider 覆盖配置
#[derive(Debug, Clone, serde::Deserialize, Default)]
struct TomlProviderConfig {
    /// API Key（可选，覆盖环境变量）
    #[serde(default)]
    api_key: Option<String>,

    /// Base URL（可选，覆盖 YAML 默认）
    #[serde(default)]
    base_url: Option<String>,
}

/// 🔥 元编程：从 ProviderSpec 生成 TOML 配置模板
///
/// **设计原则**：
/// - 零手写：从 YAML metadata 自动生成
/// - 注释完整：说明每个字段的来源和作用
/// - 可选字段：只包含用户可能需要覆盖的内容
pub fn generate_toml_template() -> String {
    use ifainew_lib::harness::api::provider_metadata;

    let mut toml = String::from("# IfAI CLI Configuration\n");
    toml.push_str("# Generated from provider metadata (");
    toml.push_str(env!("CARGO_PKG_VERSION"));
    toml.push_str(")\n");
    toml.push_str("#\n");
    toml.push_str("# Precedence (highest to lowest):\n");
    toml.push_str("#   1. CLI args (--provider, --model, --api-key)\n");
    toml.push_str("#   2. Environment variables (IFAI_PROVIDER, IFAI_MODEL, {PROVIDER}_API_KEY)\n");
    toml.push_str("#   3. This file (~/.ifai/config.toml)\n");
    toml.push_str("#   4. YAML defaults (embedded in binary)\n");
    toml.push_str("\n");

    // [default] section
    toml.push_str("[default]\n");
    toml.push_str("# Default provider (short name or full ID from providers/registry/*.yaml)\n");
    toml.push_str("# Available short names: ");
    let all_providers: Vec<_> = provider_metadata::get_all_provider_specs()
        .keys()
        .map(|k| k.replace("-official", ""))
        .collect();
    toml.push_str(&all_providers.join(", "));
    toml.push_str("\n");
    toml.push_str("provider = \"deepseek\"\n");
    toml.push_str("\n");

    toml.push_str("# Default model (must be available in selected provider)\n");
    toml.push_str("# Run 'ifai --config show' to see all available models\n");
    toml.push_str("# model = \"deepseek-chat\"\n");
    toml.push_str("\n");

    // [providers.*] sections
    toml.push_str("# Provider-specific overrides (optional)\n");
    toml.push_str("# Uncomment and configure as needed\n");
    toml.push_str("\n");

    for (provider_id, spec) in provider_metadata::get_all_provider_specs() {
        toml.push_str(&format!("[providers.{}]\n", provider_id));

        // API key hint
        let env_var_name = format!("{}_API_KEY",
            provider_id.replace("-official", "").replace("-", "_").to_uppercase());
        toml.push_str(&format!("# API key (or set {} environment variable)\n", env_var_name));
        toml.push_str(&format!("# api_key = \"sk-xxx\"\n"));

        // Base URL override
        toml.push_str(&format!("# Base URL (default: {})\n", spec.api_spec.base_url));
        toml.push_str("# base_url = \"https://...\"\n");

        toml.push_str("\n");
    }

    toml.trim_end().to_string()
}

/// 🔥 读取 TOML 配置文件
fn read_toml_config() -> Result<TomlConfig, String> {
    let path = config_file_path();

    if !path.exists() {
        // 文件不存在，返回空配置
        return Ok(TomlConfig {
            default: TomlDefaultSection::default(),
            providers: HashMap::new(),
        });
    }

    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read config file {}: {}", path.display(), e))?;

    toml::from_str(&content)
        .map_err(|e| format!("Failed to parse config file {}: {}", path.display(), e))
}

/// 🔥 初始化配置文件（--config init）
pub fn init_config_file() -> Result<PathBuf, String> {
    let path = config_file_path();

    // 检查是否已存在
    if path.exists() {
        return Err(format!("Config file already exists: {}", path.display()));
    }

    // 确保目录存在
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
    }

    // 生成 TOML 模板
    let template = generate_toml_template();

    // 写入文件
    fs::write(&path, template)
        .map_err(|e| format!("Failed to write config file: {}", e))?;

    Ok(path)
}

/// 🔥 从 TOML 配置读取 provider（优先级：Env > File > None）
fn read_provider_from_toml() -> Option<String> {
    let config = read_toml_config().ok()?;
    config.default.provider
}

/// 🔥 从 TOML 配置读取 model（优先级：Env > File > None）
fn read_model_from_toml() -> Option<String> {
    let config = read_toml_config().ok()?;
    config.default.model
}

/// 🔥 从 TOML 配置读取 provider 的 API Key
fn read_provider_api_key_from_toml(provider_id: &str) -> Option<String> {
    let config = read_toml_config().ok()?;
    config.providers.get(provider_id)?.api_key.clone()
}

/// 🔥 从 TOML 配置读取 provider 的 base URL
fn read_provider_base_url_from_toml(provider_id: &str) -> Option<String> {
    let config = read_toml_config().ok()?;
    config.providers.get(provider_id)?.base_url.clone()
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_source_as_str() {
        assert_eq!(ConfigSource::CliArg.as_str(), "cli-arg");
        assert_eq!(ConfigSource::EnvVar.as_str(), "env-var");
        assert_eq!(ConfigSource::ConfigFile.as_str(), "file");
        assert_eq!(ConfigSource::YamlDefault.as_str(), "default");
    }

    #[test]
    fn test_resolve_provider_cli_arg() {
        let result = EffectiveConfig::resolve_provider(Some("openai")).unwrap();
        assert_eq!(result.value, "openai");
        assert_eq!(result.source, ConfigSource::CliArg);
    }

    #[test]
    fn test_resolve_provider_default() {
        // 清除可能存在的环境变量
        std::env::remove_var("IFAI_PROVIDER");

        // 注意：如果有 ~/.ifai/config.toml 文件，测试可能会失败
        // 因为 TOML 配置优先级高于 YAML 默认值
        let result = EffectiveConfig::resolve_provider(None).unwrap();
        assert_eq!(result.value, "deepseek");
        // 如果 TOML 文件存在，来源会是 ConfigFile；否则是 YamlDefault
        assert!(result.source == ConfigSource::YamlDefault || result.source == ConfigSource::ConfigFile);
    }

    #[test]
    fn test_resolve_model_cli_arg() {
        let result = EffectiveConfig::resolve_model("deepseek", Some("deepseek-coder")).unwrap();
        assert_eq!(result.value, "deepseek-coder");
        assert_eq!(result.source, ConfigSource::CliArg);
    }

    #[test]
    fn test_resolve_model_default_from_provider() {
        // 清除可能存在的环境变量
        std::env::remove_var("IFAI_MODEL");

        let result = EffectiveConfig::resolve_model("deepseek", None).unwrap();
        // deepseek-official 的第一个模型应该是 deepseek-chat
        assert!(!result.value.is_empty());
        assert_eq!(result.source, ConfigSource::YamlDefault);
    }

    #[test]
    fn test_resolve_api_key_cli_arg() {
        let result = EffectiveConfig::resolve_api_key("openai", Some("sk-test")).unwrap();
        assert_eq!(result.value, Some("sk-test".to_string()));
        assert_eq!(result.source, ConfigSource::CliArg);
    }

    #[test]
    fn test_resolve_api_key_none() {
        // 清除可能存在的环境变量
        std::env::remove_var("OPENAI_API_KEY");

        let result = EffectiveConfig::resolve_api_key("openai", None).unwrap();
        assert_eq!(result.value, None);
        assert_eq!(result.source, ConfigSource::YamlDefault);
    }

    #[test]
    fn test_resolve_base_url_cli_arg() {
        let result = EffectiveConfig::resolve_base_url(Some("https://api.custom.com"), "deepseek");
        assert_eq!(result.value, Some("https://api.custom.com".to_string()));
        assert_eq!(result.source, ConfigSource::CliArg);
    }

    #[test]
    fn test_resolve_base_url_none() {
        let result = EffectiveConfig::resolve_base_url(None, "deepseek");
        assert_eq!(result.value, None);
        assert_eq!(result.source, ConfigSource::YamlDefault);
    }

    #[test]
    fn test_effective_config_full_resolution() {
        // 清除环境变量
        std::env::remove_var("IFAI_PROVIDER");
        std::env::remove_var("IFAI_MODEL");
        std::env::remove_var("DEEPSEEK_API_KEY");

        let config = EffectiveConfig::resolve(
            Some("deepseek"),
            Some("deepseek-chat"),
            Some("sk-test"),
            None,
        ).unwrap();

        assert_eq!(config.provider(), "deepseek");
        assert_eq!(config.model(), "deepseek-chat");
        assert_eq!(config.api_key(), Some("sk-test"));
        assert_eq!(config.base_url(), None);

        assert_eq!(config.provider_source(), ConfigSource::CliArg);
    }

    #[test]
    fn test_effective_config_visualize_sources() {
        let config = EffectiveConfig::resolve(
            Some("deepseek"),
            Some("deepseek-chat"),
            Some("sk-test"),
            None,
        ).unwrap();

        let visualization = config.visualize_sources();
        assert!(visualization.contains("provider: deepseek (cli-arg)"));
        assert!(visualization.contains("model: deepseek-chat (cli-arg)"));
        assert!(visualization.contains("api_key: sk-test (cli-arg)"));
    }

    #[test]
    fn test_config_file_path() {
        let path = config_file_path();
        assert!(path.ends_with(".ifai/config.toml"));
    }

    #[test]
    fn test_precedence_cli_overrides_env() {
        // 设置环境变量
        std::env::set_var("IFAI_PROVIDER", "openai");

        // CLI arg 应该覆盖 env var
        let result = EffectiveConfig::resolve_provider(Some("deepseek")).unwrap();
        assert_eq!(result.value, "deepseek");
        assert_eq!(result.source, ConfigSource::CliArg);

        // 清理
        std::env::remove_var("IFAI_PROVIDER");
    }

    #[test]
    fn test_precedence_env_overrides_default() {
        // 清除可能存在的 CLI arg
        std::env::set_var("IFAI_PROVIDER", "openai");

        let result = EffectiveConfig::resolve_provider(None).unwrap();
        assert_eq!(result.value, "openai");
        assert_eq!(result.source, ConfigSource::EnvVar);

        // 清理
        std::env::remove_var("IFAI_PROVIDER");
    }
}
