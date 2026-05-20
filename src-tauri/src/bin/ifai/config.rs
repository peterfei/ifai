//! Configuration System — 4-Layer Precedence
//!
//! 🏛️ 元编程：声明式配置，零手写解析
//!
//! Precedence Chain (highest to lowest):
//! 1. CLI arguments (--provider, --model, --api-key)
//! 2. Environment variables ({PROVIDER}_API_KEY, IFAI_PROVIDER, IFAI_MODEL)
//! 3. Config file (~/.ifai/config.toml)
//! 4. YAML defaults (from provider metadata)

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

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
        Ok(TracedValue::new(
            "deepseek".to_string(),
            ConfigSource::YamlDefault,
        ))
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
        let default_model = spec
            .models
            .first()
            .map(|m| m.id.clone())
            .unwrap_or_else(|| "unknown".to_string());

        Ok(TracedValue::new(default_model, ConfigSource::YamlDefault))
    }

    /// 解析 api_key（CLI > env > TOML > None）
    fn resolve_api_key(
        provider: &str,
        cli_arg: Option<&str>,
    ) -> Result<TracedValue<Option<String>>, String> {
        if let Some(key) = cli_arg {
            return Ok(TracedValue::new(
                Some(key.to_string()),
                ConfigSource::CliArg,
            ));
        }

        // 从 provider spec 派生环境变量名
        let spec = crate::provider::resolve_provider(provider)?;
        let env_key = crate::provider::resolve_env_key(spec);
        let full_id = spec.metadata.id.clone();

        if let Ok(key) = std::env::var(&env_key) {
            return Ok(TracedValue::new(Some(key), ConfigSource::EnvVar));
        }

        // 检查 TOML 配置文件（使用完整 provider ID，如 "deepseek-official"）
        if let Some(key) = read_provider_api_key_from_toml(&full_id) {
            return Ok(TracedValue::new(Some(key), ConfigSource::ConfigFile));
        }

        Ok(TracedValue::new(None, ConfigSource::YamlDefault))
    }

    /// 解析 base_url（CLI > 环境变量 > TOML > None）
    fn resolve_base_url(cli_arg: Option<&str>, provider: &str) -> TracedValue<Option<String>> {
        // CLI 参数优先级最高
        if let Some(url) = cli_arg {
            return TracedValue::new(Some(url.to_string()), ConfigSource::CliArg);
        }

        // 其次检查环境变量 IFAI_API_BASE（用于测试）
        if let Ok(url) = std::env::var("IFAI_API_BASE") {
            return TracedValue::new(Some(url), ConfigSource::EnvVar);
        }

        // 用完整 provider ID 查找 TOML 配置
        let full_id = crate::provider::resolve_provider(provider)
            .map(|spec| spec.metadata.id.clone())
            .unwrap_or_else(|_| provider.to_string());

        // 检查 TOML 配置文件
        if let Some(url) = read_provider_base_url_from_toml(&full_id) {
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
    if let Ok(path) = std::env::var("IFAI_CONFIG_PATH") {
        return PathBuf::from(path);
    }
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

    /// TUI 配置
    #[serde(default)]
    tui: TomlTuiSection,
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

/// 🔥 Phase 6: TUI 配置段
#[derive(Debug, Clone, serde::Deserialize, Default)]
struct TomlTuiSection {
    /// 事件持久化配置
    #[serde(default)]
    event_persistence: TomlEventPersistenceConfig,
}

/// 🔥 Phase 6: 事件持久化配置
#[derive(Debug, Clone, serde::Deserialize)]
pub struct TomlEventPersistenceConfig {
    /// 是否启用事件持久化
    #[serde(default = "default_true")]
    pub enabled: bool,

    /// 快照间隔（分钟）
    #[serde(default = "default_snapshot_interval")]
    pub snapshot_interval_minutes: u64,

    /// 触发快照的事件数
    #[serde(default = "default_snapshot_event_count")]
    pub snapshot_event_count: u64,

    /// 最大快照保留数
    #[serde(default = "default_max_snapshots")]
    pub max_snapshots: usize,
}

impl Default for TomlEventPersistenceConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            snapshot_interval_minutes: default_snapshot_interval(),
            snapshot_event_count: default_snapshot_event_count(),
            max_snapshots: default_max_snapshots(),
        }
    }
}

fn default_true() -> bool { true }
fn default_snapshot_interval() -> u64 { 10 }
fn default_snapshot_event_count() -> u64 { 50 }
fn default_max_snapshots() -> usize { 10 }

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
        // 使用短名称（如 "openai" 而非 "openai-official"），匹配用户直觉
        let short_id = provider_id
            .strip_suffix("-official")
            .unwrap_or(provider_id);
        toml.push_str(&format!("[providers.{}]\n", short_id));

        // API key hint
        let env_var_name = format!(
            "{}_API_KEY",
            short_id
                .replace("-", "_")
                .to_uppercase()
        );
        toml.push_str(&format!(
            "# API key (or set {} environment variable)\n",
            env_var_name
        ));
        toml.push_str(&format!("# api_key = \"sk-xxx\"\n"));

        // Base URL override
        toml.push_str(&format!(
            "# Base URL (default: {})\n",
            spec.api_spec.base_url
        ));
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
            tui: TomlTuiSection::default(),
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
    fs::write(&path, template).map_err(|e| format!("Failed to write config file: {}", e))?;

    Ok(path)
}

/// 🔥 确保配置文件存在（首次运行自动创建，已存在则跳过）
pub fn ensure_config() -> Result<PathBuf, String> {
    let path = config_file_path();
    if path.exists() {
        return Ok(path);
    }
    init_config_file()
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
/// 支持短名称 fallback: "[providers.openai]" 和 "[providers.openai-official]" 均可匹配
fn read_provider_api_key_from_toml(provider_id: &str) -> Option<String> {
    let config = read_toml_config().ok()?;

    // 1. 精确匹配完整 ID（如 "openai-official"）
    if let Some(provider_cfg) = config.providers.get(provider_id) {
        if let Some(key) = &provider_cfg.api_key {
            return Some(key.clone());
        }
    }

    // 2. Fallback: 去除 "-official" 后缀再试（"openai-official" → "openai"）
    if let Some(short_id) = provider_id.strip_suffix("-official") {
        if let Some(provider_cfg) = config.providers.get(short_id) {
            if let Some(key) = &provider_cfg.api_key {
                return Some(key.clone());
            }
        }
    }

    None
}

/// 🔥 从 TOML 配置读取 provider 的 base URL
/// 支持短名称 fallback: "[providers.openai]" 和 "[providers.openai-official]" 均可匹配
fn read_provider_base_url_from_toml(provider_id: &str) -> Option<String> {
    let config = read_toml_config().ok()?;

    // 1. 精确匹配完整 ID（如 "openai-official"）
    if let Some(provider_cfg) = config.providers.get(provider_id) {
        if let Some(url) = &provider_cfg.base_url {
            return Some(url.clone());
        }
    }

    // 2. Fallback: 去除 "-official" 后缀再试（"openai-official" → "openai"）
    if let Some(short_id) = provider_id.strip_suffix("-official") {
        if let Some(provider_cfg) = config.providers.get(short_id) {
            if let Some(url) = &provider_cfg.base_url {
                return Some(url.clone());
            }
        }
    }

    None
}

/// 🔥 Phase 6: 读取事件持久化配置
pub fn read_event_persistence_config() -> TomlEventPersistenceConfig {
    read_toml_config()
        .map(|c| c.tui.event_persistence)
        .unwrap_or_default()
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    /// 序列化环境变量操作，避免并行测试竞争
    static ENV_LOCK: Mutex<()> = Mutex::new(());

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
        let _lock = ENV_LOCK.lock().unwrap();
        std::env::remove_var("IFAI_PROVIDER");
        std::env::set_var("IFAI_CONFIG_PATH", "/nonexistent/ifai/config.toml");

        let result = EffectiveConfig::resolve_provider(None).unwrap();
        assert_eq!(result.value, "deepseek");
        assert_eq!(result.source, ConfigSource::YamlDefault);

        std::env::remove_var("IFAI_CONFIG_PATH");
    }

    #[test]
    fn test_resolve_model_cli_arg() {
        let result = EffectiveConfig::resolve_model("deepseek", Some("deepseek-coder")).unwrap();
        assert_eq!(result.value, "deepseek-coder");
        assert_eq!(result.source, ConfigSource::CliArg);
    }

    #[test]
    fn test_resolve_model_default_from_provider() {
        let _lock = ENV_LOCK.lock().unwrap();
        std::env::remove_var("IFAI_MODEL");
        std::env::set_var("IFAI_CONFIG_PATH", "/nonexistent/ifai/config.toml");

        let result = EffectiveConfig::resolve_model("deepseek", None).unwrap();
        assert!(!result.value.is_empty());
        assert_eq!(result.source, ConfigSource::YamlDefault);

        std::env::remove_var("IFAI_CONFIG_PATH");
    }

    #[test]
    fn test_resolve_api_key_cli_arg() {
        let result = EffectiveConfig::resolve_api_key("openai", Some("sk-test")).unwrap();
        assert_eq!(result.value, Some("sk-test".to_string()));
        assert_eq!(result.source, ConfigSource::CliArg);
    }

    #[test]
    fn test_resolve_api_key_none() {
        let _lock = ENV_LOCK.lock().unwrap();
        std::env::remove_var("OPENAI_API_KEY");
        std::env::set_var("IFAI_CONFIG_PATH", "/nonexistent/ifai/config.toml");

        let result = EffectiveConfig::resolve_api_key("openai", None).unwrap();
        assert_eq!(result.value, None);
        assert_eq!(result.source, ConfigSource::YamlDefault);

        std::env::remove_var("IFAI_CONFIG_PATH");
    }

    #[test]
    fn test_resolve_base_url_cli_arg() {
        let result = EffectiveConfig::resolve_base_url(Some("https://api.custom.com"), "deepseek");
        assert_eq!(result.value, Some("https://api.custom.com".to_string()));
        assert_eq!(result.source, ConfigSource::CliArg);
    }

    #[test]
    fn test_resolve_base_url_env_var() {
        let _lock = ENV_LOCK.lock().unwrap();
        std::env::set_var("IFAI_API_BASE", "https://mock.test.com");
        let result = EffectiveConfig::resolve_base_url(None, "openai");
        std::env::remove_var("IFAI_API_BASE");
        assert_eq!(result.value, Some("https://mock.test.com".to_string()));
        assert_eq!(result.source, ConfigSource::EnvVar);
    }

    #[test]
    fn test_resolve_base_url_env_var_priority() {
        let _lock = ENV_LOCK.lock().unwrap();
        std::env::set_var("IFAI_API_BASE", "https://mock.test.com");
        // CLI 参数应该优先于环境变量
        let result = EffectiveConfig::resolve_base_url(Some("https://cli.custom.com"), "openai");
        std::env::remove_var("IFAI_API_BASE");
        assert_eq!(result.value, Some("https://cli.custom.com".to_string()));
        assert_eq!(result.source, ConfigSource::CliArg);
    }

    #[test]
    fn test_resolve_base_url_none() {
        let _lock = ENV_LOCK.lock().unwrap();
        std::env::set_var("IFAI_CONFIG_PATH", "/nonexistent/ifai/config.toml");
        let result = EffectiveConfig::resolve_base_url(None, "deepseek");
        std::env::remove_var("IFAI_CONFIG_PATH");
        assert_eq!(result.value, None);
        assert_eq!(result.source, ConfigSource::YamlDefault);
    }

    #[test]
    fn test_effective_config_full_resolution() {
        let _lock = ENV_LOCK.lock().unwrap();
        std::env::remove_var("IFAI_PROVIDER");
        std::env::remove_var("IFAI_MODEL");
        std::env::remove_var("DEEPSEEK_API_KEY");
        std::env::set_var("IFAI_CONFIG_PATH", "/nonexistent/ifai/config.toml");

        let config = EffectiveConfig::resolve(
            Some("deepseek"),
            Some("deepseek-chat"),
            Some("sk-test"),
            None,
        )
        .unwrap();

        std::env::remove_var("IFAI_CONFIG_PATH");

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
        )
        .unwrap();

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
        let _lock = ENV_LOCK.lock().unwrap();
        std::env::set_var("IFAI_PROVIDER", "openai");

        let result = EffectiveConfig::resolve_provider(None).unwrap();
        assert_eq!(result.value, "openai");
        assert_eq!(result.source, ConfigSource::EnvVar);

        // 清理
        std::env::remove_var("IFAI_PROVIDER");
    }

    #[test]
    fn test_toml_config_parsing() {
        // 测试 TOML 配置解析
        let toml_content = r#"
[default]
provider = "openai"
model = "gpt-4o"

[providers.openai-official]
api_key = "sk-test-key"
base_url = "https://api.custom.com"
"#;

        let config: TomlConfig = toml::from_str(toml_content).unwrap();
        assert_eq!(config.default.provider, Some("openai".to_string()));
        assert_eq!(config.default.model, Some("gpt-4o".to_string()));
        assert_eq!(
            config.providers.get("openai-official").unwrap().api_key,
            Some("sk-test-key".to_string())
        );
        assert_eq!(
            config.providers.get("openai-official").unwrap().base_url,
            Some("https://api.custom.com".to_string())
        );
    }

    #[test]
    fn test_generate_toml_template() {
        // 测试 TOML 模板生成
        let template = generate_toml_template();

        // 验证包含关键部分
        assert!(template.contains("[default]"));
        assert!(template.contains("provider ="));
        assert!(template.contains("[providers."));
        assert!(template.contains("# API key"));
        assert!(template.contains("Precedence"));
    }

    #[test]
    fn test_ensure_config_creates_when_missing() {
        let _lock = ENV_LOCK.lock().unwrap();
        let temp_dir = std::env::temp_dir().join(format!(
            "ifai_test_ensure_cfg_{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&temp_dir);
        std::fs::create_dir_all(&temp_dir).unwrap();
        let config_path = temp_dir.join("config.toml");

        // 用环境变量指向临时路径
        let original = std::env::var("IFAI_CONFIG_PATH").ok();
        std::env::set_var("IFAI_CONFIG_PATH", &config_path);

        let result = ensure_config();
        assert!(result.is_ok(), "应成功创建 config.toml");
        assert!(config_path.exists(), "config.toml 应被创建");
        let content = std::fs::read_to_string(&config_path).unwrap();
        assert!(content.contains("[default]"), "应包含默认配置");

        // 恢复
        if let Some(val) = original {
            std::env::set_var("IFAI_CONFIG_PATH", val);
        } else {
            std::env::remove_var("IFAI_CONFIG_PATH");
        }
        let _ = std::fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn test_ensure_config_idempotent() {
        let _lock = ENV_LOCK.lock().unwrap();
        let temp_dir = std::env::temp_dir().join(format!(
            "ifai_test_ensure_cfg_idem_{}",
            std::process::id()
        ));
        let _ = std::fs::create_dir_all(&temp_dir);
        let config_path = temp_dir.join("config.toml");

        let custom = "# 自定义配置\n[default]\nprovider = \"test\"\n";
        std::fs::write(&config_path, custom).unwrap();

        let original = std::env::var("IFAI_CONFIG_PATH").ok();
        std::env::set_var("IFAI_CONFIG_PATH", &config_path);

        let result = ensure_config();
        assert!(result.is_ok());
        let content = std::fs::read_to_string(&config_path).unwrap();
        assert_eq!(content, custom, "已有内容不应被覆盖");

        if let Some(val) = original {
            std::env::set_var("IFAI_CONFIG_PATH", val);
        } else {
            std::env::remove_var("IFAI_CONFIG_PATH");
        }
        let _ = std::fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn test_short_name_fallback_api_key() {
        let _lock = ENV_LOCK.lock().unwrap();

        // 用户在 TOML 中使用短名称 [providers.openai]
        let temp_dir = std::env::temp_dir().join(format!(
            "ifai_test_short_name_apikey_{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&temp_dir);
        std::fs::create_dir_all(&temp_dir).unwrap();
        let config_path = temp_dir.join("config.toml");

        let toml_content = r#"
[default]
provider = "openai"

[providers.openai]
api_key = "sk-test-short-name"
base_url = "https://api.custom.com"
"#;
        std::fs::write(&config_path, toml_content).unwrap();

        let original = std::env::var("IFAI_CONFIG_PATH").ok();
        std::env::set_var("IFAI_CONFIG_PATH", &config_path);

        // 使用完整 ID "openai-official" 查找，应 fallback 到短名 "openai"
        let key = read_provider_api_key_from_toml("openai-official");
        assert_eq!(key, Some("sk-test-short-name".to_string()),
            "应通过短名称 fallback 找到 api_key");

        let url = read_provider_base_url_from_toml("openai-official");
        assert_eq!(url, Some("https://api.custom.com".to_string()),
            "应通过短名称 fallback 找到 base_url");

        // 恢复
        if let Some(val) = original {
            std::env::set_var("IFAI_CONFIG_PATH", val);
        } else {
            std::env::remove_var("IFAI_CONFIG_PATH");
        }
        let _ = std::fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn test_full_id_api_key_still_works() {
        let _lock = ENV_LOCK.lock().unwrap();

        // 用户在 TOML 中使用完整 ID [providers.openai-official]
        let temp_dir = std::env::temp_dir().join(format!(
            "ifai_test_full_id_apikey_{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&temp_dir);
        std::fs::create_dir_all(&temp_dir).unwrap();
        let config_path = temp_dir.join("config.toml");

        let toml_content = r#"
[providers.openai-official]
api_key = "sk-test-full-id"
"#;
        std::fs::write(&config_path, toml_content).unwrap();

        let original = std::env::var("IFAI_CONFIG_PATH").ok();
        std::env::set_var("IFAI_CONFIG_PATH", &config_path);

        // 精确匹配完整 ID
        let key = read_provider_api_key_from_toml("openai-official");
        assert_eq!(key, Some("sk-test-full-id".to_string()),
            "完整 ID 匹配应正常工作");

        // 恢复
        if let Some(val) = original {
            std::env::set_var("IFAI_CONFIG_PATH", val);
        } else {
            std::env::remove_var("IFAI_CONFIG_PATH");
        }
        let _ = std::fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn test_short_name_exact_match_priority() {
        let _lock = ENV_LOCK.lock().unwrap();

        // 同时配置短名和完整 ID 时，完整 ID 优先
        let temp_dir = std::env::temp_dir().join(format!(
            "ifai_test_priority_{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&temp_dir);
        std::fs::create_dir_all(&temp_dir).unwrap();
        let config_path = temp_dir.join("config.toml");

        let toml_content = r#"
[providers.openai]
api_key = "sk-short-name"

[providers.openai-official]
api_key = "sk-full-id"
"#;
        std::fs::write(&config_path, toml_content).unwrap();

        let original = std::env::var("IFAI_CONFIG_PATH").ok();
        std::env::set_var("IFAI_CONFIG_PATH", &config_path);

        let key = read_provider_api_key_from_toml("openai-official");
        assert_eq!(key, Some("sk-full-id".to_string()),
            "完整 ID 精确匹配应优先于短名 fallback");

        // 恢复
        if let Some(val) = original {
            std::env::set_var("IFAI_CONFIG_PATH", val);
        } else {
            std::env::remove_var("IFAI_CONFIG_PATH");
        }
        let _ = std::fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn test_all_providers_short_name_fallback() {
        let _lock = ENV_LOCK.lock().unwrap();

        let temp_dir = std::env::temp_dir().join(format!(
            "ifai_test_all_providers_{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&temp_dir);
        std::fs::create_dir_all(&temp_dir).unwrap();
        let config_path = temp_dir.join("config.toml");

        let toml_content = r#"
[providers.openai]
api_key = "sk-openai"

[providers.deepseek]
api_key = "sk-deepseek"

[providers.zhipu]
api_key = "sk-zhipu"

[providers.kimi]
api_key = "sk-kimi"

[providers.gemini]
api_key = "sk-gemini"
"#;
        std::fs::write(&config_path, toml_content).unwrap();

        let original = std::env::var("IFAI_CONFIG_PATH").ok();
        std::env::set_var("IFAI_CONFIG_PATH", &config_path);

        // 验证所有 provider 的短名 fallback
        assert_eq!(read_provider_api_key_from_toml("openai-official"), Some("sk-openai".to_string()));
        assert_eq!(read_provider_api_key_from_toml("deepseek-official"), Some("sk-deepseek".to_string()));
        assert_eq!(read_provider_api_key_from_toml("zhipu-official"), Some("sk-zhipu".to_string()));
        assert_eq!(read_provider_api_key_from_toml("kimi-official"), Some("sk-kimi".to_string()));
        assert_eq!(read_provider_api_key_from_toml("gemini-official"), Some("sk-gemini".to_string()));

        // 恢复
        if let Some(val) = original {
            std::env::set_var("IFAI_CONFIG_PATH", val);
        } else {
            std::env::remove_var("IFAI_CONFIG_PATH");
        }
        let _ = std::fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn test_toml_template_uses_short_names() {
        // 模板应使用短名称如 [providers.openai]，而非 [providers.openai-official]
        let template = generate_toml_template();
        assert!(template.contains("[providers.openai]"), "模板应使用短名称 [providers.openai]");
        assert!(template.contains("[providers.deepseek]"), "模板应使用短名称 [providers.deepseek]");
        assert!(!template.contains("[providers.openai-official]"), "模板不应使用完整 ID");
        assert!(!template.contains("[providers.deepseek-official]"), "模板不应使用完整 ID");
    }
}
