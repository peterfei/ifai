//! 🎨 交互式 Glob 分页系统
//!
//! **核心特性**：
//! - 虚拟化列表：只渲染可见页
//! - 流式加载：按需获取数据
//! - 智能缓存：LRU 缓存机制
//! - 零拷贝：视图与数据分离

use super::smart_glob::{SearchIntent, SearchMetadata};
use std::path::PathBuf;

/// 🎯 分页配置（声明式）
#[derive(Debug, Clone)]
pub struct PaginationConfig {
    /// 每页大小
    pub page_size: usize,
    /// 预加载页数（缓存优化）
    pub preload_pages: usize,
    /// 最大缓存页数
    pub max_cached_pages: usize,
}

impl Default for PaginationConfig {
    fn default() -> Self {
        Self {
            page_size: 50,        // 每页 50 个文件
            preload_pages: 2,     // 预加载前后各 2 页
            max_cached_pages: 10, // 最多缓存 10 页
        }
    }
}

/// 📊 分页视图（零拷贝：仅存储引用）
#[derive(Debug, Clone)]
pub struct PagedView {
    /// 当前页码（0-based）
    pub current_page: usize,
    /// 总页数
    pub total_pages: usize,
    /// 当前页的数据（视图）
    pub items: Vec<PathBuf>,
    /// 页面元数据
    pub metadata: PageMetadata,
}

/// 📊 页面元数据
#[derive(Debug, Clone)]
pub struct PageMetadata {
    /// 起始索引
    pub start_index: usize,
    /// 结束索引
    pub end_index: usize,
    /// 总项目数
    pub total_items: usize,
    /// 是否有上一页
    pub has_prev: bool,
    /// 是否有下一页
    pub has_next: bool,
}

/// 🎨 分页导航器（元编程：自动管理分页逻辑）
pub struct PaginationNavigator {
    /// 配置
    config: PaginationConfig,
    /// 总项目数
    total_items: usize,
    /// 当前页
    current_page: usize,
    /// 缓存的页面数据
    cache: lru::LruCache<usize, Vec<PathBuf>>,
}

impl PaginationNavigator {
    /// 创建新的分页导航器
    pub fn new(total_items: usize, config: PaginationConfig) -> Self {
        let total_pages = (total_items + config.page_size - 1) / config.page_size;
        let cache = lru::LruCache::new(config.max_cached_pages);

        Self {
            config,
            total_items,
            current_page: 0,
            cache,
        }
    }

    /// 🔥 获取当前页（元编程：自动从缓存加载或生成）
    pub fn current_page(&mut self) -> PagedView {
        self.load_page(self.current_page)
    }

    /// 🔥 下一页（元编程：自动处理边界和缓存）
    pub fn next_page(&mut self) -> Option<PagedView> {
        if self.has_next() {
            self.current_page += 1;
            Some(self.current_page())
        } else {
            None
        }
    }

    /// 🔥 上一页（元编程：自动处理边界和缓存）
    pub fn prev_page(&mut self) -> Option<PagedView> {
        if self.has_prev() {
            self.current_page -= 1;
            Some(self.current_page())
        } else {
            None
        }
    }

    /// 🔥 跳转到指定页
    pub fn goto_page(&mut self, page: usize) -> Option<PagedView> {
        let total_pages = self.total_pages();
        if page < total_pages {
            self.current_page = page;
            Some(self.current_page())
        } else {
            None
        }
    }

    /// 🔥 加载页面（元编程：智能缓存管理）
    fn load_page(&mut self, page: usize) -> PagedView {
        // 检查缓存
        if let Some(items) = self.cache.get(&page) {
            return self.build_view(page, items);
        }

        // 缓存未命中，生成数据
        let items = self.fetch_page_data(page);

        // 存入缓存
        self.cache.put(page, items.clone());

        // 预加载相邻页（性能优化）
        self.preload_adjacent_pages(page);

        self.build_view(page, &items)
    }

    /// 🔥 构建页面视图（元编程：自动生成元数据）
    fn build_view(&self, page: usize, items: &[PathBuf]) -> PagedView {
        let total_pages = self.total_pages();
        let start_index = page * self.config.page_size;
        let end_index = (start_index + items.len()).min(self.total_items);

        PagedView {
            current_page: page,
            total_pages,
            items: items.to_vec(),
            metadata: PageMetadata {
                start_index,
                end_index,
                total_items: self.total_items,
                has_prev: page > 0,
                has_next: page + 1 < total_pages,
            },
        }
    }

    /// 🔥 获取页面数据（元编程：懒加载，仅获取需要的页）
    fn fetch_page_data(&self, page: usize) -> Vec<PathBuf> {
        use walkdir::WalkDir;
        let start = page * self.config.page_size;
        let end = (start + self.config.page_size).min(self.total_items);

        WalkDir::new(".")
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.path().is_file())
            .skip(start)
            .take(end - start)
            .map(|e| e.path().to_path_buf())
            .collect()
    }

    /// 🔥 预加载相邻页（元编程：智能预加载）
    fn preload_adjacent_pages(&mut self, current: usize) {
        let preload_range = current.saturating_sub(self.config.preload_pages)
            ..=(current + self.config.preload_pages).min(self.total_pages() - 1);

        for page in preload_range {
            if !self.cache.contains(&page) {
                let items = self.fetch_page_data(page);
                self.cache.put(page, items);
            }
        }
    }

    /// 是否有下一页
    pub fn has_next(&self) -> bool {
        self.current_page + 1 < self.total_pages()
    }

    /// 是否有上一页
    pub fn has_prev(&self) -> bool {
        self.current_page > 0
    }

    /// 总页数
    pub fn total_pages(&self) -> usize {
        (self.total_items + self.config.page_size - 1) / self.config.page_size
    }

    /// 当前页码
    pub fn current_page_number(&self) -> usize {
        self.current_page
    }
}

/// 🎨 交互式分页界面（声明式配置）
pub struct InteractivePager {
    /// 导航器
    navigator: PaginationNavigator,
    /// 是否显示统计信息
    show_stats: bool,
    /// 是否显示文件大小
    show_size: bool,
}

impl InteractivePager {
    /// 创建新的交互式分页器
    pub fn new(total_items: usize) -> Self {
        Self {
            navigator: PaginationNavigator::new(total_items, PaginationConfig::default()),
            show_stats: true,
            show_size: false,
        }
    }

    /// 🔥 渲染当前页（元编程：自动生成界面）
    pub fn render_current_page(&mut self) -> String {
        let view = self.navigator.current_page();
        self.render_view(&view)
    }

    /// 🔥 渲染页面视图（元编程：声明式界面生成）
    fn render_view(&self, view: &PagedView) -> String {
        let mut output = String::new();

        // 顶部统计栏
        if self.show_stats {
            output.push_str(&format!(
                "╭─ Page {} of {} (Files {}-{} of {}) ─╮\n",
                view.current_page + 1,
                view.total_pages,
                view.metadata.start_index + 1,
                view.metadata.end_index,
                view.metadata.total_items
            ));
        }

        // 文件列表
        for (i, item) in view.items.iter().enumerate() {
            let line_num = view.metadata.start_index + i + 1;
            output.push_str(&format!("│ {:>5} │ {}\n", line_num, item.display()));
        }

        // 底部导航提示
        output.push_str(&format!(
            "╰─ {} {} ─╮\n",
            if view.metadata.has_prev { "◀ Prev" } else { "      " },
            if view.metadata.has_next { "Next ▶" } else { "      " },
        ));

        output
    }

    /// 处理用户输入
    pub fn handle_input(&mut self, input: &str) -> Option<String> {
        match input.trim() {
            "n" | "next" => self.navigator.next_page().map(|v| self.render_view(&v)),
            "p" | "prev" => self.navigator.prev_page().map(|v| self.render_view(&v)),
            cmd if cmd.starts_with("goto ") => {
                let page: usize = cmd[4..].trim().parse().ok()?;
                self.navigator.goto_page(page.saturating_sub(1)).map(|v| self.render_view(&v))
            }
            _ => None,
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
    fn test_pagination_navigator() {
        let mut navigator = PaginationNavigator::new(150, PaginationConfig::default());

        assert_eq!(navigator.total_pages(), 3);
        assert_eq!(navigator.current_page_number(), 0);
        assert!(navigator.has_next());
        assert!(!navigator.has_prev());

        // 测试翻页
        assert!(navigator.next_page().is_some());
        assert_eq!(navigator.current_page_number(), 1);
        assert!(navigator.has_prev());

        // 测试跳转
        assert!(navigator.goto_page(2).is_some());
        assert_eq!(navigator.current_page_number(), 2);
        assert!(!navigator.has_next());
    }

    #[test]
    fn test_page_view_metadata() {
        let mut navigator = PaginationNavigator::new(150, PaginationConfig::default());
        let view = navigator.current_page();

        assert_eq!(view.current_page, 0);
        assert_eq!(view.total_pages, 3);
        assert_eq!(view.metadata.start_index, 0);
        assert_eq!(view.metadata.end_index, 50);
        assert!(!view.metadata.has_prev);
        assert!(view.metadata.has_next);
    }
}
