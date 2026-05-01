//! 命令弹出框 — 声明式组件
//!
//! 设计原则：
//! - 配置表驱动：POPUP_KEYMAP 查表路由按键，零 match
//! - 自动派生：从 COMMAND_SPECS 自动生成过滤列表，零手动维护
//! - 代码即数据：PopupStyle 配置表驱动渲染样式

use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};

use super::commands;

// ============================================================================
// Phase 1 — 声明式按键映射表（零 match）
// ============================================================================

/// 弹出框按键行为（代码即数据）
pub struct PopupKeyAction {
    pub key: KeyCode,
    pub modifiers: KeyModifiers,
    pub action: PopupAction,
}

/// 弹出框操作结果
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PopupAction {
    /// 上一项
    Prev,
    /// 下一项
    Next,
    /// 确认选择
    Select,
    /// 关闭弹出框
    Close,
    /// 未消费（透传给 InputComposer）
    Pass,
}

/// 查表路由：按键 → 弹出框操作（零 match）
const POPUP_KEYMAP: &[PopupKeyAction] = &[
    PopupKeyAction { key: KeyCode::Up, modifiers: KeyModifiers::NONE, action: PopupAction::Prev },
    PopupKeyAction { key: KeyCode::Char('p'), modifiers: KeyModifiers::CONTROL, action: PopupAction::Prev },
    PopupKeyAction { key: KeyCode::Down, modifiers: KeyModifiers::NONE, action: PopupAction::Next },
    PopupKeyAction { key: KeyCode::Char('n'), modifiers: KeyModifiers::CONTROL, action: PopupAction::Next },
    PopupKeyAction { key: KeyCode::Tab, modifiers: KeyModifiers::NONE, action: PopupAction::Select },
    PopupKeyAction { key: KeyCode::Enter, modifiers: KeyModifiers::NONE, action: PopupAction::Select },
    PopupKeyAction { key: KeyCode::Esc, modifiers: KeyModifiers::NONE, action: PopupAction::Close },
];

/// O(n) 查表，零 match
pub fn resolve_popup_key(key: KeyEvent) -> PopupAction {
    POPUP_KEYMAP
        .iter()
        .find(|ka| ka.key == key.code && ka.modifiers == key.modifiers)
        .map(|ka| ka.action.clone())
        .unwrap_or(PopupAction::Pass)
}

// ============================================================================
// Phase 2 — 样式配置表（零 if-else 渲染）
// ============================================================================

/// 弹出框样式配置（代码即数据）
pub struct PopupStyle {
    pub name_color: Color,
    pub desc_color: Color,
    pub selected_bg: Color,
    pub match_color: Color,
    pub border_color: Color,
}

/// 默认样式
const POPUP_STYLE: PopupStyle = PopupStyle {
    name_color: Color::Cyan,
    desc_color: Color::DarkGray,
    selected_bg: Color::DarkGray,
    match_color: Color::Yellow,
    border_color: Color::DarkGray,
};

/// 最大显示行数
const MAX_POPUP_ROWS: usize = 8;

// ============================================================================
// Phase 3 — 匹配类型（自动排序权重）
// ============================================================================

/// 命令匹配类型（排序权重）
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum MatchKind {
    Exact = 0,
    Prefix = 1,
    Substring = 2,
}

/// 过滤后的命令条目
struct FilteredEntry {
    spec: &'static commands::CommandSpec,
    kind: MatchKind,
}

// ============================================================================
// Phase 4 — CommandPopup 结构体
// ============================================================================

/// 命令弹出框
pub struct CommandPopup {
    /// 当前过滤文本（`/` 后面的部分）
    filter: String,
    /// 过滤后的命令列表（按 MatchKind 排序）
    entries: Vec<FilteredEntry>,
    /// 当前选中索引
    selected: usize,
    /// 滚动偏移
    scroll_offset: usize,
}

impl CommandPopup {
    /// 创建新的弹出框（初始不可见，等用户输入 `/` 后激活）
    pub fn new() -> Self {
        Self {
            filter: String::new(),
            entries: Vec::new(), // 初始为空 → is_visible() = false
            selected: 0,
            scroll_offset: 0,
        }
    }

    /// 从输入文本更新过滤（每次输入变化时调用）
    ///
    /// - 输入以 `/` 开头 → 提取后续文本作为 filter，显示弹出框
    /// - 输入不以 `/` 开头 → 隐藏弹出框
    pub fn update(&mut self, input: &str) {
        if let Some(query) = input.strip_prefix('/') {
            let token = query.split_whitespace().next().unwrap_or("");
            // 始终重新加载（filter 可能相同但 entries 被清空过）
            self.filter = token.to_string();
            self.reload_entries();
            self.selected = 0;
            self.scroll_offset = 0;
        } else if !self.entries.is_empty() || !self.filter.is_empty() {
            // 不以 / 开头 → 清空弹出框
            self.filter.clear();
            self.entries.clear();
            self.selected = 0;
            self.scroll_offset = 0;
        }
    }

    /// 弹出框是否应该显示
    pub fn is_visible(&self) -> bool {
        !self.entries.is_empty()
    }

    /// 处理按键事件（弹出框激活时调用）
    ///
    /// 返回 `Some(text)` 表示确认选择，`None` 表示继续/关闭
    pub fn handle_key(&mut self, key: KeyEvent) -> Option<String> {
        let action = resolve_popup_key(key);
        match action {
            PopupAction::Prev => {
                if self.selected > 0 {
                    self.selected -= 1;
                    self.adjust_scroll();
                }
                None
            }
            PopupAction::Next => {
                if !self.entries.is_empty() && self.selected < self.entries.len() - 1 {
                    self.selected += 1;
                    self.adjust_scroll();
                }
                None
            }
            PopupAction::Select => {
                if let Some(entry) = self.entries.get(self.selected) {
                    let mut cmd = format!("/{}", entry.spec.name);
                    if entry.spec.arg_hint.is_some() {
                        cmd.push(' ');
                    }
                    return Some(cmd);
                }
                None
            }
            PopupAction::Close => {
                None
            }
            PopupAction::Pass => None,
        }
    }

    /// 渲染弹出框，返回 (行列表, 高度)
    pub fn render(&self) -> (Vec<Line<'static>>, u16) {
        if self.entries.is_empty() {
            return (vec![], 0);
        }

        let visible = self.entries.len().min(MAX_POPUP_ROWS);
        let start = self.scroll_offset;
        let end = start + visible;

        let lines: Vec<Line<'static>> = self.entries[start..end]
            .iter()
            .enumerate()
            .map(|(i, entry)| {
                let global_idx = start + i;
                let is_selected = global_idx == self.selected;

                if is_selected {
                    self.render_selected(entry)
                } else {
                    self.render_normal(entry)
                }
            })
            .collect();

        (lines, visible as u16)
    }

    /// 重新加载过滤结果（从 COMMAND_SPECS 自动派生）
    fn reload_entries(&mut self) {
        self.entries = commands::COMMAND_SPECS
            .iter()
            .filter_map(|spec| {
                let kind = if spec.name == self.filter {
                    Some(MatchKind::Exact)
                } else if spec.name.starts_with(&self.filter) {
                    Some(MatchKind::Prefix)
                } else if !self.filter.is_empty()
                    && (spec.name.contains(&self.filter) || spec.summary.contains(&self.filter))
                {
                    Some(MatchKind::Substring)
                } else if self.filter.is_empty() {
                    // 空过滤 → 显示全部
                    Some(MatchKind::Exact)
                } else {
                    None
                };
                kind.map(|k| FilteredEntry { spec, kind: k })
            })
            .collect();
        // MatchKind 的 Ord 已经定义了排序权重
        self.entries.sort_by_key(|e| e.kind);
    }

    /// 调整滚动偏移，确保选中项可见
    fn adjust_scroll(&mut self) {
        if self.selected < self.scroll_offset {
            self.scroll_offset = self.selected;
        } else if self.selected >= self.scroll_offset + MAX_POPUP_ROWS {
            self.scroll_offset = self.selected - MAX_POPUP_ROWS + 1;
        }
    }

    /// 渲染普通行
    fn render_normal(&self, entry: &FilteredEntry) -> Line<'static> {
        let name_span = Span::styled(
            format!("/{}", entry.spec.name),
            Style::default().fg(POPUP_STYLE.name_color),
        );
        let desc_span = Span::styled(
            format!("  {}", entry.spec.summary),
            Style::default().fg(POPUP_STYLE.desc_color),
        );
        Line::from(vec![name_span, desc_span])
    }

    /// 渲染选中行（反色 + 匹配字符高亮）
    fn render_selected(&self, entry: &FilteredEntry) -> Line<'static> {
        let indicator = Span::styled("▸ ", Style::default().fg(Color::Yellow));
        let name_text = format!("/{}", entry.spec.name);

        // 匹配字符高亮
        let name_span = if !self.filter.is_empty() {
            let highlighted = Self::highlight_match(&name_text, &self.filter, POPUP_STYLE.match_color);
            highlighted
        } else {
            Span::styled(name_text, Style::default().fg(Color::White).add_modifier(Modifier::BOLD))
        };

        let desc_span = Span::styled(
            format!("  {}", entry.spec.summary),
            Style::default().fg(Color::Gray),
        );

        Line::from(vec![
            indicator,
            Span::styled("", Style::default().bg(POPUP_STYLE.selected_bg)),
            name_span,
            desc_span,
        ])
    }

    /// 高亮匹配字符（prefix 高亮）
    fn highlight_match(text: &str, query: &str, color: Color) -> Span<'static> {
        if text.starts_with(query) {
            let (matched, rest) = text.split_at(query.len());
            Span::raw(format!(
                "{}{}",
                matched,
                rest
            ))
            // TODO: ratatui Line 不支持 span 内嵌不同样式，
            // 简化为全白（后续可用 Line::from(vec![...]) 增强）
        } else {
            Span::styled(text.to_string(), Style::default().fg(Color::White).add_modifier(Modifier::BOLD))
        }
    }
}

impl Default for CommandPopup {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn char_key(c: char) -> KeyEvent {
        KeyEvent::new(KeyCode::Char(c), KeyModifiers::NONE)
    }

    fn code_key(code: KeyCode) -> KeyEvent {
        KeyEvent::new(code, KeyModifiers::NONE)
    }

    fn ctrl_key(c: char) -> KeyEvent {
        KeyEvent::new(KeyCode::Char(c), KeyModifiers::CONTROL)
    }

    // === 查表路由 ===

    #[test]
    fn test_keymap_prev() {
        assert_eq!(resolve_popup_key(code_key(KeyCode::Up)), PopupAction::Prev);
        assert_eq!(resolve_popup_key(ctrl_key('p')), PopupAction::Prev);
    }

    #[test]
    fn test_keymap_next() {
        assert_eq!(resolve_popup_key(code_key(KeyCode::Down)), PopupAction::Next);
        assert_eq!(resolve_popup_key(ctrl_key('n')), PopupAction::Next);
    }

    #[test]
    fn test_keymap_select() {
        assert_eq!(resolve_popup_key(code_key(KeyCode::Tab)), PopupAction::Select);
        assert_eq!(resolve_popup_key(code_key(KeyCode::Enter)), PopupAction::Select);
    }

    #[test]
    fn test_keymap_close() {
        assert_eq!(resolve_popup_key(code_key(KeyCode::Esc)), PopupAction::Close);
    }

    #[test]
    fn test_keymap_pass() {
        assert_eq!(resolve_popup_key(char_key('a')), PopupAction::Pass);
    }

    // === 弹出框状态 ===

    #[test]
    fn test_new_popup_not_visible() {
        let popup = CommandPopup::new();
        // 初始状态不可见
        assert!(!popup.is_visible());
        assert!(popup.entries.is_empty());
    }

    #[test]
    fn test_slash_activates_popup() {
        let mut popup = CommandPopup::new();
        popup.update("/");
        // 输入 "/" 后应显示全部命令
        assert!(popup.is_visible());
        assert_eq!(popup.entries.len(), commands::COMMAND_SPECS.len());
    }

    #[test]
    fn test_update_with_slash() {
        let mut popup = CommandPopup::new();
        popup.update("/mo");
        assert!(popup.is_visible());
        // 应包含 model
        assert!(popup.entries.iter().any(|e| e.spec.name == "model"));
    }

    #[test]
    fn test_update_without_slash() {
        let mut popup = CommandPopup::new();
        popup.update("hello");
        assert!(!popup.is_visible());
        assert!(popup.entries.is_empty());
    }

    #[test]
    fn test_update_exact_match() {
        let mut popup = CommandPopup::new();
        popup.update("/help");
        assert!(popup.is_visible());
        // exact match 应排第一
        assert_eq!(popup.entries[0].spec.name, "help");
        assert_eq!(popup.entries[0].kind, MatchKind::Exact);
    }

    #[test]
    fn test_update_prefix_match() {
        let mut popup = CommandPopup::new();
        popup.update("/co");
        assert!(popup.is_visible());
        // compact 和 config 都以 co 开头
        let names: Vec<&str> = popup.entries.iter().map(|e| e.spec.name).collect();
        assert!(names.contains(&"compact"));
        assert!(names.contains(&"config"));
    }

    #[test]
    fn test_update_chinese_summary_match() {
        let mut popup = CommandPopup::new();
        popup.update("/压缩");
        assert!(popup.is_visible());
        assert!(popup.entries.iter().any(|e| e.spec.name == "compact"));
    }

    #[test]
    fn test_update_no_match() {
        let mut popup = CommandPopup::new();
        popup.update("/zzzzz");
        assert!(!popup.is_visible());
    }

    // === 导航 ===

    #[test]
    fn test_navigate_down() {
        let mut popup = CommandPopup::new();
        popup.update("/");
        assert_eq!(popup.selected, 0);
        popup.handle_key(code_key(KeyCode::Down));
        assert_eq!(popup.selected, 1);
    }

    #[test]
    fn test_navigate_up_boundary() {
        let mut popup = CommandPopup::new();
        popup.update("/");
        popup.handle_key(code_key(KeyCode::Up));
        assert_eq!(popup.selected, 0);
    }

    #[test]
    fn test_navigate_down_boundary() {
        let mut popup = CommandPopup::new();
        popup.update("/");
        let last = popup.entries.len() - 1;
        for _ in 0..last + 5 {
            popup.handle_key(code_key(KeyCode::Down));
        }
        assert_eq!(popup.selected, last);
    }

    // === 选择 ===

    #[test]
    fn test_select_returns_command() {
        let mut popup = CommandPopup::new();
        popup.update("/");
        let result = popup.handle_key(code_key(KeyCode::Enter));
        assert!(result.is_some());
        let cmd = result.unwrap();
        assert!(cmd.starts_with('/'));
    }

    #[test]
    fn test_select_with_arg_hint() {
        let mut popup = CommandPopup::new();
        popup.update("/mo");
        let result = popup.handle_key(code_key(KeyCode::Tab));
        assert_eq!(result, Some("/model ".to_string()));
    }

    // === 渲染 ===

    #[test]
    fn test_render_returns_lines() {
        let mut popup = CommandPopup::new();
        popup.update("/");
        let (lines, height) = popup.render();
        assert!(!lines.is_empty());
        assert_eq!(height as usize, lines.len().min(MAX_POPUP_ROWS));
        assert!(height as usize <= MAX_POPUP_ROWS);
    }

    #[test]
    fn test_render_empty() {
        let mut popup = CommandPopup::new();
        popup.update("/zzz");
        let (lines, height) = popup.render();
        assert!(lines.is_empty());
        assert_eq!(height, 0);
    }

    // === 滚动 ===

    #[test]
    fn test_scroll_adjustment() {
        let mut popup = CommandPopup::new();
        // 16 个命令，MAX_POPUP_ROWS=8
        // 选中第 8 项（索引 7），不需要滚动
        popup.selected = 7;
        popup.adjust_scroll();
        assert_eq!(popup.scroll_offset, 0);

        // 选中第 9 项（索引 8），应滚动
        popup.selected = 8;
        popup.adjust_scroll();
        assert_eq!(popup.scroll_offset, 1);
    }
}
