//! 🏛️ 声明式 TUI 状态栏系统
//!
//! 三段式元编程架构：
//!   1. 声明式配置数据（12 行） — 定义状态→图标→颜色映射
//!   2. 宏生成代码（40 行）     — 编译时自动生成所有逻辑函数
//!   3. 最小适配层（5 行）      — 仅供 draw_frame() 调用的渲染函数
//!
//! 新增一个状态 = 添加一行数据，无需修改任何手工代码。

use ratatui::style::Color;
use ratatui::text::Span;
use ratatui::style::Style;

// ============================================================================
// Macro 1: 状态→图标→颜色映射（生成 StatusKind 枚举 + icon/color/needs_animation）
// ============================================================================

macro_rules! status_mapping {
    ($($variant:ident => ($icon:expr, $color:expr, $anim:expr)),+ $(,)?) => {
        #[derive(Debug, Clone, Copy, PartialEq, Eq)]
        pub enum StatusKind {
            $( $variant ),+
        }

        impl StatusKind {
            /// 获取状态对应的图标字符
            pub fn icon(&self) -> &'static str {
                match self {
                    $( Self::$variant => $icon ),+
                }
            }

            /// 获取状态对应的真彩色
            pub fn color(&self) -> Color {
                match self {
                    $( Self::$variant => $color ),+
                }
            }

            /// 是否需要动画（true = Braille 帧轮转）
            pub fn needs_animation(&self) -> bool {
                match self {
                    $( Self::$variant => $anim ),+
                }
            }
        }

        impl Default for StatusKind {
            fn default() -> Self { Self::Idle }
        }
    };
}

// ============================================================================
// Macro 2: 动画帧数据（生成 current_frame / frame_count）
// ============================================================================

macro_rules! animation_frames {
    (frames: [$($frame:expr),+], interval_ms: $interval:expr) => {
        /// 返回当前应该显示的动画帧字符（时间驱动，纯函数）
        ///
        /// 测试模式下：始终返回第 0 帧（保证快照确定性）
        pub fn current_frame() -> char {
            #[cfg(test)]
            {
                // 测试模式：固定帧，避免快照不稳定
                const FRAMES: &[char] = &[$($frame),+];
                FRAMES[0]
            }
            #[cfg(not(test))]
            {
                const FRAMES: &[char] = &[$($frame),+];
                const INTERVAL_MS: u64 = $interval;
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis() as u64;
                FRAMES[(now / INTERVAL_MS) as usize % FRAMES.len()]
            }
        }

        /// 返回动画帧总数
        pub fn frame_count() -> usize {
            const FRAMES: &[char] = &[$($frame),+];
            FRAMES.len()
        }
    };
}

// ============================================================================
// Macro 3: 状态转换规则（生成 can_transition / valid_transitions）
// ============================================================================

macro_rules! state_transitions {
    ($($from:ident => [$($to:ident),+]),+ $(,)?) => {
        /// 检查 from → to 是否为合法转换
        pub fn can_transition(from: StatusKind, to: StatusKind) -> bool {
            $(
                if from == StatusKind::$from {
                    return matches!(to, $(StatusKind::$to)|+);
                }
            )+
            false
        }

        /// 返回从指定状态出发的所有合法目标状态
        pub fn valid_transitions(from: StatusKind) -> &'static [StatusKind] {
            match from {
                $( StatusKind::$from => &[$(StatusKind::$to),+] ),+
            }
        }
    };
}

// ============================================================================
// Layer 1: 声明式配置数据（12 行）
// ============================================================================

// 1a. 状态映射：5 行数据 → 自动生成枚举 + 3 个 impl 函数
//     颜色使用品牌色精确 RGB（真彩色）
status_mapping! {
    Idle       => ("○", Color::Rgb(154, 166, 180), false),  // muted gray  #9aa6b4
    Requesting => ("●", Color::Rgb(94, 175, 94),   true),   // success    #5ea16e
    Streaming  => ("●", Color::Rgb(75, 137, 255),  true),   // brand blue #4b89ff
    Done       => ("✔", Color::Rgb(255, 255, 255), false),  // white      #ffffff
    Failed     => ("✘", Color::Rgb(209, 105, 105), false),  // error red  #d16969
}

// 1b. 动画帧：2 行数据 → 自动生成 current_frame()
//     4 帧 Braille, 200ms/帧 → 800ms 完整周期
animation_frames! {
    frames: ['⠁', '⠂', '⠄', '⠠'],
    interval_ms: 200
}

// 1c. 状态转换：5 行规则 → 自动生成 can_transition() + valid_transitions()
state_transitions! {
    Idle        => [Requesting],
    Requesting  => [Streaming, Failed],
    Streaming   => [Done, Failed],
    Done        => [Idle],
    Failed      => [Idle]
}

// ============================================================================
// Layer 3: 最小适配层（5 行手工代码）
// ============================================================================

/// 根据状态生成带颜色和图标的 Span
///
/// 静态状态显示配置的图标字符，动画状态返回当前 Braille 帧
pub fn render_animated_status(kind: StatusKind) -> Span<'static> {
    let ch = if kind.needs_animation() {
        current_frame()
    } else {
        kind.icon().chars().next().unwrap()
    };
    Span::styled(ch.to_string(), Style::default().fg(kind.color()))
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // ── 状态映射完整性 ──

    #[test]
    fn test_all_statuses_have_icon() {
        let statuses = [
            StatusKind::Idle,
            StatusKind::Requesting,
            StatusKind::Streaming,
            StatusKind::Done,
            StatusKind::Failed,
        ];
        for s in &statuses {
            assert!(!s.icon().is_empty(), "{:?} 的 icon 不应为空", s);
            // 非动画状态不应使用 Braille 作为图标
            if !s.needs_animation() {
                assert_ne!(s.icon(), "⠁", "{:?} 不应使用 Braille 帧作为图标", s);
            }
        }
    }

    #[test]
    fn test_needs_animation_correct() {
        assert!(!StatusKind::Idle.needs_animation());
        assert!(StatusKind::Requesting.needs_animation());
        assert!(StatusKind::Streaming.needs_animation());
        assert!(!StatusKind::Done.needs_animation());
        assert!(!StatusKind::Failed.needs_animation());
    }

    #[test]
    fn test_default_is_idle() {
        assert_eq!(StatusKind::default(), StatusKind::Idle);
    }

    // ── 动画帧 ──

    #[test]
    fn test_current_frame_returns_valid() {
        let frame = current_frame();
        let valid: &[char] = &['⠁', '⠂', '⠄', '⠠'];
        assert!(valid.contains(&frame), "{} 不是有效帧", frame);
    }

    #[test]
    fn test_frame_count() {
        assert_eq!(frame_count(), 4);
    }

    #[test]
    fn test_current_frame_fixed_in_tests() {
        // 测试模式下 current_frame() 固定返回第 0 帧
        assert_eq!(current_frame(), '⠁');
        assert_eq!(current_frame(), '⠁');
        assert_eq!(current_frame(), '⠁');
    }

    // ── 状态转换 ──

    #[test]
    fn test_valid_transitions() {
        assert!(can_transition(StatusKind::Idle, StatusKind::Requesting));
        assert!(can_transition(StatusKind::Requesting, StatusKind::Streaming));
        assert!(can_transition(StatusKind::Requesting, StatusKind::Failed));
        assert!(can_transition(StatusKind::Streaming, StatusKind::Done));
        assert!(can_transition(StatusKind::Streaming, StatusKind::Failed));
        assert!(can_transition(StatusKind::Done, StatusKind::Idle));
        assert!(can_transition(StatusKind::Failed, StatusKind::Idle));
    }

    #[test]
    fn test_invalid_transitions() {
        assert!(!can_transition(StatusKind::Idle, StatusKind::Failed));
        assert!(!can_transition(StatusKind::Idle, StatusKind::Done));
        assert!(!can_transition(StatusKind::Done, StatusKind::Requesting));
        assert!(!can_transition(StatusKind::Failed, StatusKind::Requesting));
    }

    #[test]
    fn test_valid_transitions_list() {
        let from_idle = valid_transitions(StatusKind::Idle);
        assert_eq!(from_idle, &[StatusKind::Requesting]);

        let from_req = valid_transitions(StatusKind::Requesting);
        assert_eq!(from_req.len(), 2, "Requesting → [Streaming, Failed]");
        assert!(from_req.contains(&StatusKind::Streaming));
        assert!(from_req.contains(&StatusKind::Failed));
    }

    // ── 渲染 ──

    #[test]
    fn test_render_idle_icon() {
        let span = render_animated_status(StatusKind::Idle);
        assert_eq!(span.content, "○");
    }

    #[test]
    fn test_render_animated_shows_braille() {
        let span = render_animated_status(StatusKind::Requesting);
        let ch = span.content.chars().next().unwrap();
        assert!(
            ch == '⠁' || ch == '⠂' || ch == '⠄' || ch == '⠠',
            "动画状态应用 Braille 帧: {}",
            ch
        );
    }

    #[test]
    fn test_render_done_icon() {
        let span = render_animated_status(StatusKind::Done);
        assert_eq!(span.content, "✔");
    }

    #[test]
    fn test_render_failed_icon() {
        let span = render_animated_status(StatusKind::Failed);
        assert_eq!(span.content, "✘");
    }

    // ── 默认值 ──

    #[test]
    fn test_status_kind_default() {
        let k: StatusKind = Default::default();
        assert_eq!(k, StatusKind::Idle);
    }
}
