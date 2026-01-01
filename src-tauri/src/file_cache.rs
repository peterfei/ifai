/*!
File Cache Module - 本地文件内容缓存
====================================

功能：
- 缓存已读取的文件内容，避免重复 I/O
- 基于文件修改时间的自动失效
- LRU 淘汰策略（可选）
- 线程安全访问
*/

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, Duration};
use std::sync::{Arc, Mutex};
use serde::{Serialize, Deserialize};

// ============================================================================
// Cache Entry
// ============================================================================

/// 缓存条目
#[derive(Debug, Clone)]
struct CacheEntry {
    /// 文件内容
    content: String,
    /// 文件修改时间（用于验证缓存是否有效）
    modified_time: SystemTime,
    /// 缓存创建时间（用于 TTL）
    cached_at: SystemTime,
    /// 访问次数（用于 LRU）
    access_count: u64,
}

impl CacheEntry {
    /// 检查缓存是否过期
    fn is_expired(&self, ttl: Duration) -> bool {
        self.cached_at.elapsed().unwrap_or(Duration::ZERO) > ttl
    }

    /// 检查文件是否被修改（缓存失效）
    fn is_modified(&self, path: &Path) -> bool {
        match std::fs::metadata(path).and_then(|m| m.modified()) {
            Ok(modified) => modified != self.modified_time,
            Err(_) => true, // 文件不存在或无法访问，视为已修改
        }
    }
}

// ============================================================================
// File Cache
// ============================================================================

/// 文件缓存配置
#[derive(Debug, Clone)]
pub struct CacheConfig {
    /// 缓存条目最大数量
    pub max_entries: usize,
    /// 缓存 TTL（Time To Live）
    pub ttl: Duration,
    /// 是否启用 LRU 淘汰
    pub enable_lru: bool,
}

impl Default for CacheConfig {
    fn default() -> Self {
        Self {
            max_entries: 100,          // 最多缓存 100 个文件
            ttl: Duration::from_secs(300), // 5 分钟 TTL
            enable_lru: true,
        }
    }
}

/// 文件缓存统计
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheStats {
    /// 缓存命中次数
    pub hits: u64,
    /// 缓存未命中次数
    pub misses: u64,
    /// 当前缓存条目数
    pub entries: usize,
    /// 节省的文件读取次数（字节数）
    pub bytes_saved: u64,
}

/// 文件缓存
pub struct FileCache {
    /// 缓存存储：路径 -> CacheEntry
    cache: Arc<Mutex<HashMap<PathBuf, CacheEntry>>>,
    /// 缓存配置
    config: CacheConfig,
    /// 统计信息
    stats: Arc<Mutex<CacheStats>>,
}

impl FileCache {
    /// 创建新的文件缓存
    pub fn new(config: CacheConfig) -> Self {
        Self {
            cache: Arc::new(Mutex::new(HashMap::new())),
            config,
            stats: Arc::new(Mutex::new(CacheStats {
                hits: 0,
                misses: 0,
                entries: 0,
                bytes_saved: 0,
            })),
        }
    }

    /// 创建默认配置的缓存
    pub fn with_defaults() -> Self {
        Self::new(CacheConfig::default())
    }

    /// 获取文件内容（优先从缓存）
    pub fn get(&self, path: &Path) -> Option<String> {
        let mut cache = self.cache.lock().ok()?;
        let mut stats = self.stats.lock().ok()?;

        // 检查缓存
        if let Some(entry) = cache.get_mut(path) {
            // 检查是否过期
            if entry.is_expired(self.config.ttl) {
                cache.remove(path);
                stats.entries = cache.len();
                stats.misses += 1;
                return None;
            }

            // 检查文件是否被修改
            if entry.is_modified(path) {
                cache.remove(path);
                stats.entries = cache.len();
                stats.misses += 1;
                return None;
            }

            // 缓存命中
            entry.access_count += 1;
            stats.hits += 1;
            stats.bytes_saved += entry.content.len() as u64;

            println!("[FileCache] Cache HIT: {:?}", path);
            return Some(entry.content.clone());
        }

        // 缓存未命中
        stats.misses += 1;
        println!("[FileCache] Cache MISS: {:?}", path);
        None
    }

    /// 插入或更新缓存
    pub fn put(&self, path: PathBuf, content: String) {
        if let (Ok(mut cache), Ok(mut stats)) = (self.cache.lock(), self.stats.lock()) {
            // 获取文件修改时间
            let modified_time = std::fs::metadata(&path)
                .and_then(|m| m.modified())
                .unwrap_or(SystemTime::now());

            // 检查是否需要淘汰
            if cache.len() >= self.config.max_entries && !cache.contains_key(&path) {
                if self.config.enable_lru {
                    // LRU 淘汰：找到访问次数最少的条目
                    if let Some((min_key, _)) = cache.iter().min_by_key(|(_, entry)| entry.access_count) {
                        let key = min_key.clone();
                        cache.remove(&key);
                        println!("[FileCache] LRU evicted: {:?}", key);
                    }
                } else {
                    // 随机淘汰
                    if let Some(key) = cache.keys().next().cloned() {
                        cache.remove(&key);
                        println!("[FileCache] Evicted: {:?}", key);
                    }
                }
            }

            // 插入缓存
            cache.insert(path.clone(), CacheEntry {
                content,
                modified_time,
                cached_at: SystemTime::now(),
                access_count: 1,
            });

            stats.entries = cache.len();
            println!("[FileCache] Cached: {:?} (total: {} entries)", path, cache.len());
        }
    }

    /// 获取文件内容（带自动缓存）
    pub fn read_file(&self, path: &Path) -> Result<String, String> {
        // 尝试从缓存获取
        if let Some(content) = self.get(path) {
            return Ok(content);
        }

        // 缓存未命中，读取文件
        let content = std::fs::read_to_string(path)
            .map_err(|e| format!("Failed to read file: {}", e))?;

        // 插入缓存
        self.put(path.to_path_buf(), content.clone());

        Ok(content)
    }

    /// 批量读取文件（并行缓存）
    pub fn read_files(&self, paths: &[PathBuf]) -> Vec<Result<String, String>> {
        paths.iter()
            .map(|path| self.read_file(path))
            .collect()
    }

    /// 清除缓存
    pub fn clear(&self) {
        if let (Ok(mut cache), Ok(mut stats)) = (self.cache.lock(), self.stats.lock()) {
            cache.clear();
            stats.entries = 0;
            println!("[FileCache] Cache cleared");
        }
    }

    /// 清除过期缓存
    pub fn cleanup_expired(&self) {
        if let (Ok(mut cache), Ok(mut stats)) = (self.cache.lock(), self.stats.lock()) {
            let before_len = cache.len();
            cache.retain(|path, entry| {
                if entry.is_expired(self.config.ttl) {
                    println!("[FileCache] Removing expired: {:?}", path);
                    false
                } else {
                    true
                }
            });

            stats.entries = cache.len();
            let removed = before_len - cache.len();
            if removed > 0 {
                println!("[FileCache] Cleaned up {} expired entries", removed);
            }
        }
    }

    /// 获取统计信息
    pub fn stats(&self) -> CacheStats {
        self.stats.lock().unwrap().clone()
    }

    /// 打印统计信息
    pub fn print_stats(&self) {
        let stats = self.stats();
        let hit_rate = if stats.hits + stats.misses > 0 {
            (stats.hits as f64 / (stats.hits + stats.misses) as f64) * 100.0
        } else {
            0.0
        };

        println!("[FileCache] Statistics:");
        println!("  - Hits: {}", stats.hits);
        println!("  - Misses: {}", stats.misses);
        println!("  - Hit Rate: {:.1}%", hit_rate);
        println!("  - Entries: {}", stats.entries);
        println!("  - Bytes Saved: {}", stats.bytes_saved);
    }
}

// ============================================================================
// Global Cache Instance
// ============================================================================

use std::sync::OnceLock;

/// 全局文件缓存实例
static GLOBAL_CACHE: OnceLock<FileCache> = OnceLock::new();

/// 获取全局文件缓存
pub fn get_global_cache() -> &'static FileCache {
    GLOBAL_CACHE.get_or_init(|| {
        println!("[FileCache] Initializing global cache");
        FileCache::with_defaults()
    })
}

/// 便捷函数：读取文件（使用全局缓存）
pub fn cached_read_file(path: &Path) -> Result<String, String> {
    get_global_cache().read_file(path)
}

/// 便捷函数：批量读取文件（使用全局缓存）
pub fn cached_read_files(paths: &[PathBuf]) -> Vec<Result<String, String>> {
    get_global_cache().read_files(paths)
}

/// 便捷函数：清除全局缓存
pub fn clear_global_cache() {
    get_global_cache().clear();
}

/// 便捷函数：获取全局缓存统计
pub fn get_cache_stats() -> CacheStats {
    get_global_cache().stats()
}

// ============================================================================
// Tauri Commands
// ============================================================================

/// 获取缓存统计
#[tauri::command]
pub fn get_file_cache_stats() -> Result<String, String> {
    let stats = get_cache_stats();
    serde_json::to_string(&stats).map_err(|e| e.to_string())
}

/// 清除文件缓存
#[tauri::command]
pub fn clear_file_cache() -> Result<(), String> {
    clear_global_cache();
    Ok(())
}

/// 打印缓存统计到控制台
#[tauri::command]
pub fn print_file_cache_stats() {
    get_global_cache().print_stats();
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Write;

    #[test]
    fn test_cache_hit_miss() {
        let cache = FileCache::with_defaults();

        // 创建临时文件
        let temp_dir = std::env::temp_dir();
        let test_file = temp_dir.join("test_cache.txt");
        let content = "Hello, Cache!";

        fs::write(&test_file, content).unwrap();

        // 第一次读取（缓存未命中）
        let result1 = cache.read_file(&test_file).unwrap();
        assert_eq!(result1, content);
        assert_eq!(cache.stats().misses, 1);
        assert_eq!(cache.stats().hits, 0);

        // 第二次读取（缓存命中）
        let result2 = cache.read_file(&test_file).unwrap();
        assert_eq!(result2, content);
        assert_eq!(cache.stats().misses, 1);
        assert_eq!(cache.stats().hits, 1);

        // 清理
        fs::remove_file(&test_file).ok();
    }
}
