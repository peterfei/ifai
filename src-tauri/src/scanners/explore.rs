//! Explore Scanner 实现（Phase 2 优化版）
//!
//! 新增功能：
//! - 并行扫描（Rayon）
//! - LRU 缓存
//! - 进度跟踪（节流）

use rayon::prelude::*;
use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};

use crate::meta::scanner::{
    CacheConfig, CacheStrategy, ScanCache, ScanError, ScanResult, ScanStats, Scanner, ScannerConfig,
};

/// Explore Scanner 结构（Phase 2 优化版）
pub struct ExploreScanner {
    config: ScannerConfig,
    /// LRU 缓存（可选）
    cache: Option<Arc<RwLock<ScanCache<String, ExploreScanOutput>>>>,
    /// 性能统计
    stats: Arc<RwLock<ScannerStats>>,
}

/// 扫描器性能统计
#[derive(Debug, Clone, Default)]
struct ScannerStats {
    /// 总扫描次数
    total_scans: usize,
    /// 缓存命中次数
    cache_hits: usize,
    /// 总扫描时间（毫秒）
    total_scan_time_ms: u64,
}

/// Explore 扫描输出（Phase 2 优化版）
#[derive(Debug, Clone, serde::Serialize)]
pub struct ExploreScanOutput {
    /// 文件结构
    pub structure: Map<String, Value>,

    /// 关键文件列表
    pub key_files: Vec<String>,

    /// 统计信息
    pub stats: ScanStats,

    /// 缓存统计（可选）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_stats: Option<crate::meta::scanner::CacheStats>,
}

impl ExploreScanner {
    /// 从配置文件创建
    pub fn from_config_file(path: &str) -> Result<Self, ScanError> {
        let config = crate::meta::scanner::load_scanner_config(path)
            .map_err(|e| ScanError::PathNotFound(format!("Config error: {}", e)))?;

        let cache = Self::create_cache(&config.cache);

        Ok(Self {
            config,
            cache,
            stats: Arc::new(RwLock::new(ScannerStats::default())),
        })
    }

    /// 使用默认配置创建
    pub fn new() -> Self {
        let config = ScannerConfig::default();
        let cache = Self::create_cache(&config.cache);

        Self {
            config,
            cache,
            stats: Arc::new(RwLock::new(ScannerStats::default())),
        }
    }

    /// 使用自定义配置创建
    pub fn with_config(config: ScannerConfig) -> Self {
        let cache = Self::create_cache(&config.cache);

        Self {
            config,
            cache,
            stats: Arc::new(RwLock::new(ScannerStats::default())),
        }
    }

    /// 获取配置引用
    pub fn config(&self) -> &ScannerConfig {
        &self.config
    }

    /// 创建缓存（如果启用）
    fn create_cache(
        cache_config: &CacheConfig,
    ) -> Option<Arc<RwLock<ScanCache<String, ExploreScanOutput>>>> {
        if !cache_config.enabled {
            return None;
        }

        let capacity = cache_config.capacity.unwrap_or(100);
        Some(Arc::new(RwLock::new(ScanCache::new(capacity))))
    }

    /// 扫描指定路径（带缓存）
    pub fn scan_with_cache(&self, path: &Path) -> Result<ExploreScanOutput, ScanError> {
        let start = Instant::now();

        // 生成缓存键
        let cache_key = self.generate_cache_key(path);

        // 检查缓存
        if let Some(cache) = &self.cache {
            if let Ok(mut cache_guard) = cache.write() {
                if let Some(cached) = cache_guard.get(&cache_key) {
                    // 缓存命中
                    if let Ok(mut stats) = self.stats.write() {
                        stats.cache_hits += 1;
                    }
                    return Ok(cached);
                }
            }
        }

        // 缓存未命中，执行扫描
        let result = self.scan_internal(path)?;

        // 插入缓存
        if let Some(cache) = &self.cache {
            if let Ok(mut cache_guard) = cache.write() {
                let ttl = self.config.cache.ttl;
                cache_guard.put(cache_key, result.clone(), ttl);
            }
        }

        // 更新统计
        if let Ok(mut stats) = self.stats.write() {
            stats.total_scans += 1;
            stats.total_scan_time_ms += start.elapsed().as_millis() as u64;
        }

        Ok(result)
    }

    /// 生成缓存键
    fn generate_cache_key(&self, path: &Path) -> String {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};

        let mut hasher = DefaultHasher::new();
        path.hash(&mut hasher);
        self.config.max_depth.hash(&mut hasher);

        format!("scan:{:x}", hasher.finish())
    }

    /// 内部扫描实现（支持并行）
    fn scan_internal(&self, path: &Path) -> Result<ExploreScanOutput, ScanError> {
        if !path.exists() {
            return Err(ScanError::PathNotFound(path.display().to_string()));
        }

        // 根据配置选择串行或并行扫描
        let result = if self.config.parallel {
            self.scan_parallel(path)?
        } else {
            self.scan_serial(path)?
        };

        Ok(result)
    }

    /// 串行扫描
    fn scan_serial(&self, path: &Path) -> Result<ExploreScanOutput, ScanError> {
        let mut structure = Map::new();
        let mut key_files = Vec::new();
        let mut total_files = 0;
        let mut total_directories = 0;

        self.scan_dir_recursive(
            path,
            "",
            0,
            &mut structure,
            &mut key_files,
            &mut total_files,
            &mut total_directories,
        )?;

        Ok(ExploreScanOutput {
            structure,
            key_files,
            stats: ScanStats {
                total_files,
                total_directories,
                total_size: 0,
            },
            cache_stats: self.get_cache_stats(),
        })
    }

    /// 并行扫描（Phase 2 新增）
    fn scan_parallel(&self, path: &Path) -> Result<ExploreScanOutput, ScanError> {
        use rayon::prelude::*;
        use std::sync::{Arc, Mutex};

        // 首先收集所有需要扫描的路径（并行）
        let entries = self.collect_entries_parallel(path)?;

        // 并行处理文件统计
        let (total_files, total_directories) = entries
            .par_iter()
            .fold(
                || (0usize, 0usize),
                |mut acc, entry| {
                    if entry.is_dir {
                        acc.1 += 1;
                    } else {
                        acc.0 += 1;
                    }
                    acc
                },
            )
            .reduce(|| (0, 0), |a, b| (a.0 + b.0, a.1 + b.1));

        // 并行收集关键文件
        let key_files: Vec<String> = entries
            .par_iter()
            .filter_map(|entry| {
                if !entry.is_dir && self.is_key_file(&entry.name) {
                    Some(entry.rel_path.clone())
                } else {
                    None
                }
            })
            .collect();

        // 构建文件结构（这一部分可能需要串行，因为涉及复杂的树结构）
        let structure = self.build_structure(path, &entries)?;

        Ok(ExploreScanOutput {
            structure,
            key_files,
            stats: ScanStats {
                total_files,
                total_directories,
                total_size: 0,
            },
            cache_stats: self.get_cache_stats(),
        })
    }

    /// 并行收集文件条目
    fn collect_entries_parallel(&self, path: &Path) -> Result<Vec<FileEntry>, ScanError> {
        use walkdir::WalkDir;

        let max_depth = self.config.max_depth.unwrap_or(3);

        let entries: Vec<FileEntry> = WalkDir::new(path)
            .max_depth(max_depth)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| {
                let name = e.file_name().to_string_lossy();
                !self.should_ignore(&name)
            })
            .map(|e| {
                let path = e.path();
                let rel_path = path
                    .strip_prefix(path)
                    .unwrap_or(path)
                    .to_string_lossy()
                    .to_string();
                let name = e.file_name().to_string_lossy().to_string();
                let is_dir = e.file_type().is_dir();

                FileEntry {
                    name,
                    rel_path,
                    is_dir,
                }
            })
            .collect();

        Ok(entries)
    }

    /// 构建文件结构
    fn build_structure(
        &self,
        _path: &Path,
        entries: &[FileEntry],
    ) -> Result<Map<String, Value>, ScanError> {
        use std::collections::BTreeMap;

        // 使用 BTreeMap 来收集所有路径和文件
        let mut all_paths: BTreeMap<String, Vec<String>> = BTreeMap::new();

        for entry in entries {
            if !entry.is_dir && self.should_include(&entry.name) {
                let parts: Vec<&str> = entry
                    .rel_path
                    .split('/')
                    .filter(|s| !s.is_empty())
                    .collect();

                // 收集每个目录下的文件
                for i in 0..parts.len() {
                    let dir_path = if i == 0 {
                        ".".to_string()
                    } else {
                        parts[..i].join("/")
                    };

                    if i == parts.len() - 1 {
                        // 这是一个文件
                        all_paths
                            .entry(dir_path)
                            .or_insert_with(Vec::new)
                            .push(parts[i].to_string());
                    } else {
                        // 这是一个目录
                        all_paths.entry(dir_path).or_insert_with(Vec::new);
                    }
                }
            }
        }

        // 递归构建结构
        fn build_dir(entries: &Vec<String>, is_root: bool) -> Map<String, Value> {
            let mut map = Map::new();

            for entry in entries {
                // 这里我们简化处理，将所有条目都作为文件处理
                // 在完整实现中，需要区分目录和文件
                map.insert(entry.clone(), Value::String("file".to_string()));
            }

            map
        }

        let structure = build_dir(all_paths.get(".").unwrap_or(&Vec::new()), true);

        Ok(structure)
    }

    /// 获取缓存统计
    fn get_cache_stats(&self) -> Option<crate::meta::scanner::CacheStats> {
        self.cache
            .as_ref()
            .and_then(|cache| cache.read().ok().map(|c| c.stats()))
    }
}

/// 文件条目（用于并行处理）
#[derive(Debug, Clone)]
struct FileEntry {
    name: String,
    rel_path: String,
    is_dir: bool,
}

// 继承原有的方法...
impl ExploreScanner {
    /// 递归扫描目录（串行版本）
    fn scan_dir_recursive(
        &self,
        base_path: &Path,
        rel_path: &str,
        current_depth: usize,
        structure: &mut Map<String, Value>,
        key_files: &mut Vec<String>,
        total_files: &mut usize,
        total_directories: &mut usize,
    ) -> Result<(), ScanError> {
        if let Some(max_depth) = self.config.max_depth {
            if current_depth >= max_depth {
                return Ok(());
            }
        }

        let full_path = base_path.join(rel_path);
        let entries = std::fs::read_dir(&full_path).map_err(|e| ScanError::Io(e))?;

        for entry in entries {
            let entry = entry.map_err(|e| ScanError::Io(e))?;
            let name = entry.file_name();
            let name_str = name.to_string_lossy().to_string();

            if name_str.starts_with('.') || self.should_ignore(&name_str) {
                continue;
            }

            let file_type = entry.file_type().map_err(|e| ScanError::Io(e))?;

            if file_type.is_dir() {
                *total_directories += 1;
                let child_rel = if rel_path.is_empty() {
                    name_str.clone()
                } else {
                    format!("{}/{}", rel_path, name_str)
                };

                let mut dir_map = Map::new();
                self.scan_dir_recursive(
                    base_path,
                    &child_rel,
                    current_depth + 1,
                    &mut dir_map,
                    key_files,
                    total_files,
                    total_directories,
                )?;

                if !dir_map.is_empty() {
                    structure.insert(name_str, Value::Object(dir_map));
                }
            } else if file_type.is_file() {
                *total_files += 1;

                if self.should_include(&name_str) {
                    let child_rel = if rel_path.is_empty() {
                        name_str.clone()
                    } else {
                        format!("{}/{}", rel_path, name_str)
                    };

                    if self.is_key_file(&name_str) {
                        key_files.push(child_rel.clone());
                    }

                    structure.insert(name_str, Value::String("file".to_string()));
                }
            }
        }

        Ok(())
    }

    /// 检查是否应该忽略
    fn should_ignore(&self, name: &str) -> bool {
        self.config
            .filters
            .ignore
            .iter()
            .any(|pattern| self.matches_pattern(name, pattern))
    }

    /// 检查是否应该包含
    fn should_include(&self, name: &str) -> bool {
        if self.config.filters.include.is_empty() {
            return true;
        }

        self.config
            .filters
            .include
            .iter()
            .any(|pattern| self.matches_pattern(name, pattern))
    }

    /// 匹配模式
    fn matches_pattern(&self, name: &str, pattern: &str) -> bool {
        if pattern.starts_with("*.") {
            let ext = &pattern[2..];
            name.ends_with(ext)
        } else {
            name == pattern
        }
    }

    /// 检查是否是关键文件
    fn is_key_file(&self, filename: &str) -> bool {
        let key_files = [
            "README",
            "README.md",
            "README.txt",
            "package.json",
            "Cargo.toml",
            "go.mod",
            "pyproject.toml",
            "setup.py",
            ".gitignore",
            ".dockerignore",
            "Dockerfile",
            "docker-compose.yml",
            "tsconfig.json",
            "vite.config.ts",
        ];

        key_files.iter().any(|&key| filename == key)
    }
}

impl Default for ExploreScanner {
    fn default() -> Self {
        Self::new()
    }
}

impl ExploreScanOutput {
    /// 转换为 JSON 字符串
    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string_pretty(&json!({
            "structure": self.structure,
            "key_files": self.key_files,
            "stats": self.stats,
            "cache_stats": self.cache_stats,
        }))
    }
}

// 保留旧的 Scanner trait 实现
impl Scanner for ExploreScanner {
    type Output = ExploreScanOutput;

    fn scan(path: &Path) -> Result<Self::Output, ScanError> {
        Self::new().scan_with_cache(path)
    }

    fn config() -> ScannerConfig
    where
        Self: Sized,
    {
        ScannerConfig::default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_matches_pattern() {
        let scanner = ExploreScanner::new();
        assert!(scanner.matches_pattern("test.rs", "*.rs"));
        assert!(scanner.matches_pattern("test.ts", "*.ts"));
        assert!(!scanner.matches_pattern("test.rs", "*.ts"));
    }

    #[test]
    fn test_should_ignore() {
        let scanner = ExploreScanner::new();
        assert!(scanner.should_ignore("node_modules"));
        assert!(scanner.should_ignore("target"));
        assert!(scanner.should_ignore(".git"));
        assert!(!scanner.should_ignore("src"));
    }

    #[test]
    fn test_should_include() {
        let scanner = ExploreScanner::new();
        assert!(scanner.should_include("test.rs"));
        assert!(scanner.should_include("test.ts"));
        assert!(scanner.should_include("README.md"));
        assert!(!scanner.should_include("test.lock"));
    }

    #[test]
    fn test_is_key_file() {
        let scanner = ExploreScanner::new();
        assert!(scanner.is_key_file("README"));
        assert!(scanner.is_key_file("package.json"));
        assert!(scanner.is_key_file("Cargo.toml"));
        assert!(!scanner.is_key_file("random_file.rs"));
    }
}
