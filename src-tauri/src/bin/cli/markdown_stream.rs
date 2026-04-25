//! 🎨 Markdown 代码块流式渲染器
//!
//! **功能**：
//! - 检测 Markdown 代码块（```lang ... ```）
//! - 缓冲代码内容，直到检测到闭合标记
//! - 渲染带边框、行号、语言标识的代码块
//!
//! **架构**：
//! - 状态机驱动（Text → CodeBlockStart → CodeBlockBody → CodeBlockEnd）
//! - Unicode box-drawing 字符（╭ ╰ │ ─）
//! - ANSI 256 色主题

use std::fmt;

/// 🎯 流式状态枚举
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StreamState {
    /// 普通文本
    Text,
    /// 代码块开始（检测到 ```）
    CodeBlockStart,
    /// 代码块内容
    CodeBlockBody,
    /// 代码块结束（检测到闭合 ```）
    CodeBlockEnd,
}

/// 🎨 终端主题（ANSI 256 色）
#[derive(Debug, Clone)]
pub struct TerminalTheme {
    /// 边框颜色（暗灰）
    pub box_dim: &'static str,
    /// 边框颜色（灰色）
    pub box_border: &'static str,
    /// 标题颜色（青色）
    pub box_header: &'static str,
    /// 行号颜色（暗灰）
    pub line_num: &'static str,
    /// 代码内容颜色（白色）
    pub code_content: &'static str,
    /// 重置序列
    pub reset: &'static str,
}

impl Default for TerminalTheme {
    fn default() -> Self {
        Self {
            box_dim: "\x1b[38;5;240m",
            box_border: "\x1b[38;5;244m",
            box_header: "\x1b[38;5;36m",
            line_num: "\x1b[38;5;242m",
            code_content: "\x1b[38;5;255m",
            reset: "\x1b[0m",
        }
    }
}

/// 🎨 Markdown 流式状态机
pub struct MarkdownStreamState {
    /// 当前状态
    current_state: StreamState,
    /// 代码块语言（rust, python, etc.）
    code_lang: String,
    /// 代码内容缓冲区
    code_buffer: String,
    /// 终端主题
    theme: TerminalTheme,
    /// 反引号计数器（检测 ```）
    backtick_count: usize,
    /// 输出缓冲区（累积待输出内容）
    output_buffer: String,
}

impl MarkdownStreamState {
    /// 创建新的状态机
    pub fn new() -> Self {
        Self {
            current_state: StreamState::Text,
            code_lang: String::new(),
            code_buffer: String::new(),
            theme: TerminalTheme::default(),
            backtick_count: 0,
            output_buffer: String::new(),
        }
    }

    /// 使用自定义主题创建
    pub fn with_theme(theme: TerminalTheme) -> Self {
        Self {
            theme,
            ..Self::new()
        }
    }

    /// 🔥 处理流式 delta，返回渲染输出
    ///
    /// **返回值**：Vec<String> - 需要输出的内容片段
    pub fn process_delta(&mut self, delta: &str) -> Vec<String> {
        let mut outputs = Vec::new();

        for char in delta.chars() {
            match self.current_state {
                StreamState::Text => {
                    outputs.extend(self.process_text_char(char));
                }
                StreamState::CodeBlockStart => {
                    self.process_code_start_char(char);
                }
                StreamState::CodeBlockBody => {
                    if let Some(output) = self.process_code_body_char(char) {
                        outputs.push(output);
                    }
                }
                StreamState::CodeBlockEnd => {
                    // 重置状态，准备下一个代码块
                    self.reset_state();
                }
            }
        }

        outputs
    }

    /// 处理普通文本字符
    fn process_text_char(&mut self, char: char) -> Option<String> {
        // 检测代码块开始（```）
        if char == '`' {
            self.backtick_count += 1;

            // 检测到 ```，进入代码块模式
            if self.backtick_count == 3 {
                self.current_state = StreamState::CodeBlockStart;
                self.backtick_count = 0;
                self.code_lang.clear();
                self.code_buffer.clear();

                // 输出换行，让代码块在新行开始
                return Some("\n".to_string());
            }
        } else {
            // 非反引号字符
            if self.backtick_count > 0 {
                // 之前有反引号但不足 3 个，输出它们
                let backticks = "`".repeat(self.backtick_count);
                self.backtick_count = 0;
                return Some(format!("{}{}", backticks, char));
            }
            return Some(char.to_string());
        }

        None
    }

    /// 处理代码块开始字符（读取语言标识）
    fn process_code_start_char(&mut self, char: char) {
        if char == '\n' {
            // 换行表示语言标识结束，进入代码体
            self.current_state = StreamState::CodeBlockBody;
            self.code_buffer.clear();
        } else {
            // 累积语言标识（如 "rust", "python"）
            if !char.is_whitespace() || !self.code_lang.is_empty() {
                self.code_lang.push(char);
            }
        }
    }

    /// 处理代码块内容字符
    fn process_code_body_char(&mut self, char: char) -> Option<String> {
        // 检测代码块结束（```）
        if char == '`' {
            self.backtick_count += 1;

            if self.backtick_count == 3 {
                // 检测到闭合 ```，渲染代码块
                self.current_state = StreamState::CodeBlockEnd;
                self.backtick_count = 0;

                return Some(self.render_code_block());
            }
        } else {
            // 普通字符
            if self.backtick_count > 0 {
                // 之前有反引号但不足 3 个，输出它们
                self.code_buffer.push_str(&"`".repeat(self.backtick_count));
                self.backtick_count = 0;
            }
            self.code_buffer.push(char);
        }

        None
    }

    /// 🔥 渲染代码块
    fn render_code_block(&self) -> String {
        let lines: Vec<&str> = self.code_buffer.lines().collect();

        // 计算最大宽度（用于对齐），空代码块默认最小宽度 20
        let max_width = if lines.is_empty() {
            20
        } else {
            lines.iter().map(|l| l.len()).max().unwrap_or(0)
        }.min(100); // 限制最大宽度

        // 语言标识
        let lang = if self.code_lang.is_empty() {
            "text".to_string()
        } else {
            self.code_lang.clone()
        };

        let t = &self.theme;

        // Unicode 边框
        let top_border = format!("{}╭─{}─{}",
            t.box_dim,
            "─".repeat(max_width + 2),
            t.reset
        );

        let header = format!("{}│ {} {}{}",
            t.box_border,
            t.box_header,
            lang,
            t.reset
        );

        // 渲染代码行
        let body_lines: Vec<String> = lines.iter()
            .enumerate()
            .map(|(i, line)| {
                let line_num = format!("{:>3}", i + 1);
                let padded_line = format!("{:width$}", line, width = max_width);
                format!("{}│{}{} {}{}{}",
                    t.box_border,
                    t.line_num, line_num,
                    t.code_content, padded_line,
                    t.reset
                )
            })
            .collect();

        let bottom_border = format!("{}╰─{}─{}",
            t.box_dim,
            "─".repeat(max_width + 2),
            t.reset
        );

        // 组合输出（添加换行）
        vec![
            top_border,
            header,
            body_lines.join("\n"),
            bottom_border,
            "\n".to_string(), // 代码块后换行
        ].join("\n")
    }

    /// 重置状态
    fn reset_state(&mut self) {
        self.current_state = StreamState::Text;
        self.code_lang.clear();
        self.code_buffer.clear();
        self.backtick_count = 0;
    }

    /// 强制刷新（用于流结束时处理未闭合的代码块）
    pub fn flush(&mut self) -> Option<String> {
        if self.current_state == StreamState::CodeBlockBody && !self.code_buffer.is_empty() {
            // 代码块未闭合，强制渲染
            let output = self.render_code_block();
            self.reset_state();
            Some(output)
        } else {
            None
        }
    }

    /// 获取当前状态
    pub fn current_state(&self) -> StreamState {
        self.current_state
    }
}

impl Default for MarkdownStreamState {
    fn default() -> Self {
        Self::new()
    }
}

impl fmt::Debug for MarkdownStreamState {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("MarkdownStreamState")
            .field("current_state", &self.current_state)
            .field("code_lang", &self.code_lang)
            .field("code_buffer_len", &self.code_buffer.len())
            .field("backtick_count", &self.backtick_count)
            .finish()
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_state_initialization() {
        let state = MarkdownStreamState::new();
        assert_eq!(state.current_state, StreamState::Text);
        assert!(state.code_lang.is_empty());
        assert!(state.code_buffer.is_empty());
    }

    #[test]
    fn test_simple_text_passthrough() {
        let mut state = MarkdownStreamState::new();
        let outputs = state.process_delta("Hello, world!");

        // 流式处理会返回多个片段（每个字符一个）
        // 连接所有片段验证内容
        let full_output = outputs.join("");
        assert_eq!(full_output, "Hello, world!");
    }

    #[test]
    fn test_inline_code_passthrough() {
        let mut state = MarkdownStreamState::new();
        let outputs = state.process_delta("Text with `inline code`");

        // 连接所有片段
        let full_output = outputs.join("");
        assert!(full_output.contains("inline code"));
        // 不应包含边框
        assert!(!full_output.contains("╭"));
    }

    #[test]
    fn test_code_block_detection() {
        let mut state = MarkdownStreamState::new();
        let outputs = state.process_delta("```rust\nlet x = 1;\n```");

        // 应该有输出（代码块渲染）
        assert!(!outputs.is_empty());

        let full_output = outputs.join("");
        assert!(full_output.contains("╭"));
        assert!(full_output.contains("rust"));
        assert!(full_output.contains("let x = 1;"));
    }

    #[test]
    fn test_multi_line_code_block() {
        let mut state = MarkdownStreamState::new();
        let input = "```rust\nfn main() {\n    println!(\"Hi\");\n}\n```";
        let outputs = state.process_delta(input);

        let full_output = outputs.join("");
        assert!(full_output.contains("fn main()"));
        assert!(full_output.contains("println!"));
        assert!(full_output.contains("│")); // 边框字符
    }

    #[test]
    fn test_unclosed_code_block_flush() {
        let mut state = MarkdownStreamState::new();
        state.process_delta("```rust\nlet x = 1;");

        // 代码块未闭合
        assert_eq!(state.current_state, StreamState::CodeBlockBody);

        // flush 应该渲染未闭合的代码块
        let output = state.flush();
        assert!(output.is_some());
        assert!(output.unwrap().contains("let x = 1"));
    }

    #[test]
    fn test_multiple_code_blocks() {
        let mut state = MarkdownStreamState::new();
        let input = "First:\n```\nblock1\n```\nSecond:\n```\nblock2\n```";
        let outputs = state.process_delta(input);

        let full_output = outputs.join("");
        // 应该有两个代码块
        assert!(full_output.contains("block1"));
        assert!(full_output.contains("block2"));
    }

    #[test]
    fn test_empty_code_block() {
        let mut state = MarkdownStreamState::new();
        let outputs = state.process_delta("```\n```");

        // 空代码块也应该渲染（只有边框）
        let full_output = outputs.join("");
        // 应该包含边框字符
        assert!(full_output.contains("╭") || full_output.contains("╰"));
    }

    #[test]
    fn test_language_detection() {
        let mut state = MarkdownStreamState::new();
        let outputs = state.process_delta("```python\nprint('hi')\n```");

        let full_output = outputs.join("");
        assert!(full_output.contains("python"));
    }

    #[test]
    fn test_no_language_specified() {
        let mut state = MarkdownStreamState::new();
        let outputs = state.process_delta("```\ncode\n```");

        let full_output = outputs.join("");
        // 默认显示 "text"
        assert!(full_output.contains("text"));
    }
}
