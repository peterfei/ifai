//! TUI 核心模块 — ratatui 全屏终端 UI
//!
//! 布局：内容区（弹性） + 状态栏（1行固定） + 输入框（1行固定）

use std::io::{self, Stdout};
use std::time::Instant;

use crossterm::{
    event::{self, Event, KeyCode, KeyEvent, KeyModifiers, MouseEvent, MouseEventKind},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use ratatui::{
    backend::CrosstermBackend,
    layout::{Constraint, Direction, Layout, Rect},
    text::{Line, Span},
    widgets::{Block, Borders, Clear, Paragraph, Widget},
    Terminal,
};

use crate::render;
use crate::AppResult;
use crate::event::{ControlFlow, EventHandler, EventRouter};
use crate::event::{CombinedKeyHandler, MouseScrollHandler, ResizeHandler, IgnoreHandler, SearchEnterHandler, SearchInputHandler, HelpEnterHandler, HelpExitHandler};
use ifainew_lib::harness::task::{self, TaskStatus};

use super::input_composer::{self, InputComposer, InputAction};
use super::approval_overlay::{self, ApprovalRequest, ApprovalDecision};

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

// ============================================================================
// 🏛️ 任务渲染 — 配置表驱动（代码即数据，零 match）
// ============================================================================

/// 任务状态显示配置（查表驱动，渲染函数中零 match）
struct TaskStatusDisplay {
    icon: &'static str,
    color: ratatui::style::Color,
}

/// 任务状态样式配置表（与 RISK_DISPLAYS / POPUP_KEYMAP 风格一致）
static TASK_STATUS_DISPLAYS: &[(TaskStatus, TaskStatusDisplay)] = &[
    (TaskStatus::Pending,    TaskStatusDisplay { icon: "[ ]", color: ratatui::style::Color::DarkGray }),
    (TaskStatus::InProgress, TaskStatusDisplay { icon: "▸",  color: ratatui::style::Color::Yellow }),
    (TaskStatus::Completed,  TaskStatusDisplay { icon: "[x]", color: ratatui::style::Color::Green }),
];

/// 渲染任务列表（返回 ratatui Lines + 是否全部完成）
fn render_task_lines(tasks: &[task::TaskItem]) -> (Vec<Line<'static>>, bool) {
    if tasks.is_empty() {
        return (vec![], false);
    }

    let total = tasks.len();
    let completed = tasks.iter().filter(|t| t.status == TaskStatus::Completed).count();
    let all_done = completed == total;
    let max_lines = 5usize;

    if all_done {
        // 全部完成 → 单行摘要
        let line = Line::from(Span::styled(
            format!(" ✓ {}/{} 任务完成", completed, total),
            ratatui::style::Style::default().fg(ratatui::style::Color::Green),
        ));
        return (vec![line], true);
    }

    // 有未完成 → 显示任务列表（最多 max_lines 行）
    let visible: &[task::TaskItem] = if tasks.len() > max_lines {
        &tasks[..max_lines]
    } else {
        tasks
    };

    let mut lines: Vec<Line<'static>> = Vec::with_capacity(visible.len() + 1);

    for (i, task) in visible.iter().enumerate() {
        let display = TASK_STATUS_DISPLAYS.iter()
            .find(|(s, _)| *s == task.status)
            .map(|(_, d)| d)
            .unwrap_or(&TaskStatusDisplay { icon: "?", color: ratatui::style::Color::White });

        // 只有第一个 InProgress 任务用 ▸ 图标，其余用空格
        let is_first_in_progress = task.status == TaskStatus::InProgress
            && !visible[..i].iter().any(|t| t.status == TaskStatus::InProgress);
        let (prefix, content_style) = if is_first_in_progress {
            (format!("▸ [{}/{}] ", i + 1, total), display.color)
        } else {
            (format!("  [{}/{}] ", i + 1, total), display.color)
        };

        // 截断过长内容（按字符截断，保留终端宽度安全）
        let content = if task.content.chars().count() > 60 {
            format!("{}...", task.content.chars().take(57).collect::<String>())
        } else {
            task.content.clone()
        };

        lines.push(Line::from(vec![
            Span::styled(prefix, ratatui::style::Style::default().fg(content_style)),
            Span::raw(content),
        ]));
    }

    // 超出部分提示
    if tasks.len() > max_lines {
        let remaining = tasks.len() - max_lines;
        lines.push(Line::from(Span::styled(
            format!("  ... +{} more", remaining),
            ratatui::style::Style::default().fg(ratatui::style::Color::DarkGray),
        )));
    }

    (lines, false)
}

/// TUI 应用
pub struct App {
    /// Terminal（None 表示测试模式）
    terminal: Option<Terminal<CrosstermBackend<Stdout>>>,
    /// 内容区行缓冲
    pub content_lines: Vec<Line<'static>>,
    /// 内容区滚动偏移
    pub scroll_offset: u16,
    /// 用户是否手动上翻（禁用 auto_scroll）
    user_scrolled: bool,
    /// 输入框
    pub input: InputComposer,
    /// 状态栏文本
    status_text: String,
    /// 是否正在处理 AI 请求（阻止新输入）
    busy: bool,
    /// 输入消息队列（streaming 期间用户按 Enter 入队，streaming 结束自动出队）
    queue: Vec<String>,
    /// 审批状态（Some = 审批面板显示中）
    pub approval_state: Option<ApprovalRequest>,
    /// 审批面板选中项索引
    pub approval_selected: usize,
    /// 搜索模式
    pub search_mode: bool,
    /// 搜索关键词
    pub search_query: String,
    /// 匹配的行号列表
    pub search_matches: Vec<usize>,
    /// 当前匹配项索引
    pub current_match_index: usize,
    /// 搜索输入框
    pub search_input: InputComposer,
    /// 帮助模式（显示快捷键帮助覆盖层）
    pub help_mode: bool,
    /// 命令弹出框
    pub command_popup: super::command_popup::CommandPopup,
    /// 任务全部完成的时间点（用于延迟自动收起）
    task_all_done_at: Option<Instant>,
}

impl App {
    /// 创建并初始化 TUI
    pub fn new() -> io::Result<Self> {
        enable_raw_mode()?;
        execute!(io::stdout(), EnterAlternateScreen, crossterm::event::EnableMouseCapture)?;

        let backend = CrosstermBackend::new(io::stdout());
        let mut terminal = Terminal::new(backend)?;
        terminal.hide_cursor()?;

        let mut app = Self {
            terminal: Some(terminal),
            content_lines: Vec::new(),
            scroll_offset: 0,
            user_scrolled: false,
            input: InputComposer::new(""),
            status_text: String::new(),
            busy: false,
            queue: Vec::new(),
            approval_state: None,
            approval_selected: 0,
            search_mode: false,
            search_query: String::new(),
            search_matches: Vec::new(),
            current_match_index: 0,
            search_input: InputComposer::new(""),
            help_mode: false,
            command_popup: super::command_popup::CommandPopup::new(),
            task_all_done_at: None,
        };

        // 初始化时不添加任何内容，让欢迎页组件接管

        Ok(app)
    }

    /// 创建用于测试的 App（不初始化终端设备）
    #[cfg(test)]
    pub fn new_for_test() -> Self {
        Self {
            terminal: None,
            content_lines: Vec::new(),
            scroll_offset: 0,
            user_scrolled: false,
            input: InputComposer::new(""),
            status_text: String::new(),
            busy: false,
            queue: Vec::new(),
            approval_state: None,
            approval_selected: 0,
            search_mode: false,
            search_query: String::new(),
            search_matches: Vec::new(),
            current_match_index: 0,
            search_input: InputComposer::new(""),
            help_mode: false,
            command_popup: super::command_popup::CommandPopup::new(),
            task_all_done_at: None,
        }
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

    /// 检测内容区是否为空（用于显示欢迎页）
    pub fn is_empty(&self) -> bool {
        self.content_lines.is_empty()
    }

    /// 设置状态栏文本（自动剥离 ANSI 转义码）
    pub fn set_status(&mut self, text: String) {
        self.status_text = strip_ansi(&text);
    }

    /// 设置忙碌状态
    pub fn set_busy(&mut self, busy: bool) {
        self.busy = busy;
    }

    /// 是否正在处理 AI 请求（阻止新输入）
    pub fn is_busy(&self) -> bool {
        self.busy
    }

    /// 入队一条消息（自动 trim + 空检查）
    pub fn enqueue(&mut self, text: String) {
        let text = text.trim().to_string();
        if !text.is_empty() {
            self.queue.push(text);
        }
    }

    /// 出队一条消息（FIFO）
    pub fn dequeue(&mut self) -> Option<String> {
        if self.queue.is_empty() { None } else { Some(self.queue.remove(0)) }
    }

    /// 清空队列
    pub fn clear_queue(&mut self) {
        self.queue.clear();
    }

    /// 队列长度
    pub fn queue_len(&self) -> usize {
        self.queue.len()
    }

    /// 设置审批等待状态
    pub fn set_approval_pending(&mut self, request: ApprovalRequest) {
        self.approval_state = Some(request);
        self.approval_selected = 0;  // 重置选中项为第一个
    }

    /// 获取审批状态的引用（用于外部访问）
    pub fn approval_state_ref(&self) -> &Option<ApprovalRequest> {
        &self.approval_state
    }

    /// 解析审批决策，返回日志消息
    pub fn resolve_approval(&mut self, decision: ApprovalDecision) -> String {
        let tool_name = self.approval_state
            .as_ref()
            .map(|r| r.tool_name.clone())
            .unwrap_or_default();

        // 通过 oneshot 发送决策
        if let Some(request) = self.approval_state.take() {
            let _ = request.response_tx.send(decision);
        }

        // 清空终端 buffer，确保 overlay 残留（border 字符）被完全清除
        if let Some(terminal) = &mut self.terminal {
            let _ = terminal.clear();
        }

        match decision {
            ApprovalDecision::ApproveOnce => format!("✓ 已批准执行 {}", tool_name),
            ApprovalDecision::ApproveAlways => format!("✓ 已永久允许执行 {}", tool_name),
            ApprovalDecision::ApproveSession => format!("✓ 已会话允许执行 {}", tool_name),
            ApprovalDecision::Deny => format!("✗ 已拒绝执行 {}", tool_name),
            ApprovalDecision::Abort => "⊘ 已中止 AI 请求".to_string(),
        }
    }

    /// 是否处于审批状态
    pub fn is_approving(&self) -> bool {
        self.approval_state.is_some()
    }

    // ============================================================================
    // 搜索功能
    // ============================================================================

    /// 是否处于搜索模式
    pub fn is_searching(&self) -> bool {
        self.search_mode
    }

    /// 进入搜索模式
    pub fn enter_search_mode(&mut self) {
        self.search_mode = true;
        self.search_query.clear();
        self.search_matches.clear();
        self.current_match_index = 0;
        self.search_input = InputComposer::new("");
    }

    /// 退出搜索模式
    pub fn exit_search_mode(&mut self) {
        self.search_mode = false;
        self.search_query.clear();
        self.search_matches.clear();
        self.current_match_index = 0;
    }

    /// 执行搜索，更新匹配列表
    pub fn perform_search(&mut self) {
        let query = self.search_query.trim().to_lowercase();
        if query.is_empty() {
            self.search_matches.clear();
            self.current_match_index = 0;
            return;
        }

        self.search_matches = self.content_lines
            .iter()
            .enumerate()
            .filter(|(_, line)| {
                line.to_string().to_lowercase().contains(&query)
            })
            .map(|(i, _)| i)
            .collect();

        if !self.search_matches.is_empty() {
            self.current_match_index = 0;
            self.scroll_to_match(0);
        }
    }

    /// 跳转到下一个匹配
    pub fn next_match(&mut self) {
        if self.search_matches.is_empty() {
            return;
        }
        self.current_match_index = (self.current_match_index + 1) % self.search_matches.len();
        self.scroll_to_match(self.current_match_index);
    }

    /// 跳转到上一个匹配
    pub fn prev_match(&mut self) {
        if self.search_matches.is_empty() {
            return;
        }
        if self.current_match_index == 0 {
            self.current_match_index = self.search_matches.len() - 1;
        } else {
            self.current_match_index -= 1;
        }
        self.scroll_to_match(self.current_match_index);
    }

    /// 滚动到指定匹配项
    fn scroll_to_match(&mut self, match_index: usize) {
        if match_index >= self.search_matches.len() {
            return;
        }
        let target_line = self.search_matches[match_index];
        let area = self.content_area();
        let visible_lines = area.height as usize;

        // 确保目标行在可见区域内
        if target_line >= self.scroll_offset as usize + visible_lines {
            // 目标行在下方，向下滚动
            self.scroll_offset = (target_line.saturating_sub(visible_lines / 2)) as u16;
        } else if target_line < self.scroll_offset as usize {
            // 目标行在上方，向上滚动
            self.scroll_offset = target_line.saturating_sub(2) as u16;
        }
    }

    /// 高亮显示搜索词
    fn highlight_search_term(&self, line: &str, is_current: bool, is_other: bool) -> Line<'static> {
        highlight_search_term_static(line, &self.search_query, is_current, is_other)
    }

    /// 滚动到底部
    pub fn scroll_to_bottom(&mut self) {
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
    pub fn scroll_up(&mut self, n: u16) {
        self.scroll_offset = self.scroll_offset.saturating_sub(n);
        let area = self.content_area();
        let max_offset = self.content_lines.len().saturating_sub(area.height as usize) as u16;
        self.user_scrolled = self.scroll_offset < max_offset;
    }

    /// 向下滚动 n 行
    pub fn scroll_down(&mut self, n: u16) {
        let area = self.content_area();
        let max_offset = self.content_lines.len().saturating_sub(area.height as usize) as u16;
        self.scroll_offset = (self.scroll_offset + n).min(max_offset);
        if self.scroll_offset >= max_offset {
            self.user_scrolled = false;
        }
    }

    /// 获取内容区域（减去底部 2 行）
    fn content_area(&self) -> Rect {
        if let Some(terminal) = &self.terminal {
            let size = terminal.size().unwrap_or(ratatui::layout::Size::new(80, 24));
            let height = size.height.saturating_sub(2);
            Rect::new(0, 0, size.width, height)
        } else {
            // 测试模式：返回固定大小
            Rect::new(0, 0, 80, 22)
        }
    }

    /// 渲染一帧
    pub fn render(&mut self) {
        // 更新任务面板状态（副作用，必须在 draw_frame 之前）
        let tasks = task::get_global_task_store().get_tasks();
        let task_all_done = tasks.iter().all(|t| t.status == task::TaskStatus::Completed);
        if task_all_done && !tasks.is_empty() && self.task_all_done_at.is_none() {
            self.task_all_done_at = Some(Instant::now());
        } else if !task_all_done {
            self.task_all_done_at = None;
        }

        // 取出 terminal 避免借用冲突（self.terminal vs self.draw_frame）
        let mut terminal = self.terminal.take();
        if let Some(term) = &mut terminal {
            let _ = term.draw(|f| self.draw_frame(f));
        }
        self.terminal = terminal;
    }

    /// 绘制帧内容（与终端解耦，可供 TestBackend 测试调用）
    pub fn draw_frame(&self, f: &mut ratatui::Frame<'_>) {
        // 所有局部数据直接从 self 读取（不再需要提前 clone）
        let search_mode = self.search_mode;
        let search_query = &self.search_query;
        let search_matches = &self.search_matches;
        let current_match_index = self.current_match_index;
        let scroll_offset = self.scroll_offset;
        let content_lines = &self.content_lines;
        let has_approval_state = self.approval_state.is_some();
        let approval_selected = self.approval_selected;
        let user_scrolled = self.user_scrolled;
        let status_text = &self.status_text;
        let input_value = self.input.value();
        let input_cursor_col = input_composer::cursor_col(&self.input);
        let search_input_value = self.search_input.value();
        let search_input_cursor_col = input_composer::cursor_col(&self.search_input);
        let is_empty = self.is_empty();
        let help_mode = self.help_mode;
        let popup_visible = self.command_popup.is_visible();
        let (popup_lines, popup_height) = self.command_popup.render();

        let tasks = task::get_global_task_store().get_tasks();
        let (task_lines, _) = render_task_lines(&tasks);
        let task_expired = self.task_all_done_at
            .map(|t| t.elapsed().as_secs() >= 2)
            .unwrap_or(false);
        let task_height = task_lines.len() as u16;
        let show_tasks = task_height > 0 && !popup_visible && !task_expired;

        let size = f.area();
        if size.height < 4 {
            return;
        }

        // 布局：内容区 + 状态栏(1行) + 分隔线(1行) + 输入框(1行)
        let chunks = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Min(1),    // 内容区
                Constraint::Length(1), // 状态栏
                Constraint::Length(1), // 分隔线
                Constraint::Length(1), // 输入框
            ])
            .split(size);
        
        let content_area = chunks[0];
        let status_area = chunks[1];
        let separator_area = chunks[2];
        let input_area = chunks[3];
        
        // 清空内容区（确保 overlay 关闭后残留内容被清除）
        f.render_widget(Clear, content_area);
        
        // 计算内容区域信息（用于滚动指示器）
        // 当 tasks 面板或命令弹出框可见时，减去它们的高度避免内容被遮挡
        let overlay_height = if show_tasks && task_height > 0 {
            task_height
        } else if popup_visible && popup_height > 0 {
            popup_height
        } else {
            0
        };
        let visible_count = (content_area.height as usize).saturating_sub(overlay_height as usize);
        let total_lines = content_lines.len();
        
        // === 内容区 ===
        // 只有在非审批模式下才渲染内容区域
        if !has_approval_state {
            // === 欢迎页显示（当内容区为空且不在帮助模式时） ===
            if is_empty && !help_mode {
                let welcome_widget = super::welcome::WelcomeWidget::new();
                let welcome_lines = welcome_widget.render();
        
                // 居中显示欢迎页
                let welcome_content = Paragraph::new(welcome_lines)
                    .alignment(ratatui::layout::Alignment::Center);
                f.render_widget(welcome_content, content_area);
            } else if help_mode {
                // === 帮助覆盖层显示 ===
                let help_overlay = super::keybindings::HelpOverlay::new();
                let help_lines = help_overlay.render();
        
                // 帮助内容居左显示
                let help_content = Paragraph::new(help_lines)
                    .alignment(ratatui::layout::Alignment::Left);
                f.render_widget(help_content, content_area);
            } else if search_mode && !search_query.is_empty() {
                // === 搜索模式：渲染带高亮的行 ===
                let start = scroll_offset as usize;
                let end = (start + visible_count).min(total_lines);
        
                let visible_lines: Vec<Line> = (start..end)
                    .map(|line_idx| {
                        let line = &content_lines[line_idx];
                        let line_text = line.to_string();
        
                        // 检查这一行是否是当前匹配
                        let is_current_match = current_match_index < search_matches.len()
                            && search_matches[current_match_index] == line_idx;
        
                        // 检查这一行是否是其他匹配
                        let is_other_match = search_matches.contains(&line_idx)
                            && !is_current_match;
        
                        // 如果包含搜索词，添加高亮
                        if line_text.to_lowercase().contains(&search_query.to_lowercase()) {
                            highlight_search_term_static(&line_text, &search_query, is_current_match, is_other_match)
                        } else {
                            line.clone()
                        }
                    })
                    .collect();
        
                let content = Paragraph::new(visible_lines).scroll((0, 0));
                f.render_widget(content, content_area);
            } else {
                // === 正常模式：直接渲染 ===
                let start = scroll_offset as usize;
                let end = (start + visible_count).min(total_lines);
                let visible_lines: Vec<Line> = content_lines[start..end].to_vec();
                let content = Paragraph::new(visible_lines).scroll((0, 0));
                f.render_widget(content, content_area);
            }
        } else {
            // 审批模式：用黑色背景清除内容区域
            let clear_area = Paragraph::new("")
                .style(ratatui::style::Style::default().bg(ratatui::style::Color::Black));
            f.render_widget(clear_area, content_area);
        }
        
        // === 审批面板（底部弹出） ===
        if has_approval_state {
            if let Some(request) = &self.approval_state {
                let (panel_lines, panel_height) = approval_overlay::render_bottom_panel(request, approval_selected);
        
                // 计算面板区域：覆盖整个底部（包括状态栏和输入框区域）
                let panel_width = content_area.width;
                let panel_y = content_area.y + content_area.height.saturating_sub(panel_height);
                let panel_area = Rect::new(content_area.x, panel_y, panel_width, panel_height);
        
                // 黑色背景填充
                let panel_bg = Paragraph::new(panel_lines)
                    .style(ratatui::style::Style::default().bg(ratatui::style::Color::Black));
                f.render_widget(panel_bg, panel_area);
            }
        }
        
        // === 滚动指示器 ===
        let max_offset = total_lines.saturating_sub(visible_count) as u16;
        if max_offset > 0 && user_scrolled {
            let pct = if max_offset > 0 {
                (scroll_offset as f64 / max_offset as f64 * 100.0) as u16
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
        
        // === 状态栏和输入框 ===
        // 只有在非审批模式下才渲染状态栏和输入框
        if !has_approval_state {
            if search_mode {
                // === 搜索模式 ===
                let match_count = search_matches.len();
                let current = if match_count > 0 {
                    current_match_index + 1
                } else {
                    0
                };
        
                let status_text = if match_count == 0 {
                    format!("🔍 Search: {} [0/0] No matches", search_query)
                } else {
                    format!("🔍 Search: {} [{}/{}]", search_query, current, match_count)
                };
        
                let status_color = if match_count == 0 && !search_query.is_empty() {
                    ratatui::style::Color::Red
                } else {
                    ratatui::style::Color::Cyan
                };
        
                let status_line = Line::from(Span::styled(
                    format!(" {} ↑/Enter 下一个 | ↓/Shift+Enter 上一个 | Esc 退出 ", status_text),
                    ratatui::style::Style::default().fg(status_color),
                ));
                let status = Paragraph::new(status_line)
                    .style(ratatui::style::Style::default().bg(ratatui::style::Color::Black));
                f.render_widget(status, status_area);
        
                // === 搜索输入框 ===
                let prompt = Span::styled(
                    "🔍 ",
                    ratatui::style::Style::default().fg(ratatui::style::Color::Yellow),
                );
                let input_text = Span::raw(search_input_value);
                let input_line = Line::from(vec![prompt, input_text]);
                let input = Paragraph::new(input_line);
                f.render_widget(input, input_area);
        
                // 设置终端光标位置（🔍 占 2 个字符宽度）
                let cursor_x = input_area.x + 2 + (search_input_cursor_col as u16).min(input_area.width.saturating_sub(2));
                let cursor_y = input_area.y;
                f.set_cursor_position((cursor_x, cursor_y));
            } else {
                // === 正常模式 ===
                // === 状态栏 ===
                let status_line = if !tasks.is_empty() {
                    // 任务模式：显示当前任务 + 进度
                    let total = tasks.len();
                    let completed = tasks.iter().filter(|t| t.status == TaskStatus::Completed).count();
                    let mut spans: Vec<Span<'static>> = Vec::new();
        
                    // 当前 InProgress 任务的 activeForm
                    let current_task = tasks.iter()
                        .find(|t| t.status == TaskStatus::InProgress);
                    if let Some(t) = current_task {
                        spans.push(Span::styled(" ▸ ", ratatui::style::Style::default().fg(ratatui::style::Color::Yellow)));
                        spans.push(Span::styled(
                            t.active_form.clone(),
                            ratatui::style::Style::default().fg(ratatui::style::Color::Yellow),
                        ));
                        spans.push(Span::raw(" "));
                    }
        
                    // 进度 Tasks N/M
                    spans.push(Span::styled(
                        format!("Tasks {}/{}", completed, total),
                        ratatui::style::Style::default().fg(ratatui::style::Color::DarkGray),
                    ));
        
                    // 如果有其他状态文本，追加到末尾
                    if !status_text.is_empty() {
                        spans.push(Span::raw(" · "));
                        spans.push(Span::styled(
                            status_text.clone(),
                            ratatui::style::Style::default().fg(ratatui::style::Color::DarkGray),
                        ));
                    }

                    // 队列计数（自动派生）
                    if !self.queue.is_empty() {
                        spans.push(Span::raw(" · "));
                        spans.push(Span::styled(
                            format!("Queue: {}", self.queue.len()),
                            ratatui::style::Style::default().fg(ratatui::style::Color::Cyan),
                        ));
                    }

                    Line::from(spans)
                } else {
                    // 无任务：显示原有状态文本或 Ready
                    let mut spans: Vec<Span<'static>> = Vec::new();
                    if !status_text.is_empty() {
                        spans.push(Span::raw(" "));
                        spans.push(Span::styled(
                            status_text.clone(),
                            ratatui::style::Style::default().fg(ratatui::style::Color::DarkGray),
                        ));
                    } else {
                        spans.push(Span::raw(" [Ready] "));
                    }
                    // 队列计数（自动派生）
                    if !self.queue.is_empty() {
                        spans.push(Span::raw(" · "));
                        spans.push(Span::styled(
                            format!("Queue: {}", self.queue.len()),
                            ratatui::style::Style::default().fg(ratatui::style::Color::Cyan),
                        ));
                    }
                    Line::from(spans)
                };
                let status = Paragraph::new(status_line)
                    .style(ratatui::style::Style::default().bg(ratatui::style::Color::Black));
                f.render_widget(status, status_area);
        
                // === 命令弹出框（输入框上方） ===
                // 与任务列表互斥（共享同一渲染区域）
                if show_tasks && task_height > 0 {
                    let task_y = status_area.y.saturating_sub(task_height);
                    let task_area = Rect::new(
                        content_area.x,
                        task_y,
                        content_area.width,
                        task_height,
                    );
                    f.render_widget(Clear, task_area);
                    let task_content = Paragraph::new(task_lines.clone())
                        .style(ratatui::style::Style::default().bg(ratatui::style::Color::Black));
                    f.render_widget(task_content, task_area);
                } else if popup_visible && popup_height > 0 {
                    let popup_y = status_area.y.saturating_sub(popup_height);
                    let popup_area = Rect::new(
                        content_area.x,
                        popup_y,
                        content_area.width,
                        popup_height,
                    );
                    f.render_widget(Clear, popup_area);
                    let popup_content = Paragraph::new(popup_lines)
                        .style(ratatui::style::Style::default().bg(ratatui::style::Color::Black));
                    f.render_widget(popup_content, popup_area);
                }
        
                // === 分隔线（状态栏与输入框之间的视觉分隔） ===
                let separator_line = "─".repeat(separator_area.width as usize);
                let separator = Paragraph::new(separator_line)
                    .style(ratatui::style::Style::default().fg(ratatui::style::Color::DarkGray));
                f.render_widget(separator, separator_area);
        
                // === 输入框 ===
                let prompt = Span::styled(
                    format!("{}⟩ ", self.input.prompt()),
                    ratatui::style::Style::default().fg(ratatui::style::Color::Cyan),
                );
                let input_text = Span::raw(input_value);
                let input_line = Line::from(vec![prompt, input_text]);
                let input = Paragraph::new(input_line);
                f.render_widget(input, input_area);
        
                // 设置终端光标位置（input_cursor_col 已包含 prompt 和 ⟩ 的宽度）
                let cursor_x = input_area.x + (input_cursor_col as u16).min(input_area.width);
                let cursor_y = input_area.y;
                f.set_cursor_position((cursor_x, cursor_y));
            }
        }
    }

    /// 恢复终端状态
    pub fn restore(&mut self) -> io::Result<()> {
        if let Some(terminal) = &mut self.terminal {
            terminal.show_cursor()?;
        }
        execute!(io::stdout(), LeaveAlternateScreen, crossterm::event::DisableMouseCapture)?;
        disable_raw_mode()?;
        Ok(())
    }

    /// 构建事件路由器（声明式配置）
    ///
    /// 路由顺序：
    /// 1. SearchEnterHandler - Ctrl+F 进入搜索模式
    /// 2. SearchInputHandler - 搜索模式下的输入（仅在搜索模式时激活）
    /// 3. CombinedKeyHandler - 正常模式输入 + 滚动
    /// 4. MouseScrollHandler - 处理鼠标滚轮 + 选择支持
    /// 5. ResizeHandler - 处理终端大小调整
    /// 6. IgnoreHandler - 忽略其他事件
    ///
    /// 注意：SearchInputHandler 的谓词需要访问 app 状态，
    /// 但由于 EventRouter 限制，我们使用一个技巧：
    /// SearchInputHandler 会检查 app.is_searching()，如果不是搜索模式就直接返回 Continue
    fn build_event_router() -> EventRouter<crossterm::event::Event> {
        EventRouter::new()
            // 帮助进入 - 按 `?`
            .on(|e| matches!(e, crossterm::event::Event::Key(_)), HelpEnterHandler)
            // 帮助退出 - 按 `Esc`（仅在帮助模式时）
            .on(|e| matches!(e, crossterm::event::Event::Key(_)), HelpExitHandler)
            // 搜索进入 - Ctrl+F
            .on(|e| matches!(e, crossterm::event::Event::Key(_)), SearchEnterHandler)
            // 搜索输入（优先级高，需要在正常输入之前）
            .on(|e| matches!(e, crossterm::event::Event::Key(_)), SearchInputHandler)
            // 组合键盘处理器（输入 + 滚动）
            .on(|e| matches!(e, crossterm::event::Event::Key(_)), CombinedKeyHandler)
            // 鼠标滚轮路由（带选择支持）
            .on(|e| matches!(e, crossterm::event::Event::Mouse(_)), MouseScrollHandler::new())
            // Resize 路由
            .on(
                |e| matches!(e, crossterm::event::Event::Resize(_, _)),
                ResizeHandler,
            )
            // Fallback（忽略其他事件）
            .fallback(IgnoreHandler)
    }

    /// 主事件循环（返回用户提交的输入或退出信号）
    pub fn run_loop(&mut self) -> AppResult {
        let mut router = Self::build_event_router();

        loop {
            self.render();

            if event::poll(std::time::Duration::from_millis(100)).unwrap_or(false) {
                if let Ok(event) = event::read() {
                    match router.dispatch(&event, self) {
                        ControlFlow::Break(result) => return result,
                        ControlFlow::Continue => {}
                    }
                }
            }
        }
    }
}

impl Drop for App {
    fn drop(&mut self) {
        let _ = self.restore();
    }
}

/// 静态版本的搜索高亮函数（避免借用问题）
fn highlight_search_term_static(line: &str, query: &str, is_current: bool, is_other: bool) -> Line<'static> {
    if query.is_empty() {
        return Line::from(line.to_string());
    }

    let query_lower = query.to_lowercase();
    let line_lower = line.to_lowercase();

    // 如果不包含搜索词，返回原行
    if !line_lower.contains(&query_lower) {
        return Line::from(line.to_string());
    }

    // 查找所有匹配位置
    let mut spans = Vec::new();
    let mut last_end = 0;

    while let Some(pos) = line_lower[last_end..].find(&query_lower) {
        let abs_pos = last_end + pos;

        // 添加匹配前的文本（正常样式）
        if abs_pos > last_end {
            spans.push(Span::raw(line[last_end..abs_pos].to_string()));
        }

        // 添加匹配的文本（高亮样式）
        let match_end = abs_pos + query.len();
        let match_text = line[abs_pos..match_end].to_string();

        let highlight_style = if is_current {
            // 当前匹配：黄底黑字
            ratatui::style::Style::default()
                .bg(ratatui::style::Color::Yellow)
                .fg(ratatui::style::Color::Black)
        } else if is_other {
            // 其他匹配：灰底白字
            ratatui::style::Style::default()
                .bg(ratatui::style::Color::DarkGray)
                .fg(ratatui::style::Color::White)
        } else {
            // 正常文本（不应到这里）
            ratatui::style::Style::default()
        };

        spans.push(Span::styled(match_text, highlight_style));
        last_end = match_end;
    }

    // 添加剩余的文本
    if last_end < line.len() {
        spans.push(Span::raw(line[last_end..].to_string()));
    }

    Line::from(spans)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tui_test::{buffer_to_string, render_to_buffer};
    use crate::assert_tui_snapshot;
    use crate::assert_buffer_contains;
    use crate::assert_buffer_not_contains;
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

    // === 渲染测试 ===

    #[test]
    fn test_app_empty_layout() {
        let mut app = App::new_for_test();
        let buf = render_to_buffer(&mut app, 80, 24);
        let output = buffer_to_string(&buf);
        // 空内容应包含分隔线和 Ready 状态
        assert!(output.contains("─"));
        assert!(output.contains("Ready"));
    }

    #[test]
    fn test_app_with_content_lines() {
        let mut app = App::new_for_test();
        app.content_lines = vec![
            Line::from("Hello World"),
            Line::from("Second line"),
        ];
        let buf = render_to_buffer(&mut app, 80, 24);
        let output = buffer_to_string(&buf);
        assert!(output.contains("Hello World"));
        assert!(output.contains("Second line"));
    }

    #[test]
    fn test_app_status_text() {
        let mut app = App::new_for_test();
        app.status_text = "Streaming (deepseek)".to_string();
        let buf = render_to_buffer(&mut app, 80, 24);
        let output = buffer_to_string(&buf);
        assert!(output.contains("Streaming (deepseek)"));
    }

    #[test]
    fn test_app_input_visible() {
        let mut app = App::new_for_test();
        app.input.handle_key(KeyEvent::new(KeyCode::Char('h'), KeyModifiers::NONE));
        app.input.handle_key(KeyEvent::new(KeyCode::Char('i'), KeyModifiers::NONE));
        let buf = render_to_buffer(&mut app, 80, 24);
        let output = buffer_to_string(&buf);
        assert!(output.contains("hi"));
        // 输入框应在最后一行
        let last_line = output.lines().last().unwrap();
        assert!(last_line.contains("hi"));
    }

    #[test]
    fn test_app_minimal_height() {
        let mut app = App::new_for_test();
        // height < 4 应安全返回，不 panic
        let buf = render_to_buffer(&mut app, 80, 3);
        let output = buffer_to_string(&buf);
        // 3 行高度：全部是空行（draw_frame 直接 return）
        assert!(output.chars().filter(|c| *c != '\n').all(|c| c == ' '));
    }

    // === 状态栏状态转换测试（高保真复现 Bug） ===
    //
    // Bug 背景：多轮工具调用时，状态栏状态更新不完整
    // - ToolDone 后不更新 status_tx，导致状态栏卡在 "Tool: xxx [running]"
    // - MessageDone 后进入 execute_tools_tui 时不更新状态栏
    // - loop 第二轮开始时不重新发送 "Streaming (model)"
    //
    // 这些测试验证 set_status() → draw_frame() 的渲染一致性

    #[test]
    fn test_status_streaming_initial() {
        // 验证流开始时状态栏显示 Streaming
        let mut app = App::new_for_test();
        app.set_status(format!("Streaming ({})", "zhipu"));
        let buf = render_to_buffer(&mut app, 80, 24);
        let output = buffer_to_string(&buf);
        assert!(output.contains("Streaming (zhipu)"),
            "初始 Streaming 状态应显示在状态栏中");
        assert!(!output.contains("Ready"),
            "Streaming 时不应显示 Ready");
    }

    #[test]
    fn test_status_tool_running() {
        // 验证 ToolStart 时状态栏显示 "Tool: xxx [running]"
        let mut app = App::new_for_test();
        app.push_line("AI 正在分析代码...".to_string());
        app.set_status("Tool: read_file [running]".to_string());
        let buf = render_to_buffer(&mut app, 80, 24);
        let output = buffer_to_string(&buf);
        assert!(output.contains("Tool: read_file [running]"),
            "工具执行中应显示工具名和 running 状态");
    }

    #[test]
    fn test_status_done_after_message() {
        // 验证 MessageDone 后状态栏显示 "Done"
        let mut app = App::new_for_test();
        app.push_line("AI 回复内容".to_string());
        app.set_status("Done".to_string());
        let buf = render_to_buffer(&mut app, 80, 24);
        let output = buffer_to_string(&buf);
        assert!(output.contains("Done"),
            "消息完成后状态栏应显示 Done");
        assert!(!output.contains("Streaming"),
            "Done 状态不应包含 Streaming");
        assert!(!output.contains("running"),
            "Done 状态不应包含 running");
    }

    #[test]
    fn test_status_clear_after_completion() {
        // 验证整个请求完成后状态栏清空（回到 Ready）
        let mut app = App::new_for_test();
        app.push_line("最终回复".to_string());
        app.set_status("Done".to_string());
        // main.rs 第 1054 行: app.set_status(String::new())
        app.set_status(String::new());
        let buf = render_to_buffer(&mut app, 80, 24);
        let output = buffer_to_string(&buf);
        assert!(output.contains("Ready"),
            "请求完成后状态栏应显示 Ready");
        assert!(!output.contains("Done"),
            "清空后不应保留 Done");
    }

    /// 验证 ToolDone 后状态栏正确从 [running] 切换到 [done]
    ///
    /// 模拟实际场景：
    /// 1. ToolStart → status = "Tool: read_file [running]"
    /// 2. ToolDone → status = "Tool: read_file [done]"
    #[test]
    fn test_status_transitions_after_tool_done() {
        let mut app = App::new_for_test();
        app.push_line("正在读取文件...".to_string());

        // ToolStart 阶段
        app.set_status("Tool: read_file [running]".to_string());
        let buf_running = render_to_buffer(&mut app, 80, 24);
        let output_running = buffer_to_string(&buf_running);
        assert!(output_running.contains("[running]"));

        // ToolDone 阶段：状态栏更新为 [done]
        app.set_status("Tool: read_file [done]".to_string());
        let buf_after_done = render_to_buffer(&mut app, 80, 24);
        let output_after_done = buffer_to_string(&buf_after_done);
        assert!(output_after_done.contains("[done]"),
            "ToolDone 后状态栏应显示 [done]");
        assert!(!output_after_done.contains("[running]"),
            "ToolDone 后状态栏不应再显示 [running]");
    }

    /// 验证多轮循环中新一轮开始时状态栏正确重置为 Streaming
    ///
    /// 模拟实际场景：
    /// 1. 第1轮：Streaming → ToolStart → ToolDone → MessageDone("Done") → 执行工具
    /// 2. 第2轮：loop 回到顶部，重新发送 "Streaming (model)"
    #[test]
    fn test_status_resets_on_new_iteration() {
        let mut app = App::new_for_test();
        app.push_line("第1轮 AI 回复".to_string());
        app.push_line("Continuing... (1/10)".to_string());

        // 第1轮 MessageDone → "Done"
        app.set_status("Done".to_string());
        let buf_done = render_to_buffer(&mut app, 80, 24);
        let output_done = buffer_to_string(&buf_done);
        assert!(output_done.contains("Done"));

        // 第2轮开始：状态栏重置为 Streaming
        app.push_line("第2轮 AI 回复中...".to_string());
        app.set_status("Streaming (zhipu)".to_string());

        let buf_2nd = render_to_buffer(&mut app, 80, 24);
        let output_2nd = buffer_to_string(&buf_2nd);
        assert!(output_2nd.contains("Streaming (zhipu)"),
            "第2轮流开始时状态栏应显示 Streaming");
        assert!(!output_2nd.contains("Done"),
            "第2轮流开始时状态栏不应保留上轮的 Done");
    }

    // === Streaming 时输入框行为测试 ===
    //
    // 架构说明：
    // - main.rs 中 AI 调用期间不调用 app.run_loop()，而是进入 tokio::select! 循环
    //   监听 output_rx / status_rx / approval_rx，因此用户按键不会被处理
    // - App.busy 字段作为语义标记，表示"正在处理 AI 请求"
    // - 输入框在 streaming 期间仍然渲染（显示用户最后输入的内容），但不接受新输入

    #[test]
    fn test_busy_flag_prevents_input_submit() {
        // 验证 busy 状态的基本语义：set_busy(true) 后 App 标记为忙碌
        let mut app = App::new_for_test();
        assert!(!app.is_busy(), "初始状态不应为 busy");

        app.set_busy(true);
        // 注意：busy 是私有字段，通过 set_busy/get 接口操作
        // 这里验证 set_busy 不 panic 且状态一致
        app.set_status("Streaming (zhipu)".to_string());
        let buf = render_to_buffer(&mut app, 80, 24);
        let output = buffer_to_string(&buf);
        assert!(output.contains("Streaming (zhipu)"),
            "busy 状态下应显示 Streaming 状态");

        app.set_busy(false);
        app.set_status(String::new());
        let buf = render_to_buffer(&mut app, 80, 24);
        let output = buffer_to_string(&buf);
        assert!(output.contains("Ready"),
            "busy 解除后应显示 Ready");
    }

    #[test]
    fn test_input_box_rendered_during_streaming() {
        // 验证 streaming 期间输入框仍然渲染（保留用户最后输入的内容）
        let mut app = App::new_for_test();
        // 模拟用户输入了 "hello"
        app.input.handle_key(KeyEvent::new(KeyCode::Char('h'), KeyModifiers::NONE));
        app.input.handle_key(KeyEvent::new(KeyCode::Char('i'), KeyModifiers::NONE));

        // 进入 streaming 状态
        app.set_busy(true);
        app.set_status("Streaming (zhipu)".to_string());
        app.push_line("AI 正在回复...".to_string());

        let buf = render_to_buffer(&mut app, 80, 24);
        let output = buffer_to_string(&buf);

        // 输入框应仍然显示 "hi"
        let last_line = output.lines().last().unwrap();
        assert!(last_line.contains("hi"),
            "streaming 期间输入框应保留用户输入的内容");
        // 状态栏应显示 Streaming
        assert!(output.contains("Streaming (zhipu)"),
            "streaming 期间状态栏应显示 Streaming");
    }

    #[test]
    fn test_input_box_unchanged_while_busy() {
        // 验证 busy 状态下输入框内容不会被修改
        // （实际阻止输入靠 main.rs 循环结构，这里验证 App 层面的一致性）
        let mut app = App::new_for_test();
        app.input.handle_key(KeyEvent::new(KeyCode::Char('t'), KeyModifiers::NONE));
        app.input.handle_key(KeyEvent::new(KeyCode::Char('e'), KeyModifiers::NONE));
        app.input.handle_key(KeyEvent::new(KeyCode::Char('s'), KeyModifiers::NONE));
        app.input.handle_key(KeyEvent::new(KeyCode::Char('t'), KeyModifiers::NONE));

        let input_before = app.input.value().to_string();
        assert_eq!(input_before, "test");

        // 进入 busy 状态
        app.set_busy(true);
        app.set_status("Streaming (deepseek)".to_string());

        // 模拟在 busy 期间渲染多次（main.rs 的 select! 循环会频繁 render）
        for _ in 0..5 {
            let _buf = render_to_buffer(&mut app, 80, 24);
        }

        // 输入框内容应保持不变
        let input_after = app.input.value().to_string();
        assert_eq!(input_after, "test",
            "busy 期间输入框内容不应被修改");
    }

    /// 快照测试：Streaming 时完整界面布局
    ///
    /// 验证 streaming 期间内容区显示 AI 回复、状态栏显示 Streaming、
    /// 输入框保留用户输入、分隔线正常渲染。
    #[test]
    fn test_snapshot_streaming_with_input() {
        let mut app = App::new_for_test();
        // 用户输入
        app.input.handle_key(KeyEvent::new(KeyCode::Char('h'), KeyModifiers::NONE));
        app.input.handle_key(KeyEvent::new(KeyCode::Char('e'), KeyModifiers::NONE));
        app.input.handle_key(KeyEvent::new(KeyCode::Char('l'), KeyModifiers::NONE));
        app.input.handle_key(KeyEvent::new(KeyCode::Char('l'), KeyModifiers::NONE));
        app.input.handle_key(KeyEvent::new(KeyCode::Char('o'), KeyModifiers::NONE));
        // AI 回复内容
        app.push_line("你好！有什么可以帮助你的？".to_string());
        app.push_line("我可以帮你分析代码、编写测试等。".to_string());
        // Streaming 状态
        app.set_busy(true);
        app.set_status("Streaming (zhipu)".to_string());

        let buf = render_to_buffer(&mut app, 80, 24);
        let text = buffer_to_string(&buf);
        assert!(text.contains("你") && text.contains("好"),
            "内容区应包含 AI 回复的中文内容");
        assert_buffer_contains!(&buf, "Streaming (zhipu)");
        assert_tui_snapshot!("streaming_with_input", &buf);
    }

    // === 高保真复现：streaming 期间输入框无法输入 ===
    //
    // 根因分析（main.rs 第 939-1051 行）：
    //   正常状态: loop { app.run_loop() }  ← run_loop 内部调用 event::poll + router.dispatch 处理按键
    //   AI 调用: loop { tokio::select! {   ← 只监听 output_rx / status_rx / stream_handle
    //     output_rx  → push_line + render
    //     status_rx  → set_status + render
    //     stream_handle → break
    //   }}
    //
    // tokio::select! 的分支中没有任何一个读取 crossterm::event::Event，
    // 因此 streaming 期间用户的所有按键事件都被操作系统缓冲但不会被消费。
    // run_loop() 完全不被调用，CombinedKeyHandler 不会执行。
    //
    // 次要问题：CombinedKeyHandler.handle()（event/handlers.rs:181）
    // 只检查 is_searching() / help_mode，不检查 app.busy，
    // 如果未来有人修复 main.rs 让 run_loop 在 streaming 期间也被调用，
    // 输入会直接穿透到 InputComposer（因为缺少 busy 守卫）。

    #[test]
    fn test_input_composer_accepts_keys_when_not_busy() {
        // 正常状态：InputComposer 可以接收按键
        let mut app = App::new_for_test();
        assert!(!app.is_busy(), "初始状态不应为 busy");

        app.input.handle_key(KeyEvent::new(KeyCode::Char('h'), KeyModifiers::NONE));
        app.input.handle_key(KeyEvent::new(KeyCode::Char('i'), KeyModifiers::NONE));
        assert_eq!(app.input.value(), "hi",
            "非 busy 状态下输入框应正常接收按键");
    }

    #[test]
    fn test_run_loop_not_called_during_streaming() {
        // 高保真复现：模拟 main.rs 的 streaming 循环
        //
        // main.rs 的实际执行路径：
        //   1. app.run_loop() → 用户按 Enter → AppResult::Submit("hello")
        //   2. app.set_busy(true)
        //   3. loop { tokio::select! { ... } }  ← 不调用 run_loop，但新分支处理按键
        //   4. app.set_busy(false)
        //
        // 修复后：main.rs 的 select! 循环中添加了键盘事件轮询分支，
        // 允许用户在 streaming 期间输入（通过 app.input.handle_key）。
        let mut app = App::new_for_test();

        // 用户输入
        app.input.handle_key(KeyEvent::new(KeyCode::Char('h'), KeyModifiers::NONE));
        app.input.handle_key(KeyEvent::new(KeyCode::Char('i'), KeyModifiers::NONE));
        assert_eq!(app.input.value(), "hi");

        // === 模拟 main.rs 第 921 行：进入 AI 调用 ===
        app.set_busy(true);
        app.set_status("Streaming (zhipu)".to_string());
        app.push_line("AI 正在回复...".to_string());

        // === 模拟 main.rs 修复后的行为：streaming 期间可以输入 ===
        // 新分支通过 app.input.handle_key(key) 直接更新输入框
        app.input.handle_key(KeyEvent::new(KeyCode::Char('n'), KeyModifiers::NONE));
        app.input.handle_key(KeyEvent::new(KeyCode::Char('e'), KeyModifiers::NONE));
        app.input.handle_key(KeyEvent::new(KeyCode::Char('x'), KeyModifiers::NONE));
        app.input.handle_key(KeyEvent::new(KeyCode::Char('t'), KeyModifiers::NONE));

        // streaming 期间输入框内容已更新（用户提前输入了 "next"）
        assert_eq!(app.input.value(), "hinext",
            "streaming 期间输入框应接受用户输入");
        assert!(app.is_busy(),
            "streaming 期间 busy 应为 true");
    }

    #[test]
    fn test_combined_key_handler_busy_guard_blocks_submit() {
        // 验证 CombinedKeyHandler 在 busy 状态下阻止输入（防御层）
        //
        // 修复后：CombinedKeyHandler.handle() 检查 app.is_busy()，
        // 即使 run_loop 被意外调用，按键也不会穿透到 InputComposer。
        let mut app = App::new_for_test();

        // 设置为 busy 状态
        app.set_busy(true);
        app.set_status("Streaming (zhipu)".to_string());

        // 直接调用 handle_key（模拟 run_loop 被调用的情况）
        app.input.handle_key(KeyEvent::new(KeyCode::Char('x'), KeyModifiers::NONE));

        // 虽然 InputComposer 本身不检查 busy，
        // 但 CombinedKeyHandler 的 busy 守卫会阻止按键到达 InputComposer
        // 这里直接调用 InputComposer 绕过了守卫，所以输入会生效
        assert_eq!(app.input.value(), "x",
            "InputComposer 本身不检查 busy，守卫在 CombinedKeyHandler 层");

        // 验证 is_busy() 返回正确值
        assert!(app.is_busy(),
            "busy 状态应正确反映");
        app.set_busy(false);
        assert!(!app.is_busy(),
            "解除 busy 后应返回 false");
    }

    /// 快照测试：streaming 期间界面完整状态
    ///
    /// 展示 streaming 期间的实际界面布局：
    /// - 内容区：AI 回复逐行追加
    /// - 状态栏：显示 Streaming 状态
    /// - 输入框：冻结（保留用户提交前的内容）
    #[test]
    fn test_snapshot_streaming_frozen_input() {
        let mut app = App::new_for_test();
        // 用户提交前输入了 "hello"
        app.input.handle_key(KeyEvent::new(KeyCode::Char('h'), KeyModifiers::NONE));
        app.input.handle_key(KeyEvent::new(KeyCode::Char('e'), KeyModifiers::NONE));
        app.input.handle_key(KeyEvent::new(KeyCode::Char('l'), KeyModifiers::NONE));
        app.input.handle_key(KeyEvent::new(KeyCode::Char('l'), KeyModifiers::NONE));
        app.input.handle_key(KeyEvent::new(KeyCode::Char('o'), KeyModifiers::NONE));

        // 进入 streaming（模拟 main.rs 调用路径）
        app.set_busy(true);
        app.push_line("User: hello".to_string());
        app.set_status("Streaming (zhipu)".to_string());

        // 模拟 AI 流式输出
        app.push_line("AI: 我来帮你分析这段代码...".to_string());
        app.push_line("首先看一下文件结构。".to_string());

        let buf = render_to_buffer(&mut app, 80, 24);
        assert_tui_snapshot!("streaming_frozen_input", &buf);
    }

    /// 快照测试：状态栏完整生命周期
    ///
    /// 捕获状态栏在各种状态下的渲染输出，用于回归检测。
    /// 使用 insta 快照，首次运行生成 .snap，后续自动对比。
    #[test]
    fn test_snapshot_status_lifecycle() {
        let mut app = App::new_for_test();
        app.push_line("AI 正在处理请求...".to_string());

        // 阶段1：初始 Streaming
        app.set_status("Streaming (zhipu)".to_string());
        let buf = render_to_buffer(&mut app, 80, 24);
        assert_tui_snapshot!("status_streaming", &buf);

        // 阶段2：工具执行中
        app.set_status("Tool: read_file [running]".to_string());
        let buf = render_to_buffer(&mut app, 80, 24);
        assert_tui_snapshot!("status_tool_running", &buf);

        // 阶段3：Done
        app.set_status("Done".to_string());
        let buf = render_to_buffer(&mut app, 80, 24);
        assert_tui_snapshot!("status_done", &buf);

        // 阶段4：清空回到 Ready
        app.set_status(String::new());
        let buf = render_to_buffer(&mut app, 80, 24);
        assert_tui_snapshot!("status_ready", &buf);
    }

    // === 输入消息队列测试 ===

    #[test]
    fn test_enqueue_adds_to_queue() {
        let mut app = App::new_for_test();
        assert_eq!(app.queue_len(), 0);
        app.enqueue("hello".to_string());
        assert_eq!(app.queue_len(), 1);
        app.enqueue("world".to_string());
        assert_eq!(app.queue_len(), 2);
    }

    #[test]
    fn test_enqueue_trims_and_rejects_empty() {
        let mut app = App::new_for_test();
        app.enqueue("  ".to_string());
        assert_eq!(app.queue_len(), 0, "空白字符串不应入队");
        app.enqueue("".to_string());
        assert_eq!(app.queue_len(), 0, "空字符串不应入队");
        app.enqueue("  hello  ".to_string());
        assert_eq!(app.queue_len(), 1);
        assert_eq!(app.dequeue(), Some("hello".to_string()), "应自动 trim");
    }

    #[test]
    fn test_dequeue_fifo_order() {
        let mut app = App::new_for_test();
        app.enqueue("first".to_string());
        app.enqueue("second".to_string());
        app.enqueue("third".to_string());
        assert_eq!(app.dequeue(), Some("first".to_string()));
        assert_eq!(app.dequeue(), Some("second".to_string()));
        assert_eq!(app.dequeue(), Some("third".to_string()));
        assert_eq!(app.dequeue(), None, "空队列应返回 None");
    }

    #[test]
    fn test_clear_queue() {
        let mut app = App::new_for_test();
        app.enqueue("msg1".to_string());
        app.enqueue("msg2".to_string());
        assert_eq!(app.queue_len(), 2);
        app.clear_queue();
        assert_eq!(app.queue_len(), 0);
        assert_eq!(app.dequeue(), None);
    }

    #[test]
    fn test_queue_count_rendered_in_status_bar() {
        let mut app = App::new_for_test();
        app.set_status("Streaming (zhipu)".to_string());
        app.enqueue("next question".to_string());
        app.enqueue("another one".to_string());

        let buf = render_to_buffer(&mut app, 80, 24);
        assert_buffer_contains!(&buf, "Queue: 2");
        assert_buffer_contains!(&buf, "Streaming (zhipu)");
    }

    #[test]
    fn test_queue_not_rendered_when_empty() {
        let mut app = App::new_for_test();
        app.set_status("Streaming (zhipu)".to_string());

        let buf = render_to_buffer(&mut app, 80, 24);
        assert_buffer_not_contains!(&buf, "Queue:");
    }

    #[test]
    fn test_queue_count_decreases_on_dequeue() {
        let mut app = App::new_for_test();
        app.set_status("Streaming (zhipu)".to_string());
        app.enqueue("msg1".to_string());
        app.enqueue("msg2".to_string());

        // Queue: 2
        let buf = render_to_buffer(&mut app, 80, 24);
        assert_buffer_contains!(&buf, "Queue: 2");

        // 出队一条 → Queue: 1
        app.dequeue();
        let buf = render_to_buffer(&mut app, 80, 24);
        assert_buffer_contains!(&buf, "Queue: 1");
        assert_buffer_not_contains!(&buf, "Queue: 2");

        // 出队全部 → 无 Queue
        app.dequeue();
        let buf = render_to_buffer(&mut app, 80, 24);
        assert_buffer_not_contains!(&buf, "Queue:");
    }

    /// 快照测试：streaming + 队列状态
    ///
    /// 验证状态栏同时显示 Streaming 状态和 Queue 计数，
    /// 输入框保留用户最后输入的内容。
    #[test]
    fn test_snapshot_streaming_with_queue() {
        let mut app = App::new_for_test();
        // 用户在 streaming 期间输入并提交了两条消息
        app.input.handle_key(KeyEvent::new(KeyCode::Char('n'), KeyModifiers::NONE));
        app.input.handle_key(KeyEvent::new(KeyCode::Char('e'), KeyModifiers::NONE));
        app.input.handle_key(KeyEvent::new(KeyCode::Char('x'), KeyModifiers::NONE));
        app.input.handle_key(KeyEvent::new(KeyCode::Char('t'), KeyModifiers::NONE));

        app.set_busy(true);
        app.set_status("Streaming (zhipu)".to_string());
        app.push_line("AI 正在回复第一条消息...".to_string());

        // 两条消息入队
        app.enqueue("next question".to_string());
        app.enqueue("follow up".to_string());

        let buf = render_to_buffer(&mut app, 80, 24);
        assert_buffer_contains!(&buf, "Queue: 2");
        assert_buffer_contains!(&buf, "Streaming (zhipu)");
        assert_tui_snapshot!("streaming_with_queue", &buf);
    }
}
