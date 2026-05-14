//! 带缓存的 WebSearch 适配器
//!
//! 包装 WebSearchAdapter，添加 LRU 缓存功能。

use crate::harness::tool::{ToolError, ToolExecutor};
use crate::harness::tool::new_tools::{cache::SearchCache, web_search::WebSearchTool};
use serde_json::Value;
use std::sync::{Arc, Mutex};

/// 带缓存的 WebSearch 适配器
pub struct CachedWebSearchAdapter {
    /// 内部的 WebSearch 工具
    tool: WebSearchTool,
    /// 缓存
    cache: Arc<Mutex<SearchCache>>,
    /// 工具名称
    tool_name: String,
}

impl CachedWebSearchAdapter {
    /// 创建新的带缓存的适配器
    pub fn new(tool: WebSearchTool, cache: SearchCache, tool_name: String) -> Self {
        Self {
            tool,
            cache: Arc::new(Mutex::new(cache)),
            tool_name,
        }
    }

    /// 获取缓存统计
    pub fn cache_stats(&self) -> crate::harness::tool::new_tools::cache::CacheStats {
        let cache = self.cache.lock().unwrap();
        cache.stats()
    }

    /// 清除缓存
    pub fn clear_cache(&self) {
        let mut cache = self.cache.lock().unwrap();
        cache.clear();
    }

    /// 获取内部工具
    pub fn inner(&self) -> &WebSearchTool {
        &self.tool
    }
}

impl ToolExecutor for CachedWebSearchAdapter {
    fn execute(&mut self, name: &str, input: &Value) -> Result<String, ToolError> {
        if name != self.tool_name {
            return Err(ToolError::NotFound {
                name: name.to_string(),
            });
        }

        // 解析参数
        let query = input
            .get("query")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ToolError::InvalidInput(
                format!("{} - Missing 'query' parameter", name)
            ))?;

        let count = input
            .get("count")
            .and_then(|v| v.as_u64())
            .unwrap_or(5);

        // 1. 先检查缓存
        {
            let mut cache = self.cache.lock().unwrap();
            if let Some(cached_result) = cache.get(query, count) {
                return Ok(cached_result.to_output_string());
            }
        }

        // 2. 执行搜索
        let result = self.tool.execute_web_search(query, count)?;

        // 3. 更新缓存
        {
            let mut cache = self.cache.lock().unwrap();
            cache.set(query, count, result.clone());
        }

        Ok(result.to_output_string())
    }

    fn allowed_tools(&self) -> &std::collections::HashSet<String> {
        static ALLOWED: std::sync::OnceLock<std::collections::HashSet<String>> =
            std::sync::OnceLock::new();
        ALLOWED.get_or_init(|| {
            let mut set = std::collections::HashSet::new();
            set.insert("web_search".to_string());
            set
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::harness::tool::new_tools::web_search::BochaConfig;

    #[test]
    fn test_cached_adapter_creation() {
        let tool = WebSearchTool::new(BochaConfig {
            api_key: None,
            ..Default::default()
        });
        let cache = SearchCache::default_config();
        let adapter = CachedWebSearchAdapter::new(tool, cache, "web_search".to_string());

        assert_eq!(adapter.tool_name, "web_search");
        assert!(adapter.allowed_tools().contains("web_search"));
    }

    #[test]
    fn test_cached_adapter_cache_miss() {
        let tmp = std::env::temp_dir().join(format!("ifai_test_adapter_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        let tool = WebSearchTool::new(BochaConfig {
            api_key: None,
            ..Default::default()
        });
        let cache = SearchCache::new(100, 3600, Some(tmp.clone()));
        let mut adapter = CachedWebSearchAdapter::new(tool, cache, "web_search".to_string());

        let input = serde_json::json!({
            "query": "test query",
            "count": 3
        });

        // 第一次调用（未命中，返回模拟结果）
        let result1 = adapter.execute("web_search", &input);
        assert!(result1.is_ok());

        // 检查缓存统计
        let stats = adapter.cache_stats();
        assert_eq!(stats.misses, 1);

        let _ = std::fs::remove_dir_all(&tmp);
    }
}
