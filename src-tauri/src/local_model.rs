/*!
IfAI Editor - Local Model Management
====================================

本地模型管理模块，支持 GGUF 格式的微调模型。

功能：
- 模型文件验证
- 模型信息获取
- 本地推理（TBD）

平台支持：
- macOS (Apple Silicon + Intel)
- Windows (x64)
- Linux (x64 + ARM64)

模型位置：
- macOS/Linux: ~/.ifai/models/
- Windows: %USERPROFILE%\.ifai\models\
*/

use std::path::PathBuf;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

// ============================================================================
// Configuration
// ============================================================================

/// 本地模型配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalModelConfig {
    /// 模型文件名
    pub model_name: String,

    /// 模型路径（只读，由系统自动获取）
    #[serde(skip)]
    pub model_path: PathBuf,

    /// 是否启用本地模型
    pub enabled: bool,

    /// 最大序列长度
    pub max_seq_length: usize,

    /// 生成参数
    pub temperature: f32,
    pub top_p: f32,

    /// 上下文大小
    pub context_size: usize,
}

impl Default for LocalModelConfig {
    fn default() -> Self {
        let model_path = Self::default_model_path();

        Self {
            model_name: "qwen2.5-coder-0.5b-ifai-v3-Q4_K_M.gguf".to_string(),
            model_path,
            enabled: false,  // 默认禁用，需要用户手动启用
            max_seq_length: 2048,
            temperature: 0.6,
            top_p: 0.9,
            context_size: 2048,
        }
    }
}

impl LocalModelConfig {
    /// 获取默认模型路径（跨平台）
    pub fn default_model_path() -> PathBuf {
        let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));

        // 跨平台路径处理
        #[cfg(target_os = "windows")]
        let path = home.join(".ifai\\models\\qwen2.5-coder-0.5b-ifai-v3-Q4_K_M.gguf");

        #[cfg(not(target_os = "windows"))]
        let path = home.join(".ifai/models/qwen2.5-coder-0.5b-ifai-v3-Q4_K_M.gguf");

        path
    }

    /// 获取模型目录
    pub fn model_dir() -> PathBuf {
        let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));

        #[cfg(target_os = "windows")]
        let dir = home.join(".ifai\\models");

        #[cfg(not(target_os = "windows"))]
        let dir = home.join(".ifai/models");

        dir
    }

    /// 验证模型文件是否存在
    pub fn validate(&self) -> Result<ModelInfo, String> {
        // 检查文件是否存在
        if !self.model_path.exists() {
            return Err(format!(
                "模型文件不存在: {}\n请将模型文件放置在: {}",
                self.model_path.display(),
                Self::model_dir().display()
            ));
        }

        // 检查文件大小
        let metadata = std::fs::metadata(&self.model_path)
            .map_err(|e| format!("无法读取模型文件: {}", e))?;

        let file_size = metadata.len();

        // Q4_K_M 应该在 350-400MB 之间
        if file_size < 300_000_000 || file_size > 500_000_000 {
            return Err(format!(
                "模型文件大小异常: {} MB\n预期大小: 约 379 MB (Q4_K_M)",
                file_size / 1_000_000
            ));
        }

        Ok(ModelInfo {
            path: self.model_path.to_string_lossy().to_string(),
            size_mb: file_size as f64 / 1_000_000.0,
            size_bytes: file_size,
            format: "GGUF (Q4_K_M)".to_string(),
            model: "Qwen2.5-Coder-0.5B-IfAI-v3".to_string(),
        })
    }
}

// ============================================================================
// Model Info
// ============================================================================

/// 模型信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    /// 模型路径
    pub path: String,

    /// 文件大小（MB）
    pub size_mb: f64,

    /// 文件大小（字节）
    pub size_bytes: u64,

    /// 格式
    pub format: String,

    /// 模型名称
    pub model: String,
}

// ============================================================================
// Tauri Commands
// ============================================================================

/// 获取本地模型配置
#[tauri::command]
pub fn get_local_model_config() -> LocalModelConfig {
    LocalModelConfig::default()
}

/// 验证模型文件
#[tauri::command]
pub fn validate_local_model() -> Result<ModelInfo, String> {
    let config = LocalModelConfig::default();
    config.validate()
}

/// 获取系统信息（用于调试）
#[tauri::command]
pub fn get_system_info() -> SystemInfo {
    SystemInfo {
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        family: std::env::consts::FAMILY.to_string(),
        model_dir: LocalModelConfig::model_dir().to_string_lossy().to_string(),
        model_exists: LocalModelConfig::default().model_path.exists(),
    }
}

/// 本地模型聊天
#[cfg(feature = "commercial")]
#[tauri::command]
pub async fn local_model_chat(
    messages: Vec<crate::core_traits::ai::Message>,
    event_id: String,
    app: AppHandle,
) -> Result<crate::core_traits::ai::Message, String> {
    use ifainew_core::local_llm::{LocalLLMEngine, ChatMessage};

    // 转换消息格式
    let chat_messages: Vec<ChatMessage> = messages
        .iter()
        .map(|m| ChatMessage {
            role: m.role.clone(),
            content: extract_text_content(&m.content),
        })
        .collect();

    // 创建推理引擎（实际应用中应该缓存）
    let engine = LocalLLMEngine::with_default_config()
        .map_err(|e| format!("Failed to create LLM engine: {}", e))?;

    // 执行推理
    let response = engine
        .generate(&chat_messages)
        .map_err(|e| format!("Inference failed: {}", e))?;

    // 解析工具调用
    use ifainew_core::local_llm::ToolCallParser;
    let tool_calls = ToolCallParser::parse(&response);

    // 构建返回消息
    let content = if tool_calls.is_empty() {
        crate::core_traits::ai::Content::Text(response.clone())
    } else {
        crate::core_traits::ai::Content::Parts(vec![
            crate::core_traits::ai::ContentPart::Text {
                text: response,
                part_type: "text".to_string(),
            },
        ])
    };

    let message = crate::core_traits::ai::Message {
        role: "assistant".to_string(),
        content,
        tool_calls: if tool_calls.is_empty() {
            None
        } else {
            Some(tool_calls.into_iter().map(|tc| {
                crate::core_traits::ai::ToolCall {
                    id: format!("call_{}", uuid::Uuid::new_v4()),
                    r#type: "function".to_string(),
                    function: crate::core_traits::ai::FunctionCall {
                        name: tc.name,
                        arguments: serde_json::to_string(&tc.arguments).unwrap_or_default(),
                    },
                }
            }).collect())
        },
        tool_call_id: None,
    };

    Ok(message)
}

/// 社区版：返回提示信息
#[cfg(not(feature = "commercial"))]
#[tauri::command]
pub async fn local_model_chat(
    _messages: Vec<crate::core_traits::ai::Message>,
    _event_id: String,
    _app: AppHandle,
) -> Result<crate::core_traits::ai::Message, String> {
    Err(
        "本地推理功能需要商业版授权。\n\n\
         当前社区版支持：\n\
         - 模型文件验证\n\
         - 模型信息查看\n\
         - 工具调用解析测试\n\n\
         商业版功能：\n\
         - 纯 Rust 本地推理（llm crate）\n\
         - 工具调用自动解析\n\
         - 流式生成\n\
         - Agent 集成".to_string()
    )
}

/// 从消息内容中提取文本
fn extract_text_content(content: &crate::core_traits::ai::Content) -> String {
    match content {
        crate::core_traits::ai::Content::Text(text) => text.clone(),
        crate::core_traits::ai::Content::Parts(parts) => {
            parts.iter()
                .filter_map(|p| {
                    if let crate::core_traits::ai::ContentPart::Text { text, .. } = p {
                        Some(text.clone())
                    } else {
                        None
                    }
                })
                .collect::<Vec<_>>()
                .join("\n")
        }
    }
}

/// 测试工具调用解析（占位符）
#[tauri::command]
pub fn test_tool_parse(text: String) -> Vec<ParsedToolCall> {
    // 使用正则表达式解析工具调用
    use std::collections::HashMap;

    let pattern = regex::Regex::new(r"agent_(\w+)\s*\(\s*([^)]*)\s*\)").unwrap();
    let mut calls = Vec::new();

    for cap in pattern.captures_iter(&text) {
        if let (Some(tool_name), Some(args_str)) = (cap.get(1), cap.get(2)) {
            let mut args = HashMap::new();

            // 解析 key='value' 格式
            let arg_pattern = regex::Regex::new(r#"(\w+)\s*=\s*['\"]([^'\"]*)['\"]"#).unwrap();
            for arg_cap in arg_pattern.captures_iter(args_str.as_str()) {
                if let (Some(key), Some(value)) = (arg_cap.get(1), arg_cap.get(2)) {
                    args.insert(key.as_str().to_string(), value.as_str().to_string());
                }
            }

            calls.push(ParsedToolCall {
                name: format!("agent_{}", tool_name.as_str()),
                arguments: args,
            });
        }
    }

    calls
}

// ============================================================================
// Response Types
// ============================================================================

/// 系统信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemInfo {
    pub os: String,
    pub arch: String,
    pub family: String,
    pub model_dir: String,
    pub model_exists: bool,
}

/// 解析的工具调用
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedToolCall {
    pub name: String,
    pub arguments: std::collections::HashMap<String, String>,
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_path() {
        let path = LocalModelConfig::default_model_path();
        assert!(path.to_string_lossy().contains(".ifai"));
        assert!(path.to_string_lossy().contains("models"));
    }

    #[test]
    fn test_tool_parse() {
        let text = "我会使用 agent_read_file(rel_path='src/auth.ts') 来完成这个任务。";
        let calls = test_tool_parse(text.to_string());

        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].name, "agent_read_file");
        assert_eq!(calls[0].arguments.get("rel_path"), Some(&"src/auth.ts".to_string()));
    }
}
