//! Pipeline 跟踪器 - 管理工具执行的生命周期
//!
//! 🎨 元编程：使用 PipelineStepStatus 自动生成渲染逻辑

use std::collections::HashMap;
use std::time::{Duration, Instant};
use crate::pipeline::step::{PipelineStep, PipelineStepStatus, StepOutput, StepMetadata};

/// Pipeline 跟踪器
///
/// 管理工具执行的生命周期：进行中 → 成功/失败
pub struct PipelineTracker {
    /// 活跃的 pipeline 步骤（tool_id -> PipelineStep）
    active_steps: HashMap<String, PipelineStep>,
    /// 已完成的步骤（用于历史记录）
    completed_steps: Vec<PipelineStep>,
}

impl PipelineTracker {
    pub fn new() -> Self {
        Self {
            active_steps: HashMap::new(),
            completed_steps: Vec::new(),
        }
    }

    /// 开始一个新的 pipeline 步骤
    pub fn start_step(&mut self, tool_id: String, tool_name: String, tool_args: String) {
        let step = PipelineStep {
            tool_name: tool_name.clone(),
            tool_args: tool_args.clone(),
            status: PipelineStepStatus::InProgress,
            output: StepOutput::Empty,
            metadata: StepMetadata {
                duration: None,
                token_usage: None,
            },
        };

        self.active_steps.insert(tool_id.clone(), step);
    }

    /// 标记步骤为成功
    pub fn finish_step_success(&mut self, tool_id: &str, output: String, duration: Duration) {
        if let Some(mut step) = self.active_steps.remove(tool_id) {
            step.status = PipelineStepStatus::Success;
            step.output = Self::format_output(output);
            step.metadata.duration = Some(duration);

            self.completed_steps.push(step);
        }
    }

    /// 标记步骤为失败
    pub fn finish_step_error(&mut self, tool_id: &str, error: String, duration: Duration) {
        if let Some(mut step) = self.active_steps.remove(tool_id) {
            step.status = PipelineStepStatus::Failed {
                error: error.clone(),
                suggestion: None,
            };
            step.output = StepOutput::Full { content: error };
            step.metadata.duration = Some(duration);

            self.completed_steps.push(step);
        }
    }

    /// 标记步骤为跳过
    pub fn skip_step(&mut self, tool_id: &str, reason: String) {
        if let Some(mut step) = self.active_steps.remove(tool_id) {
            step.status = PipelineStepStatus::Skipped { reason: reason.clone() };
            step.output = StepOutput::Full { content: reason };
            step.metadata.duration = Some(Duration::ZERO);

            self.completed_steps.push(step);
        }
    }

    /// 获取活跃的步骤（用于渲染进行中状态）
    pub fn get_active_step(&self, tool_id: &str) -> Option<&PipelineStep> {
        self.active_steps.get(tool_id)
    }

    /// 获取所有活跃的步骤
    pub fn active_steps(&self) -> Vec<&PipelineStep> {
        self.active_steps.values().collect()
    }

    /// 获取已完成的步骤
    pub fn completed_steps(&self) -> &[PipelineStep] {
        &self.completed_steps
    }

    /// 清除所有步骤
    pub fn clear(&mut self) {
        self.active_steps.clear();
        self.completed_steps.clear();
    }

    /// 格式化输出（智能截断）
    fn format_output(content: String) -> StepOutput {
        const MAX_PREVIEW_LINES: usize = 10;

        let line_count = content.lines().count();
        if line_count <= MAX_PREVIEW_LINES {
            StepOutput::Full { content }
        } else {
            let preview = content
                .lines()
                .take(MAX_PREVIEW_LINES)
                .collect::<Vec<_>>()
                .join("\n");

            StepOutput::Truncated {
                preview,
                total_lines: line_count,
            }
        }
    }
}

impl Default for PipelineTracker {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_start_step() {
        let mut tracker = PipelineTracker::new();
        tracker.start_step("tool1".to_string(), "bash".to_string(), "ls".to_string());

        assert_eq!(tracker.active_steps().len(), 1);
        let step = tracker.get_active_step("tool1").unwrap();
        assert_eq!(step.tool_name, "bash");
        assert_eq!(step.tool_args, "ls");
        assert!(matches!(step.status, PipelineStepStatus::InProgress));
    }

    #[test]
    fn test_finish_success() {
        let mut tracker = PipelineTracker::new();
        tracker.start_step("tool1".to_string(), "bash".to_string(), "ls".to_string());

        let duration = Duration::from_secs(1);
        tracker.finish_step_success("tool1", "output".to_string(), duration);

        assert_eq!(tracker.active_steps().len(), 0);
        assert_eq!(tracker.completed_steps().len(), 1);

        let step = &tracker.completed_steps()[0];
        assert!(matches!(step.status, PipelineStepStatus::Success));
        assert_eq!(step.metadata.duration, Some(duration));
    }

    #[test]
    fn test_finish_error() {
        let mut tracker = PipelineTracker::new();
        tracker.start_step("tool1".to_string(), "bash".to_string(), "ls".to_string());

        let duration = Duration::from_millis(500);
        tracker.finish_step_error("tool1", "Error: command failed".to_string(), duration);

        assert_eq!(tracker.completed_steps().len(), 1);
        let step = &tracker.completed_steps()[0];

        match &step.status {
            PipelineStepStatus::Failed { error, .. } => {
                assert_eq!(error, "Error: command failed");
            }
            _ => panic!("Expected Failed status"),
        }
    }

    #[test]
    fn test_skip_step() {
        let mut tracker = PipelineTracker::new();
        tracker.start_step("tool1".to_string(), "bash".to_string(), "ls".to_string());

        tracker.skip_step("tool1", "User denied".to_string());

        assert_eq!(tracker.completed_steps().len(), 1);
        let step = &tracker.completed_steps()[0];

        match &step.status {
            PipelineStepStatus::Skipped { reason } => {
                assert_eq!(reason, "User denied");
            }
            _ => panic!("Expected Skipped status"),
        }
    }

    #[test]
    fn test_clear() {
        let mut tracker = PipelineTracker::new();
        tracker.start_step("tool1".to_string(), "bash".to_string(), "ls".to_string());
        tracker.finish_step_success("tool1", "output".to_string(), Duration::ZERO);

        tracker.clear();
        assert_eq!(tracker.active_steps().len(), 0);
        assert_eq!(tracker.completed_steps().len(), 0);
    }
}
