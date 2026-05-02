use once_cell::sync::Lazy;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::SystemTime;
use tokio::fs;
use tokio::sync::{RwLock, Semaphore};

/// 缓存条目
#[derive(Clone, Debug)]
pub struct CacheEntry {
    pub content: String,
    pub size: u64,
    pub modified: SystemTime,
    pub cached_at: SystemTime,
}

/// 文件缓存管理器
pub struct FileCache {
    entries: RwLock<HashMap<PathBuf, CacheEntry>>,
    max_entries: usize,
    max_memory: u64,
    /// 并发 IO 限制信号量，防止大批量读取压力
    io_semaphore: Arc<Semaphore>,
}

impl FileCache {
    pub fn new(max_entries: usize, max_memory_mb: u64) -> Self {
        Self {
            entries: RwLock::new(HashMap::new()),
            max_entries,
            max_memory: max_memory_mb * 1024 * 1024,
            // 限制最大并发磁盘 IO 数量为 10
            io_semaphore: Arc::new(Semaphore::new(10)),
        }
    }

    /// 读取文件（带缓存）
    pub async fn read_file(&self, path: &PathBuf) -> Result<String, String> {
        // 1. 尝试从缓存读取
        {
            let entries = self.entries.read().await;
            if let Some(entry) = entries.get(path) {
                // 检查缓存是否可能过期 (这里先采用简单的 metadata 校验，后续可升级为 notify 监听)
                if let Ok(metadata) = fs::metadata(path).await {
                    if let Ok(modified) = metadata.modified() {
                        if modified <= entry.modified {
                            return Ok(entry.content.clone());
                        }
                    }
                }
            }
        }

        // 2. 缓存未命中或已过期，从磁盘读取 (受信号量控制)
        let _permit = self
            .io_semaphore
            .acquire()
            .await
            .map_err(|e| format!("Failed to acquire IO permit: {}", e))?;

        let content = fs::read_to_string(path)
            .await
            .map_err(|e| format!("IO Error reading {:?}: {}", path, e))?;

        // 3. 更新缓存
        self.insert(path.clone(), content.clone()).await?;

        Ok(content)
    }

    /// 插入缓存并执行淘汰策略
    async fn insert(&self, path: PathBuf, content: String) -> Result<(), String> {
        let size = content.len() as u64;
        let modified = fs::metadata(&path)
            .await
            .and_then(|m| m.modified())
            .unwrap_or_else(|_| SystemTime::now());

        let entry = CacheEntry {
            content,
            size,
            modified,
            cached_at: SystemTime::now(),
        };

        let mut entries = self.entries.write().await;

        // 简单的 LRU 淘汰：如果超过数量限制，移除最旧的
        if entries.len() >= self.max_entries {
            if let Some(oldest_path) = entries
                .iter()
                .min_by_key(|(_, v)| v.cached_at)
                .map(|(k, _)| k.clone())
            {
                entries.remove(&oldest_path);
            }
        }

        entries.insert(path, entry);
        Ok(())
    }

    /// 使缓存失效
    pub async fn invalidate(&self, path: &Path) {
        let mut entries = self.entries.write().await;
        entries.remove(path);
    }

    /// 清空所有缓存
    pub async fn clear(&self) {
        let mut entries = self.entries.write().await;
        entries.clear();
    }

    /// 获取统计信息
    pub async fn get_stats(&self) -> CacheStats {
        let entries = self.entries.read().await;
        let total_size = entries.values().map(|e| e.size).sum();
        CacheStats {
            entries: entries.len(),
            total_size,
        }
    }
}

#[derive(serde::Serialize)]
pub struct CacheStats {
    pub entries: usize,
    pub total_size: u64,
}

/// 全局缓存实例
pub static GLOBAL_CACHE: Lazy<FileCache> = Lazy::new(|| {
    FileCache::new(1000, 50) // 默认 1000 个条目，50MB 上限
});

// ============================================================================
// Tauri Commands
// ============================================================================

#[tauri::command]
pub async fn get_file_cache_stats() -> Result<String, String> {
    let stats = GLOBAL_CACHE.get_stats().await;
    serde_json::to_string(&stats).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn clear_file_cache() -> Result<(), String> {
    GLOBAL_CACHE.clear().await;
    Ok(())
}

#[tauri::command]
pub async fn print_file_cache_stats() {
    let (count, size) = GLOBAL_CACHE.get_stats().await.entries_and_size(); // 修正调用
    println!("[FileCache] Stats: {} entries, {} bytes", count, size);
}

// 辅助方法用于打印
impl CacheStats {
    pub fn entries_and_size(&self) -> (usize, u64) {
        (self.entries, self.total_size)
    }
}

/// 公共导出 API
pub async fn cached_read_file(root_path: &str, rel_path: &str) -> Result<String, String> {
    let path = Path::new(root_path).join(rel_path);
    GLOBAL_CACHE.read_file(&path).await
}

pub async fn invalidate_cache(path: &Path) {
    GLOBAL_CACHE.invalidate(path).await;
}

#[cfg(test)]
mod tests;
