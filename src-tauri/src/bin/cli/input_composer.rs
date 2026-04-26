//! 输入框组件 — 替代 rustyline，集成到 ratatui 渲染
//!
//! 功能：字符输入、光标移动、历史记录、Enter 提交
//! 注意：cursor_pos 始终为字节索引（非字符计数），以正确处理 UTF-8 多字节字符

use std::path::Path;

use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
use ratatui::{buffer::Buffer, layout::Rect, text::{Line, Span}, widgets::Widget};

/// 输入框操作结果
#[derive(Debug, Clone)]
pub enum InputAction {
    /// 无操作
    None,
    /// 用户提交输入
    Submit(String),
    /// Ctrl+C 中断
    Interrupt,
    /// Ctrl+D 退出
    Exit,
}

/// 输入框组件
pub struct InputComposer {
    /// 当前编辑文本
    buffer: String,
    /// 光标位置（字节索引，始终在 UTF-8 字符边界上）
    cursor_pos: usize,
    /// 历史记录
    history: Vec<String>,
    /// 历史浏览索引
    history_index: Option<usize>,
    /// 浏览前草稿
    draft_backup: String,
    /// 提示符
    prompt: String,
}

impl InputComposer {
    pub fn new(prompt: &str) -> Self {
        Self {
            buffer: String::new(),
            cursor_pos: 0,
            history: Vec::new(),
            history_index: None,
            draft_backup: String::new(),
            prompt: prompt.to_string(),
        }
    }

    /// 处理按键事件
    pub fn handle_key(&mut self, key: KeyEvent) -> InputAction {
        match key.code {
            KeyCode::Char(c) if key.modifiers.contains(KeyModifiers::CONTROL) => {
                match c {
                    'c' => {
                        self.buffer.clear();
                        self.cursor_pos = 0;
                        self.history_index = None;
                        return InputAction::Interrupt;
                    }
                    'd' => {
                        if self.buffer.is_empty() {
                            return InputAction::Exit;
                        }
                    }
                    _ => {}
                }
                InputAction::None
            }
            KeyCode::Char(c) => {
                let byte_len = c.len_utf8();
                self.buffer.insert(self.cursor_pos, c);
                self.cursor_pos += byte_len;
                self.history_index = None;
                InputAction::None
            }
            KeyCode::Backspace => {
                if self.cursor_pos > 0 {
                    // 找到前一个字符的字节起始位置
                    let prev_char_start = self.buffer[..self.cursor_pos]
                        .char_indices()
                        .last()
                        .map(|(i, _)| i)
                        .unwrap_or(0);
                    self.buffer.drain(prev_char_start..self.cursor_pos);
                    self.cursor_pos = prev_char_start;
                }
                InputAction::None
            }
            KeyCode::Delete => {
                if self.cursor_pos < self.buffer.len() {
                    // 找到当前字符的字节结束位置
                    let next_char_end = self.buffer[self.cursor_pos..]
                        .char_indices()
                        .nth(1)
                        .map(|(i, _)| self.cursor_pos + i)
                        .unwrap_or(self.buffer.len());
                    self.buffer.drain(self.cursor_pos..next_char_end);
                }
                InputAction::None
            }
            KeyCode::Left => {
                if self.cursor_pos > 0 {
                    let prev = self.buffer[..self.cursor_pos]
                        .char_indices()
                        .last()
                        .map(|(i, _)| i)
                        .unwrap_or(0);
                    self.cursor_pos = prev;
                }
                InputAction::None
            }
            KeyCode::Right => {
                if self.cursor_pos < self.buffer.len() {
                    let next = self.buffer[self.cursor_pos..]
                        .char_indices()
                        .nth(1)
                        .map(|(i, _)| self.cursor_pos + i)
                        .unwrap_or(self.buffer.len());
                    self.cursor_pos = next;
                }
                InputAction::None
            }
            KeyCode::Home => {
                self.cursor_pos = 0;
                InputAction::None
            }
            KeyCode::End => {
                self.cursor_pos = self.buffer.len();
                InputAction::None
            }
            KeyCode::Up => {
                if !self.history.is_empty() {
                    if self.history_index.is_none() {
                        self.draft_backup = self.buffer.clone();
                        self.history_index = Some(self.history.len() - 1);
                    } else if let Some(idx) = self.history_index {
                        if idx > 0 {
                            self.history_index = Some(idx - 1);
                        }
                    }
                    if let Some(idx) = self.history_index {
                        self.buffer = self.history[idx].clone();
                        self.cursor_pos = self.buffer.len();
                    }
                }
                InputAction::None
            }
            KeyCode::Down => {
                if let Some(idx) = self.history_index {
                    if idx + 1 < self.history.len() {
                        self.history_index = Some(idx + 1);
                        self.buffer = self.history[idx + 1].clone();
                    } else {
                        self.history_index = None;
                        self.buffer = self.draft_backup.clone();
                    }
                    self.cursor_pos = self.buffer.len();
                }
                InputAction::None
            }
            KeyCode::Enter => {
                let text = self.buffer.clone();
                self.buffer.clear();
                self.cursor_pos = 0;
                self.history_index = None;
                InputAction::Submit(text)
            }
            _ => InputAction::None,
        }
    }

    /// 获取当前文本
    pub fn value(&self) -> &str {
        &self.buffer
    }

    /// 加载历史记录
    pub fn load_history(&mut self, path: &Path) {
        if let Ok(content) = std::fs::read_to_string(path) {
            for line in content.lines() {
                if !line.is_empty() {
                    self.history.push(line.to_string());
                }
            }
        }
    }

    /// 保存历史记录
    pub fn save_history(&self, path: &Path) {
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let entries: Vec<&String> = self.history.iter().rev().take(1000).collect();
        if let Ok(mut file) = std::fs::File::create(path) {
            for entry in entries.iter().rev() {
                let _ = writeln!(file, "{}", entry);
            }
        }
    }

    /// 添加历史记录（去重连续相同）
    pub fn add_history(&mut self, entry: &str) {
        if entry.is_empty() {
            return;
        }
        if self.history.last().map(|s| s.as_str()) == Some(entry) {
            return;
        }
        self.history.push(entry.to_string());
    }
}

use std::io::Write;

/// ratatui Widget 渲染
impl Widget for &mut InputComposer {
    fn render(self, area: Rect, buf: &mut Buffer) {
        let prompt_span = Span::styled(
            format!("{}⟩ ", self.prompt),
            ratatui::style::Style::default().fg(ratatui::style::Color::Cyan),
        );
        let input_span = Span::raw(&self.buffer);

        let line = Line::from(vec![prompt_span, input_span]);

        buf.set_line(area.x, area.y, &line, area.width);
    }
}

/// 字符显示宽度（CJK 字符占 2 列）
fn char_width(c: char) -> usize {
    match c as u32 {
        0x4E00..=0x9FFF | 0x3400..=0x4DBF | 0x3000..=0x303F | 0xFF00..=0xFFEF | 0xAC00..=0xD7AF | 0x3040..=0x30FF => 2,
        _ => 1,
    }
}

/// 获取光标列位置（供 App 设置终端光标）
pub fn cursor_col(composer: &InputComposer) -> u16 {
    // cursor_pos 是字节索引，取光标前的所有字符计算显示宽度
    let display_width: usize = composer.buffer[..composer.cursor_pos]
        .chars()
        .map(char_width)
        .sum();
    (composer.prompt.len() + display_width + 1) as u16
}
