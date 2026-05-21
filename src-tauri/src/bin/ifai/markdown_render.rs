//! TUI Markdown 渲染模块
//!
//! 将 Markdown 文本转换为带样式的 ratatui Span 列表。
//! 基于 pulldown-cmark Event 流驱动，声明式样式映射。
//!
//! # 架构
//!
//! ```text
//! pulldown-cmark Parser → Event 流
//!   → markdown_line_to_spans() 遍历
//!     → style_stack 压栈/弹栈
//!       → Vec<Span<'static>> 带样式输出
//! ```

use pulldown_cmark::{Event, Options, Parser, Tag, TagEnd};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::Span;

// ============================================================================
// 样式声明（code = data）
// ============================================================================

/// Markdown 样式映射表（声明式配置，与 BRAND_PALETTE 对齐）
struct MarkdownStyles {
    heading: [Style; 6],
    code: Style,
    strong: Style,
    emphasis: Style,
    strikethrough: Style,
    hr: Style,
}

impl Default for MarkdownStyles {
    fn default() -> Self {
        use ratatui::style::Stylize;
        let h_base = Style::new().fg(Color::Indexed(69)); // brand blue
        Self {
            heading: [
                h_base.bold().underlined(), // H1
                h_base.bold(),              // H2
                h_base.bold().italic(),     // H3
                h_base.italic(),            // H4
                h_base.italic(),            // H5
                h_base.italic(),            // H6
            ],
            code: Style::new().fg(Color::Indexed(72)),
            strong: Style::new().bold(),
            emphasis: Style::new().italic(),
            strikethrough: Style::new().crossed_out(),
            hr: Style::new().fg(Color::Indexed(244)),
        }
    }
}

static STYLES: std::sync::OnceLock<MarkdownStyles> = std::sync::OnceLock::new();

fn styles() -> &'static MarkdownStyles {
    STYLES.get_or_init(MarkdownStyles::default)
}

// ============================================================================
// 核心渲染函数
// ============================================================================

/// 将单行 Markdown 文本转换为带样式的 Span 列表
pub fn markdown_line_to_spans(line: &str) -> Vec<Span<'static>> {
    if line.is_empty() {
        return vec![Span::from(String::new())];
    }

    let mut opts = Options::empty();
    opts.insert(Options::ENABLE_STRIKETHROUGH);
    let parser = Parser::new_ext(line, opts);

    let s = styles();
    let mut style_stack: Vec<Style> = vec![];
    let mut spans: Vec<Span<'static>> = vec![];
    let mut current_text = String::new();
    let mut current_style = Style::default();
    // 列表状态：跟踪有序列表编号
    let mut list_counter: Option<u64> = None;

    for event in parser {
        match event {
            // ── 列表 ──
            Event::Start(Tag::List(start_number)) => {
                list_counter = start_number;
            }
            Event::End(TagEnd::List(_)) => {
                list_counter = None;
            }
            Event::Start(Tag::Item) => {
                flush(&mut spans, &mut current_text, current_style);
                if let Some(n) = list_counter {
                    current_text.push_str(&format!("{n}. "));
                    list_counter = Some(n + 1);
                } else {
                    current_text.push_str("• ");
                }
            }
            Event::End(TagEnd::Item) => {
                flush(&mut spans, &mut current_text, current_style);
            }

            // ── 行内格式：压栈/弹栈 ──
            Event::Start(Tag::Strong) => {
                flush(&mut spans, &mut current_text, current_style);
                style_stack.push(s.strong);
                current_style = merge_styles(&style_stack);
            }
            Event::End(TagEnd::Strong) => {
                flush(&mut spans, &mut current_text, current_style);
                style_stack.pop();
                current_style = merge_styles(&style_stack);
            }
            Event::Start(Tag::Emphasis) => {
                flush(&mut spans, &mut current_text, current_style);
                style_stack.push(s.emphasis);
                current_style = merge_styles(&style_stack);
            }
            Event::End(TagEnd::Emphasis) => {
                flush(&mut spans, &mut current_text, current_style);
                style_stack.pop();
                current_style = merge_styles(&style_stack);
            }
            Event::Start(Tag::Strikethrough) => {
                flush(&mut spans, &mut current_text, current_style);
                style_stack.push(s.strikethrough);
                current_style = merge_styles(&style_stack);
            }
            Event::End(TagEnd::Strikethrough) => {
                flush(&mut spans, &mut current_text, current_style);
                style_stack.pop();
                current_style = merge_styles(&style_stack);
            }

            // ── 行内代码 ──
            Event::Code(code) => {
                flush(&mut spans, &mut current_text, current_style);
                spans.push(Span::styled(code.into_string(), s.code));
            }

            // ── 标题 ──
            Event::Start(Tag::Heading { level, .. }) => {
                let idx = (level as usize).saturating_sub(1).min(5);
                style_stack.push(s.heading[idx]);
                current_style = merge_styles(&style_stack);
            }
            Event::End(TagEnd::Heading(_)) => {
                flush(&mut spans, &mut current_text, current_style);
                style_stack.pop();
            }

            // ── 水平线 ──
            Event::Rule => {
                flush(&mut spans, &mut current_text, current_style);
                spans.push(Span::styled(
                    "────────────────────".to_string(),
                    s.hr,
                ));
            }

            // ── 文本 ──
            Event::Text(text) => current_text.push_str(&text),
            Event::SoftBreak => current_text.push(' '),
            Event::HardBreak => {
                flush(&mut spans, &mut current_text, current_style);
            }

            // ── 忽略（表格由 push_line 层缓冲处理，其余逐行不触发）──
            _ => {}
        }
    }

    flush(&mut spans, &mut current_text, current_style);
    if spans.is_empty() {
        spans.push(Span::from(String::new()));
    }
    spans
}

/// 将栈内样式合并（与 Codex 的 current.patch(new) 等价）
fn merge_styles(stack: &[Style]) -> Style {
    stack.iter().fold(Style::default(), |acc, &s| acc.patch(s))
}

/// flush 当前文本为 Span
fn flush(spans: &mut Vec<Span<'static>>, text: &mut String, style: Style) {
    if !text.is_empty() {
        spans.push(Span::styled(std::mem::take(text), style));
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use ratatui::style::Stylize;

    /// 辅助：提取所有 span 的纯文本
    fn spans_text(spans: &[Span]) -> String {
        spans.iter().map(|s| s.content.as_ref()).collect()
    }

    /// 辅助：查找包含指定文本的 span 的样式
    fn span_style_for(spans: &[Span], text: &str) -> Option<Style> {
        spans.iter().find(|s| s.content == text).map(|s| s.style)
    }

    /// 辅助：检查样式是否包含 bold
    fn is_bold(style: Style) -> bool {
        style.add_modifier == Modifier::BOLD
            || (style.add_modifier.contains(Modifier::BOLD))
    }

    /// 辅助：检查样式是否包含 italic
    fn is_italic(style: Style) -> bool {
        style.add_modifier.contains(Modifier::ITALIC)
    }

    // ── T1: 空行 ──
    #[test]
    fn test_t01_empty_line() {
        let spans = markdown_line_to_spans("");
        assert_eq!(spans.len(), 1);
        assert_eq!(spans[0].content, "");
    }

    // ── T2: 纯文本 ──
    #[test]
    fn test_t02_plain_text() {
        let spans = markdown_line_to_spans("hello world");
        assert_eq!(spans_text(&spans), "hello world");
        // 无样式
        for span in &spans {
            assert_eq!(span.style, Style::default());
        }
    }

    // ── T3: 粗体 ──
    #[test]
    fn test_t03_bold() {
        let spans = markdown_line_to_spans("**bold** text");
        assert!(span_style_for(&spans, "bold").map_or(false, is_bold));
        assert_eq!(span_style_for(&spans, " text").unwrap(), Style::default());
    }

    // ── T4: 斜体 ──
    #[test]
    fn test_t04_italic() {
        let spans = markdown_line_to_spans("*italic* text");
        assert!(span_style_for(&spans, "italic").map_or(false, is_italic));
    }

    // ── T5: 粗斜体嵌套 ──
    #[test]
    fn test_t05_bold_italic_nested() {
        let spans = markdown_line_to_spans("***both***");
        let style = span_style_for(&spans, "both").unwrap();
        assert!(is_bold(style));
        assert!(is_italic(style));
    }

    // ── T6: 行内代码 ──
    #[test]
    fn test_t06_inline_code() {
        let spans = markdown_line_to_spans("`code` text");
        let code_style = span_style_for(&spans, "code").unwrap();
        assert_eq!(code_style.fg, Some(Color::Indexed(72)));
    }

    // ── T7: 删除线 ──
    #[test]
    fn test_t07_strikethrough() {
        let spans = markdown_line_to_spans("~~del~~ text");
        let style = span_style_for(&spans, "del").unwrap();
        assert!(style.add_modifier.contains(Modifier::CROSSED_OUT));
    }

    // ── T8: H1 标题 ──
    #[test]
    fn test_t08_h1_heading() {
        let spans = markdown_line_to_spans("# Title");
        assert_eq!(spans_text(&spans), "Title");
        let style = spans[0].style;
        assert_eq!(style.fg, Some(Color::Indexed(69)));
        assert!(is_bold(style));
    }

    // ── T9: H2 标题 ──
    #[test]
    fn test_t09_h2_heading() {
        let spans = markdown_line_to_spans("## Section");
        assert_eq!(spans_text(&spans), "Section");
        let style = spans[0].style;
        assert!(is_bold(style));
        // H2 没有 underline（H1 才有）
        assert!(!style
            .add_modifier
            .contains(Modifier::UNDERLINED));
    }

    // ── T10: H3 标题 ──
    #[test]
    fn test_t10_h3_heading() {
        let spans = markdown_line_to_spans("### Sub");
        assert_eq!(spans_text(&spans), "Sub");
        let style = spans[0].style;
        assert!(is_bold(style));
        assert!(is_italic(style));
    }

    // ── T11: 水平线 ──
    #[test]
    fn test_t11_horizontal_rule() {
        let spans = markdown_line_to_spans("---");
        assert!(spans_text(&spans).contains("────"));
        let style = spans[0].style;
        assert_eq!(style.fg, Some(Color::Indexed(244)));
    }

    // ── T12: 混合格式 ──
    #[test]
    fn test_t12_mixed_format() {
        let spans = markdown_line_to_spans("**bold** and `code`");
        assert!(span_style_for(&spans, "bold").map_or(false, is_bold));
        assert_eq!(
            span_style_for(&spans, "code").unwrap().fg,
            Some(Color::Indexed(72))
        );
        assert!(spans_text(&spans).contains(" and "));
    }

    // ── T13: 未闭合粗体 ──
    #[test]
    fn test_t13_unclosed_bold() {
        // 不应 panic
        let spans = markdown_line_to_spans("**unclosed bold");
        let text = spans_text(&spans);
        assert!(text.contains("unclosed") || text.contains("bold"));
    }

    // ── T14: 中文内容 ──
    #[test]
    fn test_t14_chinese_content() {
        let spans = markdown_line_to_spans("**加粗**中文");
        assert!(span_style_for(&spans, "加粗").map_or(false, is_bold));
        assert!(spans_text(&spans).contains("中文"));
    }

    // ── T15: 代码含星号 ──
    #[test]
    fn test_t15_code_with_stars() {
        let spans = markdown_line_to_spans("`a*b*c`");
        let code_style = span_style_for(&spans, "a*b*c").unwrap();
        assert_eq!(code_style.fg, Some(Color::Indexed(72)));
    }

    // ── T16: 有序列表 ──
    #[test]
    fn test_t16_ordered_list() {
        let spans = markdown_line_to_spans("1. First item");
        let text = spans_text(&spans);
        assert!(text.contains("1. "), "should preserve ordered list marker, got: {text}");
        assert!(text.contains("First item"));
    }

    // ── T17: 无序列表 ──
    #[test]
    fn test_t17_unordered_list() {
        let spans = markdown_line_to_spans("- bullet item");
        let text = spans_text(&spans);
        assert!(text.contains("• "), "should use bullet marker, got: {text}");
        assert!(text.contains("bullet item"));
    }
}
