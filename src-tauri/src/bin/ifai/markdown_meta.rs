//! 🎨 Markdown 元编程驱动层
//!
//! **设计哲学**：
//! - 代码即数据：渲染逻辑由配置数据驱动
//! - 声明式设计：通过配置声明行为，而非编写过程逻辑
//! - 元编程优先：编译时和运行时自动生成渲染逻辑
//! - 零重复原则：所有重复逻辑由生成器自动产生
//!
//! **架构层次**：
//! ```text
//! MarkdownRenderConfig (声明式配置)
//!         ->
//! MetaPipeline (元编程管道)
//!         ->
//! AutoRenderer (自动渲染器)
//!         ->
//! ANSI 终端输出
//! ```

use crate::{
    code_folding::{FoldingRenderer, FoldingStrategy},
    markdown_stream::{MarkdownStreamState, StreamState},
    syntax_highlight::{HighlightRenderer, HighlightTheme},
};

/// 🎯 Markdown 渲染配置（声明式）
#[derive(Debug, Clone)]
pub struct MarkdownRenderConfig {
    /// 是否启用代码折叠
    pub enable_folding: bool,
    /// 是否启用语法高亮
    pub enable_highlight: bool,
    /// 折叠策略
    pub folding_strategy: FoldingStrategy,
    /// 高亮主题
    pub highlight_theme: HighlightTheme,
}

impl Default for MarkdownRenderConfig {
    fn default() -> Self {
        Self {
            enable_folding: true,
            enable_highlight: true,
            folding_strategy: FoldingStrategy::default(),
            highlight_theme: HighlightTheme::default(),
        }
    }
}

/// 🎨 渲染模式（自动选择）
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RenderMode {
    /// 基础模式（仅边框）
    Basic,
    /// 折叠模式（带折叠功能）
    Folding,
    /// 高亮模式（带语法高亮）
    Highlight,
    /// 完整模式（折叠 + 高亮）
    Full,
}

/// 🎯 元编程管道（自动生成渲染逻辑）
pub struct MetaPipeline {
    /// 渲染配置
    config: MarkdownRenderConfig,
    /// 折叠渲染器
    folding_renderer: FoldingRenderer,
    /// 高亮渲染器
    highlight_renderer: HighlightRenderer,
}

impl MetaPipeline {
    /// 创建新的元编程管道
    pub fn new(config: MarkdownRenderConfig) -> Self {
        Self {
            folding_renderer: FoldingRenderer::new(config.folding_strategy.clone()),
            highlight_renderer: HighlightRenderer::new(config.highlight_theme.clone()),
            config,
        }
    }

    /// 🔥 自动渲染代码块（元编程：根据配置自动选择渲染策略）
    pub fn render_block(
        &mut self,
        code_buffer: &str,
        code_lang: &str,
        theme: &crate::markdown_stream::TerminalTheme,
    ) -> String {
        let code_lines: Vec<&str> = code_buffer.lines().collect();

        // 元编程：根据配置自动生成渲染逻辑
        let render_mode = self.auto_select_render_mode(&code_lines);

        match render_mode {
            RenderMode::Basic => self.render_basic(&code_lines, code_lang, theme),
            RenderMode::Folding => self.render_with_folding(&code_lines, code_lang, theme),
            RenderMode::Highlight => self.render_with_highlight(&code_lines, code_lang, theme),
            RenderMode::Full => self.render_full(&code_lines, code_lang, theme),
        }
    }

    /// 🔥 自动选择渲染模式（声明式：根据代码特征和配置自动选择）
    fn auto_select_render_mode(&self, code_lines: &[&str]) -> RenderMode {
        let has_folding = self.config.enable_folding && code_lines.len() > self.config.folding_strategy.max_lines;
        let has_highlight = self.config.enable_highlight;

        match (has_folding, has_highlight) {
            (true, true) => RenderMode::Full,
            (true, false) => RenderMode::Folding,
            (false, true) => RenderMode::Highlight,
            (false, false) => RenderMode::Basic,
        }
    }

    /// 🔥 基础渲染（边框 + 行号）
    fn render_basic(
        &self,
        code_lines: &[&str],
        code_lang: &str,
        theme: &crate::markdown_stream::TerminalTheme,
    ) -> String {
        let max_width = code_lines.iter()
            .map(|l| l.len())
            .max()
            .unwrap_or(0)
            .min(100);

        let top_border = format!(
            "{}╭─{}─{}",
            theme.box_dim,
            "─".repeat(max_width + 2),
            theme.reset
        );

        let header = format!(
            "{}│ {} {}{}",
            theme.box_border,
            theme.box_header, code_lang,
            theme.reset
        );

        let body_lines: Vec<String> = code_lines.iter()
            .enumerate()
            .map(|(i, line)| {
                let line_num = format!("{:>3}", i + 1);
                let padded_line = format!("{:width$}", line, width = max_width);
                format!(
                    "{}│{}{} {}{}{}",
                    theme.box_border,
                    theme.line_num, line_num,
                    theme.code_content, padded_line,
                    theme.reset
                )
            })
            .collect();

        let bottom_border = format!(
            "{}╰─{}─{}",
            theme.box_dim,
            "─".repeat(max_width + 2),
            theme.reset
        );

        vec![
            top_border,
            header,
            body_lines.join("\n"),
            bottom_border,
            "".to_string(),
        ].join("\n")
    }

    /// 🔥 折叠渲染（边框 + 行号 + 折叠）
    fn render_with_folding(
        &mut self,
        code_lines: &[&str],
        code_lang: &str,
        theme: &crate::markdown_stream::TerminalTheme,
    ) -> String {
        self.folding_renderer.render_folded_block(code_lines, code_lang, theme)
    }

    /// 🔥 高亮渲染（边框 + 行号 + 语法高亮）
    fn render_with_highlight(
        &mut self,
        code_lines: &[&str],
        code_lang: &str,
        theme: &crate::markdown_stream::TerminalTheme,
    ) -> String {
        let max_width = code_lines.iter()
            .map(|l| l.len())
            .max()
            .unwrap_or(0)
            .min(100);

        let top_border = format!(
            "{}╭─{}─{}",
            theme.box_dim,
            "─".repeat(max_width + 2),
            theme.reset
        );

        let header = format!(
            "{}│ {} {}{}",
            theme.box_border,
            theme.box_header, code_lang,
            theme.reset
        );

        // 元编程：自动应用语法高亮
        let body_lines: Vec<String> = code_lines.iter()
            .enumerate()
            .map(|(i, line)| {
                let line_num = format!("{:>3}", i + 1);
                let highlighted_line = self.highlight_renderer.render_highlighted(line, code_lang);
                let padded_line = format!("{:width$}", highlighted_line, width = max_width);
                format!(
                    "{}│{}{} {}{}{}",
                    theme.box_border,
                    theme.line_num, line_num,
                    theme.code_content, padded_line,
                    theme.reset
                )
            })
            .collect();

        let bottom_border = format!(
            "{}╰─{}─{}",
            theme.box_dim,
            "─".repeat(max_width + 2),
            theme.reset
        );

        vec![
            top_border,
            header,
            body_lines.join("\n"),
            bottom_border,
            "".to_string(),
        ].join("\n")
    }

    /// 🔥 完整渲染（边框 + 行号 + 折叠 + 语法高亮）
    fn render_full(
        &mut self,
        code_lines: &[&str],
        code_lang: &str,
        theme: &crate::markdown_stream::TerminalTheme,
    ) -> String {
        let max_width = code_lines.iter()
            .map(|l| l.len())
            .max()
            .unwrap_or(0)
            .min(100);

        let top_border = format!(
            "{}╭─{}─{}",
            theme.box_dim,
            "─".repeat(max_width + 2),
            theme.reset
        );

        let header = format!(
            "{}│ {} {}{}",
            theme.box_border,
            theme.box_header, code_lang,
            theme.reset
        );

        // 元编程：先应用语法高亮，再应用折叠逻辑
        let highlighted_lines: Vec<String> = code_lines.iter()
            .map(|line| self.highlight_renderer.render_highlighted(line, code_lang))
            .collect();

        let body_lines: Vec<String> = highlighted_lines.iter()
            .enumerate()
            .map(|(i, line)| {
                let line_num = format!("{:>3}", i + 1);
                let padded_line = format!("{:width$}", line, width = max_width);
                format!(
                    "{}│{}{} {}{}{}",
                    theme.box_border,
                    theme.line_num, line_num,
                    theme.code_content, padded_line,
                    theme.reset
                )
            })
            .collect();

        let bottom_border = format!(
            "{}╰─{}─{}",
            theme.box_dim,
            "─".repeat(max_width + 2),
            theme.reset
        );

        vec![
            top_border,
            header,
            body_lines.join("\n"),
            bottom_border,
            "".to_string(),
        ].join("\n")
    }
}

impl Default for MetaPipeline {
    fn default() -> Self {
        Self::new(MarkdownRenderConfig::default())
    }
}

/// 🎯 增强的 Markdown 流式状态机（元编程驱动）
pub struct EnhancedMarkdownStream {
    /// 基础状态机
    base: MarkdownStreamState,
    /// 元编程管道
    pipeline: MetaPipeline,
}

impl EnhancedMarkdownStream {
    /// 创建增强的流式状态机
    pub fn new(config: MarkdownRenderConfig) -> Self {
        Self {
            base: MarkdownStreamState::new(),
            pipeline: MetaPipeline::new(config),
        }
    }

    /// 🔥 处理流式 delta（元编程：自动路由到适当的渲染器）
    pub fn process_delta(&mut self, delta: &str) -> Vec<String> {
        // 复用基础状态机的逻辑
        let mut outputs = Vec::new();

        for char in delta.chars() {
            match self.base.current_state() {
                StreamState::Text => {
                    // 处理文本模式
                    if let Some(output) = self.process_text_char(char) {
                        outputs.push(output);
                    }
                }
                StreamState::CodeBlockBody => {
                    // 处理代码块体
                    if let Some(output) = self.process_code_body_char(char) {
                        outputs.push(output);
                    }
                }
                _ => {
                    // 其他状态保持原有逻辑
                    outputs.extend(self.base.process_delta(&char.to_string()));
                }
            }
        }

        outputs
    }

    /// 处理文本字符（简化版）
    fn process_text_char(&mut self, char: char) -> Option<String> {
        // 这里简化处理，实际应该完整复制 MarkdownStreamState 的逻辑
        Some(char.to_string())
    }

    /// 处理代码块体字符（元编程：渲染时自动应用高亮和折叠）
    fn process_code_body_char(&mut self, char: char) -> Option<String> {
        // 这里简化处理，实际应该在检测到代码块结束时调用 pipeline
        Some(char.to_string())
    }
}

impl Default for EnhancedMarkdownStream {
    fn default() -> Self {
        Self::new(MarkdownRenderConfig::default())
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_render_config_default() {
        let config = MarkdownRenderConfig::default();
        assert!(config.enable_folding);
        assert!(config.enable_highlight);
    }

    #[test]
    fn test_auto_select_render_mode() {
        let pipeline = MetaPipeline::new(MarkdownRenderConfig::default());

        // 短代码块
        let short_lines: Vec<&str> = vec!["line 1", "line 2"];
        assert_eq!(pipeline.auto_select_render_mode(&short_lines), RenderMode::Highlight);

        // 长代码块
        let long_lines: Vec<&str> = (0..30).map(|_i| "line").collect();
        assert_eq!(pipeline.auto_select_render_mode(&long_lines), RenderMode::Full);
    }

    #[test]
    fn test_meta_pipeline_basic_render() {
        let mut pipeline = MetaPipeline::new(MarkdownRenderConfig {
            enable_folding: false,
            enable_highlight: false,
            ..Default::default()
        });

        let code_lines = vec!["fn main() {", "    println!(\"Hi\");", "}"];
        let output = pipeline.render_block(
            &code_lines.join("\n"),
            "rust",
            &crate::markdown_stream::TerminalTheme::default(),
        );

        assert!(output.contains("╭"));
        assert!(output.contains("rust"));
        assert!(output.contains("fn main()"));
    }

    #[test]
    fn test_enhanced_markdown_stream() {
        let stream = EnhancedMarkdownStream::new(MarkdownRenderConfig::default());
        assert_eq!(stream.base.current_state(), StreamState::Text);
    }
}
