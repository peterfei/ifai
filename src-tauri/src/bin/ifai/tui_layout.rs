//! 🔥 声明式 TUI 布局层
//!
//! **设计原则**：
//! - 代码即数据：Layout 是纯数据结构
//! - 状态驱动：render(state) -> String
//! - 关注点分离：内容 | 状态 | 输入

use crate::terminal::TERMINAL;

/// 🎯 TUI 布局（声明式）
#[derive(Debug, Clone)]
pub struct TuiLayout {
    /// 内容区域高度（动态）
    pub content_height: u16,
    /// 状态栏行号（固定）
    pub status_row: u16,
    /// 输入框行号（固定）
    pub input_row: u16,
}

impl TuiLayout {
    /// 🔥 从终端尺寸创建布局
    pub fn from_terminal() -> Self {
        let rows = TERMINAL.rows();
        Self {
            content_height: rows.saturating_sub(2),  // 留 2 行给状态和输入
            status_row: rows.saturating_sub(1),
            input_row: rows,
        }
    }

    /// 🎨 渲染状态栏（固定底部）
    pub fn render_status(&self, status_text: &str) -> String {
        format!(
            "\x1b[s\x1b[{};1H\x1b[K{}\x1b[u",
            self.status_row,
            status_text
        )
    }

    /// 🎨 渲染输入框（固定底部）
    pub fn render_input(&self, input_text: &str) -> String {
        format!(
            "\x1b[s\x1b[{};1H\x1b[K{}\x1b[u",
            self.input_row,
            input_text
        )
    }

    /// 🔥 进入备用屏幕缓冲区
    pub fn enter_alt_screen() -> String {
        "\x1b[?1049h".to_string()
    }

    /// 🔥 退出备用屏幕缓冲区
    pub fn exit_alt_screen() -> String {
        "\x1b[?1049l".to_string()
    }
}

impl Default for TuiLayout {
    fn default() -> Self {
        Self::from_terminal()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tui_layout_default() {
        let layout = TuiLayout::default();
        assert!(layout.content_height > 0);
        assert!(layout.status_row > 0);
        assert!(layout.input_row > layout.status_row);
    }

    #[test]
    fn test_tui_layout_render_status() {
        let layout = TuiLayout::default();
        let status = layout.render_status("[测试] 状态");
        assert!(status.contains("\x1b[s"));   // 保存光标
        assert!(status.contains("\x1b[K"));   // 清除行
        assert!(status.contains("\x1b[u"));   // 恢复光标
    }

    #[test]
    fn test_tui_layout_alt_screen() {
        let enter = TuiLayout::enter_alt_screen();
        let exit = TuiLayout::exit_alt_screen();
        assert_eq!(enter, "\x1b[?1049h");
        assert_eq!(exit, "\x1b[?1049l");
    }
}
