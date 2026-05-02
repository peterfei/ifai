//! 🔥 终端抽象层 - 零跨平台代码泄漏
//!
//! **设计哲学**：
//! - 单一职责：仅管理终端尺寸和光标
//! - 零业务逻辑：不涉及状态栏内容格式化
//! - 懒加载：仅在需要时查询终端尺寸
//!
//! **元编程设计**：
//! - 自动降级策略：无法获取尺寸时使用保守默认值
//! - 缓存机制：避免频繁系统调用
//! - 线程安全：支持多线程读取
//! - 类型安全：所有 ANSI 序列封装在方法中

use once_cell::sync::Lazy;
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};

// ============================================================================
// 终端尺寸抽象
// ============================================================================

/// 🎯 终端尺寸（不可变，线程安全）
#[derive(Debug, Clone, Copy)]
pub struct TerminalSize {
    pub rows: u16,
    pub cols: u16,
}

impl TerminalSize {
    /// 创建新的终端尺寸
    pub const fn new(rows: u16, cols: u16) -> Self {
        Self { rows, cols }
    }

    /// 获取安全默认值（降级策略）
    pub const fn safe_default() -> Self {
        Self { rows: 24, cols: 80 }
    }
}

// ============================================================================
// 终端抽象
// ============================================================================

/// 🔥 终端抽象（零依赖声明）
///
/// **元编程设计**：
/// - 自动降级策略：无法获取尺寸时使用保守默认值
/// - 缓存机制：避免频繁系统调用
/// - 线程安全：支持多线程读取
pub struct Terminal {
    size: Arc<RwLock<Option<TerminalSize>>>,
    last_update: Arc<RwLock<Instant>>,
    cache_ttl: Duration,
}

impl Terminal {
    /// 🎯 创建终端抽象（惰性初始化）
    pub fn new() -> Self {
        Self {
            size: Arc::new(RwLock::new(None)),
            last_update: Arc::new(RwLock::new(Instant::now())),
            cache_ttl: Duration::from_secs(1), // 1秒缓存
        }
    }

    /// 🔥 获取终端行数（带降级策略）
    ///
    /// **降级策略**：
    /// - 成功：返回实际行数
    /// - 失败：返回 24（保守默认值，适合大多数终端）
    pub fn rows(&self) -> u16 {
        self.update_size_if_needed();
        self.size.read().unwrap().map(|s| s.rows).unwrap_or(24) // 🎯 降级到安全默认值
    }

    /// 🔥 获取终端列数（带降级策略）
    pub fn cols(&self) -> u16 {
        self.update_size_if_needed();
        self.size.read().unwrap().map(|s| s.cols).unwrap_or(80) // 🎯 降级到安全默认值
    }

    /// 🔥 获取终端尺寸（带降级策略）
    pub fn size(&self) -> TerminalSize {
        self.update_size_if_needed();
        self.size
            .read()
            .unwrap()
            .unwrap_or_else(TerminalSize::safe_default)
    }

    /// 🔥 更新尺寸（带缓存和错误容忍）
    fn update_size_if_needed(&self) {
        let now = Instant::now();
        let last = *self.last_update.read().unwrap();

        if now.duration_since(last) < self.cache_ttl {
            return; // 缓存未过期
        }

        // 🔥 跨平台查询（封装系统调用）
        let new_size = self.query_size();

        *self.size.write().unwrap() = Some(new_size);
        *self.last_update.write().unwrap() = now;
    }

    /// 🔥 查询终端尺寸（跨平台抽象）
    #[cfg(unix)]
    fn query_size(&self) -> TerminalSize {
        use libc::{ioctl, winsize, TIOCGWINSZ};
        use std::mem;

        unsafe {
            let mut size: winsize = mem::zeroed();
            if ioctl(0, TIOCGWINSZ, &mut size) == 0 {
                TerminalSize {
                    rows: size.ws_row.max(1), // 至少 1 行
                    cols: size.ws_col.max(1), // 至少 1 列
                }
            } else {
                // 🎯 失败时返回保守默认值
                TerminalSize::safe_default()
            }
        }
    }

    #[cfg(windows)]
    fn query_size(&self) -> TerminalSize {
        use std::mem;
        use windows::Win32::System::Console::{
            GetConsoleScreenBufferInfo, GetStdHandle, CONSOLE_SCREEN_BUFFER_INFO, STD_OUTPUT_HANDLE,
        };

        unsafe {
            // 获取标准输出句柄
            let handle = match GetStdHandle(STD_OUTPUT_HANDLE) {
                Ok(h) => h,
                Err(_) => return TerminalSize::safe_default(),
            };

            let mut info: CONSOLE_SCREEN_BUFFER_INFO = mem::zeroed();

            if GetConsoleScreenBufferInfo(handle, &mut info).is_ok() {
                let rows = (info.srWindow.Bottom - info.srWindow.Top + 1).max(1) as u16;
                let cols = (info.srWindow.Right - info.srWindow.Left + 1).max(1) as u16;
                TerminalSize { rows, cols }
            } else {
                TerminalSize::safe_default()
            }
        }
    }
}

impl Default for Terminal {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// ANSI 光标控制
// ============================================================================

/// 🔥 ANSI 光标控制（类型安全，零魔法数字）
///
/// **设计原则**：
/// - 每个操作返回字符串（延迟执行）
/// - 支持链式调用（流式 API）
/// - 零 runtime 错误（所有错误在编译期捕获）
pub struct Cursor;

impl Cursor {
    /// 🔥 保存光标位置
    ///
    /// **ANSI 序列**：`\033[s`
    pub fn save() -> String {
        "\x1b[s".to_string()
    }

    /// 🔥 恢复光标位置
    ///
    /// **ANSI 序列**：`\x1b[u`
    pub fn restore() -> String {
        "\x1b[u".to_string()
    }

    /// 🔥 移动到指定行列（1-based，符合 ANSI 标准）
    ///
    /// **ANSI 序列**：`\033[<row>;<col>H`
    ///
    /// **示例**：
    /// ```rust
    /// Cursor::move_to(24, 1)  // 移动到第 24 行，第 1 列
    /// ```
    pub fn move_to(row: u16, col: u16) -> String {
        format!("\x1b[{};{}H", row, col)
    }

    /// 🔥 移动到最后一行（终端底部）
    ///
    /// **元编程设计**：自动查询终端高度
    ///
    /// **示例**：
    /// ```rust
    /// Cursor::bottom_row()  // 移动到第 N 行（N = 终端高度）
    /// ```
    pub fn bottom_row() -> String {
        let row = TERMINAL.rows();
        Self::move_to(row, 1)
    }

    /// 🔥 清除从光标到行尾
    ///
    /// **ANSI 序列**：`\033[K`
    pub fn clear_to_end() -> String {
        "\x1b[K".to_string()
    }

    /// 🔥 清除整行
    ///
    /// **ANSI 序列**：`\033[2K`
    pub fn clear_line() -> String {
        "\x1b[2K".to_string()
    }

    /// 🔥 隐藏光标
    ///
    /// **ANSI 序列**：`\033[?25l`
    pub fn hide() -> String {
        "\x1b[?25l".to_string()
    }

    /// 🔥 显示光标
    ///
    /// **ANSI 序列**：`\033[?25h`
    pub fn show() -> String {
        "\x1b[?25h".to_string()
    }

    /// 🎯 固定底部状态栏渲染器（原子操作）
    ///
    /// **功能**：保存光标 → 移动到底部 → 清除行 → 输出内容 → 恢复光标
    ///
    /// **示例**：
    /// ```rust
    /// Cursor::render_at_bottom("[响应中] deepseek-chat | in: 1,000 | out: 50")
    /// ```
    pub fn render_at_bottom(content: &str) -> String {
        format!(
            "{}{}{}{}{}",
            Self::save(),
            Self::bottom_row(),
            Self::clear_to_end(),
            content,
            Self::restore()
        )
    }

    /// 🎯 固定底部状态栏渲染器（清除整行）
    ///
    /// **功能**：保存光标 → 移动到底部 → 清除整行 → 输出内容 → 恢复光标
    pub fn render_at_bottom_clear_line(content: &str) -> String {
        format!(
            "{}{}{}{}{}",
            Self::save(),
            Self::bottom_row(),
            Self::clear_line(),
            content,
            Self::restore()
        )
    }
}

// ============================================================================
// 全局单例
// ============================================================================

/// 🎯 全局终端单例（懒加载）
pub static TERMINAL: Lazy<Terminal> = Lazy::new(Terminal::new);

// ============================================================================
// 测试
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // ═══════════════════════════════════════════════════════════
    // TerminalSize 测试
    // ═══════════════════════════════════════════════════════════

    #[test]
    fn test_terminal_size_new() {
        let size = TerminalSize::new(24, 80);
        assert_eq!(size.rows, 24);
        assert_eq!(size.cols, 80);
    }

    #[test]
    fn test_terminal_size_safe_default() {
        let size = TerminalSize::safe_default();
        assert_eq!(size.rows, 24);
        assert_eq!(size.cols, 80);
    }

    // ═══════════════════════════════════════════════════════════
    // Terminal 测试
    // ═══════════════════════════════════════════════════════════

    #[test]
    fn test_terminal_new() {
        let terminal = Terminal::new();
        // 第一次查询会初始化尺寸
        let rows = terminal.rows();
        assert!(rows >= 1); // 至少应该有 1 行
    }

    #[test]
    fn test_terminal_default() {
        let terminal = Terminal::default();
        let cols = terminal.cols();
        assert!(cols >= 1); // 至少应该有 1 列
    }

    #[test]
    fn test_terminal_size() {
        let terminal = Terminal::new();
        let size = terminal.size();
        assert!(size.rows >= 1);
        assert!(size.cols >= 1);
    }

    #[test]
    fn test_terminal_fallback() {
        let terminal = Terminal::new();
        // 🎯 降级策略：即使查询失败，也应该返回安全默认值
        let rows = terminal.rows();
        let cols = terminal.cols();
        assert!(rows >= 24 || rows == 24); // 至少 24 行或默认值
        assert!(cols >= 80 || cols == 80); // 至少 80 列或默认值
    }

    // ═══════════════════════════════════════════════════════════
    // Cursor 测试
    // ═══════════════════════════════════════════════════════════

    #[test]
    fn test_cursor_save_restore() {
        let save = Cursor::save();
        assert_eq!(save, "\x1b[s");

        let restore = Cursor::restore();
        assert_eq!(restore, "\x1b[u");
    }

    #[test]
    fn test_cursor_move_to() {
        let move_cmd = Cursor::move_to(24, 1);
        assert_eq!(move_cmd, "\x1b[24;1H");
    }

    #[test]
    fn test_cursor_move_to_100_50() {
        let move_cmd = Cursor::move_to(100, 50);
        assert_eq!(move_cmd, "\x1b[100;50H");
    }

    #[test]
    fn test_cursor_clear_to_end() {
        let clear = Cursor::clear_to_end();
        assert_eq!(clear, "\x1b[K");
    }

    #[test]
    fn test_cursor_clear_line() {
        let clear = Cursor::clear_line();
        assert_eq!(clear, "\x1b[2K");
    }

    #[test]
    fn test_cursor_hide_show() {
        let hide = Cursor::hide();
        assert_eq!(hide, "\x1b[?25l");

        let show = Cursor::show();
        assert_eq!(show, "\x1b[?25h");
    }

    #[test]
    fn test_cursor_bottom_row() {
        let bottom = Cursor::bottom_row();
        // 应该包含 ANSI 移动序列
        assert!(bottom.contains("\x1b["));
        assert!(bottom.contains("H"));
    }

    #[test]
    fn test_cursor_render_at_bottom() {
        let content = "[响应中] deepseek-chat | in: 1,000 | out: 50";
        let output = Cursor::render_at_bottom(content);

        // 验证包含所有必要的 ANSI 序列
        assert!(output.contains("\x1b[s")); // 保存光标
        assert!(output.contains("\x1b[")); // 移动光标
        assert!(output.contains(content)); // 包含内容
        assert!(output.contains("\x1b[u")); // 恢复光标
    }

    #[test]
    fn test_cursor_render_at_bottom_clear_line() {
        let content = "Test content";
        let output = Cursor::render_at_bottom_clear_line(content);

        // 验证包含清除整行序列
        assert!(output.contains("\x1b[2K")); // 清除整行
        assert!(output.contains(content));
    }

    // ═══════════════════════════════════════════════════════════
    // 集成测试
    // ═══════════════════════════════════════════════════════════

    #[test]
    fn test_cursor_chain_operations() {
        let output = format!(
            "{}{}{}{}",
            Cursor::save(),
            Cursor::move_to(10, 5),
            Cursor::clear_to_end(),
            Cursor::restore()
        );

        assert_eq!(output, "\x1b[s\x1b[10;5H\x1b[K\x1b[u");
    }

    #[test]
    fn test_global_terminal_singleton() {
        // 🎯 测试全局单例
        let rows1 = TERMINAL.rows();
        let cols1 = TERMINAL.cols();

        // 第二次查询应该使用缓存（相同值）
        let rows2 = TERMINAL.rows();
        let cols2 = TERMINAL.cols();

        assert_eq!(rows1, rows2);
        assert_eq!(cols1, cols2);
    }

    #[test]
    fn test_terminal_size_const() {
        // 测试 const 函数
        const SIZE: TerminalSize = TerminalSize::new(25, 80);
        assert_eq!(SIZE.rows, 25);
        assert_eq!(SIZE.cols, 80);

        const DEFAULT: TerminalSize = TerminalSize::safe_default();
        assert_eq!(DEFAULT.rows, 24);
        assert_eq!(DEFAULT.cols, 80);
    }
}
