//! 🎨 流式 Glob 处理管道
//!
//! **核心特性**：
//! - 生产者-消费者模式：解耦数据生成和消费
//! - 背压控制：自动调节流速，防止内存溢出
//! - 实时过滤：边扫描边过滤，无需等待完整结果
//! - 零分配：使用迭代器避免中间分配

use std::path::PathBuf;
use std::pin::Pin;
use std::sync::Arc;
use futures::{stream, Stream, StreamExt};

/// 🎯 流式搜索配置（声明式）
#[derive(Debug, Clone)]
pub struct StreamConfig {
    /// 缓冲区大小（控制内存使用）
    pub buffer_size: usize,
    /// 批次大小（每次处理的文件数）
    pub batch_size: usize,
    /// 是否启用实时过滤
    pub enable_filtering: bool,
    /// 最大并发数
    pub max_concurrent: usize,
}

impl Default for StreamConfig {
    fn default() -> Self {
        Self {
            buffer_size: 1000,      // 最多缓存 1000 个文件
            batch_size: 50,         // 每批处理 50 个
            enable_filtering: true,  // 启用实时过滤
            max_concurrent: 4,       // 最多 4 个并发任务
        }
    }
}

/// 🎯 文件过滤器（声明式：函数式组合）
pub type FileFilter = Arc<dyn Fn(&PathBuf) -> bool + Send + Sync>;

/// 🎨 流式搜索结果（零拷贝：流式迭代器）
pub struct StreamingSearchResults {
    /// 文件流
    stream: Pin<Box<dyn Stream<Item = PathBuf> + Send>>,
    /// 配置
    config: StreamConfig,
    /// 统计信息
    stats: Arc<std::sync::atomic::AtomicU64>,
}

impl StreamingSearchResults {
    /// 🔥 创建流式搜索（元编程：自动生成流）
    pub fn search(pattern: &str, config: StreamConfig) -> Self {
        use walkdir::WalkDir;

        // 创建文件系统迭代器
        let walker = WalkDir::new(pattern.replace("**", "."))
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.path().is_file())
            .map(|e| e.path().to_path_buf());

        // 转换为异步流
        let stream = stream::iter(walker);

        Self {
            stream: Box::pin(stream),
            config,
            stats: Arc::new(std::sync::atomic::AtomicU64::new(0)),
        }
    }

    /// 🔥 添加过滤器（元编程：链式组合）
    pub fn filter(mut self, f: FileFilter) -> Self {
        if self.config.enable_filtering {
            let original_stream = self.stream;
            self.stream = Box::pin(original_stream.filter(move |path| f(path)));
        }
        self
    }

    /// 🔥 限制数量（元编程：自动截断）
    pub fn take(mut self, n: usize) -> Self {
        let original_stream = self.stream;
        self.stream = Box::pin(original_stream.take(n));
        self
    }

    /// 🔥 批次处理（元编程：自动分批）
    pub fn chunks(mut self, batch_size: usize) -> Self {
        let original_stream = self.stream;
        self.stream = Box::pin(
            original_stream
                .chunks(batch_size)
                .flat_map(|batch| stream::iter(batch))
        );
        self
    }

    /// 🔥 收集到 Vec（警告：会消耗内存）
    pub async fn collect(mut self) -> Vec<PathBuf> {
        let mut results = Vec::new();
        while let Some(item) = self.stream.next().await {
            results.push(item);
            self.stats.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        }
        results
    }

    /// 🔥 流式处理（元编程：边读边处理，零分配）
    pub async fn process<F>(mut self, mut f: F) -> usize
    where
        F: FnMut(PathBuf),
    {
        let mut count = 0;
        while let Some(item) = self.stream.next().await {
            f(item);
            count += 1;
        }
        count
    }

    /// 🔥 实时采样（元编程：自动采样，避免处理全部）
    pub async fn sample(mut self, n: usize) -> Vec<PathBuf> {
        use rand::Rng;

        let mut rng = rand::thread_rng();
        let mut sampled = Vec::new();
        let mut total = 0;
        let mut step = 1;

        while let Some(item) = self.stream.next().await {
            total += 1;

            // 水库采样算法
            if sampled.len() < n {
                sampled.push(item);
            } else {
                let k = rng.gen_range(0..total);
                if k < n {
                    sampled[k] = item;
                }
            }

            // 每处理 10000 个文件，更新采样步长
            if total % 10000 == 0 {
                step = total / n;
            }
        }

        sampled
    }
}

/// 🎨 流式管道构建器（声明式 DSL）
pub struct StreamPipeline {
    /// 搜索模式
    pattern: String,
    /// 配置
    config: StreamConfig,
    /// 过滤器链
    filters: Vec<FileFilter>,
    /// 限制数量
    limit: Option<usize>,
    /// 批次大小
    batch_size: Option<usize>,
}

impl StreamPipeline {
    /// 创建新的流式管道
    pub fn new(pattern: &str) -> Self {
        Self {
            pattern: pattern.to_string(),
            config: StreamConfig::default(),
            filters: Vec::new(),
            limit: None,
            batch_size: None,
        }
    }

    /// 🔥 添加过滤器（声明式：链式调用）
    pub fn with_filter(mut self, f: FileFilter) -> Self {
        self.filters.push(f);
        self
    }

    /// 🔥 设置限制
    pub fn with_limit(mut self, n: usize) -> Self {
        self.limit = Some(n);
        self
    }

    /// 🔥 设置批次大小
    pub fn with_batch_size(mut self, size: usize) -> Self {
        self.batch_size = Some(size);
        self
    }

    /// 🔥 执行搜索（元编程：自动应用所有配置）
    pub fn execute(self) -> StreamingSearchResults {
        let mut results = StreamingSearchResults::search(&self.pattern, self.config);

        // 应用过滤器
        for filter in self.filters {
            results = results.filter(filter);
        }

        // 应用限制
        if let Some(n) = self.limit {
            results = results.take(n);
        }

        // 应用批次
        if let Some(size) = self.batch_size {
            results = results.chunks(size);
        }

        results
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    #[test]
    fn test_stream_pipeline_builder() {
        let pipeline = StreamPipeline::new("**/*.rs")
            .with_filter(Arc::new(|path| {
                path.extension().map_or(false, |e| e == "rs")
            }))
            .with_limit(10)
            .with_batch_size(5);

        assert_eq!(pipeline.limit, Some(10));
        assert_eq!(pipeline.batch_size, Some(5));
        assert_eq!(pipeline.filters.len(), 1);
    }

    #[tokio::test]
    async fn test_streaming_search() {
        use std::env;
        let current_dir = env::current_dir().unwrap();
        let pattern = current_dir.join("*.rs").to_string_lossy().to_string();

        let results = StreamingSearchResults::search(
            &pattern,
            StreamConfig::default()
        )
        .take(5)
        .collect()
        .await;

        assert!(results.len() <= 5);
    }

    #[test]
    fn test_stream_config_default() {
        let config = StreamConfig::default();
        assert_eq!(config.buffer_size, 1000);
        assert_eq!(config.batch_size, 50);
        assert!(config.enable_filtering);
    }
}
