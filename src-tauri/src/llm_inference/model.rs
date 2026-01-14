/*!
Model Loader - llama.cpp GGUF Model Loading
==========================================

加载 GGUF 格式的本地模型。

使用 llama-cpp-2 v0.1 库实现。
*/

use crate::llm_inference::InferenceError;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};

#[cfg(feature = "llm-inference")]
use llama_cpp_2::{
    llama_backend::LlamaBackend,
    model::LlamaModel,
    model::params::LlamaModelParams,
    LogOptions,
};

#[cfg(feature = "llm-inference")]
use std::pin::pin;

/// 模型实例，包含后端和模型
#[cfg(feature = "llm-inference")]
pub struct Model {
    pub backend: LlamaBackend,
    pub model: LlamaModel,
}

/// 模型实例占位（当 feature 未启用时）
#[cfg(not(feature = "llm-inference"))]
pub struct Model {
    _private: (),
}

/// 全局模型实例（懒加载）
static GLOBAL_MODEL: OnceLock<Arc<Mutex<Option<Model>>>> = OnceLock::new();

/// 默认模型路径
pub fn default_model_path() -> PathBuf {
    // 用户本地模型路径
    #[cfg(target_os = "macos")]
    let base = dirs::home_dir().unwrap_or_else(|| PathBuf::from("/"));
    #[cfg(target_os = "linux")]
    let base = dirs::home_dir().unwrap_or_else(|| PathBuf::from("/"));
    #[cfg(target_os = "windows")]
    let base = dirs::home_dir().unwrap_or_else(|| PathBuf::from("C:\\"));

    base.join(".ifai").join("models").join("qwen2.5-coder-0.5b-ifai-v3-Q4_K_M.gguf")
}

/// 获取或初始化全局模型
pub fn get_or_init_model() -> Result<Arc<Mutex<Option<Model>>>, InferenceError> {
    Ok(GLOBAL_MODEL.get_or_init(|| {
        Arc::new(Mutex::new(None))
    }).clone())
}

/// 加载模型
///
/// 使用 llama-cpp-2 库从 GGUF 文件加载模型。
#[cfg(feature = "llm-inference")]
pub fn load_model(model_path: &PathBuf) -> Result<Model, InferenceError> {
    println!("[LlmInference] Loading model from: {:?}", model_path);

    // 检查文件是否存在
    if !model_path.exists() {
        return Err(InferenceError::ModelLoadFailed(format!(
            "模型文件不存在: {}",
            model_path.display()
        )));
    }

    // 检查 CPU 指令集兼容性 (仅针对 x86_64)
    #[cfg(all(target_arch = "x86_64", target_os = "windows"))]
    {
        if !std::is_x86_feature_detected!("avx2") {
            return Err(InferenceError::ModelLoadFailed(
                "当前 CPU 不支持 AVX2 指令集，无法运行本地模型。".to_string()
            ));
        }
    }

    // 启用日志
    llama_cpp_2::send_logs_to_tracing(LogOptions::default().with_logs_enabled(false));

    // 初始化后端
    let backend = LlamaBackend::init()
        .map_err(|e| InferenceError::ModelLoadFailed(format!("初始化后端失败: {}", e)))?;

    // 创建模型参数
    let model_params = pin!(LlamaModelParams::default());

    // 加载模型
    let model = LlamaModel::load_from_file(&backend, model_path, &model_params)
        .map_err(|e| InferenceError::ModelLoadFailed(format!("加载模型失败: {}", e)))?;

    println!("[LlmInference] Model loaded successfully");

    Ok(Model { backend, model })
}

/// 懒加载模型
///
/// 如果全局模型未加载，则加载模型。
pub fn ensure_model_loaded() -> Result<(), InferenceError> {
    let model_ref = get_or_init_model()?;

    {
        let mut model_guard = model_ref.lock()
            .map_err(|_| InferenceError::InferenceFailed("获取模型锁失败".to_string()))?;

        if model_guard.is_some() {
            println!("[LlmInference] Model already loaded");
            return Ok(());
        }

        // 加载默认模型
        let model_path = default_model_path();
        let model = load_model(&model_path)?;

        *model_guard = Some(model);
        println!("[LlmInference] Model loaded and stored globally");
    }

    Ok(())
}

/// 卸载模型
pub fn unload_model() -> Result<(), InferenceError> {
    println!("[LlmInference] unload_model called");

    let model_ref = get_or_init_model()?;
    let mut model_guard = model_ref.lock()
        .map_err(|_| InferenceError::InferenceFailed("获取模型锁失败".to_string()))?;

    *model_guard = None;
    println!("[LlmInference] Model unloaded");
    Ok(())
}

/// 检查模型是否已加载
pub fn is_model_loaded() -> bool {
    if let Ok(model_ref) = get_or_init_model() {
        if let Ok(model_guard) = model_ref.lock() {
            return model_guard.is_some();
        }
    }
    false
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_model_path() {
        let path = default_model_path();
        assert!(path.to_string_lossy().contains(".ifai"));
        assert!(path.to_string_lossy().contains("models"));
    }

    #[test]
    fn test_global_model_init() {
        let _model = get_or_init_model();
        assert!(!is_model_loaded());
    }
}
