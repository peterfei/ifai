//! 🔥 元编程：进度指示器（符合 IfAI Pipeline 规范）
//!
//! **规范来源**：`openspec/changes/optimize-ifai-cli/specs/ifai-pipeline-visualization-design.md`
//!
//! **状态指示器**：
//! - 进行中：`⟳` (U+27F3) - 蓝色
//! - 成功：`✓` (U+2713) - 绿色
//! - 失败：`✗` (U+2717) - 红色
//!
//! **动画帧**：
//! - 旋转：⟳ / ⟲ / ⊶ / ⊷
//! - 点阵：⠁ / ⠂ / ⠄ / ⠠

use std::time::Duration;

/// 🎯 动画帧（旋转符号）
pub const PROGRESS_FRAMES: &[char] = &['⟳', '⟲', '⊶', '⊷'];

/// 🎯 状态符号（Unicode，固定不变）
pub struct StatusSymbols;

impl StatusSymbols {
    /// 进行中（首个动画帧）
    pub const IN_PROGRESS: char = '⟳';  // U+27F3
    /// 成功
    pub const SUCCESS: char = '✓';      // U+2713
    /// 失败
    pub const FAILED: char = '✗';       // U+2717
}

/// 🎯 进度状态
#[derive(Debug, Clone)]
pub enum ProgressState {
    /// 空闲
    Idle,
    /// 进行中
    InProgress,
    /// 成功
    Success,
    /// 失败
    Failed { error: String },
}

/// 📊 动画渲染器（使用 \r 同行覆盖实现动画）
pub struct AnimatedRenderer {
    /// 当前帧索引
    frame_index: usize,
}

impl AnimatedRenderer {
    pub fn new() -> Self {
        Self {
            frame_index: 0,
        }
    }

    /// 🔥 渲染动画帧（使用 \r 覆盖当前行）
    pub fn render_frame(&mut self, model: &str) -> String {
        let frame = PROGRESS_FRAMES[self.frame_index % PROGRESS_FRAMES.len()];
        self.frame_index += 1;

        // 使用 \r 回到行首，不换行，实现同行覆盖动画
        format!("\r{} {}                     [进行中]", frame, model)
    }

    /// 🔥 完成动画（换行并显示统计）
    pub fn render_summary(&self, elapsed_secs: f64, total_in: u32, total_out: u32) -> String {
        let cost = (total_in as f64 * 0.14 / 1_000_000.0)
            + (total_out as f64 * 0.28 / 1_000_000.0);

        // 先换行（结束动画行），再显示统计
        format!(
            "\n{} Completed | {:.1}s | in: {} | out: {} | ${:.4}\n",
            StatusSymbols::SUCCESS,
            elapsed_secs, total_in, total_out, cost
        )
    }
}

/// 📊 ContentFirst 渲染器（无动画，稳定显示）
pub struct ContentFirstRenderer;

impl ContentFirstRenderer {
    pub fn new() -> Self {
        Self
    }

    /// 🔥 渲染开始进度（固定符号，无动画）
    pub fn render_start(&self, model: &str) -> String {
        format!("{} {}                     [进行中]\n", StatusSymbols::IN_PROGRESS, model)
    }

    /// 🔥 渲染完成统计
    pub fn render_summary(&self, elapsed_secs: f64, total_in: u32, total_out: u32) -> String {
        let cost = (total_in as f32 * 0.14 / 1_000_000.0)
            + (total_out as f32 * 0.28 / 1_000_000.0);

        format!(
            "\n{} Completed | {:.1}s | in: {} | out: {} | ${:.4}\n",
            StatusSymbols::SUCCESS,
            elapsed_secs, total_in, total_out, cost
        )
    }
}

/// 🏛️ 渲染模式
#[derive(Debug, Clone, Copy)]
pub enum RenderMode {
    /// 内联模式（无动画）
    Inline,
    /// 动画模式（带 \r 同行覆盖动画）
    Animated,
    /// TUI 模式
    Tui,
}

/// 📊 流式数据源
#[derive(Debug, Clone)]
pub struct StreamData {
    pub model: String,
    pub estimated_in: u32,
    pub current_out: u32,
}

/// 🎯 渲染管道
pub struct RenderPipeline {
    mode: RenderMode,
    animated_renderer: AnimatedRenderer,
    content_first_renderer: ContentFirstRenderer,
}

impl RenderPipeline {
    pub fn new(mode: RenderMode) -> Self {
        Self {
            mode,
            animated_renderer: AnimatedRenderer::new(),
            content_first_renderer: ContentFirstRenderer::new(),
        }
    }

    /// 🔥 渲染进度
    pub fn render_progress(&mut self, model: &str) -> String {
        match self.mode {
            RenderMode::Animated => self.animated_renderer.render_frame(model),
            RenderMode::Inline | RenderMode::Tui => {
                self.content_first_renderer.render_start(model)
            }
        }
    }

    /// 🔥 渲染完成统计
    pub fn render_summary(&self, elapsed_secs: f64, total_in: u32, total_out: u32) -> String {
        match self.mode {
            RenderMode::Animated => self.animated_renderer.render_summary(elapsed_secs, total_in, total_out),
            RenderMode::Inline | RenderMode::Tui => {
                self.content_first_renderer.render_summary(elapsed_secs, total_in, total_out)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_progress_symbols() {
        assert_eq!(StatusSymbols::IN_PROGRESS, '⟳');
        assert_eq!(StatusSymbols::SUCCESS, '✓');
        assert_eq!(StatusSymbols::FAILED, '✗');
    }

    #[test]
    fn test_progress_frames() {
        assert_eq!(PROGRESS_FRAMES[0], '⟳');
        assert_eq!(PROGRESS_FRAMES[1], '⟲');
        assert_eq!(PROGRESS_FRAMES[2], '⊶');
        assert_eq!(PROGRESS_FRAMES[3], '⊷');
    }

    #[test]
    fn test_animated_renderer() {
        let mut renderer = AnimatedRenderer::new();

        // 测试动画帧循环
        let frame1 = renderer.render_frame("test-model");
        assert!(frame1.contains("\r"));
        assert!(frame1.contains('⟳'));

        let frame2 = renderer.render_frame("test-model");
        assert!(frame2.contains('⟲'));

        let frame3 = renderer.render_frame("test-model");
        assert!(frame3.contains('⊶'));

        // 测试循环回到第一帧
        let frame5 = renderer.render_frame("test-model");
        assert!(frame5.contains('⟳'));
    }

    #[test]
    fn test_content_first_renderer() {
        let renderer = ContentFirstRenderer::new();

        let start = renderer.render_start("test-model");
        assert!(start.contains('⟳'));
        assert!(start.contains("[进行中]"));

        let summary = renderer.render_summary(3.2, 1303, 56);
        assert!(summary.contains('✓'));
        assert!(summary.contains("Completed"));
    }

    #[test]
    fn test_render_pipeline_inline() {
        let mut pipeline = RenderPipeline::new(RenderMode::Inline);

        let progress = pipeline.render_progress("test-model");
        assert!(progress.contains('⟳'));
        assert!(progress.contains('\n')); // Inline 模式换行

        let summary = pipeline.render_summary(3.2, 1303, 56);
        assert!(summary.contains('✓'));
    }

    #[test]
    fn test_render_pipeline_animated() {
        let mut pipeline = RenderPipeline::new(RenderMode::Animated);

        let progress = pipeline.render_progress("test-model");
        assert!(progress.contains('\r')); // Animated 模式使用 \r
        assert!(!progress.contains('\n'));
    }
}
