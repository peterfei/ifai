//! 快捷键定义和帮助系统
//!
//! 提供快捷键分类和渲染功能，用于 TUI 帮助覆盖层

use ratatui::layout::Alignment;
use ratatui::text::{Line, Span};
use ratatui::widgets::{Paragraph, Widget};

/// 帮助覆盖层组件
pub struct HelpOverlay {
    /// 快捷键分类列表
    pub categories: Vec<KeybindingCategory>,
}

impl HelpOverlay {
    /// 创建新的帮助覆盖层
    pub fn new() -> Self {
        Self {
            categories: get_all_categories(),
        }
    }

    /// 渲染帮助覆盖层内容
    pub fn render(&self) -> Vec<Line<'static>> {
        let mut lines = Vec::new();

        // 顶部标题栏
        lines.push(Line::from(vec![Span::styled(
            "╔════════════════════════════════════════════════════════╗",
            ratatui::style::Style::default().fg(ratatui::style::Color::DarkGray),
        )]));
        lines.push(Line::from(vec![
            Span::styled(
                "║",
                ratatui::style::Style::default().fg(ratatui::style::Color::DarkGray),
            ),
            Span::default(),
            Span::default(),
            Span::default(),
            Span::styled(
                "快捷键帮助 - 按 ? 或 Esc 退出",
                ratatui::style::Style::default()
                    .fg(ratatui::style::Color::Yellow)
                    .add_modifier(ratatui::style::Modifier::BOLD),
            ),
            Span::styled(
                "                                        ║",
                ratatui::style::Style::default().fg(ratatui::style::Color::DarkGray),
            ),
        ]));
        lines.push(Line::from(vec![Span::styled(
            "╚════════════════════════════════════════════════════════╝",
            ratatui::style::Style::default().fg(ratatui::style::Color::DarkGray),
        )]));

        // 空行
        lines.push(Line::from(""));

        // 渲染所有分类
        for category in &self.categories {
            lines.extend(category.render());
        }

        lines
    }
}

impl Default for HelpOverlay {
    fn default() -> Self {
        Self::new()
    }
}

/// 快捷键绑定
#[derive(Debug, Clone)]
pub struct KeyBinding {
    /// 按键组合（如 "Enter", "Ctrl+F"）
    pub keys: &'static str,
    /// 功能描述
    pub description: &'static str,
}

/// 快捷键分类
#[derive(Debug, Clone)]
pub struct KeybindingCategory {
    /// 分类名称（如 "输入操作", "搜索功能"）
    pub name: &'static str,
    /// 该分类下的快捷键列表
    pub bindings: Vec<KeyBinding>,
}

impl KeybindingCategory {
    /// 创建新的快捷键分类
    pub const fn new(name: &'static str, bindings: Vec<KeyBinding>) -> Self {
        Self { name, bindings }
    }

    /// 渲染该分类的所有快捷键
    pub fn render(&self) -> Vec<Line<'static>> {
        let mut lines = Vec::new();

        // 分类标题（带 emoji）
        lines.push(Line::from(vec![
            Span::default(),
            Span::styled(
                self.name,
                ratatui::style::Style::default()
                    .fg(ratatui::style::Color::Cyan)
                    .add_modifier(ratatui::style::Modifier::BOLD),
            ),
        ]));

        // 每个快捷键
        for binding in &self.bindings {
            lines.push(Line::from(vec![
                Span::default(),
                Span::default(),
                Span::default(),
                Span::styled(
                    binding.keys,
                    ratatui::style::Style::default()
                        .fg(ratatui::style::Color::Yellow)
                        .add_modifier(ratatui::style::Modifier::BOLD),
                ),
                Span::raw("  "),
                Span::styled(
                    binding.description,
                    ratatui::style::Style::default().fg(ratatui::style::Color::Gray),
                ),
            ]));
        }

        // 分类后空一行
        lines.push(Line::from(""));

        lines
    }
}

/// 获取所有快捷键分类
pub fn get_all_categories() -> Vec<KeybindingCategory> {
    vec![
        KeybindingCategory::new(
            "📝 输入操作",
            vec![
                KeyBinding {
                    keys: "Enter",
                    description: "提交输入",
                },
                KeyBinding {
                    keys: "Ctrl+C",
                    description: "清空输入 / 退出（空输入框时）",
                },
                KeyBinding {
                    keys: "Ctrl+D",
                    description: "退出程序（空输入框时）",
                },
                KeyBinding {
                    keys: "↑/↓",
                    description: "浏览输入历史",
                },
            ],
        ),
        KeybindingCategory::new(
            "🔍 搜索功能",
            vec![
                KeyBinding {
                    keys: "Ctrl+F",
                    description: "进入搜索模式",
                },
                KeyBinding {
                    keys: "↑/Enter",
                    description: "下一个匹配",
                },
                KeyBinding {
                    keys: "↓/Shift+Enter",
                    description: "上一个匹配",
                },
                KeyBinding {
                    keys: "Esc",
                    description: "退出搜索",
                },
            ],
        ),
        KeybindingCategory::new(
            "📖 查看详情",
            vec![
                KeyBinding {
                    keys: "Ctrl+O",
                    description: "全屏查看 AI 响应（Toggle 关闭）",
                },
                KeyBinding {
                    keys: "j/k / ↑/↓",
                    description: "滚动内容",
                },
                KeyBinding {
                    keys: "Space",
                    description: "向下翻页",
                },
                KeyBinding {
                    keys: "PageUp/PageDn",
                    description: "快速翻页",
                },
                KeyBinding {
                    keys: "g / G",
                    description: "跳转到顶部/底部",
                },
                KeyBinding {
                    keys: "Esc / q / Ctrl+C",
                    description: "退出详情视图",
                },
            ],
        ),
        KeybindingCategory::new(
            "📜 导航操作",
            vec![
                KeyBinding {
                    keys: "PageUp/PageDn",
                    description: "快速滚动",
                },
                KeyBinding {
                    keys: "Shift+↑/↓",
                    description: "逐行滚动",
                },
                KeyBinding {
                    keys: "鼠标滚轮",
                    description: "任意方向滚动",
                },
            ],
        ),
        KeybindingCategory::new(
            "❓ 帮助系统",
            vec![
                KeyBinding {
                    keys: "?",
                    description: "显示快捷键帮助",
                },
                KeyBinding {
                    keys: "Esc",
                    description: "关闭帮助",
                },
            ],
        ),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_keybinding_category_creation() {
        let category = KeybindingCategory::new(
            "测试分类",
            vec![
                KeyBinding {
                    keys: "A",
                    description: "测试 A",
                },
                KeyBinding {
                    keys: "B",
                    description: "测试 B",
                },
            ],
        );

        assert_eq!(category.name, "测试分类");
        assert_eq!(category.bindings.len(), 2);
    }

    #[test]
    fn test_keybinding_category_render() {
        let category = KeybindingCategory::new(
            "测试分类",
            vec![KeyBinding {
                keys: "A",
                description: "测试 A",
            }],
        );

        let lines = category.render();
        // 标题 + 1个快捷键 + 1个空行 = 3行
        assert_eq!(lines.len(), 3);
    }

    #[test]
    fn test_get_all_categories() {
        let categories = get_all_categories();
        assert_eq!(categories.len(), 5);

        // 验证每个分类都有快捷键
        for category in &categories {
            assert!(!category.bindings.is_empty());
        }

        // 验证包含 Ctrl+O
        let view_category = categories.iter()
            .find(|c| c.name == "📖 查看详情")
            .expect("应该有查看详情分类");
        assert!(view_category.bindings.iter().any(|b| b.keys.contains("Ctrl+O")));
    }
}
