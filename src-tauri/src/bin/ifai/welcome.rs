//! TUI 欢迎页组件
//!
//! 当内容区为空时显示欢迎信息，底部显示 36 帧有机变形 ASCII 动画。

use std::f32::consts::PI;
use std::time::{SystemTime, UNIX_EPOCH};

use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};

/// 动画帧数
const FRAME_COUNT: usize = 36;
/// 帧间隔（毫秒），与 amp 一致
const FRAME_TICK_MS: u64 = 80;

/// 编译时嵌入 36 帧动画数据（宏消除 36 行 include_str! 重复）
macro_rules! frames {
    ($($i:literal),+) => { [$(
        include_str!(concat!("welcome_frames/frame_", stringify!($i), ".txt"))
    ),+] };
}

const ANIMATION_FRAMES: [&str; FRAME_COUNT] = frames!(
     0,  1,  2,  3,  4,  5,  6,  7,  8,  9,
    10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
    20, 21, 22, 23, 24, 25, 26, 27, 28, 29,
    30, 31, 32, 33, 34, 35
);

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

    /// 时间驱动帧索引
    /// 测试模式固定返回 0，保证快照确定性
    fn current_frame_index() -> usize {
        #[cfg(test)]
        {
            return 0;
        }
        let ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;
        ((ms / FRAME_TICK_MS) % FRAME_COUNT as u64) as usize
    }

    /// Shimmer 着色：时间驱动的 Cyan 扫描带
    /// 参考 amp 的 shimmer.rs 实现
    fn shimmer_line(line: &str) -> Vec<Span<'static>> {
        let chars: Vec<char> = line.chars().collect();
        if chars.is_empty() {
            return vec![Span::default()];
        }

        let ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as f32;

        // 扫描参数
        let sweep_secs = 2.0_f32;
        let padding = 10.0_f32;
        let period = chars.len() as f32 + padding * 2.0;
        let pos = ((ms / 1000.0) % sweep_secs) / sweep_secs * period;
        let band_half_width = 5.0_f32;

        chars
            .iter()
            .enumerate()
            .map(|(i, &ch)| {
                if ch == ' ' {
                    return Span::styled(" ".to_string(), Style::default());
                }

                let i_pos = i as f32 + padding;
                let dist = (i_pos - pos).abs();
                let t = if dist <= band_half_width {
                    0.5 * (1.0 + (PI * dist / band_half_width).cos())
                } else {
                    0.0
                };

                let style = if t > 0.3 {
                    // 高光区：品牌蓝 + 粗体
                    Style::default()
                        .fg(Color::Rgb(75, 137, 255))
                        .add_modifier(Modifier::BOLD)
                } else {
                    // 基础色：暗灰
                    Style::default().fg(Color::DarkGray)
                };
                Span::styled(ch.to_string(), style)
            })
            .collect()
    }

    /// 渲染动画帧
    fn render_animation() -> Vec<Line<'static>> {
        let idx = Self::current_frame_index();
        ANIMATION_FRAMES[idx]
            .lines()
            .map(|line| Line::from(Self::shimmer_line(line)))
            .collect()
    }

    /// 渲染欢迎页内容
    pub fn render(&self) -> Vec<Line<'static>> {
        let mut lines = vec![];

        // === 原有标题/快捷键区域（不变） ===
        lines.push(Line::from(""));
        lines.push(Line::from(vec![
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
                Style::default()
                    .fg(Color::Cyan)
                    .add_modifier(Modifier::BOLD),
            ),
        ]));
        lines.push(Line::from(vec![
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
                Style::default().fg(Color::DarkGray),
            ),
        ]));
        lines.push(Line::from(""));
        lines.push(Line::from(""));
        lines.push(Line::from(vec![
            Span::default(),
            Span::default(),
            Span::styled(
                "快捷键：",
                Style::default().fg(Color::Yellow),
            ),
        ]));
        lines.push(Line::from(vec![
            Span::default(),
            Span::default(),
            Span::default(),
            Span::styled(
                "Ctrl+F  搜索内容      Ctrl+O  查看详情",
                Style::default().fg(Color::Gray),
            ),
        ]));
        lines.push(Line::from(vec![
            Span::default(),
            Span::default(),
            Span::default(),
            Span::styled(
                "Ctrl+D  退出程序      Ctrl+J   换行输入",
                Style::default().fg(Color::Gray),
            ),
        ]));
        lines.push(Line::from(vec![
            Span::default(),
            Span::default(),
            Span::default(),
            Span::styled(
                "Ctrl+C  清空/退出      Enter    提交输入",
                Style::default().fg(Color::Gray),
            ),
        ]));
        lines.push(Line::from(""));
        lines.push(Line::from(""));
        lines.push(Line::from(""));
        lines.push(Line::from(vec![
            Span::default(),
            Span::default(),
            Span::styled(
                "开始输入您的任务...",
                Style::default().fg(Color::DarkGray),
            ),
        ]));

        // === 动画区域（替换原来的空白行） ===
        let animation_lines = Self::render_animation();
        lines.extend(animation_lines);

        lines
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

        // 验证标题存在
        let title_line = &lines[1];
        assert!(title_line
            .spans
            .iter()
            .any(|s| s.content.contains("Welcome to IfAI")));

        // 验证包含 Ctrl+O 快捷键
        let has_ctrl_o = lines.iter().any(|line| {
            line.spans
                .iter()
                .any(|span| span.content.contains("Ctrl+O"))
        });
        assert!(has_ctrl_o, "应该包含 Ctrl+O 快捷键");

        // 验证动画帧存在（测试模式固定为 frame_0）
        // 原始 12 行 + 12 行动画 = 24 行
        assert!(
            lines.len() > 15,
            "应该包含动画帧行，实际 {} 行",
            lines.len()
        );
    }

    #[test]
    fn test_welcome_widget_default() {
        let widget = WelcomeWidget::default();
        assert_eq!(widget.title, "Welcome to IfAI");
    }

    #[test]
    fn test_current_frame_index_deterministic_in_test() {
        // 测试模式下应始终返回 0
        assert_eq!(WelcomeWidget::current_frame_index(), 0);
        assert_eq!(WelcomeWidget::current_frame_index(), 0);
    }

    #[test]
    fn test_animation_frames_loaded() {
        // 验证所有 36 帧已嵌入
        assert_eq!(ANIMATION_FRAMES.len(), 36);
        // 验证帧内容非空
        for (i, frame) in ANIMATION_FRAMES.iter().enumerate() {
            assert!(!frame.is_empty(), "frame_{} 不应为空", i);
        }
    }

    #[test]
    fn test_shimmer_line() {
        let spans = WelcomeWidget::shimmer_line("::+**=##");
        assert_eq!(spans.len(), 8);
        // 空格行
        let empty_spans = WelcomeWidget::shimmer_line("   ");
        assert_eq!(empty_spans.len(), 3);
    }

    #[test]
    fn test_render_animation() {
        let lines = WelcomeWidget::render_animation();
        // Frame 0 有 12 行（生成工具 ROWS=12）
        assert!(
            lines.len() >= 10,
            "动画帧应有 12 行，实际 {} 行",
            lines.len()
        );
    }
}
