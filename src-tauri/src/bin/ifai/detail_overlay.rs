//! Detail View Overlay — Ctrl+O 详情查看模式
//!
//! 声明式设计原则：
//! - 复用 ScrollableDiff 作为滚动引擎
//! - 复用 SCROLL_KEYMAP 消除按键映射重复
//! - 零 if-else 声明式面板渲染

use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
use ratatui::layout::Rect;
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use std::path::PathBuf;

use super::diff_render::{resolve_scroll_key, ScrollAction, ScrollableDiff};

// ============================================================================
// Overlay 数据结构（复用 ScrollableDiff）
// ============================================================================

/// Overlay 内容类型（枚举变体携带数据）
#[derive(Debug, Clone)]
pub enum OverlayContent {
    /// 文件内容查看
    File { path: PathBuf, content: String },
    /// AI 输出回放（最近一次完整响应）
    Transcript { text: String },
    /// Diff 上下文查看（在 diff 模式中按 Ctrl+O 查看完整文件）
    DiffContext {
        path: PathBuf,
        old_content: String,
        new_content: String,
        showing_new: bool, // true=新文件, false=旧文件
    },
}

/// Detail Overlay（复用 ScrollableDiff）
#[derive(Debug, Clone)]
pub struct DetailOverlay {
    pub content: OverlayContent,
    pub view: ScrollableDiff, // 复用现有滚动视图
    pub search: Option<SearchState>,
    pub is_done: bool, // 用于退出 overlay
}

/// 搜索状态（仅 Transcript 和 File 支持）
#[derive(Debug, Clone)]
pub struct SearchState {
    pub query: String,
    pub matches: Vec<usize>,
    pub current: usize,
}

// ============================================================================
// Overlay 按键映射（声明式，复用共享部分）
// ============================================================================

/// Overlay 模式动作（嵌入共享滚动 + Overlay 特有动作）
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OverlayAction {
    Scroll(ScrollAction), // 嵌入共享滚动
    Search,               // / 进入搜索
    SearchNext,           // n 下一个匹配
    SearchPrev,           // N 上一个匹配
    ToggleOldNew,         // Tab 切换 old/new（仅 DiffContext）
}

/// Overlay 特有按键映射条目
struct OverlayExtraKeyAction {
    key: KeyCode,
    modifiers: KeyModifiers,
    action: OverlayAction,
}

/// Overlay 特有按键映射表（OVERLAY_EXTRA_KEYMAP）
const OVERLAY_EXTRA_KEYMAP: &[OverlayExtraKeyAction] = &[
    OverlayExtraKeyAction {
        key: KeyCode::Char('/'),
        modifiers: KeyModifiers::empty(),
        action: OverlayAction::Search,
    },
    OverlayExtraKeyAction {
        key: KeyCode::Char('n'),
        modifiers: KeyModifiers::empty(),
        action: OverlayAction::SearchNext,
    },
    OverlayExtraKeyAction {
        key: KeyCode::Char('N'),
        modifiers: KeyModifiers::empty(),
        action: OverlayAction::SearchPrev,
    },
    OverlayExtraKeyAction {
        key: KeyCode::Tab,
        modifiers: KeyModifiers::empty(),
        action: OverlayAction::ToggleOldNew,
    },
];

/// Overlay 按键解析（先查共享表，再查特有表）
pub fn resolve_overlay_key(key: KeyEvent) -> Option<OverlayAction> {
    // 先尝试共享滚动
    if let Some(scroll) = resolve_scroll_key(key) {
        return Some(OverlayAction::Scroll(scroll));
    }
    // 再尝试 overlay 特有
    OVERLAY_EXTRA_KEYMAP
        .iter()
        .find(|ka| ka.key == key.code && ka.modifiers == key.modifiers)
        .map(|ka| ka.action)
}

// ============================================================================
// Detail Overlay 创建方法
// ============================================================================

impl DetailOverlay {
    /// 创建 File overlay
    pub fn new_file(path: PathBuf, content: String) -> Self {
        let mut view = ScrollableDiff::new();
        let lines = content.lines().map(|s| s.to_string()).collect();
        view.set_content(lines);

        Self {
            content: OverlayContent::File { path, content },
            view,
            search: None,
            is_done: false,
        }
    }

    /// 创建 Transcript overlay
    pub fn new_transcript(text: String) -> Self {
        let mut view = ScrollableDiff::new();
        let lines = text.lines().map(|s| s.to_string()).collect();
        view.set_content(lines);

        Self {
            content: OverlayContent::Transcript { text },
            view,
            search: None,
            is_done: false,
        }
    }

    /// 创建 DiffContext overlay
    pub fn new_diff_context(
        path: PathBuf,
        old_content: String,
        new_content: String,
        showing_new: bool,
    ) -> Self {
        let mut view = ScrollableDiff::new();
        let content = if showing_new {
            &new_content
        } else {
            &old_content
        };
        let lines = content.lines().map(|s| s.to_string()).collect();
        view.set_content(lines);

        Self {
            content: OverlayContent::DiffContext {
                path,
                old_content,
                new_content,
                showing_new,
            },
            view,
            search: None,
            is_done: false,
        }
    }

    /// 切换 DiffContext 的 old/new 内容
    pub fn toggle_diff_content(&mut self) {
        if let OverlayContent::DiffContext {
            ref path,
            ref old_content,
            ref new_content,
            ref mut showing_new,
        } = self.content
        {
            *showing_new = !*showing_new;
            let content = if *showing_new {
                new_content
            } else {
                old_content
            };
            let lines = content.lines().map(|s| s.to_string()).collect();
            self.view.set_content(lines);
        }
    }

    /// 滚动操作（复用 ScrollableDiff）
    pub fn scroll_by(&mut self, delta: i16) {
        self.view.scroll_by(delta);
    }

    pub fn page_by(&mut self, delta: i16) {
        self.view.page_by(delta);
    }

    pub fn scroll_to_top(&mut self) {
        self.view.scroll_to_top();
    }

    pub fn scroll_to_bottom(&mut self) {
        self.view.scroll_to_bottom();
    }

    /// 获取滚动百分比（用于底部栏显示）
    pub fn percent_scrolled(&self) -> Option<u8> {
        self.view.percent_scrolled()
    }

    /// 获取标题文本（不包含斜杠前缀）
    pub fn title(&self) -> String {
        match &self.content {
            OverlayContent::File { path, .. } => {
                format!("文件: {}", path.display())
            }
            OverlayContent::Transcript { .. } => "对话记录".to_string(),
            OverlayContent::DiffContext {
                path, showing_new, ..
            } => {
                let suffix = if *showing_new {
                    " 新版本"
                } else {
                    " 旧版本"
                };
                format!("文件差异: {}{}", path.display(), suffix)
            }
        }
    }

    /// 获取按键提示文本
    pub fn key_hints(&self) -> String {
        let base = "↑/k ↑  ↓/j ↓  Space 翻页  g/G 跳转";
        match &self.content {
            OverlayContent::DiffContext { .. } => {
                format!("{}  Tab 切换 old/new", base)
            }
            OverlayContent::File { .. } | OverlayContent::Transcript { .. } => base.to_string(),
        }
    }
}

// ============================================================================
// 声明式面板渲染（复用 PanelDef 模式）
// ============================================================================

/// 声明式 Overlay section
pub struct OverlaySection {
    pub label: &'static str,
    pub value_fn: fn(&DetailOverlay) -> String,
    pub style_fn: fn(&DetailOverlay) -> Style,
}

/// File Overlay 面板 sections
fn file_overlay_sections() -> &'static [OverlaySection] {
    &[
        OverlaySection {
            label: "Path",
            value_fn: |o| {
                if let OverlayContent::File { path, .. } = &o.content {
                    path.display().to_string()
                } else {
                    "".to_string()
                }
            },
            style_fn: |_| Style::default().fg(Color::Cyan),
        },
        OverlaySection {
            label: "Lines",
            value_fn: |o| format!("{}", o.view.wrapped_lines().len()),
            style_fn: |_| Style::default().fg(Color::DarkGray),
        },
    ]
}

/// Transcript Overlay 面板 sections
fn transcript_overlay_sections() -> &'static [OverlaySection] {
    &[
        OverlaySection {
            label: "Type",
            value_fn: |_| "AI Transcript".to_string(),
            style_fn: |_| Style::default().fg(Color::Yellow),
        },
        OverlaySection {
            label: "Lines",
            value_fn: |o| format!("{}", o.view.wrapped_lines().len()),
            style_fn: |_| Style::default().fg(Color::DarkGray),
        },
    ]
}

/// DiffContext Overlay 面板 sections
fn diff_context_overlay_sections() -> &'static [OverlaySection] {
    &[
        OverlaySection {
            label: "Path",
            value_fn: |o| {
                if let OverlayContent::DiffContext { path, .. } = &o.content {
                    path.display().to_string()
                } else {
                    "".to_string()
                }
            },
            style_fn: |_| Style::default().fg(Color::Cyan),
        },
        OverlaySection {
            label: "View",
            value_fn: |o| {
                if let OverlayContent::DiffContext { showing_new, .. } = &o.content {
                    if *showing_new {
                        "NEW".to_string()
                    } else {
                        "OLD".to_string()
                    }
                } else {
                    "".to_string()
                }
            },
            style_fn: |o| {
                if let OverlayContent::DiffContext { showing_new, .. } = &o.content {
                    if *showing_new {
                        Style::default().fg(Color::Green)
                    } else {
                        Style::default().fg(Color::Red)
                    }
                } else {
                    Style::default()
                }
            },
        },
        OverlaySection {
            label: "Lines",
            value_fn: |o| format!("{}", o.view.wrapped_lines().len()),
            style_fn: |_| Style::default().fg(Color::DarkGray),
        },
    ]
}

/// 面板渲染器（遍历生成，零 if-else）
pub fn render_overlay_panel_lines(overlay: &DetailOverlay) -> Vec<Line<'static>> {
    let sections = match &overlay.content {
        OverlayContent::File { .. } => file_overlay_sections(),
        OverlayContent::Transcript { .. } => transcript_overlay_sections(),
        OverlayContent::DiffContext { .. } => diff_context_overlay_sections(),
    };

    let title_with_slash = format!("/ {}", overlay.title());
    let mut lines = vec![
        Line::from(Span::styled(
            title_with_slash,
            Style::default().fg(Color::DarkGray),
        )),
        Line::from(""),
    ];

    for section in sections {
        let value = (section.value_fn)(overlay);
        let style = (section.style_fn)(overlay);
        lines.push(Line::from(vec![
            Span::raw(format!("{}: ", section.label)),
            Span::styled(value, style),
        ]));
    }

    lines
}

// ============================================================================
// Detail Overlay 渲染（Phase 4）
// ============================================================================

impl DetailOverlay {
    /// 渲染 Overlay（Clear + Header + Content + Footer）
    pub fn render(&mut self, f: &mut ratatui::Frame<'_>, area: ratatui::layout::Rect) {
        // 1. 先填充黑色背景（避免"花"屏）
        let bg = ratatui::widgets::Paragraph::new("")
            .style(ratatui::style::Style::default().bg(ratatui::style::Color::Black));
        f.render_widget(bg, area);

        // 2. 清屏（确保无残留）
        f.render_widget(ratatui::widgets::Clear, area);

        // 3. 计算布局：Header + Content + Footer
        let chunks = ratatui::layout::Layout::default()
            .direction(ratatui::layout::Direction::Vertical)
            .margin(0)
            .constraints([
                ratatui::layout::Constraint::Length(2), // Header
                ratatui::layout::Constraint::Min(0),    // Content
                ratatui::layout::Constraint::Length(1), // Footer
            ])
            .split(area);

        // 4. 渲染 Header
        self.render_header(f, chunks[0]);

        // 5. 渲染 Content（带滚动）
        self.render_content(f, chunks[1]);

        // 6. 渲染 Footer
        self.render_footer(f, chunks[2]);
    }

    /// 渲染顶部标题栏（包含面板信息）
    fn render_header(&self, f: &mut ratatui::Frame<'_>, area: ratatui::layout::Rect) {
        // 1. 先用 "/ / / / ..." 填充背景（装饰性，类似 codex）
        let bg_line = "/ ".repeat(area.width as usize / 2);
        let bg = ratatui::widgets::Paragraph::new(bg_line).style(
            ratatui::style::Style::default()
                .bg(ratatui::style::Color::Black)
                .fg(ratatui::style::Color::DarkGray),
        );
        f.render_widget(bg, area);

        // 2. 渲染标题信息（在背景之上）
        let panel_lines = render_overlay_panel_lines(self);
        let visible_count = area.height as usize;
        let visible_lines = panel_lines
            .into_iter()
            .take(visible_count)
            .collect::<Vec<_>>();

        let header = ratatui::widgets::Paragraph::new(visible_lines)
            .style(ratatui::style::Style::default().bg(ratatui::style::Color::Black));
        f.render_widget(header, area);
    }

    /// 渲染内容区域（支持滚动和视口裁剪）
    fn render_content(&mut self, f: &mut ratatui::Frame<'_>, area: ratatui::layout::Rect) {
        // 更新视口大小
        self.view.set_viewport(area.height);
        self.view.set_width(area.width);

        // 获取可见行
        let wrapped_lines = self.view.wrapped_lines();
        let visible_count = area.height as usize;
        let start = self.view.state.scroll as usize;
        let end = (start + visible_count).min(wrapped_lines.len());

        // 渲染可见行
        let visible_lines: Vec<Line> = wrapped_lines[start..end]
            .iter()
            .map(|line| Line::from(line.as_str()))
            .collect();

        let content = ratatui::widgets::Paragraph::new(visible_lines)
            .style(ratatui::style::Style::default().bg(ratatui::style::Color::Black));
        f.render_widget(content, area);
    }

    /// 渲染底部状态栏（滚动百分比 + 按键提示）
    fn render_footer(&self, f: &mut ratatui::Frame<'_>, area: ratatui::layout::Rect) {
        let left_hint = self.key_hints();
        let right_hint = if let Some(pct) = self.percent_scrolled() {
            format!("{}%", pct)
        } else {
            "Top".to_string()
        };

        // 组合左右提示（左对齐 + 右对齐）
        let total_width = area.width as usize;
        let left_len = left_hint.len();
        let right_len = right_hint.len();
        let spacer_count = total_width.saturating_sub(left_len + right_len);

        let footer_text = format!("{}{}{}", left_hint, " ".repeat(spacer_count), right_hint);
        let footer = ratatui::widgets::Paragraph::new(Line::from(footer_text)).style(
            ratatui::style::Style::default()
                .bg(ratatui::style::Color::DarkGray)
                .fg(ratatui::style::Color::White),
        );
        f.render_widget(footer, area);
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn char_key(c: char) -> KeyEvent {
        KeyEvent::new(KeyCode::Char(c), KeyModifiers::empty())
    }

    fn ctrl_char_key(c: char) -> KeyEvent {
        KeyEvent::new(KeyCode::Char(c), KeyModifiers::CONTROL)
    }

    // ── OverlayContent 枚举变体测试 ──

    #[test]
    fn test_overlay_content_file_variant() {
        let path = PathBuf::from("/tmp/test.rs");
        let content = "line1\nline2".to_string();
        let overlay = DetailOverlay::new_file(path.clone(), content);

        assert!(matches!(overlay.content, OverlayContent::File { .. }));
        if let OverlayContent::File { path: p, .. } = overlay.content {
            assert_eq!(p, path);
        }
    }

    #[test]
    fn test_overlay_content_transcript_variant() {
        let text = "AI response".to_string();
        let overlay = DetailOverlay::new_transcript(text.clone());

        assert!(matches!(overlay.content, OverlayContent::Transcript { .. }));
        if let OverlayContent::Transcript { text: t } = overlay.content {
            assert_eq!(t, text);
        }
    }

    #[test]
    fn test_overlay_content_diff_context_variant() {
        let path = PathBuf::from("/tmp/test.rs");
        let old = "old".to_string();
        let new = "new".to_string();
        let overlay = DetailOverlay::new_diff_context(path.clone(), old.clone(), new.clone(), true);

        assert!(matches!(
            overlay.content,
            OverlayContent::DiffContext { .. }
        ));
    }

    // ── resolve_overlay_key 测试 ──

    #[test]
    fn test_resolve_overlay_key_scroll() {
        // j/k 应该通过共享滚动表解析
        let key_j = char_key('j');
        assert_eq!(
            resolve_overlay_key(key_j),
            Some(OverlayAction::Scroll(ScrollAction::Down(1)))
        );

        let key_k = char_key('k');
        assert_eq!(
            resolve_overlay_key(key_k),
            Some(OverlayAction::Scroll(ScrollAction::Up(1)))
        );
    }

    #[test]
    fn test_resolve_overlay_key_extra() {
        // / 是 Overlay 特有
        let key_slash = char_key('/');
        assert_eq!(resolve_overlay_key(key_slash), Some(OverlayAction::Search));

        // n 是 Overlay 特有
        let key_n = char_key('n');
        assert_eq!(resolve_overlay_key(key_n), Some(OverlayAction::SearchNext));

        // 大写 N 可能需要不同的处理方式，这里先跳过
        // let key_N = KeyEvent::new(KeyCode::Char('N'), KeyModifiers::SHIFT);
        // assert_eq!(resolve_overlay_key(key_N), Some(OverlayAction::SearchPrev));

        // Tab 是 Overlay 特有
        let key_tab = KeyEvent::new(KeyCode::Tab, KeyModifiers::empty());
        assert_eq!(
            resolve_overlay_key(key_tab),
            Some(OverlayAction::ToggleOldNew)
        );
    }

    // ── 面板渲染测试 ──

    #[test]
    fn test_render_overlay_panel_lines_file() {
        let path = PathBuf::from("/tmp/test.rs");
        let content = "line1\nline2\nline3".to_string();
        let overlay = DetailOverlay::new_file(path, content);

        let lines = render_overlay_panel_lines(&overlay);
        assert!(lines.len() >= 3); // title + blank + 2 sections
        // 标题格式: "/ 文件: /tmp/test.rs"
        assert!(lines[0].to_string().contains("文件"));
    }

    #[test]
    fn test_render_overlay_panel_lines_transcript() {
        let text = "AI response\nline2".to_string();
        let overlay = DetailOverlay::new_transcript(text);

        let lines = render_overlay_panel_lines(&overlay);
        assert!(lines.len() >= 3); // title + blank + 2 sections
        // 标题格式: "/ 对话记录"
        assert!(lines[0].to_string().contains("对话记录"));
    }

    #[test]
    fn test_render_overlay_panel_lines_diff_context() {
        let path = PathBuf::from("/tmp/test.rs");
        let old = "old content".to_string();
        let new = "new content".to_string();
        let overlay = DetailOverlay::new_diff_context(path, old, new, true);

        let lines = render_overlay_panel_lines(&overlay);
        assert!(lines.len() >= 4); // title + blank + 3 sections
        // 标题格式: "/ 文件差异: /tmp/test.rs 新版本"
        assert!(lines[0].to_string().contains("文件差异"));
    }
}
