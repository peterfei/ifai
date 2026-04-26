//! 🎨 智能 Glob 搜索 - 元编程架构
//!
//! **设计原则**：
//! - 零拷贝：搜索结果不直接复制到上下文
//! - 元数据驱动：生成结构化摘要而非原始列表
//! - 惰性求值：按需展开详细信息
//! - 智能采样：提供代表性数据视图
//!
//! **架构层次**：
//! ```text
//! SearchIntent (声明式意图)
//!         ↓
//! MetaGenerator (元数据生成器)
//!         ↓
//! SmartView (智能视图)
//!         ↓
//! LazyIterator (按需迭代器)
//! ```

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

/// 🎯 搜索意图（声明式）
#[derive(Debug, Clone)]
pub struct SearchIntent {
    /// 搜索模式
    pub pattern: String,
    /// 意图类型（自动推断）
    pub intent_type: IntentType,
    /// 期望的结果数量（启发式）
    pub expected_count: usize,
}

/// 🎯 意图类型（元编程：自动推断用户意图）
#[derive(Debug, Clone, PartialEq)]
pub enum IntentType {
    /// 探索性搜索（了解项目结构）
    Exploratory,
    /// 精确查找（寻找特定文件）
    Precise,
    /// 批量操作（处理多个文件）
    Batch,
    /// 统计分析（收集项目信息）
    Statistical,
}

impl SearchIntent {
    /// 🔥 从搜索模式推断意图（元编程：自动分析）
    pub fn from_pattern(pattern: &str) -> Self {
        let intent_type = Self::infer_intent(pattern);
        let expected_count = Self::estimate_count(pattern, &intent_type);

        Self {
            pattern: pattern.to_string(),
            intent_type,
            expected_count,
        }
    }

    /// 元编程：自动推断用户意图
    fn infer_intent(pattern: &str) -> IntentType {
        if pattern.contains("**/*") || pattern == "*" {
            IntentType::Exploratory
        } else if pattern.contains("*.") {
            IntentType::Precise
        } else if pattern.contains("**") {
            IntentType::Batch
        } else {
            IntentType::Statistical
        }
    }

    /// 启发式估算结果数量
    fn estimate_count(pattern: &str, intent_type: &IntentType) -> usize {
        match intent_type {
            IntentType::Exploratory => 100_000,  // 可能很大
            IntentType::Precise => 100,          // 精确查找
            IntentType::Batch => 1_000,          // 批量操作
            IntentType::Statistical => 10_000,   // 统计分析
        }
    }
}

/// 🎨 搜索结果元数据（零拷贝）
#[derive(Debug, Clone)]
pub struct SearchMetadata {
    /// 总文件数
    pub total_files: usize,
    /// 总大小（字节）
    pub total_size: u64,
    /// 文件类型分布
    pub file_types: HashMap<String, usize>,
    /// 目录结构摘要（前 3 层）
    pub structure_summary: Vec<DirSummary>,
    /// 最大的文件（前 10 个）
    pub largest_files: Vec<FileSummary>,
    /// 采样结果（代表性文件）
    pub sample: Vec<PathBuf>,
}

/// 📊 目录摘要
#[derive(Debug, Clone)]
pub struct DirSummary {
    pub path: PathBuf,
    pub file_count: usize,
    pub depth: usize,
}

/// 📊 文件摘要
#[derive(Debug, Clone)]
pub struct FileSummary {
    pub path: PathBuf,
    pub size: u64,
    pub extension: String,
}

/// 🎨 智能视图（分层的、按需的）
#[derive(Debug, Clone)]
pub enum SmartView {
    /// 概览视图（统计信息）
    Overview(SearchMetadata),
    /// 采样视图（代表性文件）
    Sampled { sample: Vec<PathBuf>, total: usize },
    /// 分页视图（惰性加载）
    Paged { page: usize, page_size: usize, total: usize },
    /// 完整视图（警告：可能很大）
    Full,
}

/// 🎯 搜索结果包装器（元编程：智能选择视图）
#[derive(Debug, Clone)]
pub struct SearchResults {
    /// 搜索意图
    intent: SearchIntent,
    /// 元数据
    metadata: Arc<SearchMetadata>,
    /// 当前视图
    current_view: SmartView,
    /// 完整结果（惰性，仅当需要时计算）
    full_results: Option<Vec<PathBuf>>,
}

impl SearchResults {
    /// 🔥 创建智能搜索结果（元编程：自动选择最佳视图）
    pub fn search(pattern: &str) -> Self {
        let intent = SearchIntent::from_pattern(pattern);
        let metadata = Arc::new(Self::generate_metadata(&intent));

        // 元编程：根据意图自动选择视图
        let current_view = Self::select_view(&intent, &metadata);

        Self {
            intent,
            metadata,
            current_view,
            full_results: None,
        }
    }

    /// 🔥 生成元数据（零拷贝：流式处理，不存储完整列表）
    fn generate_metadata(intent: &SearchIntent) -> SearchMetadata {
        use walkdir::WalkDir;
        use std::collections::HashMap;

        let mut file_types = HashMap::new();
        let mut largest_files = Vec::new();
        let mut sample = Vec::new();
        let mut total_files = 0;
        let mut total_size = 0u64;
        let mut structure_summary = Vec::new();

        // 流式处理：一次性遍历，收集元数据
        for entry in WalkDir::new(&intent.pattern.replace("**", "."))
            .into_iter()
            .filter_map(|e| e.ok())
        {
            let path = entry.path();
            if path.is_file() {
                total_files += 1;

                // 收集文件扩展名
                if let Some(ext) = path.extension() {
                    *file_types.entry(ext.to_string_lossy().to_string())
                        .or_insert(0) += 1;
                }

                // 收集大文件（仅保留前 10 个）
                if let Ok(metadata) = entry.metadata() {
                    let len = metadata.len();
                    total_size += len;

                    if largest_files.len() < 10 {
                        largest_files.push(FileSummary {
                            path: path.to_path_buf(),
                            size: len,
                            extension: path.extension()
                                .unwrap_or_default()
                                .to_string_lossy()
                                .to_string(),
                        });
                        largest_files.sort_by(|a, b| b.size.cmp(&a.size));
                    } else if len > largest_files.last().unwrap().size {
                        largest_files.pop();
                        largest_files.push(FileSummary {
                            path: path.to_path_buf(),
                            size: len,
                            extension: path.extension()
                                .unwrap_or_default()
                                .to_string_lossy()
                                .to_string(),
                        });
                        largest_files.sort_by(|a, b| b.size.cmp(&a.size));
                    }
                }

                // 采样（每 1000 个文件采样 1 个，最多 100 个）
                if total_files % 1000 == 0 && sample.len() < 100 {
                    sample.push(path.to_path_buf());
                }
            }
        }

        SearchMetadata {
            total_files,
            total_size,
            file_types,
            structure_summary,
            largest_files,
            sample,
        }
    }

    /// 🔥 自动选择视图（元编程：根据意图和数据量）
    fn select_view(intent: &SearchIntent, metadata: &SearchMetadata) -> SmartView {
        match (intent.intent_type.clone(), metadata.total_files) {
            (IntentType::Exploratory, _) => {
                // 探索性搜索：显示概览
                SmartView::Overview(metadata.clone())
            }
            (IntentType::Precise, count) if count <= 100 => {
                // 精确查找：直接显示采样
                SmartView::Sampled {
                    sample: metadata.sample.clone(),
                    total: metadata.total_files,
                }
            }
            (_, count) if count > 10_000 => {
                // 大量结果：分页视图
                SmartView::Paged {
                    page: 0,
                    page_size: 50,
                    total: metadata.total_files,
                }
            }
            _ => SmartView::Sampled {
                sample: metadata.sample.clone(),
                total: metadata.total_files,
            },
        }
    }

    /// 🔥 渲染为紧凑的文本输出（元编程：自动优化输出格式）
    pub fn render_compact(&self) -> String {
        match &self.current_view {
            SmartView::Overview(meta) => {
                format!(
                    "📊 Search Results Overview\n\
                     ╟─────────────────────────────────\n\
                     │ Total Files: {}\n\
                     │ Total Size: {}\n\
                     │ File Types: {}\n\
                     │ Largest Files: {} items\n\
                     ╰─────────────────────────────────\n\
                     💡 Use .expand() to see detailed results",
                    meta.total_files,
                    Self::format_size(meta.total_size),
                    meta.file_types.len(),
                    meta.largest_files.len()
                )
            }
            SmartView::Sampled { sample, total } => {
                let preview = sample.iter()
                    .take(10)
                    .map(|p| p.display().to_string())
                    .collect::<Vec<_>>()
                    .join("\n");

                format!(
                    "📋 Sampled Results (showing 10 of {} files)\n\
                     ╟─────────────────────────────────\n\
                     {}\n\
                     ╰─────────────────────────────────\n\
                     💡 Use .expand() or .paginate() for more",
                    total,
                    preview
                )
            }
            SmartView::Paged { page, page_size, total } => {
                format!(
                    "📄 Paged Results (Page {}, {} per page, {} total)\n\
                     ╟─────────────────────────────────\n\
                     💡 Use .next_page() or .prev_page() to navigate",
                    page + 1, page_size, total
                )
            }
            SmartView::Full => {
                format!(
                    "⚠️  Full Results ({} files)\n\
                     ╟─────────────────────────────────\n\
                     │ This may consume significant tokens!\n\
                     ╰─────────────────────────────────\n\
                     💡 Consider using .sample() or .paginate() instead",
                    self.metadata.total_files
                )
            }
        }
    }

    /// 🔥 展开为完整结果（警告：会消耗大量 tokens）
    pub fn expand(&mut self) -> &Vec<PathBuf> {
        if self.full_results.is_none() {
            // 实际加载所有结果
            self.full_results = Some(Self::load_all(&self.intent.pattern));
        }
        self.full_results.as_ref().unwrap()
    }

    /// 加载所有结果
    fn load_all(pattern: &str) -> Vec<PathBuf> {
        use walkdir::WalkDir;
        WalkDir::new(pattern.replace("**", "."))
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.path().is_file())
            .map(|e| e.path().to_path_buf())
            .collect()
    }

    /// 格式化文件大小
    fn format_size(bytes: u64) -> String {
        const KB: u64 = 1024;
        const MB: u64 = KB * 1024;
        const GB: u64 = MB * 1024;

        if bytes >= GB {
            format!("{:.2} GB", bytes as f64 / GB as f64)
        } else if bytes >= MB {
            format!("{:.2} MB", bytes as f64 / MB as f64)
        } else if bytes >= KB {
            format!("{:.2} KB", bytes as f64 / KB as f64)
        } else {
            format!("{} B", bytes)
        }
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_intent_inference() {
        let intent = SearchIntent::from_pattern("**/*.rs");
        assert_eq!(intent.intent_type, IntentType::Precise);

        let intent = SearchIntent::from_pattern("**/*");
        assert_eq!(intent.intent_type, IntentType::Exploratory);
    }

    #[test]
    fn test_view_selection() {
        let intent = SearchIntent {
            pattern: "**/*".to_string(),
            intent_type: IntentType::Exploratory,
            expected_count: 100_000,
        };

        let metadata = SearchMetadata {
            total_files: 85_005,
            total_size: 1024 * 1024 * 100,
            file_types: HashMap::new(),
            structure_summary: Vec::new(),
            largest_files: Vec::new(),
            sample: Vec::new(),
        };

        let view = SearchResults::select_view(&intent, &metadata);
        assert!(matches!(view, SmartView::Overview(_)));
    }

    #[test]
    fn test_size_formatting() {
        assert_eq!(SearchResults::format_size(500), "500 B");
        assert_eq!(SearchResults::format_size(2048), "2.00 KB");
        assert_eq!(SearchResults::format_size(1024 * 1024 * 5), "5.00 MB");
    }
}
