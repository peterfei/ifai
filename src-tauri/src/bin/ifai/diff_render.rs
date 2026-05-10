//! Diff Render — TUI 终端 diff 渲染系统
//!
//! 🏛️ 元编程：声明式渲染，零 match 分支
//! 从 Codex 移植 ScrollableDiff，对齐 GUI FileChange 接口

use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
use ratatui::{
    style::{Color, Style},
    text::{Line, Span},
};
use std::path::PathBuf;

// ============================================================================
// 核心数据类型（对齐 GUI FileChange）
// ============================================================================

/// 文件变更类型（对齐 GUI changeType）
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DiffChangeKind {
    Added,    // 新建文件
    Modified, // 修改文件
    Deleted,  // 删除文件
}

/// Diff 行类型
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DiffLineType {
    Insert,     // + 插入行
    Delete,     // - 删除行
    Context,    // 空格 上下文行
    HunkHeader, // @@ @@ hunk 头
}

/// Diff 行
#[derive(Debug, Clone)]
pub struct DiffLine {
    pub line_type: DiffLineType,
    pub old_line_no: Option<usize>,
    pub new_line_no: Option<usize>,
    pub content: String,
}

/// 文件变更（对齐 GUI FileChange）
#[derive(Debug, Clone)]
pub struct DiffFileChange {
    pub path: PathBuf,
    pub kind: DiffChangeKind,
    pub old_content: Option<String>, // None for Added
    pub new_content: Option<String>, // None for Deleted
    pub added: usize,
    pub removed: usize,
}

// ============================================================================
// DiffLineType 样式配置表（查表驱动，零 match）
// ============================================================================

struct DiffLineStyle {
    sign: char,
    fg_color: Color,
    bg_color: Option<Color>,
    show_old_no: bool,
    show_new_no: bool,
}

/// 🎨 Diff 行样式查找表（与 RISK_DISPLAYS 同构）
const DIFF_LINE_STYLES: &[(DiffLineType, DiffLineStyle)] = &[
    (
        DiffLineType::Insert,
        DiffLineStyle {
            sign: '+',
            fg_color: Color::Green,
            bg_color: Some(Color::Indexed(22)), // diff_add_bg
            show_old_no: false,
            show_new_no: true,
        },
    ),
    (
        DiffLineType::Delete,
        DiffLineStyle {
            sign: '-',
            fg_color: Color::Red,
            bg_color: Some(Color::Indexed(52)), // diff_del_bg
            show_old_no: true,
            show_new_no: false,
        },
    ),
    (
        DiffLineType::Context,
        DiffLineStyle {
            sign: ' ',
            fg_color: Color::White,
            bg_color: None,
            show_old_no: true,
            show_new_no: true,
        },
    ),
    (
        DiffLineType::HunkHeader,
        DiffLineStyle {
            sign: '@',
            fg_color: Color::Indexed(69), // brand
            bg_color: None,
            show_old_no: false,
            show_new_no: false,
        },
    ),
];

fn line_style(kind: DiffLineType) -> &'static DiffLineStyle {
    DIFF_LINE_STYLES
        .iter()
        .find(|(k, _)| *k == kind)
        .map(|(_, s)| s)
        .unwrap() // 枚举穷举，不会 panic
}

// ============================================================================
// Diff 渲染引擎
// ============================================================================

/// 计算两段文本的 unified diff
pub fn compute_diff(old: &str, new: &str) -> Vec<DiffLine> {
    use similar::{Algorithm, TextDiff};

    let diff = TextDiff::configure()
        .algorithm(Algorithm::Patience)
        .diff_lines(old, new);

    let mut lines = Vec::new();

    // 获取新旧文本行
    let old_lines: Vec<&str> = old.lines().collect();
    let new_lines: Vec<&str> = new.lines().collect();

    for op in diff.ops() {
        let old_range = op.old_range();
        let new_range = op.new_range();

        // 根据 op 类型处理
        match op.tag() {
            similar::DiffTag::Equal => {
                // 上下文行
                for i in 0..old_range.len() {
                    lines.push(DiffLine {
                        line_type: DiffLineType::Context,
                        old_line_no: Some(old_range.start + i + 1),
                        new_line_no: Some(new_range.start + i + 1),
                        content: old_lines[old_range.start + i].to_string(),
                    });
                }
            }
            similar::DiffTag::Delete => {
                // 删除行
                for i in 0..old_range.len() {
                    lines.push(DiffLine {
                        line_type: DiffLineType::Delete,
                        old_line_no: Some(old_range.start + i + 1),
                        new_line_no: None,
                        content: old_lines[old_range.start + i].to_string(),
                    });
                }
            }
            similar::DiffTag::Insert => {
                // 插入行
                for i in 0..new_range.len() {
                    lines.push(DiffLine {
                        line_type: DiffLineType::Insert,
                        old_line_no: None,
                        new_line_no: Some(new_range.start + i + 1),
                        content: new_lines[new_range.start + i].to_string(),
                    });
                }
            }
            similar::DiffTag::Replace => {
                // 替换行：先删除旧行，再插入新行
                for i in 0..old_range.len() {
                    lines.push(DiffLine {
                        line_type: DiffLineType::Delete,
                        old_line_no: Some(old_range.start + i + 1),
                        new_line_no: None,
                        content: old_lines[old_range.start + i].to_string(),
                    });
                }
                for i in 0..new_range.len() {
                    lines.push(DiffLine {
                        line_type: DiffLineType::Insert,
                        old_line_no: None,
                        new_line_no: Some(new_range.start + i + 1),
                        content: new_lines[new_range.start + i].to_string(),
                    });
                }
            }
        }
    }

    lines
}

/// 渲染单行 diff 为 ratatui Line（宽度自适应）
pub fn render_diff_line(line: &DiffLine, width: usize) -> Line<'static> {
    let style = line_style(line.line_type);

    // 构建 gutter（行号部分）
    let old_no = style
        .show_old_no
        .then(|| {
            line.old_line_no
                .map(|n| format!("{:4}", n))
                .unwrap_or("    ".to_string())
        })
        .unwrap_or_else(|| "    ".to_string());

    let new_no = style
        .show_new_no
        .then(|| {
            line.new_line_no
                .map(|n| format!("{:4}", n))
                .unwrap_or("    ".to_string())
        })
        .unwrap_or_else(|| "    ".to_string());

    let gutter = format!("{}{}{}{}", old_no, new_no, style.sign, ' ');

    // 计算可用内容宽度
    let content_width = width.saturating_sub(gutter.chars().count());

    // 截断内容以适应宽度
    let content = if line.content.chars().count() > content_width {
        line.content
            .chars()
            .take(content_width.saturating_sub(3))
            .collect::<String>()
            + "..."
    } else {
        line.content.clone()
    };

    let mut spans = vec![Span::styled(gutter, Style::default().fg(style.fg_color))];

    // 添加背景色（如果有）
    let content_span = if let Some(bg) = style.bg_color {
        Span::styled(content, Style::default().fg(style.fg_color).bg(bg))
    } else {
        Span::styled(content, Style::default().fg(style.fg_color))
    };

    spans.push(content_span);

    Line::from(spans)
}

/// 渲染 diff 摘要（树形统计）
pub fn render_diff_summary(changes: &[DiffFileChange]) -> Vec<Line<'static>> {
    let mut lines = Vec::new();

    if changes.is_empty() {
        return lines;
    }

    let total_added = changes.iter().map(|c| c.added).sum::<usize>();
    let total_removed = changes.iter().map(|c| c.removed).sum::<usize>();
    let file_count = changes.len();

    // 头部摘要
    lines.push(Line::from(vec![
        Span::styled("• ", Style::default().fg(Color::Indexed(69))), // brand
        Span::styled(
            format!(
                "Edited {} files (+{} -{})",
                file_count, total_added, total_removed
            ),
            Style::default().fg(Color::White),
        ),
    ]));

    // 每个文件的变更
    for change in changes {
        let icon = match change.kind {
            DiffChangeKind::Added => "├─",
            DiffChangeKind::Modified => "├─",
            DiffChangeKind::Deleted => "└─",
        };

        let path = change.path.display().to_string();
        let path_span = Span::styled(path, Style::default().fg(Color::Indexed(72))); // code

        let stats = format!(" (+{} -{})", change.added, change.removed);
        let stats_span = Span::styled(stats, Style::default().fg(Color::Indexed(248))); // muted

        lines.push(Line::from(vec![
            Span::raw(icon),
            Span::raw(" "),
            path_span,
            stats_span,
        ]));
    }

    lines
}

// ============================================================================
// ScrollableDiff（从 Codex 移植）
// ============================================================================

use unicode_width::UnicodeWidthChar;
use unicode_width::UnicodeWidthStr;

/// 滚动状态和几何信息
#[derive(Clone, Copy, Debug, Default)]
pub struct ScrollViewState {
    pub scroll: u16,
    pub viewport_h: u16,
    pub content_h: u16,
}

impl ScrollViewState {
    pub fn clamp(&mut self) {
        let max_scroll = self.content_h.saturating_sub(self.viewport_h);
        if self.scroll > max_scroll {
            self.scroll = max_scroll;
        }
    }
}

/// 可滚动 diff 视图（从 Codex 移植）
#[derive(Clone, Debug, Default)]
pub struct ScrollableDiff {
    raw: Vec<String>,
    wrapped: Vec<String>,
    wrapped_src_idx: Vec<usize>,
    wrap_cols: Option<u16>,
    pub state: ScrollViewState,
}

impl ScrollableDiff {
    pub fn new() -> Self {
        Self::default()
    }

    /// 替换原始内容行
    pub fn set_content(&mut self, lines: Vec<String>) {
        self.raw = lines;
        self.wrapped.clear();
        self.wrapped_src_idx.clear();
        self.state.content_h = 0;
        self.wrap_cols = None;
    }

    /// 设置换行宽度
    pub fn set_width(&mut self, width: u16) {
        if self.wrap_cols == Some(width) {
            return;
        }
        self.wrap_cols = Some(width);
        self.rewrap(width);
        self.state.clamp();
    }

    /// 更新视口高度
    pub fn set_viewport(&mut self, height: u16) {
        self.state.viewport_h = height;
        self.state.clamp();
    }

    /// 获取换行后的行
    pub fn wrapped_lines(&self) -> &[String] {
        &self.wrapped
    }

    /// 按偏移量滚动
    pub fn scroll_by(&mut self, delta: i16) {
        let s = self.state.scroll as i32 + delta as i32;
        self.state.scroll = s.clamp(0, self.max_scroll() as i32) as u16;
    }

    /// 翻页
    pub fn page_by(&mut self, delta: i16) {
        self.scroll_by(delta);
    }

    /// 滚到顶部
    pub fn scroll_to_top(&mut self) {
        self.state.scroll = 0;
    }

    /// 滚到底部
    pub fn scroll_to_bottom(&mut self) {
        self.state.scroll = self.max_scroll();
    }

    /// 滚动百分比
    pub fn percent_scrolled(&self) -> Option<u8> {
        if self.state.content_h == 0 || self.state.viewport_h == 0 {
            return None;
        }
        if self.state.content_h <= self.state.viewport_h {
            return None;
        }
        let visible_bottom = self.state.scroll.saturating_add(self.state.viewport_h) as f32;
        let pct = (visible_bottom / self.state.content_h as f32 * 100.0).round();
        Some(pct.clamp(0.0, 100.0) as u8)
    }

    fn max_scroll(&self) -> u16 {
        self.state.content_h.saturating_sub(self.state.viewport_h)
    }

    fn rewrap(&mut self, width: u16) {
        if width == 0 {
            self.wrapped = self.raw.clone();
            self.state.content_h = self.wrapped.len() as u16;
            return;
        }
        let max_cols = width as usize;
        let mut out: Vec<String> = Vec::new();
        let mut out_idx: Vec<usize> = Vec::new();
        for (raw_idx, raw) in self.raw.iter().enumerate() {
            // 标准化 tab（4 空格）
            let raw = raw.replace('\t', "    ");
            if raw.is_empty() {
                out.push(String::new());
                out_idx.push(raw_idx);
                continue;
            }
            let mut line = String::new();
            let mut line_cols = 0usize;
            let mut last_soft_idx: Option<usize> = None;
            for (_i, ch) in raw.char_indices() {
                let w = UnicodeWidthChar::width(ch).unwrap_or(0);
                if line_cols.saturating_add(w) > max_cols {
                    if let Some(split) = last_soft_idx {
                        let (prefix, rest) = line.split_at(split);
                        out.push(prefix.trim_end().to_string());
                        out_idx.push(raw_idx);
                        line = rest.trim_start().to_string();
                        last_soft_idx = None;
                    } else if !line.is_empty() {
                        out.push(std::mem::take(&mut line));
                        out_idx.push(raw_idx);
                    }
                }
                if ch.is_whitespace()
                    || matches!(
                        ch,
                        ',' | ';' | '.' | ':' | ')' | ']' | '}' | '|' | '/' | '?' | '!' | '-' | '_'
                    )
                {
                    last_soft_idx = Some(line.len());
                }
                line.push(ch);
                line_cols = UnicodeWidthStr::width(line.as_str());
            }
            if !line.is_empty() {
                out.push(line);
                out_idx.push(raw_idx);
            }
        }
        self.wrapped = out;
        self.wrapped_src_idx = out_idx;
        self.state.content_h = self.wrapped.len() as u16;
    }
}

// ============================================================================
// 共享滚动动作（Diff + Overlay 复用）
// ============================================================================

/// 共享滚动动作（diff 模式和 overlay 模式共用）
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ScrollAction {
    Up(u16),
    Down(u16),
    HalfUp,
    HalfDown,
    PageUp,
    PageDown,
    Top,
    Bottom,
    Exit,
}

/// 共享滚动按键映射条目
pub struct ScrollKeyAction {
    pub key: KeyCode,
    pub modifiers: KeyModifiers,
    pub action: ScrollAction,
}

/// 🎹 共享滚动按键映射表（SCROLL_KEYMAP）
pub const SCROLL_KEYMAP: &[ScrollKeyAction] = &[
    ScrollKeyAction {
        key: KeyCode::Char('j'),
        modifiers: KeyModifiers::empty(),
        action: ScrollAction::Down(1),
    },
    ScrollKeyAction {
        key: KeyCode::Down,
        modifiers: KeyModifiers::empty(),
        action: ScrollAction::Down(1),
    },
    ScrollKeyAction {
        key: KeyCode::Char('k'),
        modifiers: KeyModifiers::empty(),
        action: ScrollAction::Up(1),
    },
    ScrollKeyAction {
        key: KeyCode::Up,
        modifiers: KeyModifiers::empty(),
        action: ScrollAction::Up(1),
    },
    ScrollKeyAction {
        key: KeyCode::Char('g'),
        modifiers: KeyModifiers::empty(),
        action: ScrollAction::Top,
    },
    ScrollKeyAction {
        key: KeyCode::Char('G'),
        modifiers: KeyModifiers::empty(),
        action: ScrollAction::Bottom,
    },
    ScrollKeyAction {
        key: KeyCode::Home,
        modifiers: KeyModifiers::empty(),
        action: ScrollAction::Top,
    },
    ScrollKeyAction {
        key: KeyCode::End,
        modifiers: KeyModifiers::empty(),
        action: ScrollAction::Bottom,
    },
    ScrollKeyAction {
        key: KeyCode::Char(' '),
        modifiers: KeyModifiers::empty(),
        action: ScrollAction::PageDown,
    },
    ScrollKeyAction {
        key: KeyCode::PageDown,
        modifiers: KeyModifiers::empty(),
        action: ScrollAction::PageDown,
    },
    ScrollKeyAction {
        key: KeyCode::PageUp,
        modifiers: KeyModifiers::empty(),
        action: ScrollAction::PageUp,
    },
    ScrollKeyAction {
        key: KeyCode::Char('d'),
        modifiers: KeyModifiers::CONTROL,
        action: ScrollAction::HalfDown,
    },
    ScrollKeyAction {
        key: KeyCode::Char('u'),
        modifiers: KeyModifiers::CONTROL,
        action: ScrollAction::HalfUp,
    },
    ScrollKeyAction {
        key: KeyCode::Char('q'),
        modifiers: KeyModifiers::empty(),
        action: ScrollAction::Exit,
    },
    ScrollKeyAction {
        key: KeyCode::Esc,
        modifiers: KeyModifiers::empty(),
        action: ScrollAction::Exit,
    },
];

/// 解析共享滚动按键（O(n) 查表）
pub fn resolve_scroll_key(key: KeyEvent) -> Option<ScrollAction> {
    SCROLL_KEYMAP
        .iter()
        .find(|ka| ka.key == key.code && ka.modifiers == key.modifiers)
        .map(|ka| ka.action)
}

// ============================================================================
// Diff 模式按键映射（查表驱动）
// ============================================================================

/// Diff 模式动作（组合模式：嵌入共享滚动 + Diff 特有动作）
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DiffAction {
    Scroll(ScrollAction), // 嵌入共享滚动
    NextFile,             // Diff 特有
    PrevFile,             // Diff 特有
}

/// Diff 特有按键映射条目（仅 NextFile/PrevFile）
struct DiffExtraKeyAction {
    key: KeyCode,
    modifiers: KeyModifiers,
    action: DiffAction,
}

/// Diff 特有按键映射表（DIFF_EXTRA_KEYMAP）
const DIFF_EXTRA_KEYMAP: &[DiffExtraKeyAction] = &[
    DiffExtraKeyAction {
        key: KeyCode::Char(']'),
        modifiers: KeyModifiers::empty(),
        action: DiffAction::NextFile,
    },
    DiffExtraKeyAction {
        key: KeyCode::Right,
        modifiers: KeyModifiers::empty(),
        action: DiffAction::NextFile,
    },
    DiffExtraKeyAction {
        key: KeyCode::Char('['),
        modifiers: KeyModifiers::empty(),
        action: DiffAction::PrevFile,
    },
    DiffExtraKeyAction {
        key: KeyCode::Left,
        modifiers: KeyModifiers::empty(),
        action: DiffAction::PrevFile,
    },
];

/// 解析 diff 模式按键（先查共享表，再查特有表）
pub fn resolve_diff_key(key: KeyEvent) -> Option<DiffAction> {
    // 先尝试共享滚动
    if let Some(scroll) = resolve_scroll_key(key) {
        // Ctrl+D 在 diff 模式是 NextFile，不是 Exit
        if scroll == ScrollAction::HalfDown {
            return None; // 让特有表处理
        }
        return Some(DiffAction::Scroll(scroll));
    }
    // 再尝试 diff 特有
    DIFF_EXTRA_KEYMAP
        .iter()
        .find(|ka| ka.key == key.code && ka.modifiers == key.modifiers)
        .map(|ka| ka.action)
}

// ============================================================================
// 辅助函数
// ============================================================================

/// 创建带背景色的 Style
pub fn style_with_bg(fg: Color, bg: Color) -> Style {
    Style::default().fg(fg).bg(bg)
}

/// 创建仅前景色的 Style
pub fn style_fg(fg: Color) -> Style {
    Style::default().fg(fg)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compute_diff_simple() {
        let old = "line1\nline2\nline3";
        let new = "line1\nline2 modified\nline3";
        let diff = compute_diff(old, new);

        // 应该有 4 行：line1 (context) + -line2 (delete) + +line2 modified (insert) + line3 (context)
        assert_eq!(diff.len(), 4);
        assert_eq!(diff[0].line_type, DiffLineType::Context);
        assert_eq!(diff[0].content, "line1");
        assert_eq!(diff[1].line_type, DiffLineType::Delete);
        assert_eq!(diff[1].content, "line2");
        assert_eq!(diff[2].line_type, DiffLineType::Insert);
        assert_eq!(diff[2].content, "line2 modified");
        assert_eq!(diff[3].line_type, DiffLineType::Context);
        assert_eq!(diff[3].content, "line3");
    }

    #[test]
    fn test_compute_diff_add_delete() {
        let old = "line1\nline2\nline3";
        let new = "line1\nline3\nline4";
        let diff = compute_diff(old, new);

        // 应该有删除 line2 和插入 line4
        let has_delete = diff.iter().any(|d| d.line_type == DiffLineType::Delete);
        let has_insert = diff.iter().any(|d| d.line_type == DiffLineType::Insert);
        assert!(has_delete);
        assert!(has_insert);
    }

    #[test]
    fn test_resolve_diff_key() {
        use crate::diff_render::ScrollAction;

        let key_j = KeyEvent::new(KeyCode::Char('j'), KeyModifiers::empty());
        assert_eq!(
            resolve_diff_key(key_j),
            Some(DiffAction::Scroll(ScrollAction::Down(1)))
        );

        let key_q = KeyEvent::new(KeyCode::Char('q'), KeyModifiers::empty());
        assert_eq!(
            resolve_diff_key(key_q),
            Some(DiffAction::Scroll(ScrollAction::Exit))
        );

        let key_esc = KeyEvent::new(KeyCode::Esc, KeyModifiers::empty());
        assert_eq!(
            resolve_diff_key(key_esc),
            Some(DiffAction::Scroll(ScrollAction::Exit))
        );

        // Ctrl+D 在 diff 模式不映射到任何操作（被排除）
        let key_ctrl_d = KeyEvent::new(KeyCode::Char('d'), KeyModifiers::CONTROL);
        assert_eq!(resolve_diff_key(key_ctrl_d), None);

        let key_bracket_right = KeyEvent::new(KeyCode::Char(']'), KeyModifiers::empty());
        assert_eq!(
            resolve_diff_key(key_bracket_right),
            Some(DiffAction::NextFile)
        );

        let key_right = KeyEvent::new(KeyCode::Right, KeyModifiers::empty());
        assert_eq!(resolve_diff_key(key_right), Some(DiffAction::NextFile));

        let key_bracket_left = KeyEvent::new(KeyCode::Char('['), KeyModifiers::empty());
        assert_eq!(
            resolve_diff_key(key_bracket_left),
            Some(DiffAction::PrevFile)
        );

        let key_left = KeyEvent::new(KeyCode::Left, KeyModifiers::empty());
        assert_eq!(resolve_diff_key(key_left), Some(DiffAction::PrevFile));

        let key_unknown = KeyEvent::new(KeyCode::Char('x'), KeyModifiers::empty());
        assert_eq!(resolve_diff_key(key_unknown), None);
    }

    #[test]
    fn test_resolve_scroll_key() {
        let key_j = KeyEvent::new(KeyCode::Char('j'), KeyModifiers::empty());
        assert_eq!(resolve_scroll_key(key_j), Some(ScrollAction::Down(1)));

        let key_k = KeyEvent::new(KeyCode::Char('k'), KeyModifiers::empty());
        assert_eq!(resolve_scroll_key(key_k), Some(ScrollAction::Up(1)));

        let key_g = KeyEvent::new(KeyCode::Char('g'), KeyModifiers::empty());
        assert_eq!(resolve_scroll_key(key_g), Some(ScrollAction::Top));

        let key_G = KeyEvent::new(KeyCode::Char('G'), KeyModifiers::empty());
        assert_eq!(resolve_scroll_key(key_G), Some(ScrollAction::Bottom));

        let key_q = KeyEvent::new(KeyCode::Char('q'), KeyModifiers::empty());
        assert_eq!(resolve_scroll_key(key_q), Some(ScrollAction::Exit));

        let key_ctrl_d = KeyEvent::new(KeyCode::Char('d'), KeyModifiers::CONTROL);
        assert_eq!(resolve_scroll_key(key_ctrl_d), Some(ScrollAction::HalfDown));

        let key_ctrl_u = KeyEvent::new(KeyCode::Char('u'), KeyModifiers::CONTROL);
        assert_eq!(resolve_scroll_key(key_ctrl_u), Some(ScrollAction::HalfUp));
    }

    #[test]
    fn test_diff_action_scroll_composition() {
        use crate::diff_render::ScrollAction;

        let key_j = KeyEvent::new(KeyCode::Char('j'), KeyModifiers::empty());
        assert_eq!(
            resolve_diff_key(key_j),
            Some(DiffAction::Scroll(ScrollAction::Down(1)))
        );

        let key_bracket_right = KeyEvent::new(KeyCode::Char(']'), KeyModifiers::empty());
        assert_eq!(
            resolve_diff_key(key_bracket_right),
            Some(DiffAction::NextFile)
        );
    }

    #[test]
    fn test_scrollable_diff_basic() {
        let mut sd = ScrollableDiff::new();
        sd.set_content(vec![
            "line1".to_string(),
            "line2".to_string(),
            "line3".to_string(),
        ]);

        sd.set_width(80);
        sd.set_viewport(2);

        assert_eq!(sd.wrapped_lines().len(), 3);
        assert_eq!(sd.state.content_h, 3);
        assert_eq!(sd.max_scroll(), 1);
    }

    #[test]
    fn test_scrollable_diff_scroll() {
        let mut sd = ScrollableDiff::new();
        sd.set_content((1..=100).map(|i| format!("line{}", i)).collect());
        sd.set_width(80);
        sd.set_viewport(10);

        assert_eq!(sd.state.scroll, 0);

        sd.scroll_by(5);
        assert_eq!(sd.state.scroll, 5);

        sd.page_by(10);
        assert_eq!(sd.state.scroll, 15); // 5 + 10

        sd.scroll_to_bottom();
        assert_eq!(sd.state.scroll, 90); // 100 - 10

        sd.scroll_to_top();
        assert_eq!(sd.state.scroll, 0);
    }

    #[test]
    fn test_scrollable_diff_wrap() {
        let mut sd = ScrollableDiff::new();
        sd.set_content(vec!["a".repeat(100), "short".to_string()]);

        sd.set_width(20);

        assert!(sd.wrapped_lines()[0].len() <= 25); // 允许一些余量
        assert!(sd.wrapped_lines().len() > 2); // 长行被拆分
    }

    #[test]
    fn test_scrollable_diff_percent() {
        let mut sd = ScrollableDiff::new();
        sd.set_content((1..=100).map(|i| format!("line{}", i)).collect());
        sd.set_width(80);
        sd.set_viewport(10);

        // 底部：100%
        sd.scroll_to_bottom();
        assert_eq!(sd.percent_scrolled(), Some(100));

        // 顶部：10%
        assert_eq!(sd.state.scroll, 90);
        sd.scroll_to_top();
        // 10行视口，100行内容 → 10% 已滚动
        assert!(sd.percent_scrolled().unwrap() < 15);
    }

    #[test]
    fn test_line_style_lookup() {
        let insert_style = line_style(DiffLineType::Insert);
        assert_eq!(insert_style.sign, '+');
        assert_eq!(insert_style.fg_color, Color::Green);
        assert!(insert_style.bg_color.is_some());

        let delete_style = line_style(DiffLineType::Delete);
        assert_eq!(delete_style.sign, '-');
        assert_eq!(delete_style.fg_color, Color::Red);
        assert!(delete_style.bg_color.is_some());

        let context_style = line_style(DiffLineType::Context);
        assert_eq!(context_style.sign, ' ');
        assert_eq!(context_style.fg_color, Color::White);
        assert!(context_style.bg_color.is_none());
    }
}
