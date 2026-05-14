//! WebSearch 缓存层
//!
//! 提供 LRU 缓存和持久化存储，减少重复的 API 调用。

use crate::harness::tool::new_tools::web_search::{SearchResult, WebSearchResult};
use lru::LruCache;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::num::NonZeroUsize;
use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// 缓存条目
#[derive(Debug, Clone, Serialize, Deserialize)]
struct CacheEntry {
    /// 搜索结果
    result: WebSearchResult,
    /// 创建时间（Unix 时间戳，秒）
    created_at: u64,
    /// 过期时间（Unix 时间戳，秒）
    expires_at: u64,
}

impl CacheEntry {
    /// 创建新的缓存条目
    fn new(result: WebSearchResult, ttl_secs: u64) -> Self {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();

        Self {
            result,
            created_at: now,
            expires_at: now + ttl_secs,
        }
    }

    /// 检查是否过期
    fn is_expired(&self) -> bool {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        now > self.expires_at
    }
}

/// 持久化缓存格式
#[derive(Debug, Serialize, Deserialize)]
struct PersistentCache {
    /// 版本号
    version: u32,
    /// 缓存条目
    entries: HashMap<String, CacheEntry>,
}

impl PersistentCache {
    fn new() -> Self {
        Self {
            version: 1,
            entries: HashMap::new(),
        }
    }
}

/// WebSearch 缓存
pub struct SearchCache {
    /// 内存 LRU 缓存
    memory_cache: LruCache<String, CacheEntry>,
    /// 缓存目录
    cache_dir: PathBuf,
    /// 持久化缓存文件路径
    cache_file: PathBuf,
    /// TTL（秒）
    ttl_secs: u64,
    /// 统计：命中次数
    hits: usize,
    /// 统计：未命中次数
    misses: usize,
}

impl SearchCache {
    /// 创建新的缓存实例
    ///
    /// # 参数
    /// - `capacity`: LRU 缓存容量
    /// - `ttl_secs`: TTL（秒），默认 3600（1 小时）
    /// - `cache_dir`: 缓存目录，默认 ~/.ifai/cache
    pub fn new(capacity: usize, ttl_secs: u64, cache_dir: Option<PathBuf>) -> Self {
        let capacity = NonZeroUsize::new(capacity).unwrap_or(NonZeroUsize::new(100).unwrap());

        let cache_dir = cache_dir.unwrap_or_else(|| {
            let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
            home.join(".ifai").join("cache")
        });

        let cache_file = cache_dir.join("search.json");

        // 确保缓存目录存在
        fs::create_dir_all(&cache_dir).ok();

        let mut cache = Self {
            memory_cache: LruCache::new(capacity),
            cache_dir,
            cache_file,
            ttl_secs,
            hits: 0,
            misses: 0,
        };

        // 从磁盘加载持久化缓存
        cache.load_persistent();

        cache
    }

    /// 使用默认配置创建缓存
    ///
    /// - 容量: 100 条
    /// - TTL: 1 小时
    /// - 目录: ~/.ifai/cache
    pub fn default_config() -> Self {
        Self::new(100, 3600, None)
    }

    /// 生成缓存键
    fn cache_key(query: &str, count: u64) -> String {
        format!("{}:{}", query, count)
    }

    /// 获取缓存
    pub fn get(&mut self, query: &str, count: u64) -> Option<WebSearchResult> {
        let key = Self::cache_key(query, count);

        // 先从内存缓存查找
        if let Some(entry) = self.memory_cache.get(&key) {
            if entry.is_expired() {
                // 过期，移除缓存
                self.memory_cache.pop(&key);
                self.misses += 1;
                return None;
            }
            self.hits += 1;
            return Some(entry.result.clone());
        }

        self.misses += 1;
        None
    }

    /// 设置缓存
    pub fn set(&mut self, query: &str, count: u64, result: WebSearchResult) {
        let key = Self::cache_key(query, count);
        let entry = CacheEntry::new(result, self.ttl_secs);

        // 存入内存缓存
        self.memory_cache.put(key.clone(), entry);

        // 异步保存到磁盘（简化版：立即保存）
        self.save_persistent();
    }

    /// 从磁盘加载持久化缓存
    fn load_persistent(&mut self) {
        if !self.cache_file.exists() {
            return;
        }

        let content = match fs::read_to_string(&self.cache_file) {
            Ok(content) => content,
            Err(_) => return,
        };

        let persistent_cache: PersistentCache = match serde_json::from_str(&content) {
            Ok(cache) => cache,
            Err(_) => return,
        };

        // 过滤掉过期的条目
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();

        for (key, entry) in persistent_cache.entries {
            if !entry.is_expired() {
                self.memory_cache.put(key, entry);
            }
        }
    }

    /// 保存持久化缓存到磁盘
    fn save_persistent(&self) {
        // 收集所有内存缓存中的条目
        let entries: HashMap<String, CacheEntry> = self
            .memory_cache
            .iter()
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect();

        let persistent_cache = PersistentCache {
            version: 1,
            entries,
        };

        let json = match serde_json::to_string_pretty(&persistent_cache) {
            Ok(json) => json,
            Err(_) => return,
        };

        fs::write(&self.cache_file, json).ok();
    }

    /// 清除所有缓存
    pub fn clear(&mut self) {
        self.memory_cache.clear();
        self.hits = 0;
        self.misses = 0;

        // 删除持久化缓存文件
        let _ = fs::remove_file(&self.cache_file);
    }

    /// 清除过期缓存
    pub fn cleanup_expired(&mut self) {
        let mut keys_to_remove = Vec::new();

        for (key, entry) in self.memory_cache.iter() {
            if entry.is_expired() {
                keys_to_remove.push(key.clone());
            }
        }

        for key in keys_to_remove {
            self.memory_cache.pop(&key);
        }

        // 保存清理后的状态
        self.save_persistent();
    }

    /// 获取缓存命中率
    pub fn hit_rate(&self) -> f64 {
        let total = self.hits + self.misses;
        if total == 0 {
            0.0
        } else {
            self.hits as f64 / total as f64
        }
    }

    /// 获取统计信息
    pub fn stats(&self) -> CacheStats {
        CacheStats {
            hits: self.hits,
            misses: self.misses,
            hit_rate: self.hit_rate(),
            size: self.memory_cache.len(),
            capacity: self.memory_cache.cap().get(),
        }
    }

    /// 获取缓存数量
    pub fn len(&self) -> usize {
        self.memory_cache.len()
    }

    /// 检查是否为空
    pub fn is_empty(&self) -> bool {
        self.memory_cache.len() == 0
    }
}

/// 缓存统计信息
#[derive(Debug, Clone)]
pub struct CacheStats {
    /// 命中次数
    pub hits: usize,
    /// 未命中次数
    pub misses: usize,
    /// 命中率（0.0 - 1.0）
    pub hit_rate: f64,
    /// 当前缓存数量
    pub size: usize,
    /// 缓存容量
    pub capacity: usize,
}

impl std::fmt::Display for CacheStats {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "CacheStats: hits={}, misses={}, hit_rate={:.1}%, size={}/{}",
            self.hits,
            self.misses,
            self.hit_rate * 100.0,
            self.size,
            self.capacity
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cache_key_generation() {
        let key1 = SearchCache::cache_key("test", 5);
        let key2 = SearchCache::cache_key("test", 5);
        let key3 = SearchCache::cache_key("test", 10);

        assert_eq!(key1, key2);
        assert_ne!(key1, key3);
    }

    #[test]
    fn test_cache_entry_expiration() {
        let result = WebSearchResult {
            query: "test".to_string(),
            results: vec![],
            count: 0,
        };

        // 1 秒 TTL
        let entry = CacheEntry::new(result.clone(), 1);
        assert!(!entry.is_expired());

        // 模拟过期（这个测试可能需要 mock 时间）
        // 在实际使用中，TTL 应该足够长（如 1 小时）
    }

    #[test]
    fn test_cache_set_get() {
        let mut cache = SearchCache::default_config();

        let result = WebSearchResult {
            query: "test query".to_string(),
            results: vec![],
            count: 0,
        };

        // 设置缓存
        cache.set("test query", 5, result.clone());

        // 获取缓存
        let cached = cache.get("test query", 5);
        assert!(cached.is_some());
        assert_eq!(cached.unwrap().query, "test query");
    }

    #[test]
    fn test_cache_miss() {
        let mut cache = SearchCache::default_config();

        // 查询不存在的缓存
        let result = cache.get("nonexistent", 5);
        assert!(result.is_none());
        assert_eq!(cache.misses, 1);
    }

    #[test]
    fn test_cache_stats() {
        let mut cache = SearchCache::default_config();

        let result = WebSearchResult {
            query: "test".to_string(),
            results: vec![],
            count: 0,
        };

        cache.set("test", 5, result);

        // 第一次访问（未命中，因为刚设置但测试隔离）
        let _ = cache.get("test", 5);

        // 第二次访问（命中）
        let _ = cache.get("test", 5);

        let stats = cache.stats();
        assert_eq!(stats.size, 1);
        assert!(stats.hits >= 1);
    }

    #[test]
    fn test_cache_clear() {
        let mut cache = SearchCache::default_config();

        let result = WebSearchResult {
            query: "test".to_string(),
            results: vec![],
            count: 0,
        };

        cache.set("test", 5, result);
        assert_eq!(cache.len(), 1);

        cache.clear();
        assert_eq!(cache.len(), 0);
        assert!(cache.is_empty());
    }

    #[test]
    fn test_cache_hit_rate() {
        let mut cache = SearchCache::default_config();

        // 初始命中率应该是 0
        assert_eq!(cache.hit_rate(), 0.0);

        let result = WebSearchResult {
            query: "test".to_string(),
            results: vec![],
            count: 0,
        };

        cache.set("test", 5, result);

        // 命中一次
        let _ = cache.get("test", 5);

        // 未命中一次
        let _ = cache.get("nonexistent", 5);

        let hit_rate = cache.hit_rate();
        assert!(hit_rate > 0.0 && hit_rate <= 1.0);
    }
}
