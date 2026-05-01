//! 输入框组件 — 替代 rustyline，集成到 ratatui 渲染
//!
//! 功能：字符输入、光标移动、历史记录、Enter 提交
//! 注意：cursor_pos 始终为字节索引（非字符计数），以正确处理 UTF-8 多字节字符

use std::path::Path;

use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
use ratatui::{
    buffer::Buffer,
    layout::Rect,
    text::{Line, Span},
    widgets::Widget,
};

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

    /// 清空输入
    pub fn clear(&mut self) {
        self.buffer.clear();
        self.cursor_pos = 0;
        self.history_index = None;
    }

    /// 获取提示符
    pub fn prompt(&self) -> &str {
        &self.prompt
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
        0x4E00..=0x9FFF
        | 0x3400..=0x4DBF
        | 0x3000..=0x303F
        | 0xFF00..=0xFFEF
        | 0xAC00..=0xD7AF
        | 0x3040..=0x30FF => 2,
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
    // prompt 的显示宽度 + ⟩ 和空格的宽度 + 输入的显示宽度
    // ⟩ (U+27E7) 的显示宽度是 1，加上空格是 2
    (composer.prompt.len() + display_width + 2) as u16
}

#[cfg(test)]
mod tests {
    use super::*;
    use pretty_assertions::assert_eq;

    /// 辅助：创建普通字符按键
    fn char_key(c: char) -> KeyEvent {
        KeyEvent::new(KeyCode::Char(c), KeyModifiers::NONE)
    }

    /// 辅助：创建 Ctrl+字符 按键
    fn ctrl_char_key(c: char) -> KeyEvent {
        KeyEvent::new(KeyCode::Char(c), KeyModifiers::CONTROL)
    }

    /// 辅助：创建功能键
    fn code_key(code: KeyCode) -> KeyEvent {
        KeyEvent::new(code, KeyModifiers::NONE)
    }

    // === 字符输入 ===

    #[test]
    fn test_ascii_input() {
        let mut ic = InputComposer::new("");
        ic.handle_key(char_key('h'));
        ic.handle_key(char_key('e'));
        ic.handle_key(char_key('l'));
        assert_eq!(ic.value(), "hel");
    }

    #[test]
    fn test_chinese_input() {
        let mut ic = InputComposer::new("");
        ic.handle_key(char_key('你'));
        ic.handle_key(char_key('好'));
        assert_eq!(ic.value(), "你好");
        assert_eq!(ic.cursor_pos, 6); // 每个中文字符 3 字节
    }

    #[test]
    fn test_mixed_ascii_and_cjk() {
        let mut ic = InputComposer::new("");
        ic.handle_key(char_key('a'));
        ic.handle_key(char_key('中'));
        ic.handle_key(char_key('b'));
        assert_eq!(ic.value(), "a中b");
    }

    #[test]
    fn test_history_index_reset_on_input() {
        let mut ic = InputComposer::new("");
        ic.history.push("old".to_string());
        ic.handle_key(code_key(KeyCode::Up)); // 进入历史浏览
        assert_eq!(ic.value(), "old");
        assert!(ic.history_index.is_some());
        ic.handle_key(char_key('x')); // 输入新字符应重置历史索引
        assert!(ic.history_index.is_none());
    }

    // === 光标移动 ===

    #[test]
    fn test_cursor_left_right() {
        let mut ic = InputComposer::new("");
        ic.handle_key(char_key('a'));
        ic.handle_key(char_key('b'));
        ic.handle_key(char_key('c'));
        assert_eq!(ic.cursor_pos, 3);

        ic.handle_key(code_key(KeyCode::Left));
        assert_eq!(ic.cursor_pos, 2);

        ic.handle_key(code_key(KeyCode::Left));
        assert_eq!(ic.cursor_pos, 1);

        ic.handle_key(code_key(KeyCode::Right));
        assert_eq!(ic.cursor_pos, 2);
    }

    #[test]
    fn test_cursor_left_boundary() {
        let mut ic = InputComposer::new("");
        ic.handle_key(char_key('a'));
        ic.handle_key(code_key(KeyCode::Left));
        assert_eq!(ic.cursor_pos, 0);
        // 再按一次不应出错
        ic.handle_key(code_key(KeyCode::Left));
        assert_eq!(ic.cursor_pos, 0);
    }

    #[test]
    fn test_cursor_right_boundary() {
        let mut ic = InputComposer::new("");
        ic.handle_key(char_key('a'));
        ic.handle_key(code_key(KeyCode::Right));
        assert_eq!(ic.cursor_pos, 1);
        // 再按一次不应出错
        ic.handle_key(code_key(KeyCode::Right));
        assert_eq!(ic.cursor_pos, 1);
    }

    #[test]
    fn test_cursor_home_end() {
        let mut ic = InputComposer::new("");
        ic.handle_key(char_key('a'));
        ic.handle_key(char_key('b'));
        ic.handle_key(char_key('c'));

        ic.handle_key(code_key(KeyCode::Home));
        assert_eq!(ic.cursor_pos, 0);

        ic.handle_key(code_key(KeyCode::End));
        assert_eq!(ic.cursor_pos, 3);
    }

    #[test]
    fn test_cursor_left_with_cjk() {
        let mut ic = InputComposer::new("");
        ic.handle_key(char_key('你'));
        ic.handle_key(char_key('好'));
        assert_eq!(ic.cursor_pos, 6);

        ic.handle_key(code_key(KeyCode::Left));
        assert_eq!(ic.cursor_pos, 3); // 跳过 "好" (3 字节)

        ic.handle_key(code_key(KeyCode::Left));
        assert_eq!(ic.cursor_pos, 0); // 跳过 "你" (3 字节)
    }

    #[test]
    fn test_insert_in_middle_with_cjk() {
        let mut ic = InputComposer::new("");
        ic.handle_key(char_key('你'));
        ic.handle_key(char_key('好'));
        // 光标在末尾 (pos=6)，移动到中间
        ic.handle_key(code_key(KeyCode::Left));
        assert_eq!(ic.cursor_pos, 3);
        // 在中间插入
        ic.handle_key(char_key('a'));
        assert_eq!(ic.value(), "你a好");
        assert_eq!(ic.cursor_pos, 4);
    }

    // === 删除 ===

    #[test]
    fn test_backspace() {
        let mut ic = InputComposer::new("");
        ic.handle_key(char_key('a'));
        ic.handle_key(char_key('b'));
        ic.handle_key(code_key(KeyCode::Backspace));
        assert_eq!(ic.value(), "a");
        assert_eq!(ic.cursor_pos, 1);
    }

    #[test]
    fn test_backspace_empty_buffer() {
        let mut ic = InputComposer::new("");
        ic.handle_key(code_key(KeyCode::Backspace));
        assert_eq!(ic.value(), "");
        assert_eq!(ic.cursor_pos, 0);
    }

    #[test]
    fn test_backspace_cjk() {
        let mut ic = InputComposer::new("");
        ic.handle_key(char_key('你'));
        ic.handle_key(code_key(KeyCode::Backspace));
        assert_eq!(ic.value(), "");
        assert_eq!(ic.cursor_pos, 0);
    }

    #[test]
    fn test_delete() {
        let mut ic = InputComposer::new("");
        ic.handle_key(char_key('a'));
        ic.handle_key(char_key('b'));
        ic.handle_key(char_key('c'));
        ic.handle_key(code_key(KeyCode::Left)); // cursor at pos 2, before 'c'
        ic.handle_key(code_key(KeyCode::Delete));
        assert_eq!(ic.value(), "ab");
    }

    #[test]
    fn test_delete_in_middle() {
        let mut ic = InputComposer::new("");
        ic.handle_key(char_key('a'));
        ic.handle_key(char_key('b'));
        ic.handle_key(char_key('c'));
        ic.handle_key(code_key(KeyCode::Left)); // cursor at pos 2
        ic.handle_key(code_key(KeyCode::Left)); // cursor at pos 1, before 'b'
        ic.handle_key(code_key(KeyCode::Delete));
        assert_eq!(ic.value(), "ac");
    }

    #[test]
    fn test_delete_at_end() {
        let mut ic = InputComposer::new("");
        ic.handle_key(char_key('a'));
        ic.handle_key(code_key(KeyCode::Delete));
        assert_eq!(ic.value(), "a");
    }

    // === 快捷键 ===

    #[test]
    fn test_ctrl_c_interrupt() {
        let mut ic = InputComposer::new("");
        ic.handle_key(char_key('h'));
        ic.handle_key(char_key('e'));
        let action = ic.handle_key(ctrl_char_key('c'));
        assert!(matches!(action, InputAction::Interrupt));
        assert_eq!(ic.value(), "");
        assert_eq!(ic.cursor_pos, 0);
        assert!(ic.history_index.is_none());
    }

    #[test]
    fn test_ctrl_d_empty_exit() {
        let mut ic = InputComposer::new("");
        let action = ic.handle_key(ctrl_char_key('d'));
        assert!(matches!(action, InputAction::Exit));
    }

    #[test]
    fn test_ctrl_d_non_empty_no_exit() {
        let mut ic = InputComposer::new("");
        ic.handle_key(char_key('a'));
        let action = ic.handle_key(ctrl_char_key('d'));
        assert!(matches!(action, InputAction::None));
        assert_eq!(ic.value(), "a");
    }

    // === 提交 ===

    #[test]
    fn test_enter_submit() {
        let mut ic = InputComposer::new("");
        ic.handle_key(char_key('h'));
        ic.handle_key(char_key('i'));
        let action = ic.handle_key(code_key(KeyCode::Enter));
        if let InputAction::Submit(text) = action {
            assert_eq!(text, "hi");
        } else {
            panic!("Expected Submit action, got {:?}", action);
        }
        assert_eq!(ic.value(), "");
        assert_eq!(ic.cursor_pos, 0);
    }

    #[test]
    fn test_enter_empty_buffer() {
        let mut ic = InputComposer::new("");
        let action = ic.handle_key(code_key(KeyCode::Enter));
        if let InputAction::Submit(text) = action {
            assert_eq!(text, "");
        } else {
            panic!("Expected Submit action, got {:?}", action);
        }
    }

    // === 历史记录 ===

    #[test]
    fn test_history_browse_up_down() {
        let mut ic = InputComposer::new("");
        ic.history.push("first".to_string());
        ic.history.push("second".to_string());

        ic.handle_key(code_key(KeyCode::Up));
        assert_eq!(ic.value(), "second");

        ic.handle_key(code_key(KeyCode::Up));
        assert_eq!(ic.value(), "first");

        // 再按 Up 不应超出范围
        ic.handle_key(code_key(KeyCode::Up));
        assert_eq!(ic.value(), "first");

        ic.handle_key(code_key(KeyCode::Down));
        assert_eq!(ic.value(), "second");

        ic.handle_key(code_key(KeyCode::Down));
        assert_eq!(ic.value(), ""); // 恢复草稿（空）
    }

    #[test]
    fn test_history_draft_backup_restore() {
        let mut ic = InputComposer::new("");
        ic.history.push("old".to_string());
        ic.handle_key(char_key('d')); // 当前输入 "d"
        ic.handle_key(code_key(KeyCode::Up)); // 草稿备份为 "d"，显示 "old"
        assert_eq!(ic.value(), "old");
        ic.handle_key(code_key(KeyCode::Down)); // 恢复草稿
        assert_eq!(ic.value(), "d");
    }

    #[test]
    fn test_add_history_dedup() {
        let mut ic = InputComposer::new("");
        ic.add_history("cmd1");
        ic.add_history("cmd2");
        ic.add_history("cmd2"); // 连续相同，不添加
        assert_eq!(ic.history.len(), 2);
        assert_eq!(ic.history[0], "cmd1");
        assert_eq!(ic.history[1], "cmd2");
    }

    #[test]
    fn test_add_history_empty_skipped() {
        let mut ic = InputComposer::new("");
        ic.add_history("");
        assert!(ic.history.is_empty());
    }

    #[test]
    fn test_history_empty_no_crash() {
        let mut ic = InputComposer::new("");
        // 没有历史记录时按 Up/Down 不应崩溃
        let action = ic.handle_key(code_key(KeyCode::Up));
        assert!(matches!(action, InputAction::None));
        let action = ic.handle_key(code_key(KeyCode::Down));
        assert!(matches!(action, InputAction::None));
    }

    // === 光标列计算 ===

    #[test]
    fn test_cursor_col_ascii() {
        let mut ic = InputComposer::new("");
        ic.handle_key(char_key('a'));
        ic.handle_key(char_key('b'));
        // prompt="" → prompt.len()=0, display_width("ab")=2, ⟩ + space = 2, total = 4
        assert_eq!(cursor_col(&ic), 4);
    }

    #[test]
    fn test_cursor_col_cjk() {
        let mut ic = InputComposer::new("");
        ic.handle_key(char_key('你'));
        // prompt="" → prompt.len()=0, display_width("你")=2, ⟩ + space = 2, total = 4
        assert_eq!(cursor_col(&ic), 4);
    }

    #[test]
    fn test_cursor_col_mixed() {
        let mut ic = InputComposer::new("");
        ic.handle_key(char_key('a'));
        ic.handle_key(char_key('中'));
        // prompt="" → prompt.len()=0, display_width("a中")=3, ⟩ + space = 2, total = 5
        assert_eq!(cursor_col(&ic), 5);
    }

    #[test]
    fn test_cursor_col_with_prompt() {
        let mut ic = InputComposer::new("cli");
        ic.handle_key(char_key('a'));
        // prompt="cli" → prompt.len()=3, display_width("a")=1, ⟩ + space = 2, total = 6
        assert_eq!(cursor_col(&ic), 6);
    }

    // === 历史文件持久化 ===

    #[test]
    fn test_save_and_load_history() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("history");

        let mut ic = InputComposer::new("");
        ic.history.push("cmd1".to_string());
        ic.history.push("cmd2".to_string());
        ic.save_history(&path);

        let mut ic2 = InputComposer::new("");
        ic2.load_history(&path);
        assert_eq!(ic2.history.len(), 2);
        assert_eq!(ic2.history[0], "cmd1");
        assert_eq!(ic2.history[1], "cmd2");
    }

    #[test]
    fn test_load_nonexistent_history() {
        let mut ic = InputComposer::new("");
        ic.load_history(Path::new("/nonexistent/path/history"));
        assert!(ic.history.is_empty());
    }

    // === 未知按键 ===

    #[test]
    fn test_unknown_keycode_returns_none() {
        let mut ic = InputComposer::new("");
        let action = ic.handle_key(code_key(KeyCode::F(1)));
        assert!(matches!(action, InputAction::None));
    }

    // === 显示宽度计算 ===

    #[test]
    fn test_char_width_ascii() {
        assert_eq!(char_width('a'), 1);
        assert_eq!(char_width('Z'), 1);
        assert_eq!(char_width(' '), 1);
        assert_eq!(char_width('@'), 1);
    }

    #[test]
    fn test_char_width_cjk() {
        assert_eq!(char_width('你'), 2);
        assert_eq!(char_width('好'), 2);
        assert_eq!(char_width('世'), 2);
    }
}
