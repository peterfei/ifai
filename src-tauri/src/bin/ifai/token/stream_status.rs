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

use crate::render::{color_256, default_theme, Theme, RESET};
use std::time::{Duration, Instant};

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
            theme.brand, model, RESET, time_part, in_part, out_part, ctrl_part,
        )
    }

    /// 🔥 渲染完成摘要（响应结束后显示）
    ///
    /// **格式**：`[✓] Completed | 3.2s | in: 1,247 | out: 156 | cost: $0.0014`
    pub fn render_summary(
        &self,
        model: &str,
        input_tokens: u32,
        output_tokens: u32,
        theme: &Theme,
    ) -> String {
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
            theme.muted,
            format!("{:.1}", seconds),
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
pub fn format_number(n: usize) -> String {
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

// ============================================================================
// 统一底部状态栏（元编程：状态机驱动）
// ============================================================================

/// 🎯 状态栏状态（声明式，零手写逻辑）
#[derive(Debug, Clone, PartialEq)]
pub enum StatusBarState {
    /// 空闲状态
    Idle,
    /// 流式响应中
    Streaming {
        estimated_input: usize,
        current_output: usize,
        current_tool: Option<String>,
    },
    /// 工具执行中
    ExecutingTool {
        tool_name: String,
        tool_count: usize,
        tool_success: usize,
        tool_errors: usize,
    },
}

/// 🎯 统一底部状态栏（元编程：状态机驱动）
///
/// **设计原则**：
/// - 单一位置：始终在屏幕底部
/// - 状态驱动：根据状态自动渲染
/// - 零手写逻辑：配置驱动，生成式渲染
pub struct BottomStatusBar {
    state: StatusBarState,
    stream_start: Option<Instant>,
    model: String,
    theme: Theme,
}

impl BottomStatusBar {
    /// 创建新的底部状态栏
    pub fn new(model: String) -> Self {
        let theme = default_theme();
        Self {
            state: StatusBarState::Idle,
            stream_start: None,
            model,
            theme,
        }
    }

    /// 🔥 声明式状态转换（零手写逻辑）
    pub fn transition(&mut self, new_state: StatusBarState) {
        // 记录流式开始时间
        if matches!(&new_state, StatusBarState::Streaming { .. }) {
            if self.stream_start.is_none() {
                self.stream_start = Some(Instant::now());
            }
        } else {
            self.stream_start = None;
        }

        self.state = new_state;
    }

    /// 🔥 更新流式输出（用于 Streaming 状态）
    pub fn update_streaming_output(&mut self, text: &str) -> usize {
        if let StatusBarState::Streaming {
            estimated_input,
            ref mut current_output,
            ..
        } = self.state
        {
            // 估算 token 数量（中文 2 字符/token，英文 4 字符/token）
            let chinese_chars = text.chars().filter(|c| is_chinese(*c)).count();
            let other_chars = text.chars().count().saturating_sub(chinese_chars);
            let tokens = chinese_chars / 2 + other_chars / 4;

            *current_output += tokens;
            *current_output
        } else {
            0
        }
    }

    /// 🎨 元编程：状态驱动的渲染（简化版，无光标移动）
    pub fn render(&self) -> String {
        // 🔥 声明式状态渲染（模式匹配，零手写逻辑）
        let status_text = match &self.state {
            StatusBarState::Idle => {
                format!("[就绪] {}", self.model)
            }
            StatusBarState::Streaming {
                estimated_input,
                current_output,
                current_tool,
            } => {
                let in_formatted = format_number(*estimated_input);
                let out_formatted = format_number(*current_output);

                let tool_info = if let Some(tool) = current_tool {
                    format!(" | 工具: {} [进行中]", tool)
                } else {
                    String::new()
                };

                format!(
                    "[响应中] {} | in: {} | out: {}{}",
                    self.model, in_formatted, out_formatted, tool_info
                )
            }
            StatusBarState::ExecutingTool {
                tool_name,
                tool_count,
                tool_success,
                tool_errors,
            } => {
                format!(
                    "[工具执行] {} | 已执行 {} 个工具 | 成功 {} | 失败 {}",
                    tool_name, tool_count, tool_success, tool_errors
                )
            }
        };

        // 简化输出：不使用光标移动，直接返回状态文本
        format!("\n{}{}{}", self.theme.muted, status_text, RESET)
    }

    /// 🔥 静默渲染（不输出换行，用于覆盖显示）
    pub fn render_silent(&self) -> String {
        let status_text = match &self.state {
            StatusBarState::Idle => {
                format!("[就绪] {}", self.model)
            }
            StatusBarState::Streaming {
                estimated_input,
                current_output,
                current_tool,
            } => {
                let in_formatted = format_number(*estimated_input);
                let out_formatted = format_number(*current_output);

                let tool_info = if let Some(tool) = current_tool {
                    format!(" | 工具: {} [进行中]", tool)
                } else {
                    String::new()
                };

                format!(
                    "[响应中] {} | in: {} | out: {}{}",
                    self.model, in_formatted, out_formatted, tool_info
                )
            }
            StatusBarState::ExecutingTool {
                tool_name,
                tool_count,
                tool_success,
                tool_errors,
            } => {
                format!(
                    "[工具执行] {} | 已执行 {} 个工具 | 成功 {} | 失败 {}",
                    tool_name, tool_count, tool_success, tool_errors
                )
            }
        };

        format!("\r{}{}{}", self.theme.muted, status_text, RESET)
    }

    /// 🎯 固定底部渲染（使用 ANSI 光标定位）
    ///
    /// **关键改进**：
    /// - 保存当前光标位置
    /// - 移动到终端最后一行
    /// - 清除该行并显示状态
    /// - 恢复光标到原位置
    ///
    /// **效果**：状态栏始终在终端底部，内容在其上方正常滚动
    pub fn render_fixed(&self) -> String {
        // 🔥 复用状态文本生成逻辑（与 render_silent 相同）
        let status_text = match &self.state {
            StatusBarState::Idle => {
                format!("[就绪] {}", self.model)
            }
            StatusBarState::Streaming {
                estimated_input,
                current_output,
                current_tool,
            } => {
                let in_formatted = format_number(*estimated_input);
                let out_formatted = format_number(*current_output);

                let tool_info = if let Some(tool) = current_tool {
                    format!(" | 工具: {} [进行中]", tool)
                } else {
                    String::new()
                };

                format!(
                    "[响应中] {} | in: {} | out: {}{}",
                    self.model, in_formatted, out_formatted, tool_info
                )
            }
            StatusBarState::ExecutingTool {
                tool_name,
                tool_count,
                tool_success,
                tool_errors,
            } => {
                format!(
                    "[工具执行] {} | 已执行 {} 个工具 | 成功 {} | 失败 {}",
                    tool_name, tool_count, tool_success, tool_errors
                )
            }
        };

        // 🔥 使用 Cursor 抽象实现固定底部渲染
        crate::terminal::Cursor::render_at_bottom(&format!(
            "{}{}{}",
            self.theme.muted, status_text, RESET
        ))
    }
}

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

    // ═══════════════════════════════════════════════════════════
    // 底部状态栏测试（红绿测试）
    // ═══════════════════════════════════════════════════════════

    #[test]
    fn test_bottom_status_bar_new() {
        let bar = BottomStatusBar::new("deepseek-chat".to_string());
        // 初始状态为 Idle
        assert!(matches!(bar.state, StatusBarState::Idle));
    }

    #[test]
    fn test_bottom_status_bar_transition_idle() {
        let mut bar = BottomStatusBar::new("deepseek-chat".to_string());
        bar.transition(StatusBarState::Idle);
        assert!(matches!(bar.state, StatusBarState::Idle));
    }

    #[test]
    fn test_bottom_status_bar_transition_streaming() {
        let mut bar = BottomStatusBar::new("deepseek-chat".to_string());
        bar.transition(StatusBarState::Streaming {
            estimated_input: 1000,
            current_output: 0,
            current_tool: None,
        });

        assert!(matches!(bar.state, StatusBarState::Streaming { .. }));
        if let StatusBarState::Streaming {
            estimated_input,
            current_output,
            current_tool,
        } = &bar.state
        {
            assert_eq!(*estimated_input, 1000);
            assert_eq!(*current_output, 0);
            assert!(current_tool.is_none());
        }
    }

    #[test]
    fn test_bottom_status_bar_transition_streaming_with_tool() {
        let mut bar = BottomStatusBar::new("deepseek-chat".to_string());
        bar.transition(StatusBarState::Streaming {
            estimated_input: 1000,
            current_output: 50,
            current_tool: Some("bash".to_string()),
        });

        if let StatusBarState::Streaming { current_tool, .. } = &bar.state {
            assert_eq!(current_tool.as_ref().unwrap(), "bash");
        }
    }

    #[test]
    fn test_bottom_status_bar_transition_executing_tool() {
        let mut bar = BottomStatusBar::new("deepseek-chat".to_string());
        bar.transition(StatusBarState::ExecutingTool {
            tool_name: "bash".to_string(),
            tool_count: 1,
            tool_success: 0,
            tool_errors: 0,
        });

        if let StatusBarState::ExecutingTool {
            tool_name,
            tool_count,
            ..
        } = &bar.state
        {
            assert_eq!(tool_name, "bash");
            assert_eq!(*tool_count, 1);
        }
    }

    #[test]
    fn test_bottom_status_bar_render_idle() {
        let bar = BottomStatusBar::new("deepseek-chat".to_string());
        let output = bar.render();
        assert!(output.contains("[就绪]"));
        assert!(output.contains("deepseek-chat"));
    }

    #[test]
    fn test_bottom_status_bar_render_streaming() {
        let mut bar = BottomStatusBar::new("deepseek-chat".to_string());
        bar.transition(StatusBarState::Streaming {
            estimated_input: 1000,
            current_output: 50,
            current_tool: None,
        });

        let output = bar.render();
        assert!(output.contains("[响应中]"));
        assert!(output.contains("in: 1,000"));
        assert!(output.contains("out: 50"));
    }

    #[test]
    fn test_bottom_status_bar_render_streaming_with_tool() {
        let mut bar = BottomStatusBar::new("deepseek-chat".to_string());
        bar.transition(StatusBarState::Streaming {
            estimated_input: 1000,
            current_output: 50,
            current_tool: Some("bash".to_string()),
        });

        let output = bar.render();
        assert!(output.contains("工具: bash [进行中]"));
    }

    #[test]
    fn test_bottom_status_bar_render_executing_tool() {
        let mut bar = BottomStatusBar::new("deepseek-chat".to_string());
        bar.transition(StatusBarState::ExecutingTool {
            tool_name: "bash".to_string(),
            tool_count: 3,
            tool_success: 2,
            tool_errors: 1,
        });

        let output = bar.render();
        assert!(output.contains("[工具执行]"));
        assert!(output.contains("bash"));
        assert!(output.contains("已执行 3 个工具"));
        assert!(output.contains("成功 2"));
        assert!(output.contains("失败 1"));
    }

    #[test]
    fn test_bottom_status_bar_render_silent_no_newline() {
        let bar = BottomStatusBar::new("deepseek-chat".to_string());
        let output = bar.render_silent();
        // 静默渲染应该以 \r 开头（不换行）
        assert!(output.starts_with('\r'));
        // 正常渲染应该以 \n 开头（换行）
        let output_normal = bar.render();
        assert!(output_normal.starts_with('\n'));
    }

    #[test]
    fn test_bottom_status_bar_update_streaming_output() {
        let mut bar = BottomStatusBar::new("deepseek-chat".to_string());
        bar.transition(StatusBarState::Streaming {
            estimated_input: 1000,
            current_output: 0,
            current_tool: None,
        });

        // 更新输出
        bar.update_streaming_output("Hello"); // 约 1 token
        if let StatusBarState::Streaming { current_output, .. } = &bar.state {
            assert_eq!(*current_output, 1);
        }

        // 更新更多输出
        bar.update_streaming_output("Hello world!"); // 约 3 tokens
        if let StatusBarState::Streaming { current_output, .. } = &bar.state {
            assert!(*current_output > 1);
        }
    }

    #[test]
    fn test_bottom_status_bar_update_streaming_output_chinese() {
        let mut bar = BottomStatusBar::new("deepseek-chat".to_string());
        bar.transition(StatusBarState::Streaming {
            estimated_input: 1000,
            current_output: 0,
            current_tool: None,
        });

        // 中文文本（约 2 字符/token）
        bar.update_streaming_output("你好世界"); // 4 个中文字符 = 2 tokens
        if let StatusBarState::Streaming { current_output, .. } = &bar.state {
            assert_eq!(*current_output, 2);
        }
    }

    #[test]
    fn test_bottom_status_bar_state_transitions() {
        let mut bar = BottomStatusBar::new("deepseek-chat".to_string());

        // Idle -> Streaming
        bar.transition(StatusBarState::Streaming {
            estimated_input: 1000,
            current_output: 0,
            current_tool: None,
        });
        assert!(matches!(bar.state, StatusBarState::Streaming { .. }));

        // Streaming -> ExecutingTool
        bar.transition(StatusBarState::ExecutingTool {
            tool_name: "bash".to_string(),
            tool_count: 1,
            tool_success: 0,
            tool_errors: 0,
        });
        assert!(matches!(bar.state, StatusBarState::ExecutingTool { .. }));

        // ExecutingTool -> Idle
        bar.transition(StatusBarState::Idle);
        assert!(matches!(bar.state, StatusBarState::Idle));
    }

    // ═══════════════════════════════════════════════════════════
    // 集成测试
    // ═══════════════════════════════════════════════════════════

    #[test]
    fn test_integration_full_workflow() {
        let mut bar = BottomStatusBar::new("deepseek-chat".to_string());

        // 1. 空闲状态
        assert!(matches!(bar.state, StatusBarState::Idle));
        let output = bar.render();
        assert!(output.contains("[就绪]"));

        // 2. 开始流式响应
        bar.transition(StatusBarState::Streaming {
            estimated_input: 1000,
            current_output: 0,
            current_tool: None,
        });
        bar.update_streaming_output("Hello world");
        let output = bar.render();
        assert!(output.contains("[响应中]"));
        assert!(output.contains("out:"));

        // 3. 工具执行
        bar.transition(StatusBarState::ExecutingTool {
            tool_name: "bash".to_string(),
            tool_count: 1,
            tool_success: 0,
            tool_errors: 0,
        });
        let output = bar.render();
        assert!(output.contains("[工具执行]"));
        assert!(output.contains("bash"));

        // 4. 返回空闲
        bar.transition(StatusBarState::Idle);
        assert!(matches!(bar.state, StatusBarState::Idle));
    }

    #[test]
    fn test_stream_start_tracking() {
        let mut bar = BottomStatusBar::new("deepseek-chat".to_string());

        // 初始无流式开始时间
        assert!(bar.stream_start.is_none());

        // 转换到 Streaming 状态，记录开始时间
        bar.transition(StatusBarState::Streaming {
            estimated_input: 1000,
            current_output: 0,
            current_tool: None,
        });
        assert!(bar.stream_start.is_some());

        // 转换到非 Streaming 状态，清除开始时间
        bar.transition(StatusBarState::Idle);
        assert!(bar.stream_start.is_none());
    }

    // ═══════════════════════════════════════════════════════════
    // 固定底部渲染测试（Phase 2 新增）
    // ═══════════════════════════════════════════════════════════

    #[test]
    fn test_bottom_status_bar_render_fixed_idle() {
        let bar = BottomStatusBar::new("deepseek-chat".to_string());
        let output = bar.render_fixed();

        // 验证包含 ANSI 序列
        assert!(output.contains("\x1b[s")); // 保存光标
        assert!(output.contains("\x1b[")); // 移动光标
        assert!(output.contains("\x1b[u")); // 恢复光标
        assert!(output.contains("[就绪]")); // 状态文本
        assert!(output.contains("deepseek-chat")); // 模型名
    }

    #[test]
    fn test_bottom_status_bar_render_fixed_streaming() {
        let mut bar = BottomStatusBar::new("deepseek-chat".to_string());
        bar.transition(StatusBarState::Streaming {
            estimated_input: 1000,
            current_output: 50,
            current_tool: None,
        });

        let output = bar.render_fixed();
        assert!(output.contains("\x1b[s")); // 保存光标
        assert!(output.contains("[响应中]"));
        assert!(output.contains("in: 1,000"));
        assert!(output.contains("out: 50"));
    }

    #[test]
    fn test_bottom_status_bar_render_fixed_streaming_with_tool() {
        let mut bar = BottomStatusBar::new("deepseek-chat".to_string());
        bar.transition(StatusBarState::Streaming {
            estimated_input: 1000,
            current_output: 50,
            current_tool: Some("bash".to_string()),
        });

        let output = bar.render_fixed();
        assert!(output.contains("工具: bash [进行中]"));
    }

    #[test]
    fn test_bottom_status_bar_render_fixed_executing_tool() {
        let mut bar = BottomStatusBar::new("deepseek-chat".to_string());
        bar.transition(StatusBarState::ExecutingTool {
            tool_name: "bash".to_string(),
            tool_count: 3,
            tool_success: 2,
            tool_errors: 1,
        });

        let output = bar.render_fixed();
        assert!(output.contains("[工具执行]"));
        assert!(output.contains("bash"));
        assert!(output.contains("已执行 3 个工具"));
        assert!(output.contains("成功 2"));
        assert!(output.contains("失败 1"));
    }

    #[test]
    fn test_bottom_status_bar_render_fixed_vs_silent() {
        let mut bar = BottomStatusBar::new("deepseek-chat".to_string());
        bar.transition(StatusBarState::Streaming {
            estimated_input: 1000,
            current_output: 50,
            current_tool: None,
        });

        let fixed_output = bar.render_fixed();
        let silent_output = bar.render_silent();

        // 两者应该包含相同的状态文本
        assert!(fixed_output.contains("[响应中]"));
        assert!(silent_output.contains("[响应中]"));

        // render_fixed 包含 ANSI 光标控制序列
        assert!(fixed_output.contains("\x1b[s"));
        assert!(fixed_output.contains("\x1b[u"));

        // render_silent 只包含简单的 \r
        assert!(silent_output.starts_with('\r'));
        assert!(!silent_output.contains("\x1b[s"));
    }

    #[test]
    fn test_bottom_status_bar_render_fixed_integration() {
        let mut bar = BottomStatusBar::new("deepseek-chat".to_string());

        // 1. 空闲状态
        let output = bar.render_fixed();
        assert!(output.contains("[就绪]"));

        // 2. 开始流式响应
        bar.transition(StatusBarState::Streaming {
            estimated_input: 1000,
            current_output: 0,
            current_tool: None,
        });

        // 3. 更新输出
        bar.update_streaming_output("Hello world");
        let output = bar.render_fixed();
        assert!(output.contains("out:"));

        // 4. 工具执行
        bar.transition(StatusBarState::ExecutingTool {
            tool_name: "bash".to_string(),
            tool_count: 1,
            tool_success: 0,
            tool_errors: 0,
        });

        let output = bar.render_fixed();
        assert!(output.contains("[工具执行]"));

        // 5. 返回空闲
        bar.transition(StatusBarState::Idle);
        let output = bar.render_fixed();
        assert!(output.contains("[就绪]"));
    }
}
