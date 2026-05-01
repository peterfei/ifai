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
    /// 终端宽度（列数）
    pub width: u16,
    /// 内容区域高度（动态）
    pub content_height: u16,
    /// 状态栏行号（固定）
    pub status_row: u16,
    /// 分隔线行号（固定）
    pub separator_row: u16,
    /// 输入框行号（固定）
    pub input_row: u16,
}

impl TuiLayout {
    /// 🔥 从终端尺寸创建布局
    pub fn from_terminal() -> Self {
        let rows = TERMINAL.rows();
        let cols = TERMINAL.cols();
        Self::from_size(cols, rows)
    }

    /// 从指定尺寸创建布局（测试用）
    pub fn from_size(cols: u16, rows: u16) -> Self {
        Self {
            width: cols,
            content_height: rows.saturating_sub(3),  // 留 3 行给状态、分隔线和输入
            status_row: rows.saturating_sub(2),
            separator_row: rows.saturating_sub(1),
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

    /// 🎨 渲染分隔线（状态栏与输入框之间）
    pub fn render_separator(&self) -> String {
        let line = "─".repeat(self.width as usize);
        format!(
            "\x1b[s\x1b[{};1H\x1b[K\x1b[38;5;8m{}\x1b[0m\x1b[u",
            self.separator_row,
            line
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

    // === 布局计算测试 ===

    #[test]
    fn test_layout_80x24() {
        let layout = TuiLayout::from_size(80, 24);
        assert_eq!(layout.width, 80);
        assert_eq!(layout.content_height, 21);
        assert_eq!(layout.status_row, 22);
        assert_eq!(layout.separator_row, 23);
        assert_eq!(layout.input_row, 24);
    }

    #[test]
    fn test_layout_wide_200x50() {
        let layout = TuiLayout::from_size(200, 50);
        assert_eq!(layout.width, 200);
        assert_eq!(layout.content_height, 47);
        assert_eq!(layout.status_row, 48);
        assert_eq!(layout.separator_row, 49);
        assert_eq!(layout.input_row, 50);
    }

    #[test]
    fn test_layout_narrow_40x10() {
        let layout = TuiLayout::from_size(40, 10);
        assert_eq!(layout.width, 40);
        assert_eq!(layout.content_height, 7);
        assert_eq!(layout.status_row, 8);
        assert_eq!(layout.separator_row, 9);
        assert_eq!(layout.input_row, 10);
    }

    #[test]
    fn test_layout_minimal_height() {
        let layout = TuiLayout::from_size(80, 3);
        assert_eq!(layout.content_height, 0);
        assert_eq!(layout.status_row, 1);
        assert_eq!(layout.separator_row, 2);
        assert_eq!(layout.input_row, 3);
    }

    #[test]
    fn test_layout_row_ordering() {
        // 任意尺寸：status < separator < input
        for (w, h) in [(80, 10), (80, 24), (200, 50), (40, 4)] {
            let layout = TuiLayout::from_size(w, h);
            assert!(layout.status_row < layout.separator_row,
                "status_row {} should be < separator_row {} for {}x{}",
                layout.status_row, layout.separator_row, w, h);
            assert!(layout.separator_row < layout.input_row,
                "separator_row {} should be < input_row {} for {}x{}",
                layout.separator_row, layout.input_row, w, h);
        }
    }
}
