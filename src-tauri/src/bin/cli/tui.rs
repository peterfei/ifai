//! TUI 核心模块 — ratatui 全屏终端 UI
//!
//! 布局：内容区（弹性） + 状态栏（1行固定） + 输入框（1行固定）

use std::io::{self, Stdout};

use crossterm::{
    event::{self, Event, KeyCode, KeyEvent, KeyModifiers},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use ratatui::{
    backend::CrosstermBackend,
    layout::{Constraint, Direction, Layout, Rect},
    text::{Line, Span},
    widgets::{Block, Borders, Paragraph, Widget},
    Terminal,
};

use crate::render;

use super::input_composer::{self, InputComposer, InputAction};

/// 剥离 ANSI 转义序列（按 char 边界，保留 UTF-8 多字节字符）
fn strip_ansi(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\x1b' {
            if chars.peek() == Some(&'[') {
                chars.next();
                while let Some(&nc) = chars.peek() {
                    if ('\x40'..='\x7E').contains(&nc) {
                        chars.next();
                        break;
                    }
                    chars.next();
                }
            }
        } else if c == '\r' {
            // 跳过回车符
        } else {
            result.push(c);
        }
    }
    result
}

/// TUI 应用
pub struct App {
    terminal: Terminal<CrosstermBackend<Stdout>>,
    /// 内容区行缓冲
    content_lines: Vec<Line<'static>>,
    /// 内容区滚动偏移
    scroll_offset: u16,
    /// 用户是否手动上翻（禁用 auto_scroll）
    user_scrolled: bool,
    /// 输入框
    pub input: InputComposer,
    /// 状态栏文本
    status_text: String,
    /// 是否正在处理 AI 请求（阻止新输入）
    busy: bool,
}

impl App {
    /// 创建并初始化 TUI
    pub fn new() -> io::Result<Self> {
        enable_raw_mode()?;
        execute!(io::stdout(), EnterAlternateScreen)?;

        let backend = CrosstermBackend::new(io::stdout());
        let mut terminal = Terminal::new(backend)?;
        terminal.hide_cursor()?;

        let mut app = Self {
            terminal,
            content_lines: Vec::new(),
            scroll_offset: 0,
            user_scrolled: false,
            input: InputComposer::new(""),
            status_text: String::new(),
            busy: false,
        };

        // 欢迎信息
        let theme = render::default_theme();
        app.push_line(format!("{}IfAI CLI v0.4.3{}", theme.brand, render::RESET));
        app.push_line("Type /help for commands. Press Ctrl+D to exit.".to_string());
        app.push_line("Scroll: PageUp/PageDown or Shift+Up/Down.".to_string());
        app.push_line(String::new());

        Ok(app)
    }

    /// 推送一行文本到内容区（自动剥离 ANSI 转义码）
    pub fn push_line(&mut self, text: String) {
        let text = strip_ansi(&text);
        for line in text.split('\n') {
            self.content_lines.push(Line::from(line.to_string()));
        }
        // 仅在用户未手动上翻时自动滚到底部
        if !self.user_scrolled {
            self.scroll_to_bottom();
        }
    }

    /// 设置状态栏文本（自动剥离 ANSI 转义码）
    pub fn set_status(&mut self, text: String) {
        self.status_text = strip_ansi(&text);
    }

    /// 设置忙碌状态
    pub fn set_busy(&mut self, busy: bool) {
        self.busy = busy;
    }

    /// 滚动到底部
    fn scroll_to_bottom(&mut self) {
        let area = self.content_area();
        let visible_lines = area.height as usize;
        let total_lines = self.content_lines.len();
        if total_lines > visible_lines {
            self.scroll_offset = (total_lines - visible_lines) as u16;
        } else {
            self.scroll_offset = 0;
        }
        self.user_scrolled = false;
    }

    /// 向上滚动 n 行
    fn scroll_up(&mut self, n: u16) {
        self.scroll_offset = self.scroll_offset.saturating_sub(n);
        let area = self.content_area();
        let max_offset = self.content_lines.len().saturating_sub(area.height as usize) as u16;
        self.user_scrolled = self.scroll_offset < max_offset;
    }

    /// 向下滚动 n 行
    fn scroll_down(&mut self, n: u16) {
        let area = self.content_area();
        let max_offset = self.content_lines.len().saturating_sub(area.height as usize) as u16;
        self.scroll_offset = (self.scroll_offset + n).min(max_offset);
        if self.scroll_offset >= max_offset {
            self.user_scrolled = false;
        }
    }

    /// 获取内容区域（减去底部 2 行）
    fn content_area(&self) -> Rect {
        let size = self.terminal.size().unwrap_or(ratatui::layout::Size::new(80, 24));
        let height = size.height.saturating_sub(2);
        Rect::new(0, 0, size.width, height)
    }

    /// 渲染一帧
    pub fn render(&mut self) {
        let _ = self.terminal.draw(|f| {
            let size = f.area();
            if size.height < 3 {
                return;
            }

            // 布局：内容区 + 状态栏(1行) + 输入框(1行)
            let chunks = Layout::default()
                .direction(Direction::Vertical)
                .constraints([
                    Constraint::Min(1),    // 内容区
                    Constraint::Length(1), // 状态栏
                    Constraint::Length(1), // 输入框
                ])
                .split(size);

            let content_area = chunks[0];
            let status_area = chunks[1];
            let input_area = chunks[2];

            // === 内容区 ===
            let visible_count = content_area.height as usize;
            let total_lines = self.content_lines.len();
            let start = self.scroll_offset as usize;
            let end = (start + visible_count).min(total_lines);
            let visible_lines: Vec<Line> = self.content_lines[start..end].to_vec();

            let content = Paragraph::new(visible_lines)
                .scroll((0, 0));
            f.render_widget(content, content_area);

            // === 滚动指示器 ===
            let max_offset = total_lines.saturating_sub(visible_count) as u16;
            if max_offset > 0 && self.user_scrolled {
                let pct = if max_offset > 0 {
                    (self.scroll_offset as f64 / max_offset as f64 * 100.0) as u16
                } else {
                    100
                };
                let indicator = Span::styled(
                    format!(" ↑{}% ", pct),
                    ratatui::style::Style::default().fg(ratatui::style::Color::Yellow),
                );
                let indicator_area = Rect::new(
                    content_area.x + content_area.width.saturating_sub(6),
                    content_area.y,
                    6,
                    1,
                );
                let indicator = Paragraph::new(Line::from(indicator));
                f.render_widget(indicator, indicator_area);
            }

            // === 状态栏 ===
            let status_line = if self.status_text.is_empty() {
                Line::from(Span::styled(
                    " [Ready] ",
                    ratatui::style::Style::default().fg(ratatui::style::Color::DarkGray),
                ))
            } else {
                Line::from(Span::styled(
                    format!(" {} ", self.status_text),
                    ratatui::style::Style::default().fg(ratatui::style::Color::DarkGray),
                ))
            };
            let status = Paragraph::new(status_line)
                .style(ratatui::style::Style::default().bg(ratatui::style::Color::Black));
            f.render_widget(status, status_area);

            // === 输入框 ===
            let cursor_col = input_composer::cursor_col(&self.input);
            let prompt = Span::styled(
                "⟩ ",
                ratatui::style::Style::default().fg(ratatui::style::Color::Cyan),
            );
            let input_text = Span::raw(self.input.value());
            let input_line = Line::from(vec![prompt, input_text]);
            let input = Paragraph::new(input_line);
            f.render_widget(input, input_area);

            // 设置终端光标位置
            let cursor_x = input_area.x + cursor_col.min(input_area.width);
            let cursor_y = input_area.y;
            f.set_cursor_position((cursor_x, cursor_y));
        });
    }

    /// 恢复终端状态
    pub fn restore(&mut self) -> io::Result<()> {
        self.terminal.show_cursor()?;
        execute!(io::stdout(), LeaveAlternateScreen)?;
        disable_raw_mode()?;
        Ok(())
    }

    /// 主事件循环（返回用户提交的输入或退出信号）
    pub fn run_loop(&mut self) -> AppResult {
        loop {
            self.render();

            if event::poll(std::time::Duration::from_millis(100)).unwrap_or(false) {
                match event::read() {
                    Ok(Event::Key(key)) => {
                        // 全局快捷键（不经过 input_composer）
                        match key.code {
                            KeyCode::PageUp => {
                                self.scroll_up(5);
                                continue;
                            }
                            KeyCode::PageDown => {
                                self.scroll_down(5);
                                continue;
                            }
                            KeyCode::Up if key.modifiers.contains(KeyModifiers::SHIFT) => {
                                self.scroll_up(3);
                                continue;
                            }
                            KeyCode::Down if key.modifiers.contains(KeyModifiers::SHIFT) => {
                                self.scroll_down(3);
                                continue;
                            }
                            _ => {}
                        }

                        let action = self.input.handle_key(key);
                        match action {
                            InputAction::Submit(text) => {
                                let text = text.trim().to_string();
                                if !text.is_empty() {
                                    return AppResult::Submit(text);
                                }
                            }
                            InputAction::Interrupt => {
                                self.push_line("^C".to_string());
                            }
                            InputAction::Exit => {
                                return AppResult::Exit;
                            }
                            InputAction::None => {}
                        }
                    }
                    Ok(Event::Resize(_, _)) => {
                        self.scroll_to_bottom();
                    }
                    _ => {}
                }
            }
        }
    }
}

/// 事件循环结果
#[derive(Debug)]
pub enum AppResult {
    Submit(String),
    Exit,
}

impl Drop for App {
    fn drop(&mut self) {
        let _ = self.restore();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use pretty_assertions::assert_eq;

    // === strip_ansi 测试 ===

    #[test]
    fn test_strip_ansi_plain_text() {
        assert_eq!(strip_ansi("hello world"), "hello world");
    }

    #[test]
    fn test_strip_ansi_color_code() {
        assert_eq!(strip_ansi("\x1b[31mred\x1b[0m"), "red");
    }

    #[test]
    fn test_strip_ansi_reset_code() {
        assert_eq!(strip_ansi("\x1b[0mtext"), "text");
    }

    #[test]
    fn test_strip_ansi_256_color() {
        assert_eq!(strip_ansi("\x1b[38;5;196mtext\x1b[0m"), "text");
    }

    #[test]
    fn test_strip_ansi_rgb_color() {
        assert_eq!(strip_ansi("\x1b[38;2;255;0;0mtext\x1b[0m"), "text");
    }

    #[test]
    fn test_strip_ansi_mixed() {
        assert_eq!(
            strip_ansi("\x1b[1m\x1b[31mbold red\x1b[0m normal"),
            "bold red normal"
        );
    }

    #[test]
    fn test_strip_ansi_carriage_return() {
        assert_eq!(strip_ansi("line1\r\nline2"), "line1\nline2");
    }

    #[test]
    fn test_strip_ansi_preserves_utf8() {
        assert_eq!(
            strip_ansi("\x1b[31m你好\x1b[0m世界"),
            "你好世界"
        );
    }

    #[test]
    fn test_strip_ansi_empty() {
        assert_eq!(strip_ansi(""), "");
    }

    #[test]
    fn test_strip_ansi_only_ansi() {
        assert_eq!(strip_ansi("\x1b[31m\x1b[0m"), "");
    }

    #[test]
    fn test_strip_ansi_incomplete_sequence() {
        // 不完整的 ESC 序列（无终止字符）应被安全跳过
        assert_eq!(strip_ansi("text\x1b["), "text");
    }

    #[test]
    fn test_strip_ansi_bold_underline() {
        assert_eq!(
            strip_ansi("\x1b[1mbold\x1b[4m underline\x1b[0m"),
            "bold underline"
        );
    }

    // === 滚动逻辑测试 ===
    //
    // 注意：由于 App 的 terminal 字段类型为 Terminal<CrosstermBackend<Stdout>>，
    // 在测试环境中无法直接构造。我们通过提取滚动计算逻辑到纯函数进行测试。

    /// 模拟 content_area 计算（给定终端高度）
    fn content_height(terminal_height: u16) -> usize {
        terminal_height.saturating_sub(2) as usize
    }

    /// 计算最大滚动偏移（与 App::scroll_to_bottom 逻辑一致）
    fn max_scroll_offset(total_lines: usize, terminal_height: u16) -> u16 {
        let visible = content_height(terminal_height);
        if total_lines > visible {
            (total_lines - visible) as u16
        } else {
            0
        }
    }

    #[test]
    fn test_scroll_no_overflow() {
        // 4 行内容，10 行高终端 → 可见 8 行，无溢出
        assert_eq!(max_scroll_offset(4, 10), 0);
    }

    #[test]
    fn test_scroll_exact_fit() {
        // 8 行内容，10 行高终端 → 可见 8 行，恰好无溢出
        assert_eq!(max_scroll_offset(8, 10), 0);
    }

    #[test]
    fn test_scroll_overflow() {
        // 14 行内容，5 行高终端 → 可见 3 行，scroll_offset = 11
        assert_eq!(max_scroll_offset(14, 5), 11);
    }

    #[test]
    fn test_scroll_small_terminal() {
        // 最小 3 行高终端：内容区 1 行
        assert_eq!(content_height(3), 1);
        assert_eq!(max_scroll_offset(5, 3), 4);
    }

    #[test]
    fn test_scroll_tiny_terminal() {
        // 2 行高终端：内容区 0 行
        assert_eq!(content_height(2), 0);
    }

    #[test]
    fn test_scroll_calculation() {
        // 模拟 scroll_up/scroll_down 的偏移量计算
        let max_off = max_scroll_offset(24, 5); // 24 行内容，3 行可见 → 21
        assert_eq!(max_off, 21);

        // scroll_up(5) 从底部
        let offset = max_off.saturating_sub(5);
        assert_eq!(offset, 16);
        assert!(offset < max_off); // user_scrolled = true

        // scroll_down(3)
        let offset = (offset + 3).min(max_off);
        assert_eq!(offset, 19);

        // scroll_down(10) 到底部
        let offset = (offset + 10).min(max_off);
        assert_eq!(offset, 21);
        assert!(offset >= max_off); // user_scrolled = false
    }

    #[test]
    fn test_scroll_no_underflow() {
        let max_off = max_scroll_offset(24, 5);
        let offset = 0u16.saturating_sub(5);
        assert_eq!(offset, 0);
    }

    // === push_line 行分割逻辑测试 ===

    #[test]
    fn test_line_split_on_newlines() {
        let text = strip_ansi("line1\nline2\nline3");
        let lines: Vec<&str> = text.split('\n').collect();
        assert_eq!(lines.len(), 3);
        assert_eq!(lines[0], "line1");
        assert_eq!(lines[1], "line2");
        assert_eq!(lines[2], "line3");
    }

    #[test]
    fn test_line_empty_string() {
        let text = strip_ansi("");
        let lines: Vec<&str> = text.split('\n').collect();
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0], "");
    }

    #[test]
    fn test_line_trailing_newline() {
        let text = strip_ansi("hello\n");
        let lines: Vec<&str> = text.split('\n').collect();
        assert_eq!(lines.len(), 2);
        assert_eq!(lines[0], "hello");
        assert_eq!(lines[1], "");
    }
}
