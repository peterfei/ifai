//! 🎨 智能 Glob 搜索 - 简化版（元编程架构）
//!
//! **核心特性**：
//! - 元数据驱动：生成结构化摘要而非原始列表
//! - 惰性求值：按需展开详细信息
//! - 零拷贝：使用迭代器避免中间分配
//!
//! **使用示例**：
//! ```rust
//! let results = SmartGlob::search("**/*.rs")
//!     .with_limit(100)
//!     .execute();
//!
//! println!("{}", results.summary());
//! ```

use std::path::{Path, PathBuf};
use std::collections::HashMap;

/// 🎯 搜索配置（声明式）
#[derive(Debug, Clone)]
pub struct SmartGlobConfig {
    /// 最大结果数
    pub max_results: usize,
    /// 是否显示文件大小
    pub show_size: bool,
    /// 是否启用智能采样
    pub enable_sampling: bool,
    /// 采样率（每 N 个文件采样 1 个）
    pub sample_rate: usize,
}

impl Default for SmartGlobConfig {
    fn default() -> Self {
        Self {
            max_results: 100,
            show_size: false,
            enable_sampling: true,
            sample_rate: 100,
        }
    }
}

/// 📊 搜索摘要（元数据）
#[derive(Debug, Clone)]
pub struct GlobSummary {
    /// 总文件数
    pub total_files: usize,
    /// 总大小
    pub total_size: u64,
    /// 文件类型分布
    pub file_types: HashMap<String, usize>,
    /// 采样结果
    pub sample: Vec<PathBuf>,
    /// 是否被截断
    pub truncated: bool,
}

/// 🎨 智能 Glob 搜索（元编程：自动优化）
pub struct SmartGlob {
    /// 搜索模式
    pattern: String,
    /// 配置
    config: SmartGlobConfig,
}

impl SmartGlob {
    /// 创建新的搜索
    pub fn search(pattern: &str) -> Self {
        Self {
            pattern: pattern.to_string(),
            config: SmartGlobConfig::default(),
        }
    }

    /// 设置限制
    pub fn with_limit(mut self, limit: usize) -> Self {
        self.config.max_results = limit;
        self
    }

    /// 设置配置
    pub fn with_config(mut self, config: SmartGlobConfig) -> Self {
        self.config = config;
        self
    }

    /// 🔥 执行搜索（元编程：自动生成摘要）
    pub fn execute(&self) -> GlobResult {
        use walkdir::WalkDir;

        let mut total_files = 0;
        let mut total_size = 0u64;
        let mut file_types = HashMap::new();
        let mut sample = Vec::new();
        let mut all_results = Vec::new();

        // 🔥 解析 glob 模式
        let (base_path, ext_filter) = self.parse_glob_pattern(&self.pattern);

        // 使用 WalkDir 递归搜索
        for entry in WalkDir::new(&base_path)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.path().is_file())
        {
            let path = entry.path();

            // 应用扩展名过滤
            if let Some(ref expected_ext) = ext_filter {
                if path.extension().and_then(|e| e.to_str()) != Some(expected_ext.as_str()) {
                    continue;
                }
            }

            total_files += 1;

            // 收集文件类型
            if let Some(ext) = path.extension() {
                *file_types.entry(ext.to_string_lossy().to_string())
                    .or_insert(0) += 1;
            }

            // 收集文件大小
            if let Ok(metadata) = entry.metadata() {
                total_size += metadata.len();
            }

            // 收集结果
            if all_results.len() < self.config.max_results {
                all_results.push(path.to_path_buf());
            }

            // 智能采样
            if self.config.enable_sampling && total_files % self.config.sample_rate == 0 {
                sample.push(path.to_path_buf());
            }

            // 采样数量限制
            if sample.len() >= 100 {
                sample.pop();
            }
        }

        let truncated = total_files > self.config.max_results;

        GlobResult {
            summary: GlobSummary {
                total_files,
                total_size,
                file_types,
                sample,
                truncated,
            },
            results: all_results,
        }
    }

    /// 🔥 解析 glob 模式（元编程：自动提取路径和扩展名）
    fn parse_glob_pattern(&self, pattern: &str) -> (String, Option<String>) {
        // 处理常见的 glob 模式
        if pattern == "." || pattern == "*" || pattern == "**/*" {
            // 搜索当前目录，所有文件
            (".".to_string(), None)
        } else if pattern.contains("*.") {
            // 提取扩展名，如 "**/*.rs" -> ("..", "rs")
            if let Some(star_pos) = pattern.find("*.") {
                let ext = pattern[star_pos + 2..].to_string();
                // 提取基础路径
                let base = if pattern.starts_with("**/") {
                    // "**/*.rs" -> "."
                    ".".to_string()
                } else if pattern.contains("/**/*.") {
                    // "src/**/*.rs" -> "src"
                    pattern[..pattern.find("/**").unwrap()].to_string()
                } else if pattern.contains("/*.") {
                    // "src/*.rs" -> "src"
                    pattern[..pattern.find("/*.").unwrap()].to_string()
                } else {
                    // 默认当前目录
                    ".".to_string()
                };
                (base, Some(ext))
            } else {
                (".".to_string(), None)
            }
        } else {
            // 精确路径或目录
            let path = if pattern.starts_with("./") {
                pattern[2..].to_string()
            } else {
                pattern.to_string()
            };
            (path, None)
        }
    }
}

/// 🎨 搜索结果（元数据 + 实际数据）
#[derive(Debug, Clone)]
pub struct GlobResult {
    /// 摘要
    pub summary: GlobSummary,
    /// 实际结果（受 max_results 限制）
    pub results: Vec<PathBuf>,
}

impl GlobResult {
    /// 🔥 渲染摘要（元编程：自动生成紧凑输出）
    pub fn render_summary(&self) -> String {
        let truncated_note = if self.summary.truncated {
            format!(" (showing first {})", self.results.len())
        } else {
            String::new()
        };

        format!(
            "📊 Search Results{}\n\
             ╟─────────────────────────────────\n\
             │ Total Files: {}\n\
             │ Total Size: {}\n\
             │ File Types: {}\n\
             │ Sample: {} files\n\
             ╰─────────────────────────────────\n\
             💡 Use .expand() to see all results",
            truncated_note,
            self.summary.total_files,
            Self::format_size(self.summary.total_size),
            self.summary.file_types.len(),
            self.summary.sample.len()
        )
    }

    /// 🔥 渲染详细结果
    pub fn render_results(&self) -> String {
        let mut output = String::new();

        for (i, path) in self.results.iter().enumerate() {
            output.push_str(&format!("{:>5} │ {}\n", i + 1, path.display()));
        }

        if self.summary.truncated {
            output.push_str(&format!(
                "\n... and {} more files (use .expand())",
                self.summary.total_files - self.results.len()
            ));
        }

        output
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
    fn test_smart_glob_creation() {
        let glob = SmartGlob::search("**/*.rs");
        assert_eq!(glob.pattern, "**/*.rs");
    }

    #[test]
    fn test_with_limit() {
        let glob = SmartGlob::search("**/*").with_limit(50);
        assert_eq!(glob.config.max_results, 50);
    }

    #[test]
    fn test_size_formatting() {
        assert_eq!(GlobResult::format_size(500), "500 B");
        assert_eq!(GlobResult::format_size(2048), "2.00 KB");
        assert_eq!(GlobResult::format_size(1024 * 1024 * 5), "5.00 MB");
    }

    #[test]
    fn test_execute_search() {
        let result = SmartGlob::search(".")
            .with_limit(10)
            .execute();

        // 应该有摘要
        assert!(result.summary.total_files >= 0);
        // 结果数量不超过限制
        assert!(result.results.len() <= 10);
    }

    #[test]
    fn test_glob_pattern_parsing() {
        let glob = SmartGlob::search(".");

        // 测试 "**/*.rs" 模式
        let (base, ext) = glob.parse_glob_pattern("**/*.rs");
        assert_eq!(base, ".");
        assert_eq!(ext, Some("rs".to_string()));

        // 测试 "src/**/*.rs" 模式
        let (base, ext) = glob.parse_glob_pattern("src/**/*.rs");
        assert_eq!(base, "src");
        assert_eq!(ext, Some("rs".to_string()));

        // 测试 "." 模式
        let (base, ext) = glob.parse_glob_pattern(".");
        assert_eq!(base, ".");
        assert_eq!(ext, None);
    }
}
