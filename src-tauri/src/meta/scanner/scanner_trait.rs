//! SmartScanner Trait 定义
//!
//! 定义扫描器的核心接口，所有扫描器必须实现此 trait。

use std::path::Path;
use serde::{Deserialize, Serialize};

/// 扫描器 trait：所有扫描器必须实现此接口
pub trait Scanner: Send + Sync {
    type Output: Send + Sync + Serialize;

    /// 扫描指定路径
    fn scan(path: &Path) -> Result<Self::Output, ScanError>;

    /// 获取扫描器配置
    fn config() -> ScannerConfig where Self: Sized;
}

/// 扫描器配置
#[derive(Debug, Clone)]
pub struct ScannerConfig {
    /// 是否并行扫描
    pub parallel: bool,

    /// 最大深度
    pub max_depth: Option<usize>,

    /// 最大文件数
    pub max_files: Option<usize>,

    /// 进度配置
    pub progress: ProgressConfig,

    /// 缓存配置
    pub cache: CacheConfig,

    /// 过滤器
    pub filters: FilterConfig,
}

#[derive(Debug, Clone)]
pub struct ProgressConfig {
    /// 发送间隔（毫秒）
    pub interval_ms: u64,

    /// 节流策略
    pub strategy: ThrottleStrategy,
}

#[derive(Debug, Clone)]
pub enum ThrottleStrategy {
    Throttle,
    Debounce,
    None,
}

#[derive(Debug, Clone)]
pub struct CacheConfig {
    /// 是否启用缓存
    pub enabled: bool,

    /// 缓存策略
    pub strategy: CacheStrategy,

    /// 容量
    pub capacity: Option<usize>,

    /// TTL（秒）
    pub ttl: Option<u64>,
}

#[derive(Debug, Clone)]
pub enum CacheStrategy {
    Lru,
    Fifo,
    None,
}

#[derive(Debug, Clone)]
pub struct FilterConfig {
    pub ignore: Vec<String>,
    pub include: Vec<String>,
}

/// 扫描错误类型
#[derive(Debug, thiserror::Error)]
pub enum ScanError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Path not found: {0}")]
    PathNotFound(String),

    #[error("Max depth exceeded: {0}")]
    MaxDepthExceeded(usize),

    #[error("Max files exceeded: {0}")]
    MaxFilesExceeded(usize),

    #[error("Method not implemented")]
    NotImplemented,
}

/// 扫描结果基础结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanResult {
    /// 文件列表
    pub files: Vec<String>,

    /// 目录列表
    pub directories: Vec<String>,

    /// 统计信息
    pub stats: ScanStats,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanStats {
    /// 总文件数
    pub total_files: usize,

    /// 总目录数
    pub total_directories: usize,

    /// 总大小（字节）
    pub total_size: u64,
}

impl Default for ScannerConfig {
    fn default() -> Self {
        Self {
            parallel: true,
            max_depth: Some(3),
            max_files: Some(10000),
            progress: ProgressConfig::default(),
            cache: CacheConfig::default(),
            filters: FilterConfig::default(),
        }
    }
}

impl ScannerConfig {
    /// 设置并行模式
    pub fn with_parallel(mut self, parallel: bool) -> Self {
        self.parallel = parallel;
        self
    }

    /// 设置最大深度
    pub fn with_max_depth(mut self, depth: Option<usize>) -> Self {
        self.max_depth = depth;
        self
    }

    /// 克隆配置
    pub fn clone_config(&self) -> Self {
        Self {
            parallel: self.parallel,
            max_depth: self.max_depth,
            max_files: self.max_files,
            progress: self.progress.clone(),
            cache: self.cache.clone(),
            filters: self.filters.clone(),
        }
    }
}

impl Default for ProgressConfig {
    fn default() -> Self {
        Self {
            interval_ms: 100,
            strategy: ThrottleStrategy::Throttle,
        }
    }
}

impl Default for CacheConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            strategy: CacheStrategy::Lru,
            capacity: Some(100),
            ttl: Some(3600),
        }
    }
}

impl Default for FilterConfig {
    fn default() -> Self {
        Self {
            ignore: vec![
                "node_modules".to_string(),
                "target".to_string(),
                "dist".to_string(),
                "build".to_string(),
                ".git".to_string(),
                "vendor".to_string(),
                "__pycache__".to_string(),
                ".next".to_string(),
                ".nuxt".to_string(),
            ],
            include: vec![
                "*.rs".to_string(),
                "*.ts".to_string(),
                "*.tsx".to_string(),
                "*.js".to_string(),
                "*.jsx".to_string(),
                "*.md".to_string(),
                "*.toml".to_string(),
                "*.yaml".to_string(),
                "*.yml".to_string(),
                "package.json".to_string(),
                "Cargo.toml".to_string(),
            ],
        }
    }
}
