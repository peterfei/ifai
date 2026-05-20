//! ResumePicker - 会话恢复交互式选择器
//!
//! 设计原则：
//! - 复用 CommandPopup 的声明式按键映射
//! - 支持 Up/Down 选择、Enter 确认、Esc 取消
//! - 底部弹出框渲染，选中项高亮

use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};

use crate::command_popup::PopupAction;

// ============================================================================
// 数据类型
// ============================================================================

/// 可恢复的会话条目
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ResumeEntry {
    /// 手动保存的会话
    Saved {
        name: String,
        message_count: usize,
        model: String,
        time_ago: String,
    },
    /// 自动快照
    Auto {
        session_id: String,
        message_count: usize,
        time_ago: String,
    },
    /// 增量日志（live）
    Live {
        session_id: String,
    },
}

impl ResumeEntry {
    /// 获取用于恢复的标识符
    pub fn resume_id(&self) -> String {
        match self {
            ResumeEntry::Saved { name, .. } => name.clone(),
            ResumeEntry::Auto { session_id, .. } => session_id.clone(),
            ResumeEntry::Live { session_id } => session_id.clone(),
        }
    }

    /// 获取显示标签
    pub fn label(&self) -> String {
        match self {
            ResumeEntry::Saved { name, message_count, model, time_ago } => {
                format!("{}  {} 条消息 · {} · {}", name, message_count, model, time_ago)
            }
            ResumeEntry::Auto { session_id, message_count, time_ago } => {
                format!("[auto] {}  {} 条消息 · {}", session_id, message_count, time_ago)
            }
            ResumeEntry::Live { session_id } => {
                format!("[live] {}", session_id)
            }
        }
    }

    /// 类型标记颜色
    pub fn badge_color(&self) -> Color {
        match self {
            ResumeEntry::Saved { .. } => Color::Cyan,
            ResumeEntry::Auto { .. } => Color::Magenta,
            ResumeEntry::Live { .. } => Color::Green,
        }
    }

    /// 是否是手动保存
    pub fn is_saved(&self) -> bool {
        matches!(self, ResumeEntry::Saved { .. })
    }

    /// 是否是增量日志（需要从 JSONL 恢复）
    pub fn is_live(&self) -> bool {
        matches!(self, ResumeEntry::Live { .. })
    }
}

// ============================================================================
// ResumePicker 结构体
// ============================================================================

const MAX_ROWS: usize = 10;

pub struct ResumePicker {
    entries: Vec<ResumeEntry>,
    selected: usize,
    scroll_offset: usize,
}

impl ResumePicker {
    pub fn new(entries: Vec<ResumeEntry>) -> Self {
        Self {
            entries,
            selected: 0,
            scroll_offset: 0,
        }
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    /// 获取当前条目数
    pub fn len(&self) -> usize {
        self.entries.len()
    }

    /// 获取当前选中索引
    pub fn selected(&self) -> usize {
        self.selected
    }

    /// 获取选中条目的引用
    pub fn selected_entry(&self) -> Option<&ResumeEntry> {
        self.entries.get(self.selected)
    }

    /// 处理按键事件
    /// 返回 Some(ResumeEntry) 表示用户确认选择
    /// 返回 None 表示继续或取消
    pub fn handle_key(&mut self, key: KeyEvent) -> Option<PickerAction> {
        let action = crate::command_popup::resolve_popup_key(key);

        match action {
            PopupAction::Prev => {
                if self.selected > 0 {
                    self.selected -= 1;
                } else {
                    self.selected = self.entries.len().saturating_sub(1);
                }
                self.adjust_scroll();
                None
            }
            PopupAction::Next => {
                if !self.entries.is_empty() && self.selected < self.entries.len() - 1 {
                    self.selected += 1;
                } else {
                    self.selected = 0;
                }
                self.adjust_scroll();
                None
            }
            PopupAction::Select => {
                if let Some(entry) = self.entries.get(self.selected) {
                    Some(PickerAction::Select(entry.clone()))
                } else {
                    None
                }
            }
            PopupAction::Close => Some(PickerAction::Cancel),
            PopupAction::Pass => None,
        }
    }

    /// 调整滚动偏移确保选中项可见
    fn adjust_scroll(&mut self) {
        if self.selected < self.scroll_offset {
            self.scroll_offset = self.selected;
        } else if self.selected >= self.scroll_offset + MAX_ROWS {
            self.scroll_offset = self.selected - MAX_ROWS + 1;
        }
    }

    /// 渲染弹出框
    pub fn render(&self) -> (Vec<Line<'static>>, u16) {
        if self.entries.is_empty() {
            return (vec![], 0);
        }

        let visible_count = self.entries.len().min(MAX_ROWS);
        let mut lines = Vec::with_capacity(visible_count + 2); // +2 for border + hint

        // 标题
        lines.push(Line::from(vec![
            Span::styled(" 📋 ", Style::default().fg(Color::Yellow)),
            Span::styled("选择要恢复的会话", Style::default().fg(Color::White).add_modifier(Modifier::BOLD)),
        ]));

        // 条目
        for i in 0..visible_count {
            let idx = self.scroll_offset + i;
            if idx >= self.entries.len() {
                break;
            }

            let entry = &self.entries[idx];
            let is_selected = idx == self.selected;

            let bg = if is_selected {
                Color::DarkGray
            } else {
                Color::Reset
            };

            let style = Style::default().bg(bg);
            let selected_marker = if is_selected { "▶" } else { " " };

            let badge = match entry {
                ResumeEntry::Saved { .. } => "[save]",
                ResumeEntry::Auto { .. } => "[auto]",
                ResumeEntry::Live { .. } => "[live]",
            };

            let badge_color = entry.badge_color();

            let label = entry.label();

            lines.push(Line::from(vec![
                Span::styled(format!(" {} ", selected_marker), style.fg(Color::Yellow)),
                Span::styled(format!("{:<6}", badge), style.fg(badge_color)),
                Span::styled(label, style),
            ]));
        }

        // 底部提示
        lines.push(Line::from(vec![
            Span::styled(
                " ↑↓ 选择 · Enter 恢复 · Esc 取消",
                Style::default().fg(Color::DarkGray),
            ),
        ]));

        let height = lines.len() as u16;
        (lines, height)
    }
}

/// 选择器操作结果
#[derive(Debug, Clone)]
pub enum PickerAction {
    /// 确认选择
    Select(ResumeEntry),
    /// 取消
    Cancel,
}
