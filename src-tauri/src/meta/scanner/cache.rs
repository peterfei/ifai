//! 扫描结果缓存
//!
//! 使用 LRU 策略缓存扫描结果，避免重复扫描

use std::hash::Hash;
use std::time::{Duration, Instant};
use std::num::NonZeroUsize;
use serde::{Deserialize, Serialize};
use crate::meta::scanner::ScanError;

/// 缓存条目
#[derive(Debug, Clone)]
struct CacheEntry<V> {
    /// 缓存的值
    value: V,
    /// 创建时间
    created_at: Instant,
    /// TTL（秒）
    ttl: Option<u64>,
}

impl<V> CacheEntry<V> {
    /// 创建新的缓存条目
    fn new(value: V, ttl: Option<u64>) -> Self {
        Self {
            value,
            created_at: Instant::now(),
            ttl,
        }
    }

    /// 检查是否过期
    fn is_expired(&self) -> bool {
        if let Some(ttl) = self.ttl {
            self.created_at.elapsed() >= Duration::from_secs(ttl)
        } else {
            false
        }
    }
}

/// 扫描结果缓存
///
/// 使用 LRU 策略缓存扫描结果，避免重复扫描
pub struct ScanCache<K, V>
where
    K: Hash + Eq + Clone,
    V: Clone,
{
    /// LRU 缓存
    cache: lru::LruCache<K, CacheEntry<V>>,
    /// 命中次数
    hits: usize,
    /// 未命中次数
    misses: usize,
}

impl<K, V> ScanCache<K, V>
where
    K: Hash + Eq + Clone,
    V: Clone,
{
    /// 创建新的缓存
    pub fn new(capacity: usize) -> Self {
        let capacity_nonzero = NonZeroUsize::new(capacity.max(1));
        Self {
            cache: lru::LruCache::new(capacity_nonzero.unwrap_or_else(|| NonZeroUsize::new(100).unwrap())),
            hits: 0,
            misses: 0,
        }
    }

    /// 获取缓存值
    pub fn get(&mut self, key: &K) -> Option<V> {
        if let Some(entry) = self.cache.get(key) {
            if entry.is_expired() {
                // 过期，删除并返回 None
                self.cache.pop(key);
                self.misses += 1;
                None
            } else {
                // 未过期，返回值
                self.hits += 1;
                Some(entry.value.clone())
            }
        } else {
            self.misses += 1;
            None
        }
    }

    /// 插入缓存值
    pub fn put(&mut self, key: K, value: V, ttl: Option<u64>) {
        let entry = CacheEntry::new(value, ttl);
        self.cache.put(key, entry);
    }

    /// 清空缓存
    pub fn clear(&mut self) {
        self.cache.clear();
        self.hits = 0;
        self.misses = 0;
    }

    /// 获取缓存大小
    pub fn len(&self) -> usize {
        self.cache.len()
    }

    /// 检查是否为空
    pub fn is_empty(&self) -> bool {
        self.cache.is_empty()
    }

    /// 获取命中率
    pub fn hit_rate(&self) -> f64 {
        let total = self.hits + self.misses;
        if total == 0 {
            0.0
        } else {
            (self.hits as f64) / (total as f64)
        }
    }

    /// 获取统计信息
    pub fn stats(&self) -> CacheStats {
        CacheStats {
            size: self.len(),
            hits: self.hits,
            misses: self.misses,
            hit_rate: self.hit_rate(),
        }
    }
}

/// 缓存统计信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheStats {
    /// 当前大小
    pub size: usize,
    /// 命中次数
    pub hits: usize,
    /// 未命中次数
    pub misses: usize,
    /// 命中率
    pub hit_rate: f64,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread;
    use std::time::Duration;

    #[test]
    fn test_cache_basic() {
        let mut cache = ScanCache::new(10);

        // 插入值
        cache.put("key1".to_string(), "value1", None);
        cache.put("key2".to_string(), "value2", None);

        // 获取值
        assert_eq!(cache.get(&"key1".to_string()).as_deref(), Some("value1"));
        assert_eq!(cache.get(&"key2".to_string()).as_deref(), Some("value2"));
        assert_eq!(cache.get(&"key3".to_string()), None);
    }

    #[test]
    fn test_cache_ttl() {
        let mut cache = ScanCache::new(10);

        // 插入带 TTL 的值（1 秒）
        cache.put("key1".to_string(), "value1", Some(1));

        // 立即获取，应该存在
        assert_eq!(cache.get(&"key1".to_string()).as_deref(), Some("value1"));

        // 等待 TTL 过期
        thread::sleep(Duration::from_secs(2));

        // 再次获取，应该不存在
        assert_eq!(cache.get(&"key1".to_string()), None);
    }

    #[test]
    fn test_cache_stats() {
        let mut cache = ScanCache::new(10);

        cache.put("key1".to_string(), "value1", None);

        // 命中
        cache.get(&"key1".to_string());

        // 未命中
        cache.get(&"key2".to_string());

        let stats = cache.stats();
        assert_eq!(stats.size, 1);
        assert_eq!(stats.hits, 1);
        assert_eq!(stats.misses, 1);
        assert_eq!(stats.hit_rate, 0.5);
    }

    #[test]
    fn test_cache_hit_rate() {
        let mut cache = ScanCache::new(10);

        cache.put("key1".to_string(), "value1", None);

        // 3 次命中
        cache.get(&"key1".to_string());
        cache.get(&"key1".to_string());
        cache.get(&"key1".to_string());

        // 1 次未命中
        cache.get(&"key2".to_string());

        assert_eq!(cache.hit_rate(), 0.75);
    }
}
