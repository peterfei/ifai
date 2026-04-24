//! 🔥 元编程：流式状态栏
//!
//! 🏛️ 架构原则：零修改现有数据流，100% 复用现有组件
//!
//! **单一数据源**：
//! - StreamEvent → StreamStatus → 状态栏渲染
//!
//! **复用组件**：
//! - Theme 系统（render::default_theme）
//! - Token 估算逻辑（token::estimate_tokens / is_chinese）
//! - 模型元数据（provider_metadata）
//! - 现有事件流（StreamEvent::TextDelta）
//!
//! **设计理念**：
//! - 极简状态（只追踪必要信息）
//! - 零拷贝（引用传递，不克隆数据）
//! - 单行刷新（ANSI 覆盖，不滚动终端）

use std::time::{Duration, Instant};
use crate::render::{Theme, RESET, color_256};

/// 🔥 流式状态追踪器（轻量级，零拷贝）
pub struct StreamStatus {
    start_time: Instant,
    estimated_input_tokens: usize,
    current_output_chars: usize,
    current_output_chinese_chars: usize,
}

impl StreamStatus {
    /// 创建新的状态追踪器
    pub fn new(estimated_input_tokens: usize) -> Self {
        Self {
            start_time: Instant::now(),
            estimated_input_tokens,
            current_output_chars: 0,
            current_output_chinese_chars: 0,
        }
    }

    /// 🔥 从文本增量更新状态（零拷贝）
    ///
    /// **复用 GUI 端逻辑**：中文 2 字符/token，英文 4 字符/token
    pub fn add_delta(&mut self, text: &str) {
        for c in text.chars() {
            self.current_output_chars += 1;
            if is_chinese(c) {
                self.current_output_chinese_chars += 1;
            }
        }
    }

    /// 🔥 估算输出 tokens（复用 token/display.rs 逻辑）
    fn estimate_output_tokens(&self) -> usize {
        let chinese_chars = self.current_output_chinese_chars;
        let other_chars = self.current_output_chars.saturating_sub(chinese_chars);
        chinese_chars / 2 + other_chars / 4
    }

    /// 🔥 渲染状态栏（单行，ANSI 覆盖）
    ///
    /// **格式**：`[deepseek-chat] 3.2s  in:1,247  out:156  [Ctrl+C]`
    ///
    /// **颜色方案**（复用 Theme 系统）：
    /// - 模型名：cyan (brand color)
    /// - 时间：green
    /// - in/out：yellow/blue（信息层次）
    /// - [Ctrl+C]：muted（辅助信息）
    pub fn render(&self, model: &str, theme: &Theme) -> String {
        let elapsed = self.start_time.elapsed();
        let seconds = elapsed.as_secs_f32();
        let out_tokens = self.estimate_output_tokens();

        // 🔥 格式化数字（千位分隔符）
        let in_formatted = format_number(self.estimated_input_tokens);
        let out_formatted = format_number(out_tokens);
        let seconds_str = format!("{:.1}", seconds);

        // 🔥 使用字符串连接避免格式化参数不匹配
        let time_part = format!("{}{}s", theme.success, seconds_str);
        let in_part = format!("{}in:{}{}{}", " ", color_256(208), in_formatted, RESET);
        let out_part = format!("{}out:{}{}{}", " ", color_256(117), out_formatted, RESET);
        let ctrl_part = format!("{}[Ctrl+C]{}", theme.muted, RESET);

        format!(
            "\r[{}{}{}] {}{}  {}  {}     ",
            theme.brand, model, RESET,
            time_part,
            in_part,
            out_part,
            ctrl_part,
        )
    }

    /// 🔥 渲染完成摘要（响应结束后显示）
    ///
    /// **格式**：`[✓] Completed | 3.2s | in: 1,247 | out: 156 | cost: $0.0014`
    pub fn render_summary(&self, model: &str, input_tokens: u32, output_tokens: u32, theme: &Theme) -> String {
        let elapsed = self.start_time.elapsed();
        let seconds = elapsed.as_secs_f32();

        // 计算成本
        let cost = super::calculate_cost(&[], model, input_tokens, output_tokens);

        let in_formatted = format_number(input_tokens as usize);
        let out_formatted = format_number(output_tokens as usize);

        let cost_str = if let Some(c) = cost {
            format!("{}${:.4}{}", theme.success, c, RESET)
        } else {
            format!("{}N/A{}", theme.muted, RESET)
        };

        format!(
            "\n{}[✓] Completed | {}{}s | in: {} | out: {} | {}",
            theme.success,
            theme.muted, format!("{:.1}", seconds),
            in_formatted,
            out_formatted,
            cost_str,
        )
    }
}

/// 🔥 判断是否为中文字符（复用 token/display.rs 逻辑）
fn is_chinese(c: char) -> bool {
    matches!(c as u32, 0x4E00..=0x9FFF)
}

/// 🔥 格式化数字（添加千位分隔符）
fn format_number(n: usize) -> String {
    let s = n.to_string();
    let mut result = String::new();
    let chars: Vec<char> = s.chars().collect();

    for (i, c) in chars.iter().enumerate() {
        if i > 0 && (chars.len() - i) % 3 == 0 {
            result.push(',');
        }
        result.push(*c);
    }

    result
}

/// 🔥 定时器配置（状态栏刷新频率）
///
/// **100ms 刷新率**：平衡流畅度和性能
/// - 太快（< 50ms）：浪费 CPU
/// - 太慢（> 200ms）：卡顿感
pub const STATUS_REFRESH_INTERVAL: Duration = Duration::from_millis(100);

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_number() {
        assert_eq!(format_number(0), "0");
        assert_eq!(format_number(123), "123");
        assert_eq!(format_number(1234), "1,234");
        assert_eq!(format_number(1234567), "1,234,567");
    }

    #[test]
    fn test_stream_status_basic() {
        let mut status = StreamStatus::new(1000);
        assert_eq!(status.estimate_output_tokens(), 0);

        // 添加英文文本（约 4 字符/token）
        status.add_delta("Hello world! ");
        assert!(status.estimate_output_tokens() > 0);

        // 添加中文文本（约 2 字符/token）
        status.add_delta("你好世界");
        assert!(status.estimate_output_tokens() > 0);
    }

    #[test]
    fn test_stream_status_render() {
        let theme = crate::render::default_theme();
        let status = StreamStatus::new(1247);

        let output = status.render("deepseek-chat", &theme);
        assert!(output.contains("deepseek-chat"));
        assert!(output.contains("in:"));
        assert!(output.contains("out:"));
        assert!(output.contains("[Ctrl+C]"));
    }

    #[test]
    fn test_chinese_detection() {
        assert!(is_chinese('你'));
        assert!(is_chinese('好'));
        assert!(!is_chinese('A'));
        assert!(!is_chinese('1'));
    }
}
