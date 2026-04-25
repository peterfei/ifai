//! Pipeline 步骤状态和数据结构
//!
//! 使用 `#[derive(StatusRender)]` 宏自动生成渲染方法，零手写渲染逻辑。

use std::time::Duration;

// 导入派生宏
use ifai_render_macro::StatusRender;

/// Pipeline 步骤状态
///
/// ✅ 使用派生宏，零手写渲染逻辑
///
/// 🎨 元编程：`#[derive(StatusRender)]` 会自动生成以下内容：
/// - `ThemeAccessor` trait 定义（在模块作用域中）
/// - `PipelineStepStatus` 的所有渲染方法
#[derive(StatusRender, Debug, Clone, PartialEq)]
pub enum PipelineStepStatus {
    /// 进行中
    #[status(symbol = "⟳", zh = "进行中", en = "Running", theme = "brand")]
    InProgress,

    /// 成功
    #[status(symbol = "✓", zh = "成功", en = "Success", theme = "success")]
    Success,

    /// 失败
    #[status(symbol = "✗", zh = "失败", en = "Failed", theme = "error")]
    Failed {
        error: String,
        suggestion: Option<String>,
    },

    /// 跳过
    #[status(symbol = "○", zh = "跳过", en = "Skipped", theme = "muted")]
    Skipped {
        reason: String,
    },

    /// 警告
    #[status(symbol = "⚠", zh = "警告", en = "Warning", theme = "warning")]
    Warning,
}

/// Pipeline 步骤
#[derive(Debug, Clone)]
pub struct PipelineStep {
    pub tool_name: String,
    pub tool_args: String,
    pub status: PipelineStepStatus,
    pub output: StepOutput,
    pub metadata: StepMetadata,
}

/// 步骤输出
#[derive(Debug, Clone)]
pub enum StepOutput {
    Truncated { preview: String, total_lines: usize },
    Full { content: String },
    Empty,
}

/// 步骤元数据
#[derive(Debug, Clone)]
pub struct StepMetadata {
    pub duration: Option<Duration>,
    pub token_usage: Option<TokenUsage>,
}

/// Token 使用情况
#[derive(Debug, Clone)]
pub struct TokenUsage {
    pub input: usize,
    pub output: usize,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_status_symbols() {
        assert_eq!(PipelineStepStatus::InProgress.symbol(), '⟳');
        assert_eq!(PipelineStepStatus::Success.symbol(), '✓');
        assert_eq!(
            PipelineStepStatus::Failed {
                error: "test".to_string(),
                suggestion: None
            }
            .symbol(),
            '✗'
        );
        assert_eq!(
            PipelineStepStatus::Skipped {
                reason: "test".to_string()
            }
            .symbol(),
            '○'
        );
        assert_eq!(PipelineStepStatus::Warning.symbol(), '⚠');
    }

    #[test]
    fn test_status_labels_zh() {
        assert_eq!(PipelineStepStatus::Success.label_zh(), "成功");
        assert_eq!(PipelineStepStatus::Failed {
            error: "test".to_string(),
            suggestion: None
        }.label_zh(), "失败");
        assert_eq!(PipelineStepStatus::InProgress.label_zh(), "进行中");
    }

    #[test]
    fn test_status_labels_en() {
        assert_eq!(PipelineStepStatus::Success.label_en(), "Success");
        assert_eq!(PipelineStepStatus::Failed {
            error: "test".to_string(),
            suggestion: None
        }.label_en(), "Failed");
        assert_eq!(PipelineStepStatus::InProgress.label_en(), "Running");
    }

    #[test]
    fn test_theme_fields() {
        assert_eq!(PipelineStepStatus::Success.theme_field(), "success");
        assert_eq!(PipelineStepStatus::Failed {
            error: "test".to_string(),
            suggestion: None
        }.theme_field(), "error");
        assert_eq!(PipelineStepStatus::InProgress.theme_field(), "brand");
        assert_eq!(PipelineStepStatus::Warning.theme_field(), "warning");
        assert_eq!(PipelineStepStatus::Skipped {
            reason: "test".to_string()
        }.theme_field(), "muted");
    }
}
