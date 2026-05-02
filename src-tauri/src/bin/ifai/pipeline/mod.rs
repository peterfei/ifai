//! Pipeline 可视化模块
//!
//! 使用元编程实现零手写渲染逻辑的 Pipeline 步骤可视化。

pub mod step;
pub mod tracker;

pub use step::{
    PipelineStep,
    PipelineStepStatus,
    StepMetadata,
    StepOutput,
    ThemeAccessor, // 🎨 元编程：由宏生成
    TokenUsage,
};
pub use tracker::PipelineTracker;
