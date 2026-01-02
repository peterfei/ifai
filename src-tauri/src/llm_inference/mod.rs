/*!
IfAI Editor - llama.cpp Local Inference
======================================

本地 LLM 推理模块，使用 llama.cpp Rust 绑定实现。

阶段 5（llama-cpp-2 迁移）：
- 模块结构创建
- 基础接口定义
- llama-cpp-2 v0.1 API 实现（支持 Qwen2）

平台支持：
- macOS (Apple Silicon + Intel)
- Linux (x64 + ARM64)
- Windows (x64)

模型支持：
- Qwen2.5-Coder (GGUF 格式)
- Qwen2 系列 (GGUF 格式)
- 其他 llama.cpp 支持的模型

注意：本模块使用 llama-cpp-2 v0.1 库实现，该库对 Qwen2 有更好的支持。
*/

// 模块版本
pub const VERSION: &str = "0.6.0-llama-cpp-2-implementation";

// 导出子模块
pub mod model;
pub mod generator;
pub mod config;

// 重新导出常用类型
pub use model::{
    default_model_path,
    load_model,
    ensure_model_loaded,
    unload_model,
    is_model_loaded,
};

pub use config::{
    LlmInferenceConfig,
};

// 重新导出文本生成函数
pub use generator::generate_completion;

// ============================================================================
// Error Types
// ============================================================================

/// LLM 推理错误
#[derive(Debug, Clone)]
pub enum InferenceError {
    /// 功能未实现
    NotYetImplemented(String),

    /// 模型未加载
    ModelNotLoaded,

    /// 模型加载失败
    ModelLoadFailed(String),

    /// 推理失败
    InferenceFailed(String),

    /// 超时
    Timeout,

    /// 内存不足
    OutOfMemory,

    /// 不支持的格式
    UnsupportedFormat(String),
}

impl std::fmt::Display for InferenceError {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        match self {
            InferenceError::NotYetImplemented(msg) => {
                write!(f, "功能未实现: {}", msg)
            }
            InferenceError::ModelNotLoaded => {
                write!(f, "模型未加载")
            }
            InferenceError::ModelLoadFailed(msg) => {
                write!(f, "模型加载失败: {}", msg)
            }
            InferenceError::InferenceFailed(msg) => {
                write!(f, "推理失败: {}", msg)
            }
            InferenceError::Timeout => {
                write!(f, "推理超时")
            }
            InferenceError::OutOfMemory => {
                write!(f, "内存不足")
            }
            InferenceError::UnsupportedFormat(msg) => {
                write!(f, "不支持的格式: {}", msg)
            }
        }
    }
}

impl std::error::Error for InferenceError {}

// ============================================================================
// Public Interface
// ============================================================================

/// 生成文本补全（带超时）
///
/// # 参数
/// - `prompt`: 输入提示词
/// - `max_tokens`: 最大生成 token 数
/// - `timeout_secs`: 超时时间（秒）
///
/// # 返回
/// - 成功时返回生成的文本
/// - 失败时返回错误信息
///
/// # 注意
/// 当前版本未实现超时功能，将直接调用 `generate_completion`。
pub fn generate_completion_with_timeout(
    prompt: &str,
    max_tokens: usize,
    _timeout_secs: u64,
) -> Result<String, InferenceError> {
    // 当前版本不实现超时，直接调用基础函数
    generate_completion(prompt, max_tokens)
}

/// 检查 LLM 推理是否可用
///
/// # 返回
/// - true: 如果依赖已启用
/// - false: 如果依赖未启用
pub fn is_available() -> bool {
    cfg!(feature = "llm-inference")
}

/// 获取版本信息
pub fn get_version() -> &'static str {
    VERSION
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_display() {
        let err = InferenceError::NotYetImplemented("test".to_string());
        assert_eq!(format!("{}", err), "功能未实现: test");
    }

    #[test]
    fn test_version() {
        assert_eq!(get_version(), "0.6.0-llama-cpp-2-implementation");
    }

    #[test]
    fn test_is_available() {
        let _ = is_available();
    }
}
