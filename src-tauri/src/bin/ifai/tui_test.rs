//! TUI 渲染测试共享基础设施
//!
//! 提供跨模块复用的无头渲染辅助函数，基于 ratatui `TestBackend`。
//! 不依赖真实终端设备，可在 CI 环境运行。
//!
//! # 架构
//!
//! ```text
//! tui_test.rs（本模块）
//! ├── render_to_buffer()   App → TestBackend → Buffer
//! ├── buffer_to_string()   Buffer → 纯文本（每行一 String）
//! ├── lines_to_text()      Vec<Line> → 纯文本（提取 Span content）
//! ├── assert_buffer_contains!    Buffer 内容断言
//! ├── assert_buffer_not_contains!
//! └── assert_tui_snapshot!       Buffer → insta 快照回归
//! ```
//!
//! # 适用场景
//!
//! | 场景 | 使用 |
//! |------|------|
//! | App 完整布局渲染测试 | `render_to_buffer` + `buffer_to_string` |
//! | 纯文本内容断言 | `assert_buffer_contains!` |
//! | 布局回归检测 | `assert_tui_snapshot!` |
//! | 组件函数返回 Vec\<Line\> | `lines_to_text` |
//!
//! # 快速开始
//!
//! ```ignore
//! #[cfg(test)]
//! mod tests {
//!     use super::*;
//!     use crate::tui_test::{buffer_to_string, render_to_buffer};
//!     use ratatui::text::Line;
//!
//!     #[test]
//!     fn test_content_visible() {
//!         let mut app = crate::tui::App::new_for_test();
//!         app.content_lines = vec![Line::from("hello")];
//!
//!         let buf = render_to_buffer(&mut app, 80, 24);
//!         let text = buffer_to_string(&buf);
//!         assert!(text.contains("hello"));
//!     }
//! }
//! ```
//!
//! # 使用断言宏
//!
//! ```ignore
//! let buf = render_to_buffer(&mut app, 80, 24);
//!
//! // 内容断言
//! assert_buffer_contains!(buf, "Streaming");
//! assert_buffer_not_contains!(buf, "Error");
//!
//! // 快照断言（首次生成 .snap，后续回归检测）
//! assert_tui_snapshot!("my_component", &buf);
//! ```
//!
//! # 测试 Line 渲染组件（非 App 整体）
//!
//! 对于 `render_panel_lines()`、`render_bottom_panel()` 等返回 `Vec<Line>` 的函数：
//!
//! ```ignore
//! use crate::tui_test::lines_to_text;
//!
//! let (lines, height) = render_bottom_panel(&request, 0);
//! let text = lines_to_text(&lines);
//! assert!(text.contains("Read file"));
//! ```
//!
//! # insta 快照工作流
//!
//! ```bash
//! # 首次运行：生成 .snap 文件
//! cargo test --bin ifai test_my_snapshot
//!
//! # 审查快照（REVIEW 生成的 .snap 文件）
//! # 接受：cargo insta accept
//! # 拒绝：cargo insta reject
//!
//! # 后续运行：自动对比，布局变化时失败并显示 diff
//! cargo test --bin ifai test_my_snapshot
//! ```
//!
//! # 添加新测试的检查清单
//!
//! 1. 在目标模块的 `#[cfg(test)] mod tests` 中引入：
//!    ```ignore
//!    use crate::tui_test::{buffer_to_string, render_to_buffer};
//!    ```
//! 2. 用 `App::new_for_test()` 创建测试实例
//! 3. 设置必要的字段（content_lines、status_text、input 等）
//! 4. 调用 `render_to_buffer(&mut app, width, height)` 渲染
//! 5. 用 `buffer_to_string` / `assert_buffer_contains!` / `assert_tui_snapshot!` 断言
//! 6. 运行 `cargo test --bin ifai <test_name>` 验证

/// 将 App 渲染到 TestBackend，返回 Buffer。
///
/// 不依赖真实终端，适合 CI 和单元测试。
/// 底层调用 `app.draw_frame(f)`，与生产渲染路径一致。
///
/// # 参数
/// - `app` — 测试用 App 实例（通过 `App::new_for_test()` 创建）
/// - `width` — 终端列数（如 80）
/// - `height` — 终端行数（如 24）
///
/// # 返回
/// ratatui `Buffer`，包含每个单元格的 symbol、fg、bg、modifier。
pub fn render_to_buffer(
    app: &mut crate::tui::App,
    width: u16,
    height: u16,
) -> ratatui::buffer::Buffer {
    let backend = ratatui::backend::TestBackend::new(width, height);
    let mut terminal = ratatui::Terminal::new(backend).unwrap();
    terminal.draw(|f| app.draw_frame(f)).unwrap();
    terminal.backend().buffer().clone()
}

/// 将 Buffer 转为可读字符串（每行一个 String，不含样式信息）。
///
/// 用于 `assert!(text.contains(...))` 形式的简单断言。
/// 注意：CJK 字符占 2 列但只返回 1 个字符，行宽不等于字符串长度。
pub fn buffer_to_string(buf: &ratatui::buffer::Buffer) -> String {
    (0..buf.area().height)
        .map(|y| {
            (0..buf.area().width)
                .map(|x| buf[(x, y)].symbol())
                .collect::<String>()
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// 将 `Vec<Line>` 拼接为纯文本（提取所有 Span 的 content）。
///
/// 适用于 `render_panel_lines()` / `render_bottom_panel()` 等返回 `Vec<Line>` 的函数，
/// 与 `buffer_to_string`（Buffer → String）互补。
pub fn lines_to_text(lines: &[ratatui::text::Line<'_>]) -> String {
    lines
        .iter()
        .flat_map(|l| l.spans.iter())
        .map(|s| s.content.clone())
        .collect::<String>()
}

/// 断言 Buffer 中包含指定文本（忽略 ANSI 样式）。
///
/// 失败时打印完整 Buffer 内容，便于调试。
#[macro_export]
macro_rules! assert_buffer_contains {
    ($buf:expr, $needle:expr $(,)?) => {{
        let text = $crate::tui_test::buffer_to_string($buf);
        assert!(
            text.contains($needle),
            "buffer should contain {:?}, got:\n{}",
            $needle,
            text
        );
    }};
}

/// 断言 Buffer 中不包含指定文本。
#[macro_export]
macro_rules! assert_buffer_not_contains {
    ($buf:expr, $needle:expr $(,)?) => {{
        let text = $crate::tui_test::buffer_to_string($buf);
        assert!(
            !text.contains($needle),
            "buffer should NOT contain {:?}, got:\n{}",
            $needle,
            text
        );
    }};
}

/// TUI 快照断言（基于 insta）。
///
/// 首次运行生成 `.snap` 文件，后续运行自动对比。
/// 布局变化时测试失败并显示 diff。
///
/// ```ignore
/// let buf = render_to_buffer(&mut app, 80, 24);
/// assert_tui_snapshot!("empty_layout", &buf);
/// ```
#[macro_export]
macro_rules! assert_tui_snapshot {
    ($name:expr, $buf:expr $(,)?) => {{
        let text = $crate::tui_test::buffer_to_string($buf);
        insta::assert_snapshot!($name, text);
    }};
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tui::App;

    #[test]
    fn test_render_to_buffer_basic() {
        let mut app = App::new_for_test();
        let buf = render_to_buffer(&mut app, 80, 24);
        let text = buffer_to_string(&buf);
        // 至少有内容：空 App 应显示 Ready
        assert!(
            text.contains("Ready"),
            "empty app should show Ready, got: {}",
            &text
        );
    }

    #[test]
    fn test_buffer_to_string_line_count() {
        let mut app = App::new_for_test();
        let buf = render_to_buffer(&mut app, 80, 10);
        let text = buffer_to_string(&buf);
        // 10 行高度 → 输出应有 10 行
        assert_eq!(text.lines().count(), 10);
    }

    #[test]
    fn test_lines_to_text_basic() {
        use ratatui::text::{Line, Span};
        let lines = vec![
            Line::from(Span::raw("hello")),
            Line::from(Span::raw("world")),
        ];
        let text = lines_to_text(&lines);
        assert_eq!(text, "helloworld");
    }

    #[test]
    fn test_lines_to_text_multi_span() {
        use ratatui::text::{Line, Span};
        let lines = vec![Line::from(vec![Span::raw("foo"), Span::raw("bar")])];
        let text = lines_to_text(&lines);
        assert_eq!(text, "foobar");
    }
}
