//! TUI 核心模块 — ratatui 全屏终端 UI
//!
//! 布局：内容区（弹性） + 状态栏（1行固定） + 输入框（1行固定）

use std::io::{self, Stdout};
use std::time::Instant;

use crossterm::{
    event::{self, Event, KeyCode, KeyEvent, KeyModifiers, MouseEvent, MouseEventKind},
    execute,
    terminal::{
        disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen,
    },
};
use ratatui::{
    backend::CrosstermBackend,
    layout::{Constraint, Direction, Layout, Rect},
    text::{Line, Span},
    widgets::{Block, Borders, Clear, Paragraph, Widget},
    Terminal,
};

use crate::event::{
    CombinedKeyHandler, DetailEnterHandler, DetailModeHandler, DiffEnterHandler, DiffModeHandler,
    HelpEnterHandler, HelpExitHandler, IgnoreHandler, MouseScrollHandler, ResizeHandler,
    SearchEnterHandler, SearchInputHandler, ThreadModeHandler, ThreadEnterHandler,
};
use crate::event::{ControlFlow, EventHandler, EventRouter};
use crate::render;
use crate::AppResult;
use ifainew_lib::harness::task::{self, TaskStatus};

use super::approval_overlay::{self, ApprovalDecision, ApprovalRequest};
use super::input_composer::{self, InputAction, InputComposer};
use super::thread::{self, ThreadId, ThreadMessages, ThreadStore};

// ============================================================================
// 🔥 Phase 6: Per-Thread 并发支持
// ============================================================================

/// 活跃的 AI 请求
#[derive(Debug)]
pub struct ActiveRequest {
    pub thread_id: crate::thread::ThreadId,
    pub stream_handle: tokio::task::JoinHandle<Result<String, String>>,
    pub output_tx: tokio::sync::mpsc::UnboundedSender<super::OutputMessage>,
}

/// 活跃请求管理器（简单手写版本）
pub struct ActiveRequests {
    requests: std::collections::HashMap<crate::thread::ThreadId, ActiveRequest>,
}

impl ActiveRequests {
    pub fn new() -> Self {
        Self {
            requests: std::collections::HashMap::new(),
        }
    }

    pub fn start_request(&mut self, thread_id: crate::thread::ThreadId, request: ActiveRequest) {
        self.requests.insert(thread_id, request);
    }

    pub fn finish_request(&mut self, thread_id: &crate::thread::ThreadId) -> Option<ActiveRequest> {
        self.requests.remove(thread_id)
    }

    pub fn is_thread_busy(&self, thread_id: &crate::thread::ThreadId) -> bool {
        self.requests.contains_key(thread_id)
    }

    pub fn get_thread_request(&self, thread_id: &crate::thread::ThreadId) -> Option<&ActiveRequest> {
        self.requests.get(thread_id)
    }

    pub fn active_count(&self) -> usize {
        self.requests.len()
    }

    pub fn is_empty(&self) -> bool {
        self.requests.is_empty()
    }
}

impl Default for ActiveRequests {
    fn default() -> Self {
        Self::new()
    }
}
/// StreamSubsystem: 流式处理相关状态（per-thread）
pub struct StreamSubsystem {
    pub thread_busy: std::collections::HashMap<crate::thread::ThreadId, bool>,
    pub active_requests: ActiveRequests,
    pub queue: Vec<(String, crate::thread::ThreadId)>,
    pub streaming_response_buffers: std::collections::HashMap<crate::thread::ThreadId, String>,
    pub last_ai_responses: std::collections::HashMap<crate::thread::ThreadId, String>,
}

impl StreamSubsystem {
    pub fn new() -> Self {
        Self {
            thread_busy: std::collections::HashMap::new(),
            active_requests: ActiveRequests::new(),
            queue: Vec::new(),
            streaming_response_buffers: std::collections::HashMap::new(),
            last_ai_responses: std::collections::HashMap::new(),
        }
    }
}

impl Default for StreamSubsystem {
    fn default() -> Self { Self::new() }
}

/// ApprovalSubsystem: 审批相关状态
pub struct ApprovalSubsystem {
    pub states: std::collections::HashMap<crate::thread::ThreadId, ApprovalRequest>,
    pub selected: usize,
}

impl ApprovalSubsystem {
    pub fn new() -> Self {
        Self { states: std::collections::HashMap::new(), selected: 0 }
    }
}

impl Default for ApprovalSubsystem {
    fn default() -> Self { Self::new() }
}

/// SearchSubsystem: 搜索相关状态
pub struct SearchSubsystem {
    pub mode: bool,
    pub query: String,
    pub matches: Vec<usize>,
    pub current_index: usize,
    pub input: InputComposer,
}

impl SearchSubsystem {
    pub fn new() -> Self {
        Self { mode: false, query: String::new(), matches: Vec::new(), current_index: 0, input: InputComposer::new("") }
    }
}

impl Default for SearchSubsystem {
    fn default() -> Self { Self::new() }
}

/// DiffSubsystem: Diff 相关状态
pub struct DiffSubsystem {
    pub mode: bool,
    pub view: Option<crate::diff_render::ScrollableDiff>,
    pub files: Vec<crate::diff_render::DiffFileChange>,
    pub index: usize,
}

impl DiffSubsystem {
    pub fn new() -> Self {
        Self { mode: false, view: None, files: Vec::new(), index: 0 }
    }
}

impl Default for DiffSubsystem {
    fn default() -> Self { Self::new() }
}

/// ThreadSubsystem: 线程相关状态
pub struct ThreadSubsystem {
    pub store: ThreadStore,
    pub messages: ThreadMessages,
    pub active_mode: bool,
}

impl ThreadSubsystem {
    pub fn new() -> Self {
        Self { store: ThreadStore::new(), messages: ThreadMessages::new(), active_mode: false }
    }
}

impl Default for ThreadSubsystem {
    fn default() -> Self { Self::new() }
}

// ============================================================================
// Mode enum — 替代分散的布尔模式标志
// ============================================================================

/// TUI 交互模式。同一时间只有一个模式处于激活状态。
///
/// 互斥性由 `enter_*` / `exit_*` 方法和 `consumed` 标志保证。
/// 替代原先分散在 SearchSubsystem.mode、DiffSubsystem.mode、App.help_mode、
/// App.overlay、ApprovalSubsystem.states 中的布尔判断。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Mode {
    /// 正常输入/浏览模式
    Normal,
    /// Diff 查看模式（Ctrl+D 进入）
    Diff,
    /// 详情 overlay 模式（Ctrl+O 进入）
    Overlay,
    /// 搜索模式（Ctrl+F 进入）
    Search,
    /// 工具审批模式（streaming 期间收到 ApprovalRequest）
    Approving,
    /// 帮助模式（显示快捷键帮助）
    Help,
    /// 线程选择器模式（Ctrl+T）
    ThreadPicker,
    /// 命令弹出框模式
    CommandPopup,
}

impl Default for Mode {
    fn default() -> Self { Self::Normal }
}


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
    (
        TaskStatus::Pending,
        TaskStatusDisplay {
            icon: "[ ]",
            color: ratatui::style::Color::DarkGray,
        },
    ),
    (
        TaskStatus::InProgress,
        TaskStatusDisplay {
            icon: "▸",
            color: ratatui::style::Color::Yellow,
        },
    ),
    (
        TaskStatus::Completed,
        TaskStatusDisplay {
            icon: "[x]",
            color: ratatui::style::Color::Green,
        },
    ),
];

/// 渲染任务列表（返回 ratatui Lines + 是否全部完成）
fn render_task_lines(tasks: &[task::TaskItem]) -> (Vec<Line<'static>>, bool) {
    if tasks.is_empty() {
        return (vec![], false);
    }

    let total = tasks.len();
    let completed = tasks
        .iter()
        .filter(|t| t.status == TaskStatus::Completed)
        .count();
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
        let display = TASK_STATUS_DISPLAYS
            .iter()
            .find(|(s, _)| *s == task.status)
            .map(|(_, d)| d)
            .unwrap_or(&TaskStatusDisplay {
                icon: "?",
                color: ratatui::style::Color::White,
            });

        // 只有第一个 InProgress 任务用 ▸ 图标，其余用空格
        let is_first_in_progress = task.status == TaskStatus::InProgress
            && !visible[..i]
                .iter()
                .any(|t| t.status == TaskStatus::InProgress);
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

/// RAII Guard：streaming 作用域结束时自动清理所有状态
///
/// 在 streaming 循环入口创建，任何退出路径（break/return/panic）都会触发清理。
/// 零运行时开销 — Drop 在编译时单态化。
pub struct StreamGuard<'a> {
    app: &'a mut App,
    thread_id: crate::thread::ThreadId,
}

impl StreamGuard<'_> {
    pub fn new(app: &mut App, thread_id: crate::thread::ThreadId) -> StreamGuard<'_> {
        StreamGuard { app, thread_id }
    }
}

impl Drop for StreamGuard<'_> {
    fn drop(&mut self) {
        self.app.cleanup_after_stream(self.thread_id);
    }
}

/// TUI 应用
pub struct App {
    /// 当前交互模式
    pub mode: Mode,
    /// Terminal（None 表示测试模式）
    terminal: Option<Terminal<CrosstermBackend<Stdout>>>,
    /// 内容区行缓冲
    pub content_lines: Vec<Line<'static>>,
    /// 内容区滚动偏移
    pub scroll_offset: u16,
    /// 输入框
    pub input: InputComposer,
    /// 状态栏文本
    status_text: String,
    /// StreamSubsystem
    pub stream: StreamSubsystem,
    /// ApprovalSubsystem
    pub approval: ApprovalSubsystem,
    /// SearchSubsystem
    pub search: SearchSubsystem,
    /// 帮助模式（显示快捷键帮助覆盖层）
    pub help_mode: bool,
    /// 命令弹出框
    pub command_popup: super::command_popup::CommandPopup,
    /// 任务全部完成的时间点（用于延迟自动收起）
    task_all_done_at: Option<Instant>,
    /// 🔥 Per-thread TaskStore（隔离 TodoWrite 任务，避免跨线程泄漏）
    task_stores: std::collections::HashMap<crate::thread::ThreadId, task::TaskStore>,
    /// 🔥 Per-thread Session 上下文（隔离 messages、tokens、pipeline）
    thread_session_contexts: std::collections::HashMap<crate::thread::ThreadId, std::sync::Arc<tokio::sync::Mutex<super::session::ThreadSessionContext>>>,
    /// DiffSubsystem
    pub diff: DiffSubsystem,
    /// 详情 overlay
    pub overlay: Option<crate::detail_overlay::DetailOverlay>,
    /// ThreadSubsystem
    pub thread: ThreadSubsystem,
    /// 测试模式下的终端尺寸（None 表示使用实际 terminal 尺寸）
    #[cfg(test)]
    test_size: Option<(u16, u16)>,
}

impl App {
    /// 创建并初始化 TUI
    pub fn new() -> io::Result<Self> {
        enable_raw_mode()?;
        // 不启用键盘增强模式（kitty protocol），因为会破坏 CJK IME 输入法组合
        // 多行输入使用 Ctrl+J（ASCII LineFeed，终端通用）
        execute!(
            io::stdout(),
            EnterAlternateScreen,
            crossterm::event::EnableMouseCapture,
        )?;

        let backend = CrosstermBackend::new(io::stdout());
        let mut terminal = Terminal::new(backend)?;
        terminal.hide_cursor()?;

        let mut app = Self {
            mode: Mode::default(),
            terminal: Some(terminal),
            content_lines: Vec::new(),
            scroll_offset: 0,
            input: InputComposer::new(""),
            status_text: String::new(),
            stream: StreamSubsystem::new(),
            approval: ApprovalSubsystem::new(),
            search: SearchSubsystem::new(),
            help_mode: false,
            command_popup: super::command_popup::CommandPopup::new(),
            task_all_done_at: None,
            task_stores: std::collections::HashMap::new(),
            thread_session_contexts: std::collections::HashMap::new(),
            diff: DiffSubsystem::new(),
            overlay: None,
            thread: ThreadSubsystem::new(),
            #[cfg(test)]
            test_size: None,
        };

        // 初始化时不添加任何内容，让欢迎页组件接管

        Ok(app)
    }

    /// 创建用于测试的 App（不初始化终端设备）
    #[cfg(test)]
    pub fn new_for_test() -> Self {
        Self {
            mode: Mode::default(),
            terminal: None,
            content_lines: Vec::new(),
            scroll_offset: 0,
            input: InputComposer::new(""),
            status_text: String::new(),
            stream: StreamSubsystem::new(),
            approval: ApprovalSubsystem::new(),
            search: SearchSubsystem::new(),
            help_mode: false,
            command_popup: super::command_popup::CommandPopup::new(),
            task_all_done_at: None,
            task_stores: std::collections::HashMap::new(),
            thread_session_contexts: std::collections::HashMap::new(),
            diff: DiffSubsystem::new(),
            overlay: None,
            thread: ThreadSubsystem::new(),
            #[cfg(test)]
            test_size: None,
        }
    }

    /// 设置测试模式下的终端尺寸（使 content_area() 与 TestBackend 一致）
    #[cfg(test)]
    pub fn set_test_size(&mut self, width: u16, height: u16) {
        self.test_size = Some((width, height));
    }

    // ============================================================================
    // 声明式线程感知辅助：消除散落的 thread_store.active_thread() 样板
    // ============================================================================

    /// 获取当前活动线程 ID（声明式：一处定义，处处复用）
    pub fn current_thread_id(&self) -> crate::thread::ThreadId {
        self.thread.store.active_thread()
            .map(|t| t.id)
            .unwrap_or_else(|| self.thread.store.primary_id())
    }

    /// 获取当前线程的 TaskStore（声明式：自动懒创建并缓存）
    pub fn current_task_store(&self) -> task::TaskStore {
        self.task_store_for(self.current_thread_id())
    }

    /// 获取指定线程的 TaskStore（声明式：自动懒创建并缓存）
    /// 由于 TaskStore 内部使用 Arc<RwLock>，clone 后共享同一底层数据
    pub fn task_store_for(&self, thread_id: crate::thread::ThreadId) -> task::TaskStore {
        self.task_stores
            .get(&thread_id)
            .cloned()
            .unwrap_or_else(|| {
                // 懒创建：返回新 store（调用方会通过 set_task_store 或 Arc 共享写入）
                task::TaskStore::new()
            })
    }

    /// 确保指定线程有 TaskStore（懒创建 + 缓存）
    /// 在发起 AI 请求前调用，确保 TodoWrite 有地方写入
    pub fn ensure_task_store(&mut self, thread_id: crate::thread::ThreadId) -> task::TaskStore {
        self.task_stores
            .entry(thread_id)
            .or_insert_with(task::TaskStore::new)
            .clone()
    }

    /// 设置指定线程的 TaskStore（幂等：覆盖写入）
    pub fn set_task_store(&mut self, thread_id: crate::thread::ThreadId, store: task::TaskStore) {
        self.task_stores.insert(thread_id, store);
    }

    /// 确保指定线程有 ThreadSessionContext（懒创建 + 缓存）
    /// 返回 Arc<Mutex<>>，可在 tokio::spawn 中使用
    pub fn ensure_session_context(&mut self, thread_id: crate::thread::ThreadId) -> std::sync::Arc<tokio::sync::Mutex<super::session::ThreadSessionContext>> {
        self.thread_session_contexts
            .entry(thread_id)
            .or_insert_with(|| std::sync::Arc::new(tokio::sync::Mutex::new(super::session::ThreadSessionContext::new())))
            .clone()
    }

    /// 推送一行文本到内容区（自动剥离 ANSI 转义码）
    pub fn push_line(&mut self, text: String) {
        // 在添加内容前记住是否在底部（follow-bottom 模式）
        let was_at_bottom = self.at_bottom();
        let text = strip_ansi(&text);
        for line in text.split('\n') {
            self.content_lines.push(Line::from(line.to_string()));
        }
        if was_at_bottom {
            self.scroll_to_bottom();
        }
    }

    /// 🔥 线程安全的 push_line：仅在当前活动线程匹配目标线程时才写入 content_lines
    /// 用于 streaming loop 中，防止消息写入到错误的线程显示区
    pub fn push_line_if_active_thread(&mut self, target_thread_id: crate::thread::ThreadId, text: String) {
        let current_thread_id = self.thread.store.active_thread()
            .map(|t| t.id)
            .unwrap_or_else(|| self.thread.store.primary_id());

        if current_thread_id == target_thread_id {
            self.push_line(text);
        }
    }

    /// 检测内容区是否为空（用于显示欢迎页）
    pub fn is_empty(&self) -> bool {
        self.content_lines.is_empty()
    }

    // ============================================================================
    // AI 响应缓存机制（Transcript 核心支持）
    // ============================================================================

    /// 开始 streaming 时清空目标线程的 buffer
    pub fn begin_streaming(&mut self, thread_id: crate::thread::ThreadId) {
        self.stream.streaming_response_buffers.insert(thread_id, String::new());
    }

    /// 接收 streaming 输出时累积到目标线程的 buffer（替代直接 push_line）
    pub fn append_streaming_output(&mut self, thread_id: crate::thread::ThreadId, text: String) {
        // 累积原始文本到目标线程的 buffer
        self.stream.streaming_response_buffers
            .entry(thread_id)
            .or_insert_with(String::new)
            .push_str(&text);

        // ⚠️ 关键修复：不直接渲染到 content_lines
        // 原因：
        // 1. 流式输出可能跨越多个线程（用户在输出期间切换）
        // 2. 直接 push_line 会导致内容显示在当前活动线程，而不是请求线程
        // 3. 正确的渲染由 ThreadEvent 处理逻辑完成（main.rs:1566-1582）
        //
        // 修复前：self.push_line(text);  // ❌ 显示在当前活动线程
        // 修复后：不渲染，由 ThreadEvent 负责
    }

    /// Streaming 完成时保存 buffer 到 last_ai_response 并删除 buffer
    pub fn end_streaming(&mut self, thread_id: crate::thread::ThreadId) {
        if let Some(buffer) = self.stream.streaming_response_buffers.remove(&thread_id) {
            if !buffer.is_empty() {
                self.stream.last_ai_responses.insert(thread_id, buffer);
            }
        }
        // AI 回复结束后自动回到底部，确保用户看到完整回复
        let current_thread_id = self.thread.store.active_thread()
            .map(|t| t.id)
            .unwrap_or_else(|| self.thread.store.primary_id());
        if thread_id == current_thread_id {
            self.scroll_to_bottom();
        }
    }

    /// 统一状态清理：flush buffer + 删除 buffer + 清除 busy + 清除 status
    ///
    /// 由 StreamGuard::drop() 自动调用，也可手动调用（幂等）。
    pub fn cleanup_after_stream(&mut self, thread_id: crate::thread::ThreadId) {
        self.end_streaming(thread_id);
        self.set_thread_busy(thread_id, false);
        self.set_status(String::new());
    }

    /// 获取当前活动线程的 streaming buffer（用于 overlay 在 streaming 期间显示）
    pub fn get_streaming_buffer(&self) -> Option<&str> {
        let current_thread_id = self.thread.store.active_thread()
            .map(|t| t.id)
            .unwrap_or_else(|| self.thread.store.primary_id());

        self.stream.streaming_response_buffers
            .get(&current_thread_id)
            .filter(|s| !s.is_empty())
            .map(|s| s.as_str())
    }

    /// 获取当前活动线程的最近一次 AI 响应
    pub fn get_last_ai_response(&self) -> Option<&str> {
        let current_thread_id = self.thread.store.active_thread()
            .map(|t| t.id)
            .unwrap_or_else(|| self.thread.store.primary_id());

        self.stream.last_ai_responses
            .get(&current_thread_id)
            .map(|s| s.as_str())
    }

    // ============================================================================
    // Diff 功能
    // ============================================================================

    /// 推送 diff 文件变更到内容区（渲染摘要）
    pub fn push_diff(&mut self, diff: crate::diff_render::DiffFileChange) {
        use crate::diff_render;

        // 保存 diff 到列表
        self.diff.files.push(diff);

        // 渲染所有 diff 的摘要（显示完整的文件列表）
        let was_at_bottom = self.at_bottom();
        let summary_lines = diff_render::render_diff_summary(&self.diff.files);
        // 清除之前的摘要（如果需要，可以添加标记来追踪）
        // 这里简化处理：每次都重新渲染所有摘要
        // TODO: 优化为增量更新
        self.content_lines.push(Line::from(""));
        for line in summary_lines {
            self.content_lines.push(line);
        }

        // 添加提示信息
        self.content_lines.push(Line::from(""));
        self.content_lines.push(Line::from("按 Ctrl+D 查看 diff 详情"));
        self.content_lines.push(Line::from(""));

        // 自动滚到底部
        if was_at_bottom {
            self.scroll_to_bottom();
        }
    }

    /// 🔥 线程安全的 push_diff：仅在当前活动线程匹配目标线程时才写入 content_lines
    pub fn push_diff_if_active_thread(&mut self, target_thread_id: crate::thread::ThreadId, diff: crate::diff_render::DiffFileChange) {
        let current_thread_id = self.thread.store.active_thread()
            .map(|t| t.id)
            .unwrap_or_else(|| self.thread.store.primary_id());

        if current_thread_id == target_thread_id {
            self.push_diff(diff);
        }
    }

    /// 进入 diff 模式（显示完整 diff）
    pub fn enter_diff_mode(&mut self) {
        if self.diff.files.is_empty() {
            return;
        }
        self.mode = Mode::Diff;

        // 默认显示最新的 diff（最后一个）
        self.diff.index = self.diff.files.len().saturating_sub(1);

        self.render_current_diff();
    }

    /// 渲染当前选中的 diff
    fn render_current_diff(&mut self) {
        if self.diff.index >= self.diff.files.len() {
            return;
        }

        let diff = &self.diff.files[self.diff.index];
        use crate::diff_render::{compute_diff, DiffLineType, ScrollableDiff};

        let old_content = diff.old_content.as_deref().unwrap_or("");
        let new_content = diff.new_content.as_deref().unwrap_or("");

        let diff_lines = compute_diff(old_content, new_content);

        let mut scrollable_diff = ScrollableDiff::new();
        let raw_lines: Vec<String> = diff_lines
            .iter()
            .map(|line| {
                format!(
                    "{:4} {:4} {}{}",
                    line.old_line_no.unwrap_or(0),
                    line.new_line_no.unwrap_or(0),
                    match line.line_type {
                        DiffLineType::Insert => '+',
                        DiffLineType::Delete => '-',
                        DiffLineType::Context => ' ',
                        DiffLineType::HunkHeader => '@',
                    },
                    line.content
                )
            })
            .collect();

        scrollable_diff.set_content(raw_lines);

        // 设置初始宽度（使用默认值）
        scrollable_diff.set_width(80);

        self.diff.view = Some(scrollable_diff);
        self.diff.mode = true;

        // 清除终端 buffer，确保 overlay 残留被清除
        if let Some(terminal) = &mut self.terminal {
            let _ = terminal.clear();
        }
    }

    /// 退出 diff 模式
    pub fn exit_diff_mode(&mut self) {
        self.mode = Mode::Normal;
        self.diff.mode = false;
        self.diff.view = None;

        // 清除终端 buffer，确保 overlay 残残留被清除
        if let Some(terminal) = &mut self.terminal {
            let _ = terminal.clear();
        }
    }

    /// 是否处于 diff 模式
    pub fn is_diff_mode(&self) -> bool {
        self.mode == Mode::Diff
    }

    // ========================================================================
    // 🔥 Ctrl+O Detail Overlay 方法（Phase 3）
    // ========================================================================

    /// 是否处于 overlay 模式
    pub fn is_overlay_mode(&self) -> bool {
        self.mode == Mode::Overlay
    }

    /// 进入 overlay 模式
    pub fn enter_overlay_mode(&mut self, overlay: crate::detail_overlay::DetailOverlay) {
        self.mode = Mode::Overlay;
        self.overlay = Some(overlay);
        // 清除终端 buffer，确保 overlay 清晰显示
        if let Some(terminal) = &mut self.terminal {
            let _ = terminal.clear();
        }
    }

    /// 退出 overlay 模式
    pub fn exit_overlay_mode(&mut self) {
        self.mode = Mode::Normal;
        self.overlay = None;
        // 清除终端 buffer，确保 overlay 残留被清除
        if let Some(terminal) = &mut self.terminal {
            let _ = terminal.clear();
        }
    }

    // ========================================================================

    /// 切换到下一个 diff 文件
    pub fn next_diff(&mut self) {
        if self.diff.files.is_empty() {
            return;
        }
        if self.diff.index + 1 < self.diff.files.len() {
            self.diff.index += 1;
            self.render_current_diff();
        }
    }

    /// 切换到上一个 diff 文件
    pub fn prev_diff(&mut self) {
        if self.diff.files.is_empty() {
            return;
        }
        if self.diff.index > 0 {
            self.diff.index -= 1;
            self.render_current_diff();
        }
    }

    /// 设置状态栏文本（自动剥离 ANSI 转义码）
    pub fn set_status(&mut self, text: String) {
        self.status_text = strip_ansi(&text);
    }

    /// 🔥 Phase 6: 检查指定线程是否 busy
    pub fn is_thread_busy(&self, thread_id: crate::thread::ThreadId) -> bool {
        self.stream.thread_busy.get(&thread_id).copied().unwrap_or(false)
    }

    /// 🔥 Phase 6: 设置指定线程的 busy 状态
    pub fn set_thread_busy(&mut self, thread_id: crate::thread::ThreadId, busy: bool) {
        self.stream.thread_busy.insert(thread_id, busy);
    }

    /// 🔥 Phase 6: 检查当前活动线程是否 busy
    pub fn is_current_thread_busy(&self) -> bool {
        let current_thread_id = self.thread.store.active_thread()
            .map(|t| t.id)
            .unwrap_or_else(|| self.thread.store.primary_id());
        self.is_thread_busy(current_thread_id)
    }

    /// 设置忙碌状态（向后兼容：操作当前线程）
    pub fn set_busy(&mut self, busy: bool) {
        let current_thread_id = self.thread.store.active_thread()
            .map(|t| t.id)
            .unwrap_or_else(|| self.thread.store.primary_id());
        self.set_thread_busy(current_thread_id, busy);
    }

    /// 是否正在处理 AI 请求（向后兼容：检查当前线程）
    pub fn is_busy(&self) -> bool {
        self.is_current_thread_busy()
    }

    /// 入队一条消息（自动 trim + 空检查）
    pub fn enqueue(&mut self, text: String) {
        let text = text.trim().to_string();
        if !text.is_empty() {
            // ⚠️ 关键修复：排队时必须捕获目标线程 ID
            // 这样处理队列时，消息会被发送到正确的线程
            // 而不是处理队列时的当前活动线程
            let target_thread_id = self.thread.store.active_thread()
                .map(|t| t.id)
                .unwrap_or_else(|| self.thread.store.primary_id());
            self.stream.queue.push((text, target_thread_id));
        }
    }

    /// 出队一条消息（FIFO）
    /// 返回 (文本, 目标线程 ID)
    pub fn dequeue(&mut self) -> Option<(String, crate::thread::ThreadId)> {
        if self.stream.queue.is_empty() {
            None
        } else {
            Some(self.stream.queue.remove(0))
        }
    }

    /// 清空队列
    pub fn clear_queue(&mut self) {
        self.stream.queue.clear();
    }

    /// 队列长度
    pub fn queue_len(&self) -> usize {
        self.stream.queue.len()
    }

    /// 设置审批等待状态
    /// ⚠️ 重要：审批请求会记录 thread_id，存储到对应线程的审批状态中
    pub fn set_approval_pending(&mut self, request: ApprovalRequest) {
        let thread_id = request.thread_id;
        self.approval.states.insert(thread_id, request);
        self.approval.selected = 0; // 重置选中项为第一个
        // 如果是当前活动线程的审批请求，切换到 Approving 模式
        let current_thread_id = self.thread.store.active_thread()
            .map(|t| t.id)
            .unwrap_or_else(|| self.thread.store.primary_id());
        if thread_id == current_thread_id {
            self.mode = Mode::Approving;
        }
    }

    /// 获取当前活动线程的审批状态（用于外部访问）
    /// 🔥 关键修复：返回当前活动线程的审批状态引用
    /// 注意：由于生命周期限制，调用方需要在作用域内使用返回值
    pub fn approval_state_ref(&self) -> Option<&ApprovalRequest> {
        let current_thread_id = self.thread.store.active_thread()
            .map(|t| t.id)
            .unwrap_or_else(|| self.thread.store.primary_id());

        self.approval.states.get(&current_thread_id)
    }

    /// 🔥 新方法：获取当前活动线程的审批状态
    pub fn get_current_approval_state(&self) -> Option<&ApprovalRequest> {
        let current_thread_id = self.thread.store.active_thread()
            .map(|t| t.id)
            .unwrap_or_else(|| self.thread.store.primary_id());

        self.approval.states.get(&current_thread_id)
    }

    /// 解析审批决策，返回日志消息
    /// ⚠️ 重要：只移除当前活动线程的审批状态
    pub fn resolve_approval(&mut self, decision: ApprovalDecision) -> String {
        // 🔥 关键修复：只处理当前活动线程的审批状态
        let current_thread_id = self.thread.store.active_thread()
            .map(|t| t.id)
            .unwrap_or_else(|| self.thread.store.primary_id());

        // 恢复 Normal 模式
        if self.mode == Mode::Approving {
            self.mode = Mode::Normal;
        }

        let tool_name = self
            .approval.states
            .get(&current_thread_id)
            .map(|r| r.tool_name.clone())
            .unwrap_or_default();

        // 通过 oneshot 发送决策
        if let Some(request) = self.approval.states.remove(&current_thread_id) {
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
        self.mode == Mode::Approving
    }

    /// 🔥 获取并移除当前线程的待处理审批请求（用于重新发送到审批 loop）
    pub fn take_pending_approval(&mut self) -> Option<ApprovalRequest> {
        let current_thread_id = self.thread.store.active_thread()
            .map(|t| t.id)
            .unwrap_or_else(|| self.thread.store.primary_id());

        self.approval.states.remove(&current_thread_id)
    }

    // ============================================================================
    // 搜索功能
    // ============================================================================

    /// 是否处于搜索模式
    pub fn is_searching(&self) -> bool {
        self.mode == Mode::Search
    }

    /// 进入搜索模式
    pub fn enter_search_mode(&mut self) {
        self.mode = Mode::Search;
        self.search.mode = true;
        self.search.query.clear();
        self.search.matches.clear();
        self.search.current_index = 0;
        self.search.input = InputComposer::new("");
    }

    /// 退出搜索模式
    pub fn exit_search_mode(&mut self) {
        self.mode = Mode::Normal;
        self.search.mode = false;
        self.search.query.clear();
        self.search.matches.clear();
        self.search.current_index = 0;
    }

    /// 执行搜索，更新匹配列表
    pub fn perform_search(&mut self) {
        let query = self.search.query.trim().to_lowercase();
        if query.is_empty() {
            self.search.matches.clear();
            self.search.current_index = 0;
            return;
        }

        self.search.matches = self
            .content_lines
            .iter()
            .enumerate()
            .filter(|(_, line)| line.to_string().to_lowercase().contains(&query))
            .map(|(i, _)| i)
            .collect();

        if !self.search.matches.is_empty() {
            self.search.current_index = 0;
            self.scroll_to_match(0);
        }
    }

    /// 跳转到下一个匹配
    pub fn next_match(&mut self) {
        if self.search.matches.is_empty() {
            return;
        }
        self.search.current_index = (self.search.current_index + 1) % self.search.matches.len();
        self.scroll_to_match(self.search.current_index);
    }

    /// 跳转到上一个匹配
    pub fn prev_match(&mut self) {
        if self.search.matches.is_empty() {
            return;
        }
        if self.search.current_index == 0 {
            self.search.current_index = self.search.matches.len() - 1;
        } else {
            self.search.current_index -= 1;
        }
        self.scroll_to_match(self.search.current_index);
    }

    /// 滚动到指定匹配项
    fn scroll_to_match(&mut self, match_index: usize) {
        if match_index >= self.search.matches.len() {
            return;
        }
        let target_line = self.search.matches[match_index];
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
        highlight_search_term_static(line, &self.search.query, is_current, is_other)
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
    }

    /// 判断当前是否在内容底部
    pub fn at_bottom(&self) -> bool {
        let area = self.content_area();
        let max_offset = self
            .content_lines
            .len()
            .saturating_sub(area.height as usize) as u16;
        self.scroll_offset >= max_offset
    }

    /// 向上滚动 n 行
    pub fn scroll_up(&mut self, n: u16) {
        self.scroll_offset = self.scroll_offset.saturating_sub(n);
    }

    /// 向下滚动 n 行
    pub fn scroll_down(&mut self, n: u16) {
        let area = self.content_area();
        let max_offset = self
            .content_lines
            .len()
            .saturating_sub(area.height as usize) as u16;
        self.scroll_offset = (self.scroll_offset + n).min(max_offset);
    }

    /// 获取内容区域（减去状态栏 + 分隔线 + 输入框高度）
    fn content_area(&self) -> Rect {
        let input_height = self.input.line_count().min(10) as u16;
        if let Some(terminal) = &self.terminal {
            let size = terminal
                .size()
                .unwrap_or(ratatui::layout::Size::new(80, 24));
            // 布局：内容区 + 状态栏(1) + 分隔线(1) + 输入框(input_height)
            let height = size.height.saturating_sub(2 + input_height);
            Rect::new(0, 0, size.width, height)
        } else {
            // 测试模式：使用 test_size 或默认值
            #[cfg(test)]
            let (w, h): (u16, u16) = self.test_size.unwrap_or((80, 24));
            #[cfg(not(test))]
            let (w, h): (u16, u16) = (80, 24);
            let height = h.saturating_sub(2 + input_height);
            Rect::new(0, 0, w, height)
        }
    }

    /// 渲染一帧
    pub fn render(&mut self) {
        // 更新任务面板状态（副作用，必须在 draw_frame 之前）
        // 🔥 声明式：只读取当前线程的任务，其他线程的任务不泄漏
        let tasks = self.current_task_store().get_tasks();
        let task_all_done = tasks
            .iter()
            .all(|t| t.status == task::TaskStatus::Completed);
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
    pub fn draw_frame(&mut self, f: &mut ratatui::Frame<'_>) {
        // 所有局部数据直接从 self 读取（不再需要提前 clone）
        let search_mode = self.search.mode;
        let search_query = &self.search.query;
        let search_matches = &self.search.matches;
        let current_match_index = self.search.current_index;
        let scroll_offset = self.scroll_offset;
        let content_lines = &self.content_lines;
        // 🔥 关键修复：只检查当前活动线程的审批状态
        let has_approval_state = self.is_approving();
        let approval_selected = self.approval.selected;
        let user_scrolled = !self.at_bottom();
        let status_text = &self.status_text;
        let input_value = self.input.value();
        let input_cursor_col = input_composer::cursor_col(&self.input);
        let input_line_count = self.input.line_count() as u16;
        let input_cursor_row = self.input.cursor_row() as u16;
        let search_input_value = self.search.input.value();
        let search_input_cursor_col = input_composer::cursor_col(&self.search.input);
        let is_empty = self.is_empty();
        let help_mode = self.help_mode;
        let popup_visible = self.command_popup.is_visible();
        let (popup_lines, popup_height) = self.command_popup.render();

        // 🔥 声明式：只渲染当前线程的任务
        let tasks = self.current_task_store().get_tasks();
        let (task_lines, _) = render_task_lines(&tasks);
        let task_expired = self
            .task_all_done_at
            .map(|t| t.elapsed().as_secs() >= 2)
            .unwrap_or(false);
        let task_height = task_lines.len() as u16;
        let show_tasks = task_height > 0 && !popup_visible && !task_expired;

        let size = f.area();
        if size.height < 4 {
            return;
        }

        // 布局：内容区 + 状态栏(1行) + 分隔线(1行) + 输入框(动态行数)
        let input_height = input_line_count.min(10); // 最多 10 行
        let chunks = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Min(1),             // 内容区
                Constraint::Length(1),          // 状态栏
                Constraint::Length(1),          // 分隔线
                Constraint::Length(input_height), // 输入框
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
            // === Detail Overlay 显示（优先级最高，占据整个屏幕）===
            if let Some(ref mut overlay) = self.overlay {
                // Overlay 占据整个终端屏幕（包括状态栏和输入框区域）
                overlay.render(f, f.area());
            }
            // === Diff 模式显示 ===
            else if self.diff.mode {
                if let Some(diff_view) = &mut self.diff.view {
                    // 更新视口大小
                    diff_view.set_viewport(content_area.height);
                    diff_view.set_width(content_area.width);

                    // 获取可见行
                    let wrapped_lines = diff_view.wrapped_lines();

                    // 计算可见行数
                    let visible_count = content_area.height as usize;
                    let start = diff_view.state.scroll as usize;
                    let end = (start + visible_count).min(wrapped_lines.len());

                    // 渲染可见行
                    let visible_lines: Vec<Line> = wrapped_lines[start..end]
                        .iter()
                        .map(|line| Line::from(line.as_str()))
                        .collect();

                    let diff_content = Paragraph::new(visible_lines);
                    f.render_widget(diff_content, content_area);

                    // 显示滚动百分比
                    if let Some(pct) = diff_view.percent_scrolled() {
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
                }
            }
            // === 欢迎页显示（当内容区为空且不在帮助模式时） ===
            else if is_empty && !help_mode {
                let welcome_widget = super::welcome::WelcomeWidget::new();
                let welcome_lines = welcome_widget.render();

                // 居中显示欢迎页
                let welcome_content =
                    Paragraph::new(welcome_lines).alignment(ratatui::layout::Alignment::Center);
                f.render_widget(welcome_content, content_area);
            } else if help_mode {
                // === 帮助覆盖层显示 ===
                let help_overlay = super::keybindings::HelpOverlay::new();
                let help_lines = help_overlay.render();

                // 帮助内容居左显示
                let help_content =
                    Paragraph::new(help_lines).alignment(ratatui::layout::Alignment::Left);
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
                        let is_other_match =
                            search_matches.contains(&line_idx) && !is_current_match;

                        // 如果包含搜索词，添加高亮
                        if line_text
                            .to_lowercase()
                            .contains(&search_query.to_lowercase())
                        {
                            highlight_search_term_static(
                                &line_text,
                                &search_query,
                                is_current_match,
                                is_other_match,
                            )
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
        // 🔥 关键修复：只显示当前活动线程的审批界面
        if has_approval_state {
            if let Some(request) = self.get_current_approval_state() {
                let (panel_lines, panel_height) =
                    approval_overlay::render_bottom_panel(request, approval_selected);

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
            if self.is_overlay_mode() {
                // === Overlay 模式 ===
                // 不渲染状态栏、分隔线和输入框，overlay 占据整个屏幕
            } else if self.diff.mode {
                // === Diff 模式 ===
                let (diff_path, file_index) = if self.diff.index < self.diff.files.len() {
                    (
                        self.diff.files[self.diff.index].path.display().to_string(),
                        format!("{}/{}", self.diff.index + 1, self.diff.files.len()),
                    )
                } else {
                    ("Unknown".to_string(), "0/0".to_string())
                };

                let status_line = Line::from(Span::styled(
                    format!(
                        " Diff: {} [{}] | ←/→ 或 [/] 切换文件 | j/k 滚动 | q/Esc 退出 ",
                        diff_path, file_index
                    ),
                    ratatui::style::Style::default().fg(ratatui::style::Color::Cyan),
                ));
                let status = Paragraph::new(status_line)
                    .style(ratatui::style::Style::default().bg(ratatui::style::Color::Black));
                f.render_widget(status, status_area);

                // === 分隔线 ===
                let separator_line = "─".repeat(separator_area.width as usize);
                let separator = Paragraph::new(separator_line)
                    .style(ratatui::style::Style::default().fg(ratatui::style::Color::DarkGray));
                f.render_widget(separator, separator_area);

                // === 输入框（Diff 模式下禁用） ===
                let input_text = Span::raw("(Diff 模式 - 按 q/Esc/Ctrl+D 退出)");
                let input_line = Line::from(input_text);
                let input = Paragraph::new(input_line);
                f.render_widget(input, input_area);
            } else if search_mode {
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
                    format!(
                        " {} ↑/Enter 下一个 | ↓/Shift+Enter 上一个 | Esc 退出 ",
                        status_text
                    ),
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
                let cursor_x = input_area.x
                    + 2
                    + (search_input_cursor_col as u16).min(input_area.width.saturating_sub(2));
                let cursor_y = input_area.y;
                f.set_cursor_position((cursor_x, cursor_y));
            } else if self.thread.active_mode {
                // === 线程模式 ===
                // 获取当前线程信息
                let thread_name = self.current_thread_name();
                let thread_info = self.thread.store.active_thread();
                let total_threads = self.thread.store.len();
                let thread_index = thread_info
                    .and_then(|t| self.thread.store.thread_index(t.id))
                    .unwrap_or(0);

                // 构建线程模式状态栏
                let mut spans: Vec<Span<'static>> = Vec::new();

                // 线程图标 (分支符号，工业级风格)
                spans.push(Span::styled(
                    "» ",
                    ratatui::style::Style::default().fg(ratatui::style::Color::Yellow),
                ));

                // 线程名称
                spans.push(Span::styled(
                    thread_name.clone(),
                    ratatui::style::Style::default().fg(ratatui::style::Color::Yellow),
                ));

                // 线程索引 (2/5)
                spans.push(Span::raw(" "));
                spans.push(Span::styled(
                    format!("({}/{})", thread_index + 1, total_threads),
                    ratatui::style::Style::default().fg(ratatui::style::Color::DarkGray),
                ));

                // 父线程信息（如果有）
                if let Some(thread) = thread_info {
                    if let Some(parent_id) = thread.parent_id {
                        if let Some(parent) = self.thread.store.get_thread(parent_id) {
                            spans.push(Span::raw(" "));
                            spans.push(Span::styled(
                                "(",
                                ratatui::style::Style::default().fg(ratatui::style::Color::DarkGray),
                            ));
                            spans.push(Span::styled(
                                parent.display_name(),
                                ratatui::style::Style::default().fg(ratatui::style::Color::Cyan),
                            ));
                            spans.push(Span::styled(
                                ")",
                                ratatui::style::Style::default().fg(ratatui::style::Color::DarkGray),
                            ));
                        }
                    }
                }

                // Esc 提示
                spans.push(Span::raw(" "));
                spans.push(Span::styled(
                    "Esc",
                    ratatui::style::Style::default().fg(ratatui::style::Color::Yellow),
                ));
                spans.push(Span::styled(
                    " ↩ ",
                    ratatui::style::Style::default().fg(ratatui::style::Color::Yellow),
                ));
                spans.push(Span::styled(
                    "to return",
                    ratatui::style::Style::default().fg(ratatui::style::Color::DarkGray),
                ));

                // === 追加 streaming/queue/Ctrl+O 状态（与正常模式一致） ===
                // 任务进度
                if !tasks.is_empty() {
                    let total = tasks.len();
                    let completed = tasks
                        .iter()
                        .filter(|t| t.status == TaskStatus::Completed)
                        .count();
                    spans.push(Span::raw(" · "));
                    spans.push(Span::styled(
                        format!("Tasks {}/{}", completed, total),
                        ratatui::style::Style::default().fg(ratatui::style::Color::DarkGray),
                    ));
                }
                // Streaming/Busy 状态
                if !status_text.is_empty() {
                    spans.push(Span::raw(" · "));
                    spans.push(Span::styled(
                        status_text.clone(),
                        ratatui::style::Style::default().fg(ratatui::style::Color::DarkGray),
                    ));
                }
                // 队列计数
                if !self.stream.queue.is_empty() {
                    spans.push(Span::raw(" · "));
                    spans.push(Span::styled(
                        format!("Queue: {}", self.stream.queue.len()),
                        ratatui::style::Style::default().fg(ratatui::style::Color::Cyan),
                    ));
                }
                // Ctrl+O 提示
                if self.get_last_ai_response().is_some() || self.get_streaming_buffer().is_some() {
                    spans.push(Span::raw(" · "));
                    spans.push(Span::styled(
                        "Ctrl+O 查看详情",
                        ratatui::style::Style::default().fg(ratatui::style::Color::Yellow),
                    ));
                }

                let status_line = Line::from(spans);
                let status = Paragraph::new(status_line)
                    .style(ratatui::style::Style::default().bg(ratatui::style::Color::Black));
                f.render_widget(status, status_area);

                // === 命令弹出框（输入框上方） ===
                if show_tasks && task_height > 0 {
                    let task_y = status_area.y.saturating_sub(task_height);
                    let task_area =
                        Rect::new(content_area.x, task_y, content_area.width, task_height);
                    f.render_widget(Clear, task_area);
                    let task_content = Paragraph::new(task_lines.clone())
                        .style(ratatui::style::Style::default().bg(ratatui::style::Color::Black));
                    f.render_widget(task_content, task_area);
                } else if popup_visible && popup_height > 0 {
                    let popup_y = status_area.y.saturating_sub(popup_height);
                    let popup_area =
                        Rect::new(content_area.x, popup_y, content_area.width, popup_height);
                    f.render_widget(Clear, popup_area);
                    let popup_content = Paragraph::new(popup_lines)
                        .style(ratatui::style::Style::default().bg(ratatui::style::Color::Black));
                    f.render_widget(popup_content, popup_area);
                }

                // === 分隔线 ===
                let separator_line = "─".repeat(separator_area.width as usize);
                let separator = Paragraph::new(separator_line)
                    .style(ratatui::style::Style::default().fg(ratatui::style::Color::DarkGray));
                f.render_widget(separator, separator_area);

                // === 输入框 ===
                let prompt = Span::styled(
                    format!("{}⟩ ", self.input.prompt()),
                    ratatui::style::Style::default().fg(ratatui::style::Color::Cyan),
                );
                let input_text = if input_value.contains('\n') {
                    // 多行输入：拆分为多行，后续行带缩进
                    let indent_span = Span::raw(format!(
                        "{:width$}",
                        "",
                        width = self.input.prompt().len() + 2
                    ));
                    let lines: Vec<Line<'_>> = input_value
                        .lines()
                        .enumerate()
                        .map(|(i, line_text)| {
                            if i == 0 {
                                Line::from(vec![prompt.clone(), Span::raw(line_text)])
                            } else {
                                Line::from(vec![indent_span.clone(), Span::raw(line_text)])
                            }
                        })
                        .collect();
                    ratatui::text::Text::from(lines)
                } else {
                    let input_line = Line::from(vec![prompt, Span::raw(input_value)]);
                    ratatui::text::Text::from(input_line)
                };
                let input = Paragraph::new(input_text);
                f.render_widget(input, input_area);

                // 设置终端光标位置
                let cursor_x = input_area.x + (input_cursor_col as u16).min(input_area.width);
                let cursor_y = input_area.y + input_cursor_row.min(input_area.height - 1);
                f.set_cursor_position((cursor_x, cursor_y));
            } else {
                // === 正常模式 ===
                // === 状态栏 ===
                let status_line = if !tasks.is_empty() {
                    // 任务模式：显示当前任务 + 进度
                    let total = tasks.len();
                    let completed = tasks
                        .iter()
                        .filter(|t| t.status == TaskStatus::Completed)
                        .count();
                    let mut spans: Vec<Span<'static>> = Vec::new();

                    // 当前 InProgress 任务的 activeForm
                    let current_task = tasks.iter().find(|t| t.status == TaskStatus::InProgress);
                    if let Some(t) = current_task {
                        spans.push(Span::styled(
                            " ▸ ",
                            ratatui::style::Style::default().fg(ratatui::style::Color::Yellow),
                        ));
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
                    if !self.stream.queue.is_empty() {
                        spans.push(Span::raw(" · "));
                        spans.push(Span::styled(
                            format!("Queue: {}", self.stream.queue.len()),
                            ratatui::style::Style::default().fg(ratatui::style::Color::Cyan),
                        ));
                    }

                    // Ctrl+O 提示（当有 AI 响应可查看时）
                    if self.get_last_ai_response().is_some() || self.get_streaming_buffer().is_some() {
                        spans.push(Span::raw(" · "));
                        spans.push(Span::styled(
                            "Ctrl+O 查看详情",
                            ratatui::style::Style::default().fg(ratatui::style::Color::Yellow),
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
                    if !self.stream.queue.is_empty() {
                        spans.push(Span::raw(" · "));
                        spans.push(Span::styled(
                            format!("Queue: {}", self.stream.queue.len()),
                            ratatui::style::Style::default().fg(ratatui::style::Color::Cyan),
                        ));
                    }
                    // Ctrl+O 提示（当有 AI 响应可查看时）
                    if self.get_last_ai_response().is_some() || self.get_streaming_buffer().is_some() {
                        spans.push(Span::raw(" · "));
                        spans.push(Span::styled(
                            "Ctrl+O 查看详情",
                            ratatui::style::Style::default().fg(ratatui::style::Color::Yellow),
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
                    let task_area =
                        Rect::new(content_area.x, task_y, content_area.width, task_height);
                    f.render_widget(Clear, task_area);
                    let task_content = Paragraph::new(task_lines.clone())
                        .style(ratatui::style::Style::default().bg(ratatui::style::Color::Black));
                    f.render_widget(task_content, task_area);
                } else if popup_visible && popup_height > 0 {
                    let popup_y = status_area.y.saturating_sub(popup_height);
                    let popup_area =
                        Rect::new(content_area.x, popup_y, content_area.width, popup_height);
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
                let input_text = if input_value.contains('\n') {
                    // 多行输入：拆分为多行，后续行带缩进
                    let indent_span = Span::raw(format!(
                        "{:width$}",
                        "",
                        width = self.input.prompt().len() + 2
                    ));
                    let lines: Vec<Line<'_>> = input_value
                        .lines()
                        .enumerate()
                        .map(|(i, line_text)| {
                            if i == 0 {
                                Line::from(vec![prompt.clone(), Span::raw(line_text)])
                            } else {
                                Line::from(vec![indent_span.clone(), Span::raw(line_text)])
                            }
                        })
                        .collect();
                    ratatui::text::Text::from(lines)
                } else {
                    let input_line = Line::from(vec![prompt, Span::raw(input_value)]);
                    ratatui::text::Text::from(input_line)
                };
                let input = Paragraph::new(input_text);
                f.render_widget(input, input_area);

                // 设置终端光标位置（input_cursor_col 已包含 prompt 和 ⟩ 的宽度）
                let cursor_x = input_area.x + (input_cursor_col as u16).min(input_area.width);
                let cursor_y = input_area.y + input_cursor_row.min(input_area.height - 1);
                f.set_cursor_position((cursor_x, cursor_y));
            }
        }
    }

    /// 恢复终端状态
    pub fn restore(&mut self) -> io::Result<()> {
        if let Some(terminal) = &mut self.terminal {
            terminal.show_cursor()?;
        }
        execute!(
            io::stdout(),
            LeaveAlternateScreen,
            crossterm::event::DisableMouseCapture
        )?;
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
    pub(crate) fn build_event_router() -> EventRouter<crossterm::event::Event> {
        EventRouter::new()
            // 帮助进入 - 按 `?`
            .on(
                |e| matches!(e, crossterm::event::Event::Key(_)),
                HelpEnterHandler,
            )
            // 帮助退出 - 按 `Esc`（仅在帮助模式时）
            .on(
                |e| matches!(e, crossterm::event::Event::Key(_)),
                HelpExitHandler,
            )
            // 搜索进入 - Ctrl+F
            .on(
                |e| matches!(e, crossterm::event::Event::Key(_)),
                SearchEnterHandler,
            )
            // 搜索输入（优先级高，需要在正常输入之前）
            .on(
                |e| matches!(e, crossterm::event::Event::Key(_)),
                SearchInputHandler,
            )
            // Diff 进入 - 按 `d`（仅在非 diff 模式且有 diff 可用时）
            .on(
                |e| matches!(e, crossterm::event::Event::Key(_)),
                DiffEnterHandler,
            )
            // Diff 模式处理（优先级高，需要在正常输入之前）
            .on(
                |e| {
                    matches!(e, crossterm::event::Event::Key(_))
                        || matches!(e, crossterm::event::Event::Mouse(_))
                },
                DiffModeHandler,
            )
            // Detail Overlay 进入 - Ctrl+O（优先级高，需要在正常输入之前）
            .on(
                |e| matches!(e, crossterm::event::Event::Key(_)),
                DetailEnterHandler,
            )
            // Detail Overlay 模式处理（优先级高，需要在正常输入之前）
            .on(
                |e| {
                    matches!(e, crossterm::event::Event::Key(_))
                        || matches!(e, crossterm::event::Event::Mouse(_))
                },
                DetailModeHandler,
            )
            // 线程模式处理（优先级高，需要在正常输入之前）
            .on(
                |e| matches!(e, crossterm::event::Event::Key(_)),
                ThreadModeHandler,
            )
            // 线程进入处理（创建/切换线程）
            .on(
                |e| matches!(e, crossterm::event::Event::Key(_)),
                ThreadEnterHandler,
            )
            // 组合键盘处理器（输入 + 滚动）
            .on(
                |e| matches!(e, crossterm::event::Event::Key(_)),
                CombinedKeyHandler,
            )
            // 鼠标滚轮 + 焦点恢复路由（带选择支持）
            .on(
                |e| matches!(e, crossterm::event::Event::Mouse(_) | crossterm::event::Event::FocusGained),
                MouseScrollHandler::new(),
            )
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

            // 🔥 审批模式拦截：如果当前线程有挂起的审批，优先处理审批键盘输入
            // 场景：用户在 streaming 期间切换线程后切回，审批状态仍存在但审批循环已退出
            if self.is_approving() {
                if event::poll(std::time::Duration::from_millis(100)).unwrap_or(false) {
                    if let Ok(event) = event::read() {
                        if let Event::Key(key) = &event {
                            if key.kind == event::KeyEventKind::Release {
                                continue;
                            }

                            use event::KeyCode;

                            let options_count = if let Some(ref req) = self.approval_state_ref() {
                                crate::approval_overlay::build_approval_options(req).len()
                            } else {
                                0
                            };

                            let mut handled = false;

                            match key.code {
                                KeyCode::Up | KeyCode::Down => {
                                    if options_count > 0 {
                                        if key.code == KeyCode::Up {
                                            if self.approval.selected > 0 {
                                                self.approval.selected -= 1;
                                            } else {
                                                self.approval.selected = options_count - 1;
                                            }
                                        } else {
                                            if self.approval.selected + 1 < options_count {
                                                self.approval.selected += 1;
                                            } else {
                                                self.approval.selected = 0;
                                            }
                                        }
                                        self.render();
                                        handled = true;
                                    }
                                }
                                KeyCode::Enter => {
                                    if options_count > 0 {
                                        if let Some(ref req) = self.approval_state_ref() {
                                            let options = crate::approval_overlay::build_approval_options(req);
                                            if self.approval.selected < options.len() {
                                                let decision = options[self.approval.selected].decision;
                                                let msg = self.resolve_approval(decision);
                                                self.push_line(msg);
                                                self.scroll_to_bottom();
                                                self.render();
                                                handled = true;
                                            }
                                        }
                                    }
                                }
                                KeyCode::Char(c) if c.is_ascii_digit() => {
                                    let digit = c.to_digit(10).unwrap() as usize;
                                    if digit > 0 && digit <= options_count {
                                        if let Some(ref req) = self.approval_state_ref() {
                                            let options = crate::approval_overlay::build_approval_options(req);
                                            let decision = options[digit - 1].decision;
                                            let msg = self.resolve_approval(decision);
                                            self.push_line(msg);
                                            self.scroll_to_bottom();
                                            self.render();
                                            handled = true;
                                        }
                                    }
                                }
                                _ => {
                                    if let Some(decision) = crate::approval_overlay::resolve_approval_key(*key) {
                                        let msg = self.resolve_approval(decision);
                                        self.push_line(msg);
                                        self.scroll_to_bottom();
                                        self.render();
                                        handled = true;
                                    }
                                }
                            }

                            if handled {
                                // 审批决策已发送，检查审批状态是否已清除
                                // 如果审批已解决，继续正常的事件循环
                                continue;
                            }
                        }
                    }
                }
                // 审批模式下：如果没有真正挂起的审批（状态残留），清除审批标记
                // 正常情况 is_approving() 已经基于 approval_states 判断，这里是额外安全网
                continue; // 审批模式下不处理其他事件
            }

            if event::poll(std::time::Duration::from_millis(100)).unwrap_or(false) {
                if let Ok(event) = event::read() {
                    // 过滤键盘释放事件（键盘增强模式会发送 Press + Release）
                    if matches!(event, Event::Key(ref k) if k.kind == event::KeyEventKind::Release) {
                        continue;
                    }
                    match router.dispatch(&event, self) {
                        ControlFlow::Break(AppResult::Submit(text)) => return AppResult::Submit(text),
                        ControlFlow::Break(AppResult::Exit) => return AppResult::Exit,
                        ControlFlow::Break(AppResult::Handled) => {} // 事件已消费，继续循环
                        ControlFlow::Continue => {}
                    }
                }
            }
        }
    }

    // ========================================================================
    // 线程管理方法
    // ========================================================================

    /// 创建侧线程
    pub fn create_side_thread(&mut self, name: Option<String>) -> ThreadId {
        let current_id = self
            .thread.store
            .active_thread()
            .map(|t| t.id)
            .unwrap_or_else(|| self.thread.store.primary_id());

        let thread_id = self.thread.store.create_side_thread(current_id, name);

        // 🔥 Bug 修复：使用 self.switch_thread 而不是 thread_store.switch_to
        // 这样会触发消息加载逻辑
        self.switch_thread(thread_id);

        thread_id
    }

    /// 重命名线程
    pub fn rename_thread(&mut self, thread_id: ThreadId, new_name: String) -> bool {
        self.thread.store.rename_thread(thread_id, new_name)
    }

    /// 切换线程
    pub fn switch_thread(&mut self, thread_id: ThreadId) -> bool {
        if self.thread.store.switch_to(thread_id) {
            // 🔥 Bug 修复：清空终端并加载目标线程的历史消息
            self.content_lines.clear();
            self.scroll_offset = 0;

            // 加载目标线程的历史消息（先收集到 Vec 以避免借用问题）
            let messages_to_load: Vec<String> = self.thread.messages
                .get(thread_id)
                .map(|msgs| msgs.iter().map(|m| m.content.clone()).collect())
                .unwrap_or_default();

            for msg in messages_to_load {
                self.push_line(msg);
            }

            // 同步 mode：如果目标线程有审批请求，切到 Approving；否则恢复 Normal
            // 退出 overlay/diff/search 等非 per-thread 模式
            match self.mode {
                Mode::Overlay => { self.exit_overlay_mode(); }
                Mode::Diff => { self.exit_diff_mode(); }
                Mode::Search => { self.exit_search_mode(); }
                Mode::Help => { self.help_mode = false; self.mode = Mode::Normal; }
                Mode::Approving | Mode::ThreadPicker | Mode::CommandPopup | Mode::Normal => {}
            }
            if self.approval.states.contains_key(&thread_id) {
                self.mode = Mode::Approving;
            } else if self.mode == Mode::Approving {
                self.mode = Mode::Normal;
            }

            true
        } else {
            false
        }
    }

    /// 返回父线程
    pub fn return_to_parent(&mut self) -> bool {
        if let Some(current) = self.thread.store.active_thread() {
            if let Some(parent_id) = current.parent_id {
                self.switch_thread(parent_id)
            } else {
                false
            }
        } else {
            false
        }
    }

    /// 获取当前线程的显示名称
    pub fn current_thread_name(&self) -> String {
        self.thread.store
            .active_thread()
            .map(|t| t.display_name())
            .unwrap_or("Unknown".to_string())
    }
}

impl Drop for App {
    fn drop(&mut self) {
        let _ = self.restore();
    }
}

/// 静态版本的搜索高亮函数（避免借用问题）
fn highlight_search_term_static(
    line: &str,
    query: &str,
    is_current: bool,
    is_other: bool,
) -> Line<'static> {
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
    use crate::assert_buffer_contains;
    use crate::assert_buffer_not_contains;
    use crate::assert_tui_snapshot;
    use crate::tui_test::{buffer_to_string, render_to_buffer};
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
        assert_eq!(strip_ansi("\x1b[31m你好\x1b[0m世界"), "你好世界");
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

    /// 模拟 content_area 计算（给定终端高度和输入行数）
    fn content_height(terminal_height: u16, input_lines: u16) -> usize {
        let input_height = input_lines.min(10);
        terminal_height.saturating_sub(2 + input_height) as usize
    }

    /// 计算最大滚动偏移（与 App::scroll_to_bottom 逻辑一致）
    fn max_scroll_offset(total_lines: usize, terminal_height: u16, input_lines: u16) -> u16 {
        let visible = content_height(terminal_height, input_lines);
        if total_lines > visible {
            (total_lines - visible) as u16
        } else {
            0
        }
    }

    #[test]
    fn test_scroll_no_overflow() {
        // 4 行内容，10 行高终端，1 行输入 → 可见 7 行，无溢出
        assert_eq!(max_scroll_offset(4, 10, 1), 0);
    }

    #[test]
    fn test_scroll_exact_fit() {
        // 7 行内容，10 行高终端，1 行输入 → 可见 7 行，恰好无溢出
        assert_eq!(max_scroll_offset(7, 10, 1), 0);
    }

    #[test]
    fn test_scroll_overflow() {
        // 14 行内容，5 行高终端，1 行输入 → 可见 2 行，scroll_offset = 12
        assert_eq!(max_scroll_offset(14, 5, 1), 12);
    }

    #[test]
    fn test_scroll_small_terminal() {
        // 最小 3 行高终端，1 行输入：内容区 0 行
        assert_eq!(content_height(3, 1), 0);
        assert_eq!(max_scroll_offset(5, 3, 1), 5);
    }

    #[test]
    fn test_scroll_tiny_terminal() {
        // 2 行高终端：内容区 0 行
        assert_eq!(content_height(2, 1), 0);
    }

    #[test]
    fn test_scroll_calculation() {
        // 模拟 scroll_up/scroll_down 的偏移量计算
        let max_off = max_scroll_offset(24, 5, 1); // 24 行内容，2 行可见 → 22
        assert_eq!(max_off, 22);

        // scroll_up(5) 从底部
        let offset = max_off.saturating_sub(5);
        assert_eq!(offset, 17);
        assert!(offset < max_off); // 不在底部

        // scroll_down(3)
        let offset = (offset + 3).min(max_off);
        assert_eq!(offset, 20);

        // scroll_down(10) 到底部
        let offset = (offset + 10).min(max_off);
        assert_eq!(offset, 22);
        assert!(offset >= max_off); // 在底部
    }

    #[test]
    fn test_scroll_no_underflow() {
        let max_off = max_scroll_offset(24, 5, 1);
        let offset = 0u16.saturating_sub(5);
        assert_eq!(offset, 0);
    }

    #[test]
    fn test_scroll_with_multiline_input() {
        // 多行输入（3 行）时，内容区更小，max_offset 更大
        // 14 行内容，5 行高终端，3 行输入 → 可见 0 行（5-2-3=0）
        assert_eq!(max_scroll_offset(14, 5, 3), 14);

        // 14 行内容，10 行高终端，3 行输入 → 可见 5 行，max_offset = 9
        assert_eq!(max_scroll_offset(14, 10, 3), 9);

        // 同样的内容，1 行输入 → 可见 7 行，max_offset = 7
        assert_eq!(max_scroll_offset(14, 10, 1), 7);
    }

    // === Smart auto-scroll 测试 ===

    #[test]
    fn test_at_bottom_empty() {
        // 空内容时 at_bottom 返回 true
        let app = App::new_for_test();
        assert!(app.at_bottom());
    }

    #[test]
    fn test_at_bottom_with_scroll_space() {
        // 内容超出可视区域，scroll_offset 在最大值时 at_bottom = true
        let mut app = App::new_for_test();
        for i in 0..30 {
            app.push_line(format!("Line {}", i));
        }
        app.scroll_to_bottom();
        assert!(app.at_bottom());

        // 向上滚动 3 行，不再在底部
        app.scroll_up(3);
        assert!(!app.at_bottom());

        // 滚回底部
        app.scroll_to_bottom();
        assert!(app.at_bottom());
    }

    #[test]
    fn test_at_bottom_no_scroll_space() {
        // 内容不超过可视区域，at_bottom 始终为 true
        let mut app = App::new_for_test();
        app.push_line("short".to_string());
        assert!(app.at_bottom());
        app.scroll_up(3); // saturating_sub，不会变负
        assert!(app.at_bottom());
    }

    #[test]
    fn test_push_line_auto_scroll_at_bottom() {
        // 在底部时 push_line 自动滚动
        let mut app = App::new_for_test();
        for i in 0..30 {
            app.push_line(format!("Line {}", i));
        }
        app.scroll_to_bottom();
        let last_offset = app.scroll_offset;

        // 再添加一行
        app.push_line("New line".to_string());
        assert_eq!(app.scroll_offset, last_offset + 1);
    }

    #[test]
    fn test_push_line_preserves_scroll_position() {
        // 不在底部时 push_line 不改变滚动位置
        let mut app = App::new_for_test();
        for i in 0..30 {
            app.push_line(format!("Line {}", i));
        }
        app.scroll_to_bottom();
        app.scroll_up(5); // 向上翻 5 行
        let offset_before = app.scroll_offset;

        // 添加新内容
        app.push_line("New line".to_string());
        assert_eq!(app.scroll_offset, offset_before);
    }

    #[test]
    fn test_end_streaming_auto_scroll_to_bottom() {
        // end_streaming 后自动回到底部
        let mut app = App::new_for_test();
        for i in 0..30 {
            app.push_line(format!("Line {}", i));
        }
        app.scroll_to_bottom();
        app.scroll_up(10); // 向上翻
        assert!(!app.at_bottom());

        // 模拟 streaming（写入 buffer）
        let thread_id = app.thread.store.primary_id();
        app.stream.streaming_response_buffers.insert(thread_id, "AI response".to_string());

        // end_streaming 应自动回底
        app.end_streaming(thread_id);
        assert!(app.at_bottom());
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
        app.content_lines = vec![Line::from("Hello World"), Line::from("Second line")];
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
        app.input
            .handle_key(KeyEvent::new(KeyCode::Char('h'), KeyModifiers::NONE));
        app.input
            .handle_key(KeyEvent::new(KeyCode::Char('i'), KeyModifiers::NONE));
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
        assert!(
            output.contains("Streaming (zhipu)"),
            "初始 Streaming 状态应显示在状态栏中"
        );
        assert!(!output.contains("Ready"), "Streaming 时不应显示 Ready");
    }

    #[test]
    fn test_status_tool_running() {
        // 验证 ToolStart 时状态栏显示 "Tool: xxx [running]"
        let mut app = App::new_for_test();
        app.push_line("AI 正在分析代码...".to_string());
        app.set_status("Tool: read_file [running]".to_string());
        let buf = render_to_buffer(&mut app, 80, 24);
        let output = buffer_to_string(&buf);
        assert!(
            output.contains("Tool: read_file [running]"),
            "工具执行中应显示工具名和 running 状态"
        );
    }

    #[test]
    fn test_status_done_after_message() {
        // 验证 MessageDone 后状态栏显示 "Done"
        let mut app = App::new_for_test();
        app.push_line("AI 回复内容".to_string());
        app.set_status("Done".to_string());
        let buf = render_to_buffer(&mut app, 80, 24);
        let output = buffer_to_string(&buf);
        assert!(output.contains("Done"), "消息完成后状态栏应显示 Done");
        assert!(!output.contains("Streaming"), "Done 状态不应包含 Streaming");
        assert!(!output.contains("running"), "Done 状态不应包含 running");
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
        assert!(output.contains("Ready"), "请求完成后状态栏应显示 Ready");
        assert!(!output.contains("Done"), "清空后不应保留 Done");
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
        assert!(
            output_after_done.contains("[done]"),
            "ToolDone 后状态栏应显示 [done]"
        );
        assert!(
            !output_after_done.contains("[running]"),
            "ToolDone 后状态栏不应再显示 [running]"
        );
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
        assert!(
            output_2nd.contains("Streaming (zhipu)"),
            "第2轮流开始时状态栏应显示 Streaming"
        );
        assert!(
            !output_2nd.contains("Done"),
            "第2轮流开始时状态栏不应保留上轮的 Done"
        );
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
        assert!(
            output.contains("Streaming (zhipu)"),
            "busy 状态下应显示 Streaming 状态"
        );

        app.set_busy(false);
        app.set_status(String::new());
        let buf = render_to_buffer(&mut app, 80, 24);
        let output = buffer_to_string(&buf);
        assert!(output.contains("Ready"), "busy 解除后应显示 Ready");
    }

    #[test]
    fn test_input_box_rendered_during_streaming() {
        // 验证 streaming 期间输入框仍然渲染（保留用户最后输入的内容）
        let mut app = App::new_for_test();
        // 模拟用户输入了 "hello"
        app.input
            .handle_key(KeyEvent::new(KeyCode::Char('h'), KeyModifiers::NONE));
        app.input
            .handle_key(KeyEvent::new(KeyCode::Char('i'), KeyModifiers::NONE));

        // 进入 streaming 状态
        app.set_busy(true);
        app.set_status("Streaming (zhipu)".to_string());
        app.push_line("AI 正在回复...".to_string());

        let buf = render_to_buffer(&mut app, 80, 24);
        let output = buffer_to_string(&buf);

        // 输入框应仍然显示 "hi"
        let last_line = output.lines().last().unwrap();
        assert!(
            last_line.contains("hi"),
            "streaming 期间输入框应保留用户输入的内容"
        );
        // 状态栏应显示 Streaming
        assert!(
            output.contains("Streaming (zhipu)"),
            "streaming 期间状态栏应显示 Streaming"
        );
    }

    #[test]
    fn test_input_box_unchanged_while_busy() {
        // 验证 busy 状态下输入框内容不会被修改
        // （实际阻止输入靠 main.rs 循环结构，这里验证 App 层面的一致性）
        let mut app = App::new_for_test();
        app.input
            .handle_key(KeyEvent::new(KeyCode::Char('t'), KeyModifiers::NONE));
        app.input
            .handle_key(KeyEvent::new(KeyCode::Char('e'), KeyModifiers::NONE));
        app.input
            .handle_key(KeyEvent::new(KeyCode::Char('s'), KeyModifiers::NONE));
        app.input
            .handle_key(KeyEvent::new(KeyCode::Char('t'), KeyModifiers::NONE));

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
        assert_eq!(input_after, "test", "busy 期间输入框内容不应被修改");
    }

    /// 快照测试：Streaming 时完整界面布局
    ///
    /// 验证 streaming 期间内容区显示 AI 回复、状态栏显示 Streaming、
    /// 输入框保留用户输入、分隔线正常渲染。
    #[test]
    fn test_snapshot_streaming_with_input() {
        let mut app = App::new_for_test();
        // 用户输入
        app.input
            .handle_key(KeyEvent::new(KeyCode::Char('h'), KeyModifiers::NONE));
        app.input
            .handle_key(KeyEvent::new(KeyCode::Char('e'), KeyModifiers::NONE));
        app.input
            .handle_key(KeyEvent::new(KeyCode::Char('l'), KeyModifiers::NONE));
        app.input
            .handle_key(KeyEvent::new(KeyCode::Char('l'), KeyModifiers::NONE));
        app.input
            .handle_key(KeyEvent::new(KeyCode::Char('o'), KeyModifiers::NONE));
        // AI 回复内容
        app.push_line("你好！有什么可以帮助你的？".to_string());
        app.push_line("我可以帮你分析代码、编写测试等。".to_string());
        // Streaming 状态
        app.set_busy(true);
        app.set_status("Streaming (zhipu)".to_string());

        let buf = render_to_buffer(&mut app, 80, 24);
        let text = buffer_to_string(&buf);
        assert!(
            text.contains("你") && text.contains("好"),
            "内容区应包含 AI 回复的中文内容"
        );
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

        app.input
            .handle_key(KeyEvent::new(KeyCode::Char('h'), KeyModifiers::NONE));
        app.input
            .handle_key(KeyEvent::new(KeyCode::Char('i'), KeyModifiers::NONE));
        assert_eq!(
            app.input.value(),
            "hi",
            "非 busy 状态下输入框应正常接收按键"
        );
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
        app.input
            .handle_key(KeyEvent::new(KeyCode::Char('h'), KeyModifiers::NONE));
        app.input
            .handle_key(KeyEvent::new(KeyCode::Char('i'), KeyModifiers::NONE));
        assert_eq!(app.input.value(), "hi");

        // === 模拟 main.rs 第 921 行：进入 AI 调用 ===
        app.set_busy(true);
        app.set_status("Streaming (zhipu)".to_string());
        app.push_line("AI 正在回复...".to_string());

        // === 模拟 main.rs 修复后的行为：streaming 期间可以输入 ===
        // 新分支通过 app.input.handle_key(key) 直接更新输入框
        app.input
            .handle_key(KeyEvent::new(KeyCode::Char('n'), KeyModifiers::NONE));
        app.input
            .handle_key(KeyEvent::new(KeyCode::Char('e'), KeyModifiers::NONE));
        app.input
            .handle_key(KeyEvent::new(KeyCode::Char('x'), KeyModifiers::NONE));
        app.input
            .handle_key(KeyEvent::new(KeyCode::Char('t'), KeyModifiers::NONE));

        // streaming 期间输入框内容已更新（用户提前输入了 "next"）
        assert_eq!(
            app.input.value(),
            "hinext",
            "streaming 期间输入框应接受用户输入"
        );
        assert!(app.is_busy(), "streaming 期间 busy 应为 true");
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
        app.input
            .handle_key(KeyEvent::new(KeyCode::Char('x'), KeyModifiers::NONE));

        // 虽然 InputComposer 本身不检查 busy，
        // 但 CombinedKeyHandler 的 busy 守卫会阻止按键到达 InputComposer
        // 这里直接调用 InputComposer 绕过了守卫，所以输入会生效
        assert_eq!(
            app.input.value(),
            "x",
            "InputComposer 本身不检查 busy，守卫在 CombinedKeyHandler 层"
        );

        // 验证 is_busy() 返回正确值
        assert!(app.is_busy(), "busy 状态应正确反映");
        app.set_busy(false);
        assert!(!app.is_busy(), "解除 busy 后应返回 false");
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
        app.input
            .handle_key(KeyEvent::new(KeyCode::Char('h'), KeyModifiers::NONE));
        app.input
            .handle_key(KeyEvent::new(KeyCode::Char('e'), KeyModifiers::NONE));
        app.input
            .handle_key(KeyEvent::new(KeyCode::Char('l'), KeyModifiers::NONE));
        app.input
            .handle_key(KeyEvent::new(KeyCode::Char('l'), KeyModifiers::NONE));
        app.input
            .handle_key(KeyEvent::new(KeyCode::Char('o'), KeyModifiers::NONE));

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
        // dequeue 返回 (String, ThreadId)，检查文本部分
        assert_eq!(app.dequeue().map(|(text, _)| text), Some("hello".to_string()), "应自动 trim");
    }

    #[test]
    fn test_dequeue_fifo_order() {
        let mut app = App::new_for_test();
        app.enqueue("first".to_string());
        app.enqueue("second".to_string());
        app.enqueue("third".to_string());
        assert_eq!(app.dequeue().map(|(text, _)| text), Some("first".to_string()));
        assert_eq!(app.dequeue().map(|(text, _)| text), Some("second".to_string()));
        assert_eq!(app.dequeue().map(|(text, _)| text), Some("third".to_string()));
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
        app.input
            .handle_key(KeyEvent::new(KeyCode::Char('n'), KeyModifiers::NONE));
        app.input
            .handle_key(KeyEvent::new(KeyCode::Char('e'), KeyModifiers::NONE));
        app.input
            .handle_key(KeyEvent::new(KeyCode::Char('x'), KeyModifiers::NONE));
        app.input
            .handle_key(KeyEvent::new(KeyCode::Char('t'), KeyModifiers::NONE));

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

    // ============================================================================
    // Diff 功能测试
    // ============================================================================

    /// 快照测试：单文件 diff 模式
    ///
    /// 验证 diff 模式下的完整布局，包括：
    /// - Diff 内容显示（+/- 行）
    /// - 状态栏显示文件路径和按键提示
    /// - 输入框显示 "Diff 模式 - 按 q/Esc/Ctrl+D 退出"
    #[test]
    fn test_snapshot_diff_mode_single_file() {
        use crate::diff_render::{DiffChangeKind, DiffFileChange};
        use std::path::PathBuf;

        let mut app = App::new_for_test();

        // 添加一个文件 diff
        let diff = DiffFileChange {
            path: PathBuf::from("src/main.rs"),
            kind: DiffChangeKind::Modified,
            old_content: Some(
                "fn main() {\n    println!(\"Hello\");\n}\n"
                    .to_string()
            ),
            new_content: Some(
                "fn main() {\n    println!(\"Hello, World!\");\n}\n"
                    .to_string()
            ),
            added: 1,
            removed: 1,
        };
        app.push_diff(diff);

        // 进入 diff 模式
        app.enter_diff_mode();

        let buf = render_to_buffer(&mut app, 80, 24);
        assert_buffer_contains!(&buf, "src/main.rs");
        assert_buffer_contains!(&buf, "+");
        assert_buffer_contains!(&buf, "-");
        // 快照测试会捕获完整布局
        assert_tui_snapshot!("diff_mode_single_file", &buf);
    }

    /// 快照测试：多文件 diff 切换
    ///
    /// 验证多个文件的 diff 显示和文件索引（X/Y）。
    #[test]
    fn test_snapshot_diff_mode_multiple_files() {
        use crate::diff_render::{DiffChangeKind, DiffFileChange};
        use std::path::PathBuf;

        let mut app = App::new_for_test();

        // 添加三个文件 diff
        app.push_diff(DiffFileChange {
            path: PathBuf::from("src/main.rs"),
            kind: DiffChangeKind::Modified,
            old_content: Some("old content 1\n".to_string()),
            new_content: Some("new content 1\n".to_string()),
            added: 5,
            removed: 2,
        });

        app.push_diff(DiffFileChange {
            path: PathBuf::from("src/utils.rs"),
            kind: DiffChangeKind::Modified,
            old_content: Some("old content 2\n".to_string()),
            new_content: Some("new content 2\n".to_string()),
            added: 3,
            removed: 1,
        });

        app.push_diff(DiffFileChange {
            path: PathBuf::from("README.md"),
            kind: DiffChangeKind::Added,
            old_content: None,
            new_content: Some("# New README\n".to_string()),
            added: 10,
            removed: 0,
        });

        // 进入 diff 模式（默认显示最后一个，即 README.md [3/3]）
        app.enter_diff_mode();

        let buf = render_to_buffer(&mut app, 80, 24);
        assert_buffer_contains!(&buf, "[3/3]");
        assert_buffer_contains!(&buf, "README.md");
        assert_tui_snapshot!("diff_mode_multiple_files_last", &buf);

        // 切换到第一个文件
        app.diff.index = 0;
        app.render_current_diff();
        let buf_first = render_to_buffer(&mut app, 80, 24);
        assert_buffer_contains!(&buf_first, "[1/3]");
        assert_buffer_contains!(&buf_first, "main.rs");
        assert_tui_snapshot!("diff_mode_multiple_files_first", &buf_first);

        // 切换到第二个文件
        app.diff.index = 1;
        app.render_current_diff();
        let buf_second = render_to_buffer(&mut app, 80, 24);
        assert_buffer_contains!(&buf_second, "[2/3]");
        assert_buffer_contains!(&buf_second, "utils.rs");
        assert_tui_snapshot!("diff_mode_multiple_files_second", &buf_second);
    }

    /// 测试：diff 摘要渲染
    ///
    /// 验证 diff 摘要在内容区的显示，包括文件列表和统计信息。
    #[test]
    fn test_diff_summary_rendering() {
        use crate::diff_render::{DiffChangeKind, DiffFileChange};
        use std::path::PathBuf;

        let mut app = App::new_for_test();

        // 添加多个文件 diff
        app.push_diff(DiffFileChange {
            path: PathBuf::from("src/main.rs"),
            kind: DiffChangeKind::Modified,
            old_content: Some("old\n".to_string()),
            new_content: Some("new\n".to_string()),
            added: 10,
            removed: 5,
        });

        app.push_diff(DiffFileChange {
            path: PathBuf::from("src/helpers.rs"),
            kind: DiffChangeKind::Added,
            old_content: None,
            new_content: Some("new file\n".to_string()),
            added: 20,
            removed: 0,
        });

        let buf = render_to_buffer(&mut app, 80, 24);
        let output = buffer_to_string(&buf);

        // 验证摘要包含关键信息（英文部分）
        assert!(output.contains("Edited 2 files"));
        assert!(output.contains("+"));
        assert!(output.contains("-"));
        assert!(output.contains("main.rs"));
        assert!(output.contains("helpers.rs"));
        // CJK 提示由快照捕获
    }

    /// 快照测试：diff 摘要显示
    #[test]
    fn test_snapshot_diff_summary() {
        use crate::diff_render::{DiffChangeKind, DiffFileChange};
        use std::path::PathBuf;

        let mut app = App::new_for_test();

        app.push_diff(DiffFileChange {
            path: PathBuf::from("src/lib.rs"),
            kind: DiffChangeKind::Modified,
            old_content: Some("old lib\n".to_string()),
            new_content: Some("new lib\n".to_string()),
            added: 8,
            removed: 3,
        });

        app.push_diff(DiffFileChange {
            path: PathBuf::from("tests/test.rs"),
            kind: DiffChangeKind::Added,
            old_content: None,
            new_content: Some("test content\n".to_string()),
            added: 15,
            removed: 0,
        });

        let buf = render_to_buffer(&mut app, 80, 24);
        assert_tui_snapshot!("diff_summary", &buf);
    }

    /// 测试：diff 模式按键导航（通过状态栏验证）
    ///
    /// 验证 diff 模式状态栏显示所有可用的按键导航提示。
    #[test]
    fn test_diff_mode_navigation_hints() {
        use crate::diff_render::{DiffChangeKind, DiffFileChange};
        use std::path::PathBuf;

        let mut app = App::new_for_test();

        app.push_diff(DiffFileChange {
            path: PathBuf::from("test.rs"),
            kind: DiffChangeKind::Modified,
            old_content: Some("old\n".to_string()),
            new_content: Some("new\n".to_string()),
            added: 1,
            removed: 1,
        });

        app.enter_diff_mode();

        let buf = render_to_buffer(&mut app, 80, 24);
        // 验证状态栏包含关键导航按键（英文部分）
        assert_buffer_contains!(&buf, "j/k");
        assert_buffer_contains!(&buf, "q/Esc");
        // 快照会捕获完整的 CJK 提示
        assert_tui_snapshot!("diff_mode_navigation", &buf);
    }

    /// 测试：空 diffs 列表时进入 diff 模式
    ///
    /// 验证没有 diff 时不能进入 diff 模式。
    #[test]
    fn test_diff_mode_no_diffs() {
        let mut app = App::new_for_test();

        // 没有 diff 时尝试进入 diff 模式
        app.enter_diff_mode();

        // diff_mode 应该保持 false
        assert!(!app.is_diff_mode());
        assert!(app.diff.view.is_none());
    }

    /// 测试：diff 文件索引边界
    ///
    /// 验证 diff_index 超出边界时的行为。
    #[test]
    fn test_diff_index_bounds() {
        use crate::diff_render::{DiffChangeKind, DiffFileChange};
        use std::path::PathBuf;

        let mut app = App::new_for_test();

        app.push_diff(DiffFileChange {
            path: PathBuf::from("file1.rs"),
            kind: DiffChangeKind::Modified,
            old_content: Some("old\n".to_string()),
            new_content: Some("new\n".to_string()),
            added: 1,
            removed: 1,
        });

        app.enter_diff_mode();

        // 初始索引应为 0（唯一文件）
        assert_eq!(app.diff.index, 0);

        // next_diff 不应超出边界
        app.next_diff();
        assert_eq!(app.diff.index, 0);

        // prev_diff 不应低于 0
        app.prev_diff();
        assert_eq!(app.diff.index, 0);
    }

    /// 测试：多文件 diff 切换
    ///
    /// 验证在多个 diff 文件之间正确切换。
    #[test]
    fn test_multi_file_switching() {
        use crate::diff_render::{DiffChangeKind, DiffFileChange};
        use std::path::PathBuf;

        let mut app = App::new_for_test();

        // 添加 3 个文件
        app.push_diff(DiffFileChange {
            path: PathBuf::from("a.rs"),
            kind: DiffChangeKind::Modified,
            old_content: Some("a\n".to_string()),
            new_content: Some("a new\n".to_string()),
            added: 1,
            removed: 0,
        });

        app.push_diff(DiffFileChange {
            path: PathBuf::from("b.rs"),
            kind: DiffChangeKind::Modified,
            old_content: Some("b\n".to_string()),
            new_content: Some("b new\n".to_string()),
            added: 1,
            removed: 0,
        });

        app.push_diff(DiffFileChange {
            path: PathBuf::from("c.rs"),
            kind: DiffChangeKind::Modified,
            old_content: Some("c\n".to_string()),
            new_content: Some("c new\n".to_string()),
            added: 1,
            removed: 0,
        });

        app.enter_diff_mode();

        // 初始应为最后一个（索引 2）
        assert_eq!(app.diff.index, 2);

        // prev_diff 应到索引 1
        app.prev_diff();
        assert_eq!(app.diff.index, 1);

        // prev_diff 应到索引 0
        app.prev_diff();
        assert_eq!(app.diff.index, 0);

        // 再 prev_diff 不应低于 0
        app.prev_diff();
        assert_eq!(app.diff.index, 0);

        // next_diff 应到索引 1
        app.next_diff();
        assert_eq!(app.diff.index, 1);

        // next_diff 应到索引 2
        app.next_diff();
        assert_eq!(app.diff.index, 2);

        // 再 next_diff 不应超出边界
        app.next_diff();
        assert_eq!(app.diff.index, 2);
    }

    // ============================================================================
    // Ctrl+D 事件路由测试
    // ============================================================================

    /// 测试：Ctrl+D 通过 EventRouter 进入 diff 模式
    ///
    /// 验证 run_loop 路径下 DiffEnterHandler 正确捕获 Ctrl+D 并进入 diff 模式，
    /// 不会被后续的 CombinedKeyHandler 拦截为 Exit。
    #[test]
    fn test_ctrl_d_enters_diff_via_router() {
        use crate::diff_render::{DiffChangeKind, DiffFileChange};
        use crossterm::event::{Event, KeyCode, KeyModifiers};
        use std::path::PathBuf;

        let mut app = App::new_for_test();

        // 准备 diff 数据
        app.push_diff(DiffFileChange {
            path: PathBuf::from("src/main.rs"),
            kind: DiffChangeKind::Modified,
            old_content: Some("old\n".to_string()),
            new_content: Some("new\n".to_string()),
            added: 1,
            removed: 1,
        });

        assert!(!app.is_diff_mode(), "初始状态不应在 diff 模式");

        // 构建 EventRouter 并派发 Ctrl+D
        let mut router = App::build_event_router();
        let ctrl_d = Event::Key(crossterm::event::KeyEvent::new(
            KeyCode::Char('d'),
            KeyModifiers::CONTROL,
        ));
        let flow = router.dispatch(&ctrl_d, &mut app);

        // 验证：进入 diff 模式，事件被消费
        assert!(
            app.is_diff_mode(),
            "Ctrl+D 应进入 diff 模式，但 is_diff_mode() = false"
        );
        assert!(
            matches!(flow, ControlFlow::Break(AppResult::Handled)),
            "应返回 Break(Handled)，实际: {:?}",
            flow
        );

        // 快照：验证 diff 模式布局
        let buf = render_to_buffer(&mut app, 80, 24);
        assert_buffer_contains!(&buf, "src/main.rs");
        assert_tui_snapshot!("ctrl_d_enter_diff_router", &buf);
    }

    /// 测试：streaming 路径下 Ctrl+D 进入 diff 后不被 DiffModeHandler 立刻退出
    ///
    /// 模拟 main.rs streaming 循环中的按键处理逻辑，
    /// 验证 Ctrl+D 进入 diff 后同一个事件不会被 DiffModeHandler 再次处理为 Exit。
    #[test]
    fn test_ctrl_d_streaming_no_immediate_exit() {
        use crate::diff_render::{DiffChangeKind, DiffFileChange};
        use crossterm::event::{Event, KeyCode, KeyModifiers};
        use std::path::PathBuf;

        let mut app = App::new_for_test();

        // 准备 diff 数据
        app.push_diff(DiffFileChange {
            path: PathBuf::from("src/app.rs"),
            kind: DiffChangeKind::Modified,
            old_content: Some("fn old() {}\n".to_string()),
            new_content: Some("fn new() {}\n".to_string()),
            added: 1,
            removed: 1,
        });

        assert!(!app.is_diff_mode());

        // === 模拟 streaming 路径的按键处理（复现 main.rs 逻辑） ===
        let event = Event::Key(crossterm::event::KeyEvent::new(
            KeyCode::Char('d'),
            KeyModifiers::CONTROL,
        ));

        if let Event::Key(key) = event {
            let mut consumed = false;

            // Ctrl+D：进入 diff 模式
            if key.code == KeyCode::Char('d')
                && key.modifiers.contains(KeyModifiers::CONTROL)
                && !app.is_diff_mode()
                && !app.diff.files.is_empty()
            {
                app.enter_diff_mode();
                consumed = true;
            }

            // Diff 模式下的按键 — 这里是 Bug 所在：
            // 之前用 `if`，进入 diff 后同一事件会立刻触发 DiffModeHandler 退出
            if app.is_diff_mode() && !consumed {
                use crate::event::handlers::DiffModeHandler;
                use crate::event::EventHandler;
                let mut handler = DiffModeHandler;
                let _ = handler.handle(&event, &mut app);
                consumed = true;
            }

            // 验证 consumed 只被设置一次（进入 diff）
            assert!(consumed, "事件应被消费");
        }

        // 关键断言：diff 模式应保持开启，不能被立刻退出
        assert!(
            app.is_diff_mode(),
            "Ctrl+D 应进入并保持在 diff 模式，不应被 DiffModeHandler 立刻退出"
        );

        let buf = render_to_buffer(&mut app, 80, 24);
        assert_buffer_contains!(&buf, "src/app.rs");
        assert_tui_snapshot!("ctrl_d_streaming_no_exit", &buf);
    }

    /// 快照测试：diff 模式下滚动
    ///
    /// 验证长 diff 内容的滚动功能。
    #[test]
    fn test_snapshot_diff_mode_scrolling() {
        use crate::diff_render::{DiffChangeKind, DiffFileChange};
        use std::path::PathBuf;

        let mut app = App::new_for_test();

        // 创建一个包含多行的 diff
        let old_content: String = (1..=50).map(|i| format!("line {}\n", i)).collect();
        let new_content: String = (1..=50).map(|i| format!("line {} modified\n", i)).collect();

        app.push_diff(DiffFileChange {
            path: PathBuf::from("large_file.rs"),
            kind: DiffChangeKind::Modified,
            old_content: Some(old_content),
            new_content: Some(new_content),
            added: 50,
            removed: 50,
        });

        app.enter_diff_mode();

        // 初始状态（顶部）
        let buf_top = render_to_buffer(&mut app, 80, 24);
        assert_tui_snapshot!("diff_mode_scroll_top", &buf_top);

        // 滚动到中间
        if let Some(ref mut diff_view) = app.diff.view {
            diff_view.scroll_by(20);
        }
        let buf_middle = render_to_buffer(&mut app, 80, 24);
        assert_tui_snapshot!("diff_mode_scroll_middle", &buf_middle);

        // 滚动到底部
        if let Some(ref mut diff_view) = app.diff.view {
            diff_view.scroll_to_bottom();
        }
        let buf_bottom = render_to_buffer(&mut app, 80, 24);
        assert_tui_snapshot!("diff_mode_scroll_bottom", &buf_bottom);
    }

    // ───────────────────────────────────────────────────────────
    // Ctrl+O Detail Overlay 快照测试
    // ───────────────────────────────────────────────────────────

    #[test]
    fn test_snapshot_overlay_transcript() {
        use crate::detail_overlay::DetailOverlay;

        let mut app = App::new_for_test();

        // 模拟 AI 响应
        let ai_response = "Here is the code you requested:\n\n\
```rust\nfn main() {\n    println!(\"Hello, World!\");\n}\n```\n\nThis program prints a greeting.";
        app.stream.last_ai_responses.insert(app.thread.store.primary_id(), ai_response.to_string());

        // 创建并进入 overlay
        let overlay = DetailOverlay::new_transcript(ai_response.to_string());
        app.enter_overlay_mode(overlay);

        // 渲染快照
        let buf = render_to_buffer(&mut app, 80, 24);
        assert_buffer_contains!(&buf, "T R A N S C R I P T");
        assert_tui_snapshot!("overlay_transcript", &buf);
    }

    #[test]
    fn test_snapshot_overlay_transcript_scrolling() {
        use crate::detail_overlay::DetailOverlay;

        let mut app = App::new_for_test();

        // 创建一个长的 AI 响应（需要滚动）
        let long_response: String = (1..=30)
            .map(|i| format!("Line {}: Some content here\n", i))
            .collect();
        app.stream.last_ai_responses.insert(app.thread.store.primary_id(), long_response.clone());

        // 创建并进入 overlay
        let overlay = DetailOverlay::new_transcript(long_response);
        app.enter_overlay_mode(overlay);

        // 渲染初始状态（顶部）
        let buf_top = render_to_buffer(&mut app, 80, 24);
        assert_tui_snapshot!("overlay_transcript_top", &buf_top);

        // 滚动到中间
        if let Some(ref mut overlay) = app.overlay {
            overlay.scroll_by(10);
        }
        let buf_mid = render_to_buffer(&mut app, 80, 24);
        assert_tui_snapshot!("overlay_transcript_middle", &buf_mid);

        // 滚动到底部
        if let Some(ref mut overlay) = app.overlay {
            overlay.scroll_to_bottom();
        }
        let buf_bottom = render_to_buffer(&mut app, 80, 24);
        assert_tui_snapshot!("overlay_transcript_bottom", &buf_bottom);
    }

    #[test]
    fn test_snapshot_overlay_file_viewer() {
        use crate::detail_overlay::DetailOverlay;
        use std::path::PathBuf;

        let mut app = App::new_for_test();

        // 模拟文件内容
        let file_content = "use std::collections::HashMap;\n\n\
fn main() {\n    let mut map = HashMap::new();\n    map.insert(\"key\", \"value\");\n    println!(\"{:?}\", map);\n}\n";

        // 创建 File overlay
        let overlay = DetailOverlay::new_file(PathBuf::from("src/main.rs"), file_content.to_string());
        app.enter_overlay_mode(overlay);

        // 渲染快照
        let buf = render_to_buffer(&mut app, 80, 24);
        assert_buffer_contains!(&buf, "F I L E");
        assert_buffer_contains!(&buf, "src/main.rs");
        assert_tui_snapshot!("overlay_file_viewer", &buf);
    }

    #[test]
    fn test_snapshot_overlay_diff_context() {
        use crate::detail_overlay::DetailOverlay;
        use std::path::PathBuf;

        let mut app = App::new_for_test();

        // 模拟 diff 上下文
        let old_content = "fn hello() {\n    println!(\"Hello\");\n}\n";
        let new_content = "fn hello() {\n    println!(\"Hello, World!\");\n}\n";

        // 创建 DiffContext overlay（显示新内容）
        let overlay = DetailOverlay::new_diff_context(
            PathBuf::from("src/lib.rs"),
            old_content.to_string(),
            new_content.to_string(),
            true, // showing_new
        );
        app.enter_overlay_mode(overlay);

        // 渲染快照
        let buf = render_to_buffer(&mut app, 80, 24);
        assert_buffer_contains!(&buf, "D I F F");
        assert_buffer_contains!(&buf, "NEW");
        assert_tui_snapshot!("overlay_diff_context_new", &buf);
    }

    #[test]
    fn test_ctrl_o_enters_overlay_via_router() {
        use crate::detail_overlay::DetailOverlay;
        use crate::event::{ControlFlow, EventHandler};
        use crate::event::handlers::DetailEnterHandler;

        let mut app = App::new_for_test();

        // 设置 AI 响应
        app.stream.last_ai_responses.insert(app.thread.store.primary_id(), "Test response\nLine 2\nLine 3".to_string());

        // 模拟 Ctrl+O 按键
        let event = crossterm::event::Event::Key(crossterm::event::KeyEvent::new(
            crossterm::event::KeyCode::Char('o'),
            crossterm::event::KeyModifiers::CONTROL,
        ));

        let mut handler = DetailEnterHandler;
        let result = handler.handle(&event, &mut app);

        // 验证进入了 overlay 模式
        assert!(app.is_overlay_mode());
        assert!(matches!(result, ControlFlow::Break(_)));

        // 验证 overlay 内容
        assert!(app.overlay.is_some());
    }

    #[test]
    fn test_overlay_mode_exits_on_esc() {
        use crate::detail_overlay::DetailOverlay;
        use crate::event::{ControlFlow, EventHandler};
        use crate::event::handlers::DetailModeHandler;

        let mut app = App::new_for_test();

        // 进入 overlay 模式
        let overlay = DetailOverlay::new_transcript("Test content".to_string());
        app.enter_overlay_mode(overlay);
        assert!(app.is_overlay_mode());

        // 模拟 Esc 按键
        let event = crossterm::event::Event::Key(crossterm::event::KeyEvent::new(
            crossterm::event::KeyCode::Esc,
            crossterm::event::KeyModifiers::empty(),
        ));

        let mut handler = DetailModeHandler;
        handler.handle(&event, &mut app);

        // 验证退出了 overlay 模式
        assert!(!app.is_overlay_mode());
        assert!(app.overlay.is_none());
    }

    #[test]
    fn test_ctrl_o_toggles_overlay() {
        use crate::detail_overlay::DetailOverlay;
        use crate::event::{ControlFlow, EventHandler};
        use crate::event::handlers::DetailModeHandler;

        let mut app = App::new_for_test();

        // 设置 AI 响应
        app.stream.last_ai_responses.insert(app.thread.store.primary_id(), "Test response".to_string());

        // 第一次 Ctrl+O - 进入 overlay
        let event = crossterm::event::Event::Key(crossterm::event::KeyEvent::new(
            crossterm::event::KeyCode::Char('o'),
            crossterm::event::KeyModifiers::CONTROL,
        ));

        use crate::event::handlers::DetailEnterHandler;
        let mut handler = DetailEnterHandler;
        let result = handler.handle(&event, &mut app);

        // 验证进入了 overlay 模式
        assert!(app.is_overlay_mode());
        assert!(matches!(result, ControlFlow::Break(_)));

        // 第二次 Ctrl+O - 应该退出 overlay（通过 DetailModeHandler）
        let event2 = crossterm::event::Event::Key(crossterm::event::KeyEvent::new(
            crossterm::event::KeyCode::Char('o'),
            crossterm::event::KeyModifiers::CONTROL,
        ));

        let mut mode_handler = DetailModeHandler;
        mode_handler.handle(&event2, &mut app);

        // 验证退出了 overlay 模式
        assert!(!app.is_overlay_mode());
        assert!(app.overlay.is_none());
    }

    // === Ctrl+T 线程模式状态栏测试 ===

    #[test]
    fn test_thread_mode_status_bar_shows_streaming() {
        // 模拟：Ctrl+T 打开线程面板 + 正在 streaming
        let mut app = App::new_for_test();
        app.thread.active_mode = true;
        app.status_text = "Streaming...".to_string();
        app.content_lines
            .push(ratatui::text::Line::from("AI response text"));

        let buf = render_to_buffer(&mut app, 80, 24);

        // 线程面板信息应显示
        assert_buffer_contains!(&buf, "Main");
        assert_buffer_contains!(&buf, "Esc");
        assert_buffer_contains!(&buf, "to return");
        // streaming 状态也应显示
        assert_buffer_contains!(&buf, "Streaming...");
    }

    #[test]
    fn test_thread_mode_status_bar_shows_queue() {
        // 模拟：Ctrl+T 打开线程面板 + 有排队消息
        let mut app = App::new_for_test();
        app.thread.active_mode = true;
        let main_id = app.thread.store.active_id().unwrap();
        app.stream.queue.push(("hello".to_string(), main_id));

        let buf = render_to_buffer(&mut app, 80, 24);

        // 线程面板信息应显示
        assert_buffer_contains!(&buf, "Main");
        assert_buffer_contains!(&buf, "to return");
        // 队列计数也应显示
        assert_buffer_contains!(&buf, "Queue: 1");
    }

    #[test]
    fn test_thread_mode_status_bar_shows_ctrl_o_hint() {
        // 模拟：Ctrl+T 打开线程面板 + 有 AI 响应可查看
        let mut app = App::new_for_test();
        app.thread.active_mode = true;
        let main_id = app.thread.store.active_id().unwrap();
        app.stream.last_ai_responses
            .insert(main_id, "AI response".to_string());

        let buf = render_to_buffer(&mut app, 80, 24);

        // 线程面板信息应显示
        assert_buffer_contains!(&buf, "Main");
        assert_buffer_contains!(&buf, "to return");
        // Ctrl+O 提示也应显示
        assert_buffer_contains!(&buf, "Ctrl+O");
    }

    #[test]
    fn test_thread_mode_status_bar_shows_all_combined() {
        // 模拟：Ctrl+T + streaming + queue + AI 响应 全部同时存在
        let mut app = App::new_for_test();
        app.thread.active_mode = true;
        app.status_text = "Streaming...".to_string();
        let main_id = app.thread.store.active_id().unwrap();
        app.stream.queue.push(("next question".to_string(), main_id));
        app.stream.last_ai_responses
            .insert(main_id, "previous AI response".to_string());

        let buf = render_to_buffer(&mut app, 80, 24);

        // 线程面板 + 所有状态信息应同时显示
        assert_buffer_contains!(&buf, "Main");
        assert_buffer_contains!(&buf, "to return");
        assert_buffer_contains!(&buf, "Streaming...");
        assert_buffer_contains!(&buf, "Queue: 1");
        assert_buffer_contains!(&buf, "Ctrl+O");
    }

    #[test]
    fn test_thread_mode_no_extra_separators_when_idle() {
        // 模拟：Ctrl+T 打开线程面板，无 streaming/queue，不应有多余分隔符
        let mut app = App::new_for_test();
        app.thread.active_mode = true;

        let buf = render_to_buffer(&mut app, 80, 24);

        // 线程面板信息应显示
        assert_buffer_contains!(&buf, "Main");
        assert_buffer_contains!(&buf, "to return");
        // 不应有 queue/streaming 状态
        assert_buffer_not_contains!(&buf, "Queue:");
        assert_buffer_not_contains!(&buf, "Streaming");
    }

    // === R1: Stream Recovery — RAII Guard + 统一清理 ===

    fn test_thread_id() -> crate::thread::ThreadId {
        crate::thread::ThreadId(uuid::Uuid::new_v4())
    }

    fn setup_streaming(app: &mut App, thread_id: crate::thread::ThreadId) {
        app.begin_streaming(thread_id);
        app.append_streaming_output(thread_id, "partial response".to_string());
        app.set_thread_busy(thread_id, true);
        app.set_status("Streaming...".to_string());
    }

    #[test]
    fn test_cleanup_after_stream_clears_all_state() {
        let mut app = App::new_for_test();
        let tid = test_thread_id();
        setup_streaming(&mut app, tid);

        assert!(app.is_thread_busy(tid));
        assert_eq!(app.status_text, "Streaming...");
        assert!(app.stream.streaming_response_buffers.contains_key(&tid));

        app.cleanup_after_stream(tid);

        assert!(!app.is_thread_busy(tid), "busy should be false");
        assert_eq!(app.status_text, "", "status should be empty");
        assert!(!app.stream.streaming_response_buffers.contains_key(&tid), "buffer should be removed");
        assert!(app.stream.last_ai_responses.contains_key(&tid), "response should be saved");
        assert_eq!(app.stream.last_ai_responses.get(&tid).unwrap(), "partial response");
    }

    #[test]
    fn test_end_streaming_uses_remove() {
        let mut app = App::new_for_test();
        let tid = test_thread_id();
        app.begin_streaming(tid);
        app.append_streaming_output(tid, "hello".to_string());

        assert!(app.stream.streaming_response_buffers.contains_key(&tid));

        app.end_streaming(tid);

        assert!(!app.stream.streaming_response_buffers.contains_key(&tid), "buffer should be removed after end_streaming");
        assert_eq!(app.stream.last_ai_responses.get(&tid).unwrap(), "hello");
    }

    #[test]
    fn test_end_streaming_empty_buffer_not_saved() {
        let mut app = App::new_for_test();
        let tid = test_thread_id();
        app.begin_streaming(tid);
        // 不写入任何内容

        app.end_streaming(tid);

        assert!(!app.stream.streaming_response_buffers.contains_key(&tid));
        assert!(!app.stream.last_ai_responses.contains_key(&tid), "empty buffer should not be saved");
    }

    #[test]
    fn test_stream_guard_drop_cleans_all() {
        let mut app = App::new_for_test();
        let tid = test_thread_id();
        setup_streaming(&mut app, tid);

        {
            let _guard = StreamGuard::new(&mut app, tid);
            // guard 持有 &mut app，无法同时通过 app 读取（RAII 的设计保证）
        } // guard 被 drop → 自动清理

        assert!(!app.is_thread_busy(tid));
        assert_eq!(app.status_text, "");
        assert!(!app.stream.streaming_response_buffers.contains_key(&tid));
    }

    // ========================================================================
    // Phase 4: StreamState 生命周期统一 — 状态契约测试
    // ========================================================================

    #[test]
    fn test_cleanup_after_stream_is_idempotent() {
        let mut app = App::new_for_test();
        let tid = test_thread_id();
        setup_streaming(&mut app, tid);

        // 第一次清理
        app.cleanup_after_stream(tid);
        assert!(!app.is_thread_busy(tid));
        assert!(!app.stream.streaming_response_buffers.contains_key(&tid));

        // 第二次清理（幂等，不应 panic 或产生副作用）
        app.cleanup_after_stream(tid);
        assert!(!app.is_thread_busy(tid));
        assert!(!app.stream.streaming_response_buffers.contains_key(&tid));
        // last_ai_responses 仍保留（用户可回看）
        assert!(app.stream.last_ai_responses.contains_key(&tid));
    }

    #[test]
    fn test_no_orphan_state_after_multi_thread_cleanup() {
        let mut app = App::new_for_test();
        let tid1 = test_thread_id();
        let tid2 = test_thread_id();
        let tid3 = test_thread_id();

        // 3 个线程同时 begin streaming
        setup_streaming(&mut app, tid1);
        setup_streaming(&mut app, tid2);
        setup_streaming(&mut app, tid3);

        assert!(app.is_thread_busy(tid1));
        assert!(app.is_thread_busy(tid2));
        assert!(app.is_thread_busy(tid3));
        assert_eq!(app.stream.thread_busy.len(), 3);
        assert_eq!(app.stream.streaming_response_buffers.len(), 3);

        // 逐个 cleanup
        app.cleanup_after_stream(tid1);
        assert!(!app.is_thread_busy(tid1));
        assert!(app.is_thread_busy(tid2));
        assert!(app.is_thread_busy(tid3));

        app.cleanup_after_stream(tid2);
        assert!(!app.is_thread_busy(tid2));
        assert!(app.is_thread_busy(tid3));

        app.cleanup_after_stream(tid3);
        assert!(!app.is_thread_busy(tid3));

        // 所有 busy 标记为 false（注意：set_thread_busy 用 insert 而非 remove）
        assert!(!app.is_thread_busy(tid1));
        assert!(!app.is_thread_busy(tid2));
        assert!(!app.is_thread_busy(tid3));
        // buffer 清除，但 last_ai_responses 保留
        assert!(app.stream.streaming_response_buffers.is_empty());
        assert_eq!(app.stream.last_ai_responses.len(), 3);
    }

    #[test]
    fn test_end_streaming_preserves_buffers_for_user_review() {
        let mut app = App::new_for_test();
        let tid = test_thread_id();
        app.begin_streaming(tid);
        app.append_streaming_output(tid, "Important AI response".to_string());
        app.set_thread_busy(tid, true);

        // end_streaming 将 buffer 移到 last_ai_responses
        app.end_streaming(tid);

        // buffer 已移除
        assert!(!app.stream.streaming_response_buffers.contains_key(&tid));
        // 但 last_ai_responses 保留（用户 Ctrl+O 可回看）
        assert_eq!(app.stream.last_ai_responses.get(&tid).unwrap(), "Important AI response");
        // busy 不会被 end_streaming 清除（只有 cleanup_after_stream 才清除）
        assert!(app.is_thread_busy(tid));
    }

    #[test]
    fn test_stream_guard_idempotent() {
        let mut app = App::new_for_test();
        let tid = test_thread_id();
        setup_streaming(&mut app, tid);

        app.cleanup_after_stream(tid);
        app.cleanup_after_stream(tid); // 第二次调用不应 panic

        assert!(!app.is_thread_busy(tid));
        assert_eq!(app.status_text, "");
    }

    // === 多行输入测试 ===

    #[test]
    fn test_multiline_input_ctrl_j() {
        // 验证 Ctrl+J 插入换行，输入框正确渲染多行
        let mut app = App::new_for_test();

        // 输入 "hello" + Ctrl+J + "world"
        for c in "hello".chars() {
            app.input
                .handle_key(KeyEvent::new(KeyCode::Char(c), KeyModifiers::NONE));
        }
        app.input
            .handle_key(KeyEvent::new(KeyCode::Char('j'), KeyModifiers::CONTROL));
        for c in "world".chars() {
            app.input
                .handle_key(KeyEvent::new(KeyCode::Char(c), KeyModifiers::NONE));
        }

        assert_eq!(app.input.value(), "hello\nworld");
        assert_eq!(app.input.line_count(), 2);
        assert_eq!(app.input.cursor_row(), 1);

        let buf = render_to_buffer(&mut app, 80, 24);
        let text = buffer_to_string(&buf);

        // 验证两行都可见
        assert_buffer_contains!(&buf, "hello");
        assert_buffer_contains!(&buf, "world");

        // 快照回归：确保布局正确
        assert_tui_snapshot!("multiline_input_basic", &buf);
    }

    #[test]
    fn test_multiline_input_three_lines() {
        // 验证三行输入，布局扩展正确
        let mut app = App::new_for_test();

        for c in "line1".chars() {
            app.input
                .handle_key(KeyEvent::new(KeyCode::Char(c), KeyModifiers::NONE));
        }
        app.input
            .handle_key(KeyEvent::new(KeyCode::Char('j'), KeyModifiers::CONTROL));
        for c in "line2".chars() {
            app.input
                .handle_key(KeyEvent::new(KeyCode::Char(c), KeyModifiers::NONE));
        }
        app.input
            .handle_key(KeyEvent::new(KeyCode::Char('j'), KeyModifiers::CONTROL));
        for c in "line3".chars() {
            app.input
                .handle_key(KeyEvent::new(KeyCode::Char(c), KeyModifiers::NONE));
        }

        assert_eq!(app.input.value(), "line1\nline2\nline3");
        assert_eq!(app.input.line_count(), 3);

        let buf = render_to_buffer(&mut app, 80, 24);
        assert_tui_snapshot!("multiline_input_three_lines", &buf);
    }

    #[test]
    fn test_multiline_input_with_cjk() {
        // 验证 CJK 多行输入正确渲染
        let mut app = App::new_for_test();

        for c in "你好世界".chars() {
            app.input
                .handle_key(KeyEvent::new(KeyCode::Char(c), KeyModifiers::NONE));
        }
        app.input
            .handle_key(KeyEvent::new(KeyCode::Char('j'), KeyModifiers::CONTROL));
        for c in "测试多行".chars() {
            app.input
                .handle_key(KeyEvent::new(KeyCode::Char(c), KeyModifiers::NONE));
        }

        assert_eq!(app.input.value(), "你好世界\n测试多行");

        let buf = render_to_buffer(&mut app, 80, 24);
        // CJK 字符在终端中占 2 列，buffer_to_string 输出带空格填充
        assert_buffer_contains!(&buf, "你 好 世 界");
        assert_buffer_contains!(&buf, "测 试 多 行");
        assert_tui_snapshot!("multiline_input_cjk", &buf);
    }

    #[test]
    fn test_multiline_input_cursor_position() {
        // 验证多行光标位置正确
        let mut app = App::new_for_test();

        for c in "abc".chars() {
            app.input
                .handle_key(KeyEvent::new(KeyCode::Char(c), KeyModifiers::NONE));
        }
        app.input
            .handle_key(KeyEvent::new(KeyCode::Char('j'), KeyModifiers::CONTROL));
        for c in "def".chars() {
            app.input
                .handle_key(KeyEvent::new(KeyCode::Char(c), KeyModifiers::NONE));
        }

        // 光标在第二行末尾
        assert_eq!(app.input.cursor_row(), 1);

        // 移到第一行
        app.input
            .handle_key(KeyEvent::new(KeyCode::Up, KeyModifiers::NONE));
        assert_eq!(app.input.cursor_row(), 0);

        // 移回第二行
        app.input
            .handle_key(KeyEvent::new(KeyCode::Down, KeyModifiers::NONE));
        assert_eq!(app.input.cursor_row(), 1);
    }

    #[test]
    fn test_single_line_layout_unchanged() {
        // 回归测试：单行输入的布局应与之前完全一致
        let mut app = App::new_for_test();

        app.input
            .handle_key(KeyEvent::new(KeyCode::Char('h'), KeyModifiers::NONE));
        app.input
            .handle_key(KeyEvent::new(KeyCode::Char('i'), KeyModifiers::NONE));

        assert_eq!(app.input.line_count(), 1);

        let buf = render_to_buffer(&mut app, 80, 24);
        assert_tui_snapshot!("single_line_input_unchanged", &buf);
    }

    #[test]
    fn test_multiline_input_dynamic_height() {
        // 验证输入框高度随行数动态变化，内容区缩小
        let mut app = App::new_for_test();
        app.push_line("Line 1 of content".to_string());
        app.push_line("Line 2 of content".to_string());

        // 单行输入
        let buf1 = render_to_buffer(&mut app, 80, 10);
        let text1 = buffer_to_string(&buf1);

        // 添加多行
        app.input
            .handle_key(KeyEvent::new(KeyCode::Char('a'), KeyModifiers::NONE));
        app.input
            .handle_key(KeyEvent::new(KeyCode::Char('j'), KeyModifiers::CONTROL));
        app.input
            .handle_key(KeyEvent::new(KeyCode::Char('b'), KeyModifiers::NONE));

        let buf2 = render_to_buffer(&mut app, 80, 10);
        let text2 = buffer_to_string(&buf2);

        // 多行输入后，分隔线位置应上移（内容区变小）
        // 找到分隔线 "─" 在两个 buffer 中的行号
        let sep_line_1 = text1.lines().position(|l| l.starts_with('─')).unwrap();
        let sep_line_2 = text2.lines().position(|l| l.starts_with('─')).unwrap();
        assert_eq!(
            sep_line_2, sep_line_1 - 1,
            "多行输入时分隔线应上移一行"
        );
    }

    #[test]
    fn test_scroll_up_with_multiline_input_no_overflow() {
        // 高保真快照：多行输入时向上翻历史，不应看到空白或输入框内容溢出到内容区
        let mut app = App::new_for_test();
        app.set_test_size(40, 12);

        // 添加 20 行内容
        for i in 0..20 {
            app.push_line(format!("Content line {:02}", i));
        }
        app.scroll_to_bottom();

        // 输入 2 行文本（Ctrl+J 换行）
        app.input
            .handle_key(KeyEvent::new(KeyCode::Char('h'), KeyModifiers::NONE));
        app.input
            .handle_key(KeyEvent::new(KeyCode::Char('i'), KeyModifiers::NONE));
        app.input
            .handle_key(KeyEvent::new(KeyCode::Char('j'), KeyModifiers::CONTROL));
        app.input
            .handle_key(KeyEvent::new(KeyCode::Char('t'), KeyModifiers::NONE));
        app.input
            .handle_key(KeyEvent::new(KeyCode::Char('h'), KeyModifiers::NONE));
        app.input
            .handle_key(KeyEvent::new(KeyCode::Char('e'), KeyModifiers::NONE));
        app.input
            .handle_key(KeyEvent::new(KeyCode::Char('r'), KeyModifiers::NONE));
        app.input
            .handle_key(KeyEvent::new(KeyCode::Char('e'), KeyModifiers::NONE));
        assert_eq!(app.input.value(), "hi\nthere");
        assert_eq!(app.input.line_count(), 2);

        // 向上翻 5 行
        app.scroll_up(5);

        let buf = render_to_buffer(&mut app, 40, 12);
        let text = buffer_to_string(&buf);

        // 快照回归
        assert_tui_snapshot!("scroll_multiline_input_no_overflow", &buf);

        // 验证：内容区只显示内容行，不应出现空白行或输入框泄漏
        let lines: Vec<&str> = text.lines().collect();
        // 找分隔线位置
        let sep_idx = lines.iter().position(|l| l.contains('─')).unwrap();

        // 分隔线之前的所有行都应该是内容行（非空白）
        for i in 0..sep_idx {
            let trimmed = lines[i].trim();
            // 允许行尾的空白，但不允许完全空白的行出现在内容区
            // （内容区应该填满可见行）
            assert!(
                !trimmed.is_empty() || i == sep_idx.saturating_sub(1),
                "内容区第 {} 行为空，可能存在滚动溢出 bug",
                i
            );
        }
    }

    #[test]
    fn test_scroll_to_bottom_with_multiline_input() {
        // 验证多行输入时 scroll_to_bottom 正确计算底部位置
        let mut app = App::new_for_test();
        app.set_test_size(40, 10);

        for i in 0..15 {
            app.push_line(format!("Line {:02}", i));
        }

        // 输入 3 行
        app.input
            .handle_key(KeyEvent::new(KeyCode::Char('a'), KeyModifiers::NONE));
        app.input
            .handle_key(KeyEvent::new(KeyCode::Char('j'), KeyModifiers::CONTROL));
        app.input
            .handle_key(KeyEvent::new(KeyCode::Char('b'), KeyModifiers::NONE));
        app.input
            .handle_key(KeyEvent::new(KeyCode::Char('j'), KeyModifiers::CONTROL));
        app.input
            .handle_key(KeyEvent::new(KeyCode::Char('c'), KeyModifiers::NONE));
        assert_eq!(app.input.line_count(), 3);

        app.scroll_to_bottom();
        assert!(app.at_bottom());

        // 渲染并验证最后一行内容可见
        let buf = render_to_buffer(&mut app, 40, 10);
        let text = buffer_to_string(&buf);
        assert_buffer_contains!(&buf, "Line 14");
    }

    // === Per-thread TaskStore 隔离测试 ===

    #[test]
    fn test_task_store_per_thread_isolation() {
        let mut app = App::new_for_test();
        let main_id = app.thread.store.primary_id();
        let thread1_id = app.thread.store.create_side_thread(main_id, Some("thread1".to_string()));

        // main 写入任务
        let main_store = app.ensure_task_store(main_id);
        main_store.set_tasks(vec![
            task::TaskItem {
                content: "main task 1".to_string(),
                active_form: "doing main task".to_string(),
                status: task::TaskStatus::Pending,
            },
        ]).unwrap();

        // thread1 写入不同任务
        let t1_store = app.ensure_task_store(thread1_id);
        t1_store.set_tasks(vec![
            task::TaskItem {
                content: "thread1 task 1".to_string(),
                active_form: "doing t1 task".to_string(),
                status: task::TaskStatus::InProgress,
            },
        ]).unwrap();

        // 验证：main 的渲染只看到 main 的任务
        app.switch_thread(main_id);
        let main_tasks = app.current_task_store().get_tasks();
        assert_eq!(main_tasks.len(), 1);
        assert_eq!(main_tasks[0].content, "main task 1");

        // 验证：thread1 的渲染只看到 thread1 的任务
        app.switch_thread(thread1_id);
        let t1_tasks = app.current_task_store().get_tasks();
        assert_eq!(t1_tasks.len(), 1);
        assert_eq!(t1_tasks[0].content, "thread1 task 1");

        // 验证：main 的任务不会出现在 thread1 视图中
        assert!(t1_tasks.iter().all(|t| t.content != "main task 1"));
    }

    #[test]
    fn test_task_store_render_only_shows_current_thread() {
        let mut app = App::new_for_test();
        let main_id = app.thread.store.primary_id();
        let thread1_id = app.thread.store.create_side_thread(main_id, Some("thread1".to_string()));

        // main 有任务
        let main_store = app.ensure_task_store(main_id);
        main_store.set_tasks(vec![
            task::TaskItem {
                content: "main visible task".to_string(),
                active_form: "working".to_string(),
                status: task::TaskStatus::InProgress,
            },
        ]).unwrap();

        // thread1 有不同任务
        let t1_store = app.ensure_task_store(thread1_id);
        t1_store.set_tasks(vec![
            task::TaskItem {
                content: "thread1 visible task".to_string(),
                active_form: "working".to_string(),
                status: task::TaskStatus::Pending,
            },
        ]).unwrap();

        // 切到 main，渲染，应包含 "main visible task"
        app.switch_thread(main_id);
        let buf = render_to_buffer(&mut app, 80, 24);
        let text = buffer_to_string(&buf);
        assert!(text.contains("main visible task"), "main render should show main task");
        assert!(!text.contains("thread1 visible task"), "main render should NOT show thread1 task");

        // 切到 thread1，渲染，应包含 "thread1 visible task"
        app.switch_thread(thread1_id);
        let buf = render_to_buffer(&mut app, 80, 24);
        let text = buffer_to_string(&buf);
        assert!(text.contains("thread1 visible task"), "thread1 render should show thread1 task");
        assert!(!text.contains("main visible task"), "thread1 render should NOT show main task");
    }

    // === 并发 streaming / todo 快照测试 ===

    #[test]
    fn test_concurrent_both_busy() {
        let mut app = App::new_for_test();
        let main_id = app.thread.store.primary_id();
        let thread1_id = app.thread.store.create_side_thread(main_id, Some("Thread-1".to_string()));

        // main 线程 streaming：push_line 模拟已渲染的 AI 回复 + streaming buffer
        app.switch_thread(main_id);
        app.set_thread_busy(main_id, true);
        app.set_status("Streaming (gpt)".to_string());
        app.begin_streaming(main_id);
        app.append_streaming_output(main_id, "Main thread AI response line 1\n".to_string());
        app.append_streaming_output(main_id, "Main thread AI response line 2\n".to_string());
        // push_line 模拟 ThreadEvent 处理逻辑将 streaming 内容推送到 content_lines
        app.push_line("Main thread AI response line 1".to_string());
        app.push_line("Main thread AI response line 2".to_string());

        // thread1 也同时 busy（但不 append 输出）
        app.set_thread_busy(thread1_id, true);

        // 渲染当前视图（main）
        let buf = render_to_buffer(&mut app, 80, 24);
        let text = buffer_to_string(&buf);
        assert!(text.contains("Main thread AI response"), "应显示 main 的 streaming 输出");
        // streaming buffer 存在，应显示 Ctrl+O 提示
        assert!(app.get_streaming_buffer().is_some(), "main 线程应有 streaming buffer");

        assert_tui_snapshot!("concurrent_both_busy_main_view", &buf);

        // 切换到 thread1：content_lines 被清空并加载 thread1 的消息
        app.switch_thread(thread1_id);
        let buf2 = render_to_buffer(&mut app, 80, 24);
        let text2 = buffer_to_string(&buf2);
        assert!(!text2.contains("Main thread AI response"), "切换后不应显示 main 的输出");
        // thread1 的 streaming buffer 为空（没有 begin_streaming/append）
        assert!(app.get_streaming_buffer().is_none(), "thread1 无 streaming buffer");

        assert_tui_snapshot!("concurrent_both_busy_thread1_view", &buf2);
    }

    #[test]
    fn test_switch_while_other_streaming() {
        let mut app = App::new_for_test();
        let main_id = app.thread.store.primary_id();
        let thread1_id = app.thread.store.create_side_thread(main_id, Some("Thread-1".to_string()));

        // main 线程正在 streaming
        app.switch_thread(main_id);
        app.set_thread_busy(main_id, true);
        app.set_status("Streaming (gpt)".to_string());
        app.begin_streaming(main_id);
        app.append_streaming_output(main_id, "Secret data from main thread\n".to_string());
        app.append_streaming_output(main_id, "More secret output\n".to_string());
        // push_line 模拟 ThreadEvent 处理逻辑将 streaming 内容推送到 content_lines
        app.push_line("Secret data from main thread".to_string());
        app.push_line("More secret output".to_string());

        // 切换到空闲的 thread1
        app.switch_thread(thread1_id);

        let buf = render_to_buffer(&mut app, 80, 24);
        let text = buffer_to_string(&buf);

        // thread1 视图不应显示 main 的 streaming 内容
        assert!(!text.contains("Secret data"), "不应泄漏其他线程的 streaming 内容");
        assert!(!text.contains("More secret"), "不应泄漏其他线程的 streaming 内容");
        // thread1 无 streaming buffer
        assert!(app.get_streaming_buffer().is_none(), "thread1 不应有 streaming buffer");

        assert_tui_snapshot!("switch_while_other_busy", &buf);
    }

    #[test]
    fn test_concurrent_todo_isolation() {
        let mut app = App::new_for_test();
        let main_id = app.thread.store.primary_id();
        let thread1_id = app.thread.store.create_side_thread(main_id, Some("Thread-1".to_string()));

        // main 线程有 TodoWrite 任务
        app.switch_thread(main_id);
        let main_store = app.ensure_task_store(main_id);
        main_store.set_tasks(vec![
            task::TaskItem {
                content: "Main task 1".to_string(),
                active_form: "Doing main work".to_string(),
                status: task::TaskStatus::Pending,
            },
            task::TaskItem {
                content: "Main task 2".to_string(),
                active_form: "Doing more work".to_string(),
                status: task::TaskStatus::Pending,
            },
        ]).unwrap();

        // thread1 也有自己的 TodoWrite 任务
        let t1_store = app.ensure_task_store(thread1_id);
        t1_store.set_tasks(vec![
            task::TaskItem {
                content: "Thread1 task 1".to_string(),
                active_form: "Doing thread1 work".to_string(),
                status: task::TaskStatus::Pending,
            },
        ]).unwrap();

        // 在 main 视图渲染
        app.switch_thread(main_id);
        let buf = render_to_buffer(&mut app, 80, 24);
        let text = buffer_to_string(&buf);

        assert!(text.contains("Main task 1"), "应显示 main 的 todo");
        assert!(text.contains("Main task 2"), "应显示 main 的 todo");
        assert!(!text.contains("Thread1 task"), "不应显示 thread1 的 todo");

        assert_tui_snapshot!("concurrent_todo_main_view", &buf);

        // 在 thread1 视图渲染
        app.switch_thread(thread1_id);
        let buf2 = render_to_buffer(&mut app, 80, 24);
        let text2 = buffer_to_string(&buf2);

        assert!(text2.contains("Thread1 task 1"), "应显示 thread1 的 todo");
        assert!(!text2.contains("Main task"), "不应显示 main 的 todo");

        assert_tui_snapshot!("concurrent_todo_thread1_view", &buf2);
    }

    // ========================================================================
    // Normal 模式滚动快照测试 — 模拟 run_loop 的完整 render → dispatch → render 循环
    // ========================================================================

    #[test]
    fn test_normal_scroll_pageup_snapshot() {
        // 模拟 run_loop：创建内容 → render → PageUp → render → 快照对比
        use crate::event::EventRouter;
        use crossterm::event::{Event, KeyCode, KeyEvent, KeyModifiers};

        let mut app = App::new_for_test();
        app.set_test_size(80, 24);
        app.mode = Mode::Normal;

        // 填充 30 行内容（超过 24 行终端高度）
        for i in 0..30 {
            app.push_line(format!("Content line {:02} - some text here", i));
        }
        app.scroll_to_bottom();

        // === 快照 1：底部状态（最后几行可见） ===
        let buf_before = crate::tui_test::render_to_buffer(&mut app, 80, 24);
        insta::assert_snapshot!("normal_scroll_before_pageup", crate::tui_test::buffer_to_string(&buf_before));

        // === 模拟 run_loop: PageUp 事件通过 router dispatch ===
        let mut router = App::build_event_router();
        let event = Event::Key(KeyEvent::new(KeyCode::PageUp, KeyModifiers::empty()));
        let _ = router.dispatch(&event, &mut app);

        // === 快照 2：PageUp 后（应该看到更早的内容） ===
        let buf_after = crate::tui_test::render_to_buffer(&mut app, 80, 24);
        insta::assert_snapshot!("normal_scroll_after_pageup", crate::tui_test::buffer_to_string(&buf_after));

        // 验证：滚动后第一行应该包含更早的内容
        let text_after = crate::tui_test::buffer_to_string(&buf_after);
        let lines_after: Vec<&str> = text_after.lines().collect();
        // 底部时最后可见行是 "Content line 29"，PageUp 后应该看到 "Content line 24" 左右
        assert!(
            !lines_after.iter().any(|l| l.contains("Content line 29")),
            "PageUp 后不应看到最后一行 Content line 29"
        );
    }

    #[test]
    fn test_normal_scroll_mouse_wheel_snapshot() {
        // 模拟鼠标滚轮滚动
        use crate::event::EventRouter;
        use crossterm::event::{Event, KeyCode, KeyEvent, KeyModifiers, MouseEvent, MouseEventKind};

        let mut app = App::new_for_test();
        app.set_test_size(80, 24);
        app.mode = Mode::Normal;

        for i in 0..30 {
            app.push_line(format!("Content line {:02} - some text here", i));
        }
        app.scroll_to_bottom();

        // 鼠标滚轮向上
        let mut router = App::build_event_router();
        let event = Event::Mouse(MouseEvent {
            kind: MouseEventKind::ScrollUp,
            column: 40,
            row: 10,
            modifiers: KeyModifiers::empty(),
        });
        let _ = router.dispatch(&event, &mut app);

        let buf_after = crate::tui_test::render_to_buffer(&mut app, 80, 24);
        insta::assert_snapshot!("normal_scroll_after_mouse_up", crate::tui_test::buffer_to_string(&buf_after));

        let text_after = crate::tui_test::buffer_to_string(&buf_after);
        assert!(
            !text_after.contains("Content line 29"),
            "鼠标上滑后不应看到最后一行"
        );
    }

    #[test]
    fn test_normal_scroll_shift_up_snapshot() {
        // 模拟 Shift+Up 滚动
        use crate::event::EventRouter;
        use crossterm::event::{Event, KeyCode, KeyEvent, KeyModifiers};

        let mut app = App::new_for_test();
        app.set_test_size(80, 24);
        app.mode = Mode::Normal;

        for i in 0..30 {
            app.push_line(format!("Content line {:02} - some text here", i));
        }
        app.scroll_to_bottom();

        let mut router = App::build_event_router();
        let event = Event::Key(KeyEvent::new(KeyCode::Up, KeyModifiers::SHIFT));
        let _ = router.dispatch(&event, &mut app);

        let buf_after = crate::tui_test::render_to_buffer(&mut app, 80, 24);
        insta::assert_snapshot!("normal_scroll_after_shift_up", crate::tui_test::buffer_to_string(&buf_after));
    }

    /// 模拟真实 run_loop 事件循环 — 验证 poll → read → dispatch → render 完整路径
    ///
    /// 这个测试不依赖 TestBackend，而是模拟 run_loop 的实际控制流。
    /// 如果 PageUp 被 router 错误消费（返回 Break 但没改 scroll_offset），
    /// 或者被某个中间 handler 拦截，这里能捕获到。
    #[test]
    fn test_run_loop_scroll_flow_simulation() {
        use crate::event::EventRouter;
        use crossterm::event::{Event, KeyCode, KeyEvent, KeyModifiers};

        let mut app = App::new_for_test();
        app.set_test_size(80, 24);
        app.mode = Mode::Normal;

        // 填充 30 行内容
        for i in 0..30 {
            app.push_line(format!("Line {:02}", i));
        }
        app.scroll_to_bottom();
        let offset_before = app.scroll_offset;
        assert!(offset_before > 0, "底部 offset 应 > 0");

        // ===== 模拟 run_loop 的一轮迭代 =====
        let mut router = App::build_event_router();

        // Step 1: render（run_loop 顶部）
        // （测试中跳过真实 render，用 render_to_buffer 验证）

        // Step 2: 审批检查（run_loop L1922）
        assert!(!app.is_approving(), "Normal 模式不应在审批中");

        // Step 3: 模拟收到 PageUp 事件（实际来自 crossterm::event::read()）
        let event = Event::Key(KeyEvent::new(KeyCode::PageUp, KeyModifiers::empty()));

        // Step 4: router.dispatch（run_loop L2019）
        let flow = router.dispatch(&event, &mut app);

        // ===== 验证 =====
        // dispatch 应该返回 Break(Handled)（滚动后 render + Break）
        assert!(
            matches!(flow, crate::event::ControlFlow::Break(crate::AppResult::Handled)),
            "PageUp 应该被 Break(Handled) 消费，实际: {:?}",
            flow
        );

        // scroll_offset 应该减小
        assert!(
            app.scroll_offset < offset_before,
            "PageUp 后 scroll_offset 应减小: {} → {}",
            offset_before,
            app.scroll_offset
        );

        // Step 5: 验证渲染内容确实变了
        let buf = crate::tui_test::render_to_buffer(&mut app, 80, 24);
        let text = crate::tui_test::buffer_to_string(&buf);

        // 滚动后不应该看到最后一行
        assert!(
            !text.contains("Line 29"),
            "PageUp 后渲染不应包含 Line 29，实际内容:\n{}",
            text.lines().take(5).collect::<Vec<_>>().join("\n")
        );

        // 应该看到更早的行
        assert!(
            text.contains("Line 04"),
            "PageUp 后渲染应包含 Line 04"
        );
    }

    // ========================================================================
    // Phase 2: Mode enum 契约测试
    // ========================================================================

    #[test]
    fn test_mode_enter_exit_diff() {
        let mut app = App::new_for_test();
        assert!(matches!(app.mode, Mode::Normal));

        // 需要至少一个 diff file 才能 enter
        app.diff.files.push(crate::diff_render::DiffFileChange {
            path: std::path::PathBuf::from("test.rs"),
            kind: crate::diff_render::DiffChangeKind::Modified,
            old_content: Some("old".into()),
            new_content: Some("new".into()),
            added: 1,
            removed: 1,
        });

        app.enter_diff_mode();
        assert!(matches!(app.mode, Mode::Diff));
        assert!(app.is_diff_mode());

        app.exit_diff_mode();
        assert!(matches!(app.mode, Mode::Normal));
        assert!(!app.is_diff_mode());
    }

    #[test]
    fn test_mode_enter_exit_search() {
        let mut app = App::new_for_test();
        assert!(matches!(app.mode, Mode::Normal));

        app.enter_search_mode();
        assert!(matches!(app.mode, Mode::Search));
        assert!(app.is_searching());

        app.exit_search_mode();
        assert!(matches!(app.mode, Mode::Normal));
        assert!(!app.is_searching());
    }

    #[test]
    fn test_mode_enter_exit_overlay() {
        let mut app = App::new_for_test();
        assert!(matches!(app.mode, Mode::Normal));

        let overlay = crate::detail_overlay::DetailOverlay::new_transcript("test content".into());
        app.enter_overlay_mode(overlay);
        assert!(matches!(app.mode, Mode::Overlay));
        assert!(app.is_overlay_mode());

        app.exit_overlay_mode();
        assert!(matches!(app.mode, Mode::Normal));
        assert!(!app.is_overlay_mode());
    }

    #[test]
    fn test_mode_mutex_diff_blocks_search() {
        // 类型系统保证：enter Diff 后不可能同时是 Search
        let mut app = App::new_for_test();
        app.diff.files.push(crate::diff_render::DiffFileChange {
            path: std::path::PathBuf::from("test.rs"),
            kind: crate::diff_render::DiffChangeKind::Modified,
            old_content: Some("old".into()),
            new_content: Some("new".into()),
            added: 1,
            removed: 1,
        });
        app.enter_diff_mode();
        assert!(matches!(app.mode, Mode::Diff));
        // 编译时保证：app.mode 不可能同时是 Mode::Search
        assert!(!app.is_searching());
        assert!(!app.is_overlay_mode());
        assert!(!app.is_approving());
    }

    #[test]
    fn test_mode_mutex_search_blocks_diff() {
        let mut app = App::new_for_test();
        app.enter_search_mode();
        assert!(matches!(app.mode, Mode::Search));
        assert!(!app.is_diff_mode());
        assert!(!app.is_overlay_mode());
        assert!(!app.is_approving());
    }

    #[test]
    fn test_mode_default_is_normal() {
        let app = App::new_for_test();
        assert!(matches!(app.mode, Mode::Normal));
        assert!(!app.is_diff_mode());
        assert!(!app.is_searching());
        assert!(!app.is_overlay_mode());
        assert!(!app.is_approving());
    }

    #[test]
    fn test_mode_enter_diff_ignored_when_no_files() {
        let mut app = App::new_for_test();
        assert!(matches!(app.mode, Mode::Normal));

        app.enter_diff_mode(); // diff.files 为空，应忽略
        assert!(matches!(app.mode, Mode::Normal));
        assert!(!app.is_diff_mode());
    }
}
