//! TUI 工具审批 Overlay — 声明式组件
//!
//! 设计原则：
//! - 零 match 按键路由（APPROVAL_KEYMAP 查表）
//! - 零 if-else 风险样式（RISK_DISPLAYS 配置表）
//! - 声明式面板渲染（PanelDef + PanelSection 遍历生成）

use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
use ratatui::style::{Color, Style};
use ratatui::text::{Line, Span};

use super::session::PendingToolCall;
use crate::permission::{self as approval, RiskLevel, ToolCategory};

// ═══════════════════════════════════════════════════════════
// Phase 1.1 — 审批核心类型
// ═══════════════════════════════════════════════════════════

/// 审批决策（扩展支持持久化白名单）
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ApprovalDecision {
    /// 仅本次允许
    ApproveOnce,
    /// 持久化白名单（Bash 工具）
    ApproveAlways,
    /// 会话级白名单（文件编辑工具）
    ApproveSession,
    /// 拒绝执行
    Deny,
    /// 中止请求
    Abort,
}

/// 兼容旧代码：`Approve` 映射到 `ApproveOnce`
impl From<ApprovalDecision> for Option<bool> {
    fn from(decision: ApprovalDecision) -> Self {
        match decision {
            ApprovalDecision::ApproveOnce
            | ApprovalDecision::ApproveAlways
            | ApprovalDecision::ApproveSession => Some(true),
            ApprovalDecision::Deny => Some(false),
            ApprovalDecision::Abort => None,
        }
    }
}

/// 审批请求（Session → App）
pub struct ApprovalRequest {
    /// 🔥 Phase 4: 线程 ID - 记录审批请求属于哪个线程
    /// 这样可以确保审批界面只显示在正确的线程中
    pub thread_id: crate::thread::ThreadId,
    pub tool_id: String,
    pub tool_name: String,
    pub args_json: serde_json::Value,
    pub risk_level: RiskLevel,
    pub category: ToolCategory,
    pub response_tx: tokio::sync::oneshot::Sender<ApprovalDecision>,
}

impl ApprovalRequest {
    /// 从 PendingToolCall 构造审批请求
    pub fn from_tool(
        tool: &PendingToolCall,
        thread_id: crate::thread::ThreadId,
        response_tx: tokio::sync::oneshot::Sender<ApprovalDecision>,
    ) -> Self {
        let args_json: serde_json::Value =
            serde_json::from_str(&tool.args).unwrap_or(serde_json::json!({}));
        let risk_level = approval::calculate_risk(&tool.name, &args_json);
        let category = approval::categorize_tool(&tool.name);

        Self {
            thread_id,
            tool_id: tool.tool_id.clone(),
            tool_name: tool.name.clone(),
            args_json,
            risk_level,
            category,
            response_tx,
        }
    }
}

// ═══════════════════════════════════════════════════════════
// Phase 1.2 — 声明式按键映射表（零 match）
// ═══════════════════════════════════════════════════════════

/// 声明式按键映射（代码即数据）
pub struct KeyAction {
    pub key: KeyCode,
    pub modifiers: KeyModifiers,
    pub label: &'static str,
    pub decision: ApprovalDecision,
}

pub const APPROVAL_KEYMAP: &[KeyAction] = &[
    KeyAction {
        key: KeyCode::Char('y'),
        modifiers: KeyModifiers::NONE,
        label: "批准",
        decision: ApprovalDecision::ApproveOnce,
    },
    KeyAction {
        key: KeyCode::Char('a'),
        modifiers: KeyModifiers::NONE,
        label: "永久允许",
        decision: ApprovalDecision::ApproveAlways,
    },
    KeyAction {
        key: KeyCode::Char('s'),
        modifiers: KeyModifiers::NONE,
        label: "会话允许",
        decision: ApprovalDecision::ApproveSession,
    },
    KeyAction {
        key: KeyCode::Char('n'),
        modifiers: KeyModifiers::NONE,
        label: "拒绝",
        decision: ApprovalDecision::Deny,
    },
    KeyAction {
        key: KeyCode::Esc,
        modifiers: KeyModifiers::NONE,
        label: "中止",
        decision: ApprovalDecision::Abort,
    },
];

/// O(n) 查表，零 match
pub fn resolve_approval_key(key: KeyEvent) -> Option<ApprovalDecision> {
    APPROVAL_KEYMAP
        .iter()
        .find(|ka| ka.key == key.code && ka.modifiers == key.modifiers)
        .map(|ka| ka.decision)
}

/// 从 KeyAction 表自动生成快捷键提示行（DRY：只定义一次）
pub fn render_keymap_hint() -> Span<'static> {
    let hint: String = APPROVAL_KEYMAP
        .iter()
        .map(|ka| {
            let key_label = match ka.key {
                KeyCode::Char(c) => c.to_string(),
                KeyCode::Esc => "Esc".to_string(),
                _ => format!("{:?}", ka.key),
            };
            format!("[{}] {}", key_label, ka.label)
        })
        .collect::<Vec<_>>()
        .join("  ");
    Span::styled(hint, Style::default().fg(Color::DarkGray))
}

// ═══════════════════════════════════════════════════════════
// Phase 1.3 — 风险等级配置表（零 match）
// ═══════════════════════════════════════════════════════════

/// 风险等级显示配置
pub struct RiskDisplay {
    pub icon: &'static str,
    pub color: Color,
}

pub const RISK_DISPLAYS: &[(RiskLevel, RiskDisplay)] = &[
    (
        RiskLevel::Low,
        RiskDisplay {
            icon: "🟢",
            color: Color::Green,
        },
    ),
    (
        RiskLevel::Medium,
        RiskDisplay {
            icon: "🟡",
            color: Color::Yellow,
        },
    ),
    (
        RiskLevel::High,
        RiskDisplay {
            icon: "🔴",
            color: Color::Red,
        },
    ),
];

/// 查表获取风险显示配置，默认 Gray
pub fn risk_display(level: RiskLevel) -> &'static RiskDisplay {
    RISK_DISPLAYS
        .iter()
        .find(|(l, _)| *l == level)
        .map(|(_, d)| d)
        .unwrap_or(&RiskDisplay {
            icon: "⚪",
            color: Color::Gray,
        })
}

// ═══════════════════════════════════════════════════════════
// Phase 1.4 — 审批选项定义表（零 match）
// ═══════════════════════════════════════════════════════════

/// 审批选项类型
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ApprovalOptionType {
    Once,    // 仅本次允许
    Always,  // 持久化白名单
    Session, // 会话级白名单
    Deny,    // 拒绝
}

/// 审批选项定义（代码即数据）
pub struct ApprovalOptionDef {
    pub categories: &'static [ToolCategory],
    pub option_type: ApprovalOptionType,
    pub label_template: &'static str,
}

/// 审批选项定义表（根据工具类型和选项类型生成标签）
pub const APPROVAL_OPTION_DEFS: &[ApprovalOptionDef] = &[
    // Destructive 工具的选项
    ApprovalOptionDef {
        categories: &[ToolCategory::Destructive],
        option_type: ApprovalOptionType::Once,
        label_template: "Yes",
    },
    ApprovalOptionDef {
        categories: &[ToolCategory::Destructive],
        option_type: ApprovalOptionType::Always,
        label_template: "Yes, and always allow '{tool}' for this project",
    },
    ApprovalOptionDef {
        categories: &[ToolCategory::Destructive],
        option_type: ApprovalOptionType::Deny,
        label_template: "No",
    },
    // Dangerous 工具的选项
    ApprovalOptionDef {
        categories: &[ToolCategory::Dangerous],
        option_type: ApprovalOptionType::Once,
        label_template: "Yes",
    },
    ApprovalOptionDef {
        categories: &[ToolCategory::Dangerous],
        option_type: ApprovalOptionType::Session,
        label_template: "Yes, and allow edits to '{path}' for this session",
    },
    ApprovalOptionDef {
        categories: &[ToolCategory::Dangerous],
        option_type: ApprovalOptionType::Deny,
        label_template: "No",
    },
    // Safe 工具的选项
    ApprovalOptionDef {
        categories: &[ToolCategory::Safe],
        option_type: ApprovalOptionType::Once,
        label_template: "Yes",
    },
    ApprovalOptionDef {
        categories: &[ToolCategory::Safe],
        option_type: ApprovalOptionType::Deny,
        label_template: "No",
    },
];

/// 查表生成审批选项列表（零 match）
pub fn build_approval_options_declarative(req: &ApprovalRequest) -> Vec<ApprovalOption> {
    APPROVAL_OPTION_DEFS
        .iter()
        .filter(|def| def.categories.contains(&req.category))
        .map(|def| {
            let label = def
                .label_template
                .replace("{tool}", &req.tool_name)
                .replace("{path}", &extract_path_hint(req));
            let decision = match def.option_type {
                ApprovalOptionType::Once => ApprovalDecision::ApproveOnce,
                ApprovalOptionType::Always => ApprovalDecision::ApproveAlways,
                ApprovalOptionType::Session => ApprovalDecision::ApproveSession,
                ApprovalOptionType::Deny => ApprovalDecision::Deny,
            };
            ApprovalOption { label, decision }
        })
        .collect()
}

// ═══════════════════════════════════════════════════════════
// Phase 1.5 — 工具显示名称表（零 match）
// ═══════════════════════════════════════════════════════════

/// 工具显示名称定义（代码即数据）
pub struct ToolDisplayNameDef {
    pub tool_name: &'static str,
    pub display_title: &'static str,
    pub color: Color,
}

/// 工具显示名称表
pub const TOOL_DISPLAY_NAMES: &[ToolDisplayNameDef] = &[
    ToolDisplayNameDef {
        tool_name: "bash",
        display_title: "Bash command",
        color: Color::Cyan,
    },
    ToolDisplayNameDef {
        tool_name: "write_file",
        display_title: "Write file",
        color: Color::Green,
    },
    ToolDisplayNameDef {
        tool_name: "edit_file",
        display_title: "Edit file",
        color: Color::Yellow,
    },
    ToolDisplayNameDef {
        tool_name: "delete_file",
        display_title: "Delete file",
        color: Color::Red,
    },
    ToolDisplayNameDef {
        tool_name: "read_file",
        display_title: "Read file",
        color: Color::Blue,
    },
];

/// 查表获取工具显示名称（零 match）
pub fn get_tool_display_name_declarative(tool_name: &str) -> String {
    TOOL_DISPLAY_NAMES
        .iter()
        .find(|def| def.tool_name == tool_name)
        .map(|def| def.display_title.to_string())
        .unwrap_or_else(|| tool_name.to_string())
}

/// 查表获取工具颜色（零 match）
pub fn get_tool_color(tool_name: &str) -> Color {
    TOOL_DISPLAY_NAMES
        .iter()
        .find(|def| def.tool_name == tool_name)
        .map(|def| def.color)
        .unwrap_or(Color::White)
}

// ═══════════════════════════════════════════════════════════
// Phase 2 — 声明式面板渲染
// ═══════════════════════════════════════════════════════════

/// 声明式面板 section（代码即数据）
pub struct PanelSection {
    pub label: &'static str,
    pub value_fn: fn(&ApprovalRequest) -> String,
    pub style_fn: fn(&ApprovalRequest) -> Style,
}

/// 声明式面板定义
pub struct PanelDef<'a> {
    pub title: &'static str,
    pub title_style: Style,
    pub sections: &'a [PanelSection],
}

/// 参数预览（最多 6 行，空参数显示 "(无参数)"）
pub fn args_preview(req: &ApprovalRequest) -> String {
    let preview = format_tool_args_preview(&req.tool_name, &req.args_json);
    let trimmed = preview.trim();
    if trimmed.is_empty() || trimmed == "{}" || trimmed == "null" {
        "(无参数)".to_string()
    } else {
        let lines: Vec<&str> = preview.lines().take(6).collect();
        let mut result = lines.join("\n");
        if preview.lines().count() > 6 {
            result.push_str("\n...");
        }
        result
    }
}

/// 截断路径：保留文件名 + 父目录，超长时中间用 ...
/// 如 /Users/mac/project/aieditor/ifainew/src-tauri/test2.log
/// → .../ifainew/src-tauri/test2.log
fn truncate_path(path: &str, max_len: usize) -> String {
    if path.len() <= max_len {
        return path.to_string();
    }
    let path_buf = std::path::Path::new(path);
    let file_name = path_buf.file_name().and_then(|n| n.to_str()).unwrap_or(path);
    // 至少保留文件名
    if file_name.len() >= max_len {
        return format!("...{}", &file_name[..file_name.len().min(max_len - 3)]);
    }
    // 尝试保留父目录最后一部分
    let parent = path_buf.parent().and_then(|p| p.to_str()).unwrap_or("");
    let parent_tail = parent.rsplit('/').next().unwrap_or("");
    let tail = format!("{}/{}", parent_tail, file_name);
    if tail.len() + 3 <= max_len {
        return format!(".../{}", tail);
    }
    // 只保留文件名
    format!("...{}", file_name)
}

/// 格式化工具参数预览（复用 session.rs 的逻辑）
fn format_tool_args_preview(tool_name: &str, args: &serde_json::Value) -> String {
    match tool_name {
        "bash" => {
            if let Some(cmd) = args.get("cmd").and_then(|v| v.as_str()) {
                cmd.to_string()
            } else {
                serde_json::to_string_pretty(args).unwrap_or_default()
            }
        }
        "write_file" => {
            let path = args.get("path").and_then(|v| v.as_str()).unwrap_or("?");
            let display_path = truncate_path(path, 50);
            let content = args.get("content").and_then(|v| v.as_str()).unwrap_or("");
            let preview = if content.len() > 60 {
                let truncated: String = content.chars().take(57).collect();
                format!("{}... ({} 字符)", truncated, content.len())
            } else {
                content.to_string()
            };
            format!("路径: {}\n内容: {}", display_path, preview)
        }
        "edit_file" => {
            let path = args.get("path").and_then(|v| v.as_str()).unwrap_or("?");
            let display_path = truncate_path(path, 50);
            let edit = args.get("edit").and_then(|v| v.as_str()).unwrap_or("?");
            let preview = if edit.len() > 60 {
                let truncated: String = edit.chars().take(57).collect();
                format!("{}...", truncated)
            } else {
                edit.to_string()
            };
            format!("编辑文件: {}\n变更: {}", display_path, preview)
        }
        "delete_file" => {
            let path = args.get("path").and_then(|v| v.as_str()).unwrap_or("?");
            let display_path = truncate_path(path, 50);
            format!("删除文件: {}", display_path)
        }
        _ => {
            let json_str = serde_json::to_string_pretty(args).unwrap_or_default();
            if json_str.len() > 200 {
                // 🔥 安全截断 UTF-8 字符串（避免在多字节字符中间切断）
                let mut end = 197;
                while end > 0 && !json_str.is_char_boundary(end) {
                    end -= 1;
                }
                format!("{}...", &json_str[..end])
            } else {
                json_str
            }
        }
    }
}

/// 审批面板 section 定义
fn approval_sections() -> &'static [PanelSection] {
    &[
        PanelSection {
            label: "工具",
            value_fn: |req| req.tool_name.clone(),
            style_fn: |_| {
                Style::default()
                    .fg(Color::White)
                    .add_modifier(ratatui::style::Modifier::BOLD)
            },
        },
        PanelSection {
            label: "风险",
            value_fn: |req| {
                let rd = risk_display(req.risk_level);
                format!("{} {}", rd.icon, format!("{:?}", req.risk_level))
            },
            style_fn: |req| Style::default().fg(risk_display(req.risk_level).color),
        },
        PanelSection {
            label: "参数",
            value_fn: |req| args_preview(req),
            style_fn: |_| Style::default().fg(Color::Gray),
        },
    ]
}

/// 审批面板定义
fn approval_panel_def() -> PanelDef<'static> {
    PanelDef {
        title: "⚠️  工具执行审批",
        title_style: Style::default()
            .fg(Color::Yellow)
            .add_modifier(ratatui::style::Modifier::BOLD),
        sections: approval_sections(),
    }
}

/// 面板渲染器 — 遍历 sections 生成 Lines（零 if-else）
pub fn render_panel_lines(req: &ApprovalRequest) -> Vec<Line<'static>> {
    let def = approval_panel_def();
    let mut lines = vec![Line::from(Span::styled(def.title, def.title_style))];
    lines.push(Line::from(""));

    for section in def.sections {
        let value = (section.value_fn)(req);
        let style = (section.style_fn)(req);
        lines.push(Line::from(vec![
            Span::raw(format!("{}: ", section.label)),
            Span::styled(value, style),
        ]));
    }

    lines.push(Line::from(""));
    lines.push(Line::from(render_keymap_hint()));
    lines
}

// ═══════════════════════════════════════════════════════════
// Phase 3 — 底部弹出面板渲染（Claude Code 风格）
// ═══════════════════════════════════════════════════════════

/// 审批选项（用于数字选择）
#[derive(Debug, Clone)]
pub struct ApprovalOption {
    pub label: String,
    pub decision: ApprovalDecision,
}

/// 生成审批选项列表（声明式，零 match）
pub fn build_approval_options(req: &ApprovalRequest) -> Vec<ApprovalOption> {
    build_approval_options_declarative(req)
}

/// 从请求中提取路径提示（用于文件编辑工具）
fn extract_path_hint(req: &ApprovalRequest) -> String {
    if let Some(path) = req.args_json.get("path").and_then(|v| v.as_str()) {
        // 提取父目录
        if let Some(parent) = std::path::Path::new(path).parent() {
            parent.to_str().unwrap_or(".").to_string()
        } else {
            ".".to_string()
        }
    } else {
        ".".to_string()
    }
}

/// 渲染底部弹出面板（Claude Code 风格）
///
/// 返回 (lines, height)：
/// - lines: 面板的所有行（包括边框）
/// - height: 面板的总高度
pub fn render_bottom_panel(
    req: &ApprovalRequest,
    selected_index: usize,
) -> (Vec<Line<'static>>, u16) {
    let options = build_approval_options(req);
    let tool_display = get_tool_display_name(&req.tool_name);

    // 面板内容
    let mut lines = vec![];

    // 标题行：工具名
    lines.push(Line::from(Span::styled(
        format!("─ {} ", tool_display),
        Style::default().fg(Color::DarkGray),
    )));

    // 命令预览
    let args_preview = args_preview(req);
    lines.push(Line::from(Span::styled(
        args_preview,
        Style::default().fg(Color::White),
    )));

    // 分隔线
    lines.push(Line::from(Span::styled(
        "─".repeat(60),
        Style::default().fg(Color::DarkGray),
    )));

    // 提示文本
    lines.push(Line::from(""));
    lines.push(Line::from(Span::styled(
        "Do you want to proceed?",
        Style::default().fg(Color::White),
    )));

    // 选项列表
    for (i, option) in options.iter().enumerate() {
        let is_selected = i == selected_index;
        let style = if is_selected {
            Style::default().fg(Color::Cyan)
        } else {
            Style::default().fg(Color::DarkGray)
        };

        lines.push(Line::from(vec![
            Span::raw("  "),
            Span::styled(format!("{}. {}", i + 1, option.label), style),
        ]));
    }

    // Esc 提示
    lines.push(Line::from(""));
    lines.push(Line::from(Span::styled(
        "Esc to cancel",
        Style::default().fg(Color::DarkGray),
    )));

    // 计算高度
    let height = lines.len() as u16;

    (lines, height)
}

/// 获取工具显示名称
fn get_tool_display_name(tool_name: &str) -> String {
    get_tool_display_name_declarative(tool_name)
}

// ═══════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    fn char_key(c: char) -> KeyEvent {
        KeyEvent::new(KeyCode::Char(c), KeyModifiers::NONE)
    }

    fn esc_key() -> KeyEvent {
        KeyEvent::new(KeyCode::Esc, KeyModifiers::NONE)
    }

    fn ctrl_char_key(c: char) -> KeyEvent {
        KeyEvent::new(KeyCode::Char(c), KeyModifiers::CONTROL)
    }

    fn make_request(tool_name: &str, args: &str) -> ApprovalRequest {
        let tool = PendingToolCall {
            tool_id: "test-0".to_string(),
            name: tool_name.to_string(),
            args: args.to_string(),
        };
        let (tx, _rx) = tokio::sync::oneshot::channel();
        // 使用一个 dummy thread_id
        let thread_id = crate::thread::ThreadId::new();
        ApprovalRequest::from_tool(&tool, thread_id, tx)
    }

    // ── Phase 1.2: resolve_approval_key ──

    #[test]
    fn test_resolve_approval_key_y() {
        assert_eq!(
            resolve_approval_key(char_key('y')),
            Some(ApprovalDecision::ApproveOnce)
        );
    }

    #[test]
    fn test_resolve_approval_key_n() {
        assert_eq!(
            resolve_approval_key(char_key('n')),
            Some(ApprovalDecision::Deny)
        );
    }

    #[test]
    fn test_resolve_approval_key_esc() {
        assert_eq!(
            resolve_approval_key(esc_key()),
            Some(ApprovalDecision::Abort)
        );
    }

    #[test]
    fn test_resolve_approval_key_other() {
        assert_eq!(resolve_approval_key(char_key('x')), None);
        assert_eq!(resolve_approval_key(char_key('Y')), None); // 大写不匹配
        assert_eq!(resolve_approval_key(ctrl_char_key('c')), None);
    }

    // ── Phase 1.2: render_keymap_hint ──

    #[test]
    fn test_render_keymap_hint() {
        let span = render_keymap_hint();
        let hint = span.content;
        assert!(hint.contains("[y] 批准"), "hint: {}", hint);
        assert!(hint.contains("[n] 拒绝"), "hint: {}", hint);
        assert!(hint.contains("[Esc] 中止"), "hint: {}", hint);
    }

    // ── Phase 1.3: risk_display ──

    #[test]
    fn test_risk_display_low() {
        let rd = risk_display(RiskLevel::Low);
        assert_eq!(rd.icon, "🟢");
        assert_eq!(rd.color, Color::Green);
    }

    #[test]
    fn test_risk_display_medium() {
        let rd = risk_display(RiskLevel::Medium);
        assert_eq!(rd.icon, "🟡");
        assert_eq!(rd.color, Color::Yellow);
    }

    #[test]
    fn test_risk_display_high() {
        let rd = risk_display(RiskLevel::High);
        assert_eq!(rd.icon, "🔴");
        assert_eq!(rd.color, Color::Red);
    }

    #[test]
    fn test_risk_display_unknown() {
        // 没有未知变体，但函数有默认兜底
        let rd = risk_display(RiskLevel::Low); // 仅验证查表逻辑
        assert!(!rd.icon.is_empty());
    }

    // ── Phase 2: render_panel_lines ──

    #[test]
    fn test_render_panel_lines() {
        let req = make_request("bash", r#"{"cmd": "ls -la"}"#);
        let lines = render_panel_lines(&req);
        assert!(lines.len() >= 5); // title + blank + 3 sections + blank + hint
        assert!(lines[0].to_string().contains("工具执行审批"));
    }

    // ── args_preview ──

    #[test]
    fn test_args_preview_multiline_truncate() {
        let long_cmd = (0..20)
            .map(|i| format!("line {}", i))
            .collect::<Vec<_>>()
            .join("\n");
        let args_json = serde_json::json!({"cmd": long_cmd}).to_string();
        let req = make_request("bash", &args_json);
        let preview = args_preview(&req);
        let line_count = preview.lines().count();
        assert!(
            line_count <= 7,
            "expected <=7 lines, got {} lines: {:?}",
            line_count,
            preview
        );
        assert!(preview.contains("..."), "preview: {}", preview);
    }

    #[test]
    fn test_args_preview_empty() {
        let req = make_request("bash", "{}");
        let preview = args_preview(&req);
        assert_eq!(preview, "(无参数)");
    }

    #[test]
    fn test_args_preview_long_single_line() {
        let long = "x".repeat(300);
        let req = make_request("bash", &format!(r#"{{"cmd": "{}"}}"#, long));
        let preview = args_preview(&req);
        assert!(preview.len() < 400); // 合理截断
    }

    // ── ApprovalRequest::from_tool ──

    #[test]
    fn test_from_tool_bash() {
        let tool = PendingToolCall {
            tool_id: "t-0".to_string(),
            name: "bash".to_string(),
            args: r#"{"cmd": "rm -rf /tmp/test"}"#.to_string(),
        };
        let (tx, _rx) = tokio::sync::oneshot::channel();
        let thread_id = crate::thread::ThreadId::new();
        let req = ApprovalRequest::from_tool(&tool, thread_id, tx);
        assert_eq!(req.tool_name, "bash");
        assert_eq!(req.category, ToolCategory::Destructive);
        assert_eq!(req.risk_level, RiskLevel::High);
    }

    #[test]
    fn test_from_tool_read_file() {
        let tool = PendingToolCall {
            tool_id: "t-1".to_string(),
            name: "read_file".to_string(),
            args: r#"{"path": "/tmp/test.rs"}"#.to_string(),
        };
        let (tx, _rx) = tokio::sync::oneshot::channel();
        let thread_id = crate::thread::ThreadId::new();
        let req = ApprovalRequest::from_tool(&tool, thread_id, tx);
        assert_eq!(req.tool_name, "read_file");
        assert_eq!(req.category, ToolCategory::Safe);
    }

    // ── Phase 1.4: APPROVAL_OPTION_DEFS 表测试 ──

    #[test]
    fn test_build_approval_options_destructive() {
        let req = make_request("bash", r#"{"cmd": "ls -la"}"#);
        let options = build_approval_options(&req);

        assert_eq!(options.len(), 3);
        assert_eq!(options[0].label, "Yes");
        assert_eq!(options[0].decision, ApprovalDecision::ApproveOnce);
        assert!(options[1].label.contains("always allow"));
        assert_eq!(options[1].decision, ApprovalDecision::ApproveAlways);
        assert_eq!(options[2].label, "No");
        assert_eq!(options[2].decision, ApprovalDecision::Deny);
    }

    #[test]
    fn test_build_approval_options_dangerous() {
        let req = make_request("edit_file", r#"{"path": "src/main.rs"}"#);
        let options = build_approval_options(&req);

        assert_eq!(options.len(), 3);
        assert_eq!(options[0].label, "Yes");
        assert!(options[1].label.contains("allow edits"));
        assert_eq!(options[1].decision, ApprovalDecision::ApproveSession);
        assert_eq!(options[2].label, "No");
        assert_eq!(options[2].decision, ApprovalDecision::Deny);
    }

    #[test]
    fn test_build_approval_options_safe() {
        let req = make_request("read_file", r#"{"path": "/tmp/test.rs"}"#);
        let options = build_approval_options(&req);

        assert_eq!(options.len(), 2);
        assert_eq!(options[0].label, "Yes");
        assert_eq!(options[0].decision, ApprovalDecision::ApproveOnce);
        assert_eq!(options[1].label, "No");
        assert_eq!(options[1].decision, ApprovalDecision::Deny);
    }

    // ── Phase 1.5: TOOL_DISPLAY_NAMES 表测试 ──

    #[test]
    fn test_get_tool_display_name_bash() {
        let name = get_tool_display_name("bash");
        assert_eq!(name, "Bash command");
    }

    #[test]
    fn test_get_tool_display_name_write_file() {
        let name = get_tool_display_name("write_file");
        assert_eq!(name, "Write file");
    }

    #[test]
    fn test_get_tool_display_name_edit_file() {
        let name = get_tool_display_name("edit_file");
        assert_eq!(name, "Edit file");
    }

    #[test]
    fn test_get_tool_display_name_unknown() {
        let name = get_tool_display_name("unknown_tool");
        assert_eq!(name, "unknown_tool");
    }

    #[test]
    fn test_get_tool_color() {
        assert_eq!(get_tool_color("bash"), Color::Cyan);
        assert_eq!(get_tool_color("write_file"), Color::Green);
        assert_eq!(get_tool_color("edit_file"), Color::Yellow);
        assert_eq!(get_tool_color("delete_file"), Color::Red);
        assert_eq!(get_tool_color("read_file"), Color::Blue);
        assert_eq!(get_tool_color("unknown"), Color::White);
    }

    // ── 集成测试：声明式选项生成 ──

    #[test]
    fn test_declarative_options_match_imperative() {
        let bash_req = make_request("bash", r#"{"cmd": "pwd"}"#);
        let options = build_approval_options(&bash_req);

        // 验证生成的选项与硬编码版本一致
        assert_eq!(options.len(), 3);
        assert_eq!(options[0].decision, ApprovalDecision::ApproveOnce);
        assert_eq!(options[1].decision, ApprovalDecision::ApproveAlways);
        assert_eq!(options[2].decision, ApprovalDecision::Deny);
    }

    // === 渲染测试 ===

    use crate::tui_test::lines_to_text;

    #[test]
    fn test_render_panel_contains_tool_display_name() {
        let request = make_request("read_file", r#"{"path": "/tmp/test.rs"}"#);
        let (lines, height) = render_bottom_panel(&request, 0);
        assert!(height > 0);
        let text = lines_to_text(&lines);
        // render_bottom_panel 使用 get_tool_display_name → "Read file"
        assert!(
            text.contains("Read file"),
            "panel should contain display name, got: {}",
            &text
        );
    }

    #[test]
    fn test_render_panel_contains_args_preview() {
        // args 必须是合法 JSON，否则 serde_json::from_str fallback 到 {}
        let request = make_request("bash", r#"{"cmd": "ls -la /tmp"}"#);
        let (lines, height) = render_bottom_panel(&request, 0);
        assert!(height > 0);
        let text = lines_to_text(&lines);
        assert!(
            text.contains("ls -la /tmp"),
            "panel should contain args preview, got: {}",
            &text
        );
    }

    #[test]
    fn test_render_panel_contains_options() {
        let request = make_request("bash", r#"{"cmd": "echo hi"}"#);
        let (lines, height) = render_bottom_panel(&request, 0);
        assert!(height > 0);
        let text = lines_to_text(&lines);
        assert!(text.contains("Yes"));
        assert!(text.contains("cancel"));
    }
}
