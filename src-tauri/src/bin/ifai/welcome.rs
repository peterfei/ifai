//! TUI 欢迎页组件
//!
//! 当内容区为空时显示欢迎信息，采用极简设计（无 ASCII art）

use ratatui::text::{Line, Span};

/// 欢迎页组件
pub struct WelcomeWidget {
    /// 标题
    title: String,
    /// 副标题
    subtitle: String,
}

impl WelcomeWidget {
    /// 创建新的欢迎页组件
    pub fn new() -> Self {
        Self {
            title: "Welcome to IfAI".to_string(),
            subtitle: "AI 驱动的命令行代码编辑助手".to_string(),
        }
    }

    /// 渲染欢迎页内容（使用静态字符串以满足 'static 生命周期）
    pub fn render(&self) -> Vec<Line<'static>> {
        vec![
            Line::from(""),
            Line::from(vec![
                Span::default(),
                Span::default(),
                Span::default(),
                Span::default(),
                Span::default(),
                Span::default(),
                Span::default(),
                Span::default(),
                Span::default(),
                Span::default(),
                Span::default(),
                Span::default(),
                Span::default(),
                Span::default(),
                Span::default(),
                Span::default(),
                Span::default(),
                Span::default(),
                Span::default(),
                Span::default(),
                Span::default(),
                Span::styled(
                    "Welcome to IfAI",
                    ratatui::style::Style::default()
                        .fg(ratatui::style::Color::Cyan)
                        .add_modifier(ratatui::style::Modifier::BOLD),
                ),
            ]),
            Line::from(vec![
                Span::default(),
                Span::default(),
                Span::default(),
                Span::default(),
                Span::default(),
                Span::default(),
                Span::default(),
                Span::default(),
                Span::default(),
                Span::default(),
                Span::default(),
                Span::default(),
                Span::default(),
                Span::default(),
                Span::default(),
                Span::default(),
                Span::styled(
                    "AI 驱动的命令行代码编辑助手",
                    ratatui::style::Style::default().fg(ratatui::style::Color::DarkGray),
                ),
            ]),
            Line::from(""),
            Line::from(""),
            Line::from(vec![
                Span::default(),
                Span::default(),
                Span::styled(
                    "快捷键：",
                    ratatui::style::Style::default().fg(ratatui::style::Color::Yellow),
                ),
            ]),
            Line::from(vec![
                Span::default(),
                Span::default(),
                Span::default(),
                Span::styled(
                    "Ctrl+F  搜索内容      Enter    提交输入",
                    ratatui::style::Style::default().fg(ratatui::style::Color::Gray),
                ),
            ]),
            Line::from(vec![
                Span::default(),
                Span::default(),
                Span::default(),
                Span::styled(
                    "PageUp   向上滚动      Esc      退出搜索",
                    ratatui::style::Style::default().fg(ratatui::style::Color::Gray),
                ),
            ]),
            Line::from(vec![
                Span::default(),
                Span::default(),
                Span::default(),
                Span::styled(
                    "按 ? 查看更多快捷键",
                    ratatui::style::Style::default().fg(ratatui::style::Color::Gray),
                ),
            ]),
            Line::from(""),
            Line::from(""),
            Line::from(""),
            Line::from(vec![
                Span::default(),
                Span::default(),
                Span::styled(
                    "开始输入您的任务...",
                    ratatui::style::Style::default().fg(ratatui::style::Color::DarkGray),
                ),
            ]),
        ]
    }
}

impl Default for WelcomeWidget {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_welcome_widget_creation() {
        let widget = WelcomeWidget::new();
        assert_eq!(widget.title, "Welcome to IfAI");
        assert_eq!(widget.subtitle, "AI 驱动的命令行代码编辑助手");
    }

    #[test]
    fn test_welcome_widget_render() {
        let widget = WelcomeWidget::new();
        let lines = widget.render();

        // 验证返回的行数（约 13 行）
        assert_eq!(lines.len(), 13);

        // 验证标题存在
        let title_line = &lines[1];
        assert!(title_line
            .spans
            .iter()
            .any(|s| s.content.contains("Welcome to IfAI")));
    }

    #[test]
    fn test_welcome_widget_default() {
        let widget = WelcomeWidget::default();
        assert_eq!(widget.title, "Welcome to IfAI");
    }
}
