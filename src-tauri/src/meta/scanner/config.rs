//! 配置文件加载和管理
//!
//! 支持从 YAML 文件加载扫描器配置

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

use super::scanner_trait::*;

/// YAML 配置文件格式
#[derive(Debug, Deserialize, Serialize)]
pub struct ScannerYamlConfig {
    /// 扫描器配置
    pub scanner: ScannerSection,

    /// 进度配置
    #[serde(default)]
    pub progress: ProgressSection,

    /// 缓存配置
    #[serde(default)]
    pub cache: CacheSection,

    /// 过滤器配置
    #[serde(default)]
    pub filters: FiltersSection,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct ScannerSection {
    /// 是否并行扫描
    #[serde(default = "default_true")]
    pub parallel: bool,

    /// 最大深度
    #[serde(default)]
    pub max_depth: Option<usize>,

    /// 最大文件数
    #[serde(default)]
    pub max_files: Option<usize>,
}

#[derive(Debug, Deserialize, Serialize, Default)]
pub struct ProgressSection {
    /// 发送间隔
    #[serde(default = "default_interval")]
    pub interval: String,

    /// 节流策略
    #[serde(default = "default_throttle")]
    pub strategy: String,
}

#[derive(Debug, Deserialize, Serialize, Default)]
pub struct CacheSection {
    /// 是否启用缓存
    #[serde(default = "default_true")]
    pub enabled: bool,

    /// 缓存策略
    #[serde(default = "default_lru")]
    pub strategy: String,

    /// 容量
    #[serde(default)]
    pub capacity: Option<usize>,

    /// TTL（秒）
    #[serde(default)]
    pub ttl: Option<u64>,
}

#[derive(Debug, Deserialize, Serialize, Default)]
pub struct FiltersSection {
    /// 忽略列表
    #[serde(default)]
    pub ignore: Vec<String>,

    /// 包含列表
    #[serde(default)]
    pub include: Vec<String>,
}

fn default_true() -> bool {
    true
}
fn default_interval() -> String {
    "100ms".to_string()
}
fn default_throttle() -> String {
    "throttle".to_string()
}
fn default_lru() -> String {
    "lru".to_string()
}

/// 从 YAML 文件加载配置
pub fn load_scanner_config(path: &str) -> Result<ScannerConfig, ConfigError> {
    let content = fs::read_to_string(path).map_err(|e| ConfigError::ReadError(e.to_string()))?;

    let yaml_config: ScannerYamlConfig =
        serde_yaml::from_str(&content).map_err(|e| ConfigError::ParseError(e.to_string()))?;

    Ok(yaml_config.into())
}

/// 配置错误类型
#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("Read error: {0}")]
    ReadError(String),

    #[error("Parse error: {0}")]
    ParseError(String),

    #[error("Validation error: {0}")]
    ValidationError(String),
}

impl From<ScannerYamlConfig> for ScannerConfig {
    fn from(yaml: ScannerYamlConfig) -> Self {
        Self {
            parallel: yaml.scanner.parallel,
            max_depth: yaml.scanner.max_depth,
            max_files: yaml.scanner.max_files,
            progress: ProgressConfig {
                interval_ms: parse_interval(&yaml.progress.interval),
                strategy: parse_throttle_strategy(&yaml.progress.strategy),
            },
            cache: CacheConfig {
                enabled: yaml.cache.enabled,
                strategy: parse_cache_strategy(&yaml.cache.strategy),
                capacity: yaml.cache.capacity,
                ttl: yaml.cache.ttl,
            },
            filters: FilterConfig {
                ignore: yaml.filters.ignore,
                include: yaml.filters.include,
            },
        }
    }
}

/// 解析间隔字符串（如 "100ms", "1s"）
fn parse_interval(s: &str) -> u64 {
    if s.ends_with("ms") {
        s.trim_end_matches("ms").parse().unwrap_or(100)
    } else if s.ends_with('s') {
        s.trim_end_matches('s').parse::<u64>().unwrap_or(1) * 1000
    } else {
        100
    }
}

/// 解析节流策略
fn parse_throttle_strategy(s: &str) -> ThrottleStrategy {
    match s.to_lowercase().as_str() {
        "throttle" => ThrottleStrategy::Throttle,
        "debounce" => ThrottleStrategy::Debounce,
        "none" => ThrottleStrategy::None,
        _ => ThrottleStrategy::Throttle,
    }
}

/// 解析缓存策略
fn parse_cache_strategy(s: &str) -> CacheStrategy {
    match s.to_lowercase().as_str() {
        "lru" => CacheStrategy::Lru,
        "fifo" => CacheStrategy::Fifo,
        "none" => CacheStrategy::None,
        _ => CacheStrategy::Lru,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_interval() {
        assert_eq!(parse_interval("100ms"), 100);
        assert_eq!(parse_interval("1s"), 1000);
        assert_eq!(parse_interval("2s"), 2000);
        assert_eq!(parse_interval("invalid"), 100);
    }

    #[test]
    fn test_parse_throttle_strategy() {
        assert!(matches!(
            parse_throttle_strategy("throttle"),
            ThrottleStrategy::Throttle
        ));
        assert!(matches!(
            parse_throttle_strategy("debounce"),
            ThrottleStrategy::Debounce
        ));
        assert!(matches!(
            parse_throttle_strategy("none"),
            ThrottleStrategy::None
        ));
    }

    #[test]
    fn test_parse_cache_strategy() {
        assert!(matches!(parse_cache_strategy("lru"), CacheStrategy::Lru));
        assert!(matches!(parse_cache_strategy("fifo"), CacheStrategy::Fifo));
        assert!(matches!(parse_cache_strategy("none"), CacheStrategy::None));
    }
}
