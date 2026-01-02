/*!
配置管理 - llama.cpp 推理配置
====================================

管理本地推理的配置选项。
*/

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// LLM 推理配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmInferenceConfig {
    /// 模型路径
    pub model_path: PathBuf,

    /// 最大生成 token 数
    pub max_tokens: usize,

    /// 温度参数（0.0 - 2.0）
    pub temperature: f32,

    /// Top-p 采样参数（0.0 - 1.0）
    pub top_p: f32,

    /// 超时时间（秒）
    pub timeout_secs: u64,

    /// 上下文大小
    pub context_size: usize,

    /// 是否启用本地推理
    pub enabled: bool,
}

impl Default for LlmInferenceConfig {
    fn default() -> Self {
        // 默认模型路径
        #[cfg(target_os = "macos")]
        let base = dirs::home_dir().unwrap_or_else(|| PathBuf::from("/"));
        #[cfg(target_os = "linux")]
        let base = dirs::home_dir().unwrap_or_else(|| PathBuf::from("/"));
        #[cfg(target_os = "windows")]
        let base = dirs::home_dir().unwrap_or_else(|| PathBuf::from("C:\\"));

        let model_path = base.join(".ifai").join("models").join("qwen2.5-coder-0.5b-ifai-v3-Q4_K_M.gguf");

        Self {
            model_path,
            max_tokens: 50,
            temperature: 0.7,
            top_p: 0.9,
            timeout_secs: 5,
            context_size: 2048,
            enabled: true,
        }
    }
}

impl LlmInferenceConfig {
    /// 从文件加载配置
    pub fn load_from_file(path: &PathBuf) -> Result<Self, String> {
        let content = std::fs::read_to_string(path)
            .map_err(|e| format!("无法读取配置文件: {}", e))?;

        serde_json::from_str(&content)
            .map_err(|e| format!("解析配置文件失败: {}", e))
    }

    /// 保存配置到文件
    pub fn save_to_file(&self, path: &PathBuf) -> Result<(), String> {
        let content = serde_json::to_string_pretty(self)
            .map_err(|e| format!("序列化配置失败: {}", e))?;

        std::fs::write(path, content)
            .map_err(|e| format!("写入配置文件失败: {}", e))
    }

    /// 验证配置
    pub fn validate(&self) -> Result<(), String> {
        // 检查温度参数范围
        if self.temperature < 0.0 || self.temperature > 2.0 {
            return Err(format!("温度参数超出范围 (0.0 - 2.0): {}", self.temperature));
        }

        // 检查 top_p 参数范围
        if self.top_p < 0.0 || self.top_p > 1.0 {
            return Err(format!("Top-p 参数超出范围 (0.0 - 1.0): {}", self.top_p));
        }

        // 检查 max_tokens
        if self.max_tokens == 0 || self.max_tokens > 1000 {
            return Err(format!("最大 token 数超出范围 (1 - 1000): {}", self.max_tokens));
        }

        // 检查超时
        if self.timeout_secs == 0 || self.timeout_secs > 60 {
            return Err(format!("超时时间超出范围 (1 - 60): {}", self.timeout_secs));
        }

        Ok(())
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = LlmInferenceConfig::default();
        assert_eq!(config.max_tokens, 50);
        assert_eq!(config.temperature, 0.7);
        assert_eq!(config.top_p, 0.9);
        assert_eq!(config.timeout_secs, 5);
        assert!(config.enabled);
    }

    #[test]
    fn test_config_validation() {
        let config = LlmInferenceConfig::default();
        assert!(config.validate().is_ok());

        // 测试无效的温度
        let mut config = config.clone();
        config.temperature = 3.0;
        assert!(config.validate().is_err());

        // 测试无效的 top_p
        config.temperature = 0.7;
        config.top_p = 1.5;
        assert!(config.validate().is_err());
    }
}
