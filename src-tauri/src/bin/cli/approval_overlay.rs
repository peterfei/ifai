//! TUI 工具审批 Overlay — 声明式组件
//!
//! 设计原则：
//! - 零 match 按键路由（APPROVAL_KEYMAP 查表）
//! - 零 if-else 风险样式（RISK_DISPLAYS 配置表）
//! - 声明式面板渲染（PanelDef + PanelSection 遍历生成）

use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
use ratatui::style::{Color, Style};
use ratatui::text::{Line, Span};

use crate::permission::{self as approval, RiskLevel, ToolCategory};
use super::session::PendingToolCall;

// ═══════════════════════════════════════════════════════════
// Phase 1.1 — 审批核心类型
// ═══════════════════════════════════════════════════════════

/// 审批决策
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ApprovalDecision {
    /// 执行工具
    Approve,
    /// 跳过工具，返回错误给 AI
    Deny,
    /// 中止整个 AI 请求
    Abort,
}

/// 审批请求（Session → App）
pub struct ApprovalRequest {
    pub tool_id: String,
    pub tool_name: String,
    pub args_json: serde_json::Value,
    pub risk_level: RiskLevel,
    pub category: ToolCategory,
    pub response_tx: tokio::sync::oneshot::Sender<ApprovalDecision>,
}

impl ApprovalRequest {
    /// 从 PendingToolCall 构造审批请求
    pub fn from_tool(tool: &PendingToolCall, response_tx: tokio::sync::oneshot::Sender<ApprovalDecision>) -> Self {
        let args_json: serde_json::Value = serde_json::from_str(&tool.args)
            .unwrap_or(serde_json::json!({}));
        let risk_level = approval::calculate_risk(&tool.name, &args_json);
        let category = approval::categorize_tool(&tool.name);

        Self {
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
    KeyAction { key: KeyCode::Char('y'), modifiers: KeyModifiers::NONE, label: "批准", decision: ApprovalDecision::Approve },
    KeyAction { key: KeyCode::Char('n'), modifiers: KeyModifiers::NONE, label: "拒绝", decision: ApprovalDecision::Deny },
    KeyAction { key: KeyCode::Esc, modifiers: KeyModifiers::NONE, label: "中止", decision: ApprovalDecision::Abort },
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
    (RiskLevel::Low,    RiskDisplay { icon: "🟢", color: Color::Green }),
    (RiskLevel::Medium, RiskDisplay { icon: "🟡", color: Color::Yellow }),
    (RiskLevel::High,   RiskDisplay { icon: "🔴", color: Color::Red }),
];

/// 查表获取风险显示配置，默认 Gray
pub fn risk_display(level: RiskLevel) -> &'static RiskDisplay {
    RISK_DISPLAYS
        .iter()
        .find(|(l, _)| *l == level)
        .map(|(_, d)| d)
        .unwrap_or(&RiskDisplay { icon: "⚪", color: Color::Gray })
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
            let content = args.get("content").and_then(|v| v.as_str()).unwrap_or("");
            let preview = if content.len() > 60 {
                format!("{}... ({} 字符)", &content[..57], content.len())
            } else {
                content.to_string()
            };
            format!("路径: {}\n内容: {}", path, preview)
        }
        "edit_file" => {
            let path = args.get("path").and_then(|v| v.as_str()).unwrap_or("?");
            let edit = args.get("edit").and_then(|v| v.as_str()).unwrap_or("?");
            let preview = if edit.len() > 60 {
                format!("{}...", &edit[..57])
            } else {
                edit.to_string()
            };
            format!("编辑文件: {}\n变更: {}", path, preview)
        }
        "delete_file" => {
            let path = args.get("path").and_then(|v| v.as_str()).unwrap_or("?");
            format!("删除文件: {}", path)
        }
        _ => {
            let json_str = serde_json::to_string_pretty(args).unwrap_or_default();
            if json_str.len() > 200 {
                format!("{}...", &json_str[..197])
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
            style_fn: |_| Style::default().fg(Color::White).add_modifier(ratatui::style::Modifier::BOLD),
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
        title_style: Style::default().fg(Color::Yellow).add_modifier(ratatui::style::Modifier::BOLD),
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
        ApprovalRequest::from_tool(&tool, tx)
    }

    // ── Phase 1.2: resolve_approval_key ──

    #[test]
    fn test_resolve_approval_key_y() {
        assert_eq!(resolve_approval_key(char_key('y')), Some(ApprovalDecision::Approve));
    }

    #[test]
    fn test_resolve_approval_key_n() {
        assert_eq!(resolve_approval_key(char_key('n')), Some(ApprovalDecision::Deny));
    }

    #[test]
    fn test_resolve_approval_key_esc() {
        assert_eq!(resolve_approval_key(esc_key()), Some(ApprovalDecision::Abort));
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
        let long_cmd = (0..20).map(|i| format!("line {}", i)).collect::<Vec<_>>().join("\n");
        let args_json = serde_json::json!({"cmd": long_cmd}).to_string();
        let req = make_request("bash", &args_json);
        let preview = args_preview(&req);
        let line_count = preview.lines().count();
        assert!(line_count <= 7, "expected <=7 lines, got {} lines: {:?}", line_count, preview);
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
        let req = ApprovalRequest::from_tool(&tool, tx);
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
        let req = ApprovalRequest::from_tool(&tool, tx);
        assert_eq!(req.tool_name, "read_file");
        assert_eq!(req.category, ToolCategory::Safe);
    }
}
