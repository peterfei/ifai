//! 格式适配器 - 统一不同提供商的请求/响应格式
//!
//! 🏛️ 元编程架构：通过 trait 抽象 + 代码生成，消除重复代码
//!
//! ## 设计理念
//!
//! 1. **标准化内部格式**：统一的 `StreamRequest` 和 `StreamEvent`
//! 2. **提供商适配**：每个提供商实现 `FormatAdapter` trait
//! 3. **元数据驱动**：从 YAML 配置生成适配器代码
//!
//! ## 架构图
//!
//! ```text
//! ┌─────────────────┐
//! │  内部标准化格式   │
//!  │ StreamRequest  │
//! └────────┬────────┘
//!          │
//!          ▼
//! ┌─────────────────┐
//! │  FormatAdapter  │ ← 🏛️ trait 抽象
//! └────────┬────────┘
//!          │
//!    ┌─────┴─────┬─────────┬─────────┐
//!    ▼           ▼         ▼         ▼
//! ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐
//! │OpenAI│  │Zhipu │  │ Kimi │  │Gemini│  ← 🏛️ 元数据生成
//! └──────┘  └──────┘  └──────┘  └──────┘
//! ```

use crate::harness::api::types::{Message, MessageContent, StreamRequest, StreamEvent};
use crate::harness::api::provider_metadata::ProviderSpec;
use async_trait::async_trait;
use serde_json::Value as JsonValue;
use std::collections::HashMap;

/// 🏛️ FormatAdapter trait - 统一不同提供商的请求/响应格式转换
///
/// ## 职责
/// - 将标准化的 `StreamRequest` 转换为提供商特定的请求格式
/// - 将提供商的响应转换回标准化的 `StreamEvent`
/// - 处理认证、端点、错误映射等
///
/// ## 实现方式
/// - **手动实现**：为特殊格式手动实现（如 Gemini）
/// - **元数据生成**：从 YAML 配置自动生成（如 OpenAI 兼容）
#[async_trait]
pub trait FormatAdapter: Send + Sync + Clone {
    /// 获取提供商规格
    fn spec(&self) -> &ProviderSpec;

    /// 构建请求 URL
    ///
    /// ## 示例
    /// - OpenAI: `https://api.openai.com/v1/chat/completions`
    /// - Gemini: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:streamGenerateContent?key=xxx`
    fn build_url(&self, model_id: &str, api_key: &str) -> String {
        let spec = self.spec();
        let base_url = &spec.api_spec.base_url;
        let endpoint = &spec.api_spec.endpoint;

        // 替换模型 ID 占位符
        let endpoint = endpoint.replace("{model}", model_id);

        // 处理认证
        let url = match &spec.api_spec.auth {
            crate::harness::api::provider_metadata::AuthSpec::BearerHeader { .. } => {
                // Bearer token 在 header 中处理
                format!("{}{}", base_url, endpoint)
            }
            crate::harness::api::provider_metadata::AuthSpec::QueryParam { param_name } => {
                // API key 在 query 参数中
                format!("{}{}?{}={}", base_url, endpoint, param_name, api_key)
            }
        };

        url
    }

    /// 构建请求头
    ///
    /// ## 示例
    /// - OpenAI: `Authorization: Bearer sk-xxx`
    /// - Gemini: `x-goog-api-key: xxx`
    fn build_headers(&self, api_key: &str) -> Vec<(String, String)> {
        let spec = self.spec();
        let mut headers = vec![
            ("Content-Type".to_string(), "application/json".to_string()),
        ];

        match &spec.api_spec.auth {
            crate::harness::api::provider_metadata::AuthSpec::BearerHeader { header_name, format } => {
                let auth_value = format.replace("{key}", api_key);
                headers.push((header_name.clone(), auth_value));
            }
            crate::harness::api::provider_metadata::AuthSpec::QueryParam { .. } => {
                // Query param auth 不需要额外的 header
            }
        }

        headers
    }

    /// 转换请求体
    ///
    /// 将标准化的 `StreamRequest` 转换为提供商特定的 JSON 格式
    ///
    /// ## 示例
    ///
    /// ### 输入（标准化格式）
    /// ```json
    /// {
    ///   "model": "gpt-4o",
    ///   "messages": [
    ///     {"role": "system", "content": "You are helpful"},
    ///     {"role": "user", "content": "Hello"}
    ///   ],
    ///   "stream": true
    /// }
    /// ```
    ///
    /// ### 输出（OpenAI 格式）
    /// ```json
    /// {
    ///   "model": "gpt-4o",
    ///   "messages": [
    ///     {"role": "system", "content": "You are helpful"},
    ///     {"role": "user", "content": "Hello"}
    ///   ],
    ///   "stream": true
    /// }
    /// ```
    ///
    /// ### 输出（Gemini 格式）
    /// ```json
    /// {
    ///   "contents": [
    ///     {"parts": [{"text": "System: You are helpful"}], "role": "user"},
    ///     {"parts": [{"text": "Hello"}], "role": "user"}
    ///   ]
    /// }
    /// ```
    fn transform_request_body(&self, request: &StreamRequest) -> Result<JsonValue, String>;

    /// 解析 SSE 事件
    ///
    /// 将提供商的 SSE 事件解析为标准化的 `StreamEvent`
    ///
    /// ## 示例
    ///
    /// ### OpenAI SSE 事件
    /// ```text
    /// data: {"id": "chatcmpl-123", "choices": [{"delta": {"content": "Hello"}}]}
    /// ```
    ///
    /// ### Gemini SSE 事件
    /// ```text
    /// data: [{"candidates": [{"content": {"parts": [{"text": "Hi"}]}}]}]
    /// ```
    fn parse_sse_event(&self, event_data: &str) -> Result<Option<StreamEvent>, String>;

    /// 映射错误码
    ///
    /// 将提供商的 HTTP 错误码映射为标准化的错误类型
    fn map_error(&self, status_code: u16) -> String {
        let spec = self.spec();
        spec.error_mapping
            .get(&status_code)
            .cloned()
            .unwrap_or_else(|| format!("unknown_error_{}", status_code))
    }
}

/// 🏛️ OpenAI 标准格式适配器
///
/// 适用于所有 OpenAI 兼容的提供商：
/// - OpenAI 官方
/// - Zhipu AI (智谱)
/// - Kimi (Moonshot AI)
/// - 以及其他兼容 OpenAI API 的提供商
#[derive(Debug, Clone)]
pub struct OpenAIFormatAdapter {
    spec: ProviderSpec,
}

impl OpenAIFormatAdapter {
    pub fn new(spec: ProviderSpec) -> Self {
        Self { spec }
    }
}

#[async_trait]
impl FormatAdapter for OpenAIFormatAdapter {
    fn spec(&self) -> &ProviderSpec {
        &self.spec
    }

    fn transform_request_body(&self, request: &StreamRequest) -> Result<JsonValue, String> {
        let mut body = serde_json::json!({
            "model": request.model,
            "stream": true,
        });

        // 转换消息格式
        let messages = transform_messages_openai(
            &request.messages,
            &self.spec.request_format,
        )?;
        body["messages"] = serde_json::to_value(messages)
            .map_err(|e| format!("Failed to serialize messages: {}", e))?;

        // 添加工具（如果有）
        if let Some(tools) = &request.tools {
            if let Some(tools_field) = &self.spec.request_format.tools_field {
                body[tools_field] = serde_json::to_value(tools)
                    .map_err(|e| format!("Failed to serialize tools: {}", e))?;
            }
        }

        Ok(body)
    }

    fn parse_sse_event(&self, event_data: &str) -> Result<Option<StreamEvent>, String> {
        // OpenAI SSE 格式: data: {...}
        if event_data.trim() == "[DONE]" {
            return Ok(None);
        }

        let json: JsonValue = serde_json::from_str(event_data)
            .map_err(|e| format!("Failed to parse SSE JSON: {}", e))?;

        // 🔥 FIX: 检查是否是结束事件（支持多种格式）
        // 格式 1: 标准 OpenAI - choices[0].finish_reason
        // 格式 2: Kimi - 顶层 finish_reason
        //
        // ⚠️ CRITICAL: finish_reason: null 不应该被视为结束事件！
        // 只有当 finish_reason 存在且不为 null 时才是结束事件
        let is_finish_event = if let Some(choices) = json.get("choices").and_then(|c| c.as_array()) {
            // 标准 OpenAI 格式
            choices.first()
                .and_then(|c| c.get("finish_reason"))
                .and_then(|v| v.as_str())  // 🔥 关键：获取字符串值，null 不会通过
                .is_some()
        } else {
            // Kimi 格式：顶层 finish_reason
            json.get("finish_reason")
                .and_then(|v| v.as_str())  // 🔥 关键：获取字符串值，null 不会通过
                .is_some()
        };

        if is_finish_event {
            // 结束事件，返回 None
            return Ok(None);
        }

        // 备选路径列表（按优先级）
        let fallback_paths = vec![
            "choices.0.delta.content",           // 标准 OpenAI 内容
            "choices.0.delta.reasoning_content", // Kimi K2 thinking 模式
            "delta.content",                     // Kimi 简化格式
            "message.content",                   // 某些提供商的非流式格式
        ];

        let mut content = String::new();
        for path in fallback_paths {
            match extract_content_by_path(&json, path) {
                Ok(text) => {
                    if !text.is_empty() {
                        content = text;
                        break;
                    }
                }
                Err(_) => {
                    // 继续尝试下一个路径
                }
            }
        }

        if content.is_empty() {
            // 没有内容的事件（如工具调用开始等）
            Ok(None)
        } else {
            Ok(Some(StreamEvent::TextDelta {
                text: content,
            }))
        }
    }
}

/// 🏛️ Gemini 自定义格式适配器
///
/// Google Gemini 使用独特的请求/响应格式，需要特殊处理
#[derive(Debug, Clone)]
pub struct GeminiFormatAdapter {
    spec: ProviderSpec,
}

impl GeminiFormatAdapter {
    pub fn new(spec: ProviderSpec) -> Self {
        Self { spec }
    }
}

#[async_trait]
impl FormatAdapter for GeminiFormatAdapter {
    fn spec(&self) -> &ProviderSpec {
        &self.spec
    }

    fn transform_request_body(&self, request: &StreamRequest) -> Result<JsonValue, String> {
        let mut body = serde_json::json!({});

        // Gemini 格式：contents 数组
        let contents = transform_messages_gemini(&request.messages)?;
        body["contents"] = serde_json::to_value(contents)
            .map_err(|e| format!("Failed to serialize contents: {}", e))?;

        Ok(body)
    }

    fn parse_sse_event(&self, event_data: &str) -> Result<Option<StreamEvent>, String> {
        // Gemini SSE 格式可能是：
        // 1. 官方格式: data: [{...}] (数组)
        // 2. 第三方格式: data: {...} (对象)

        // 先尝试解析为数组
        if let Ok(json_array) = serde_json::from_str::<Vec<JsonValue>>(event_data) {
            if let Some(first_item) = json_array.first() {
                let content = extract_content_by_path(first_item, &self.spec.response_format.content_extraction)?;
                return Ok(Some(StreamEvent::TextDelta {
                    text: content,
                }));
            }
        }

        // 如果失败，尝试解析为对象
        let json: JsonValue = serde_json::from_str(event_data)
            .map_err(|e| format!("Failed to parse SSE JSON (tried array and object): {}", e))?;

        let content = extract_content_by_path(&json, &self.spec.response_format.content_extraction)?;
        Ok(Some(StreamEvent::TextDelta {
            text: content,
        }))
    }
}

// ============================================================================
// 辅助函数
// ============================================================================

/// 转换消息格式（OpenAI 标准格式）
fn transform_messages_openai(
    messages: &[Message],
    request_format: &crate::harness::api::provider_metadata::RequestFormat,
) -> Result<Vec<JsonValue>, String> {
    let handling = &request_format.system_prompt_handling;

    messages
        .iter()
        .map(|msg| {
            let role = match &msg.role {
                crate::harness::api::types::MessageRole::System => {
                    match handling.as_str() {
                        "separate_message" => "system",
                        "prefix_in_user" => "user",  // 系统提示词前缀到用户消息
                        _ => "user",
                    }
                }
                crate::harness::api::types::MessageRole::User => "user",
                crate::harness::api::types::MessageRole::Assistant => "assistant",
                _ => "user",
            };

            let content = if handling == "prefix_in_user"
                && matches!(msg.role, crate::harness::api::types::MessageRole::System) {
                // 系统提示词前缀模式：添加 "System: " 前缀
                crate::harness::api::types::MessageContent::Text(format!("System: {}", msg.content))
            } else {
                msg.content.clone()
            };

            Ok(serde_json::json!({
                "role": role,
                "content": content,
            }))
        })
        .collect()
}

/// 转换消息格式（Gemini 格式）
fn transform_messages_gemini(messages: &[Message]) -> Result<Vec<JsonValue>, String> {
    use crate::harness::api::types::MessageContent;

    messages
        .iter()
        .map(|msg| {
            let role = match &msg.role {
                crate::harness::api::types::MessageRole::System => "user",  // Gemini 没有 system 角色
                crate::harness::api::types::MessageRole::User => "user",
                crate::harness::api::types::MessageRole::Assistant => "model",
                _ => "user",
            };

            // 处理系统提示词前缀
            let content = if matches!(msg.role, crate::harness::api::types::MessageRole::System) {
                match &msg.content {
                    MessageContent::Text(text) => {
                        MessageContent::Text(format!("System: {}", text))
                    }
                    MessageContent::MultiModal(parts) => {
                        // 如果系统消息是多模态，在第一个文本部分添加前缀
                        let mut new_parts = parts.clone();
                        if let Some(first_text) = new_parts.iter_mut().find(|p| p.part_type == "text") {
                            if let Some(text) = &first_text.text {
                                first_text.text = Some(format!("System: {}", text));
                            }
                        }
                        MessageContent::MultiModal(new_parts)
                    }
                }
            } else {
                msg.content.clone()
            };

            // 根据 content 类型构建 parts
            let parts = match &content {
                MessageContent::Text(text) => {
                    serde_json::json!([{"text": text}])
                }
                MessageContent::MultiModal(content_parts) => {
                    // 转换 OpenAI 格式的 ContentPart 为 Gemini 格式
                    let gemini_parts: Result<Vec<JsonValue>, String> = content_parts
                        .iter()
                        .map(|part| {
                            if part.part_type == "text" {
                                Ok(serde_json::json!({
                                    "text": part.text.as_ref().unwrap_or(&String::new())
                                }))
                            } else if part.part_type == "image_url" {
                                // 从 data:image/jpeg;base64,<data> 提取 mime type 和 data
                                if let Some(image_url) = &part.image_url {
                                    let url = &image_url.url;
                                    // 解析 data URL 格式: data:image/jpeg;base64,<data>
                                    if url.starts_with("data:") {
                                        let parts: Vec<&str> = url.splitn(3, ':').collect();
                                        if parts.len() >= 2 {
                                            let mime_part = parts[1]; // image/jpeg
                                            let remaining = parts.get(2).unwrap_or(&"");
                                            let data_parts: Vec<&str> = remaining.splitn(2, ',').collect();
                                            if data_parts.len() == 2 {
                                                let base64_data = data_parts[1];
                                                return Ok(serde_json::json!({
                                                    "inline_data": {
                                                        "mime_type": mime_part,
                                                        "data": base64_data
                                                    }
                                                }));
                                            }
                                        }
                                    }
                                    Err(format!("Invalid image_url format"))
                                } else {
                                    Err(format!("Missing image_url"))
                                }
                            } else {
                                Err(format!("Unknown content part type: {}", part.part_type))
                            }
                        })
                        .collect();

                    serde_json::to_value(gemini_parts?)
                        .map_err(|e| format!("Failed to serialize Gemini parts: {}", e))?
                }
            };

            Ok(serde_json::json!({
                "role": role,
                "parts": parts,
            }))
        })
        .collect()
}

/// 根据路径从 JSON 中提取内容
///
/// ## 路径语法
/// - `delta.content` → `json["delta"]["content"]`
/// - `parts.0.text` → `json["parts"][0]["text"]`
pub fn extract_content_by_path(json: &JsonValue, path: &str) -> Result<String, String> {
    println!("[extract_content_by_path] 🔍 Extracting path: {}", path);
    println!("[extract_content_by_path] JSON: {}", serde_json::to_string(json).unwrap_or_else(|_| "Cannot serialize".to_string()));

    let parts: Vec<&str> = path.split('.').collect();
    println!("[extract_content_by_path] Path parts: {:?}", parts);

    let mut current = json;
    for (i, part) in parts.iter().enumerate() {
        println!("[extract_content_by_path] Step {}: current key/index = '{}'", i, part);
        current = if let Ok(idx) = part.parse::<usize>() {
            // 数组索引
            match current.get(idx) {
                Some(val) => {
                    println!("[extract_content_by_path] ✅ Got array index {}, value: {}", idx, serde_json::to_string(val).unwrap_or_else(|_| "?".to_string()));
                    val
                }
                None => {
                    println!("[extract_content_by_path] ❌ Array index {} out of bounds", idx);
                    return Err(format!("Index {} out of bounds", idx));
                }
            }
        } else {
            // 对象键
            match current.get(*part) {
                Some(val) => {
                    println!("[extract_content_by_path] ✅ Got key '{}', value: {}", part, serde_json::to_string(val).unwrap_or_else(|_| "?".to_string()));
                    val
                }
                None => {
                    println!("[extract_content_by_path] ❌ Key '{}' not found", part);
                    return Err(format!("Key '{}' not found", part));
                }
            }
        };
    }

    let result = current
        .as_str()
        .map(|s| {
            println!("[extract_content_by_path] ✅ Final value as string: '{}'", s);
            s.to_string()
        })
        .ok_or_else(|| {
            println!("[extract_content_by_path] ❌ Value is not a string, type: {:?}", current);
            "Value is not a string".to_string()
        });

    match &result {
        Ok(s) => println!("[extract_content_by_path] ✨ SUCCESS: extracted '{}' from path '{}'", s, path),
        Err(e) => println!("[extract_content_by_path] 💥 FAILURE: {}", e),
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::harness::api::types::MessageRole;

    #[test]
    fn test_openai_adapter_transform_request() {
        let spec_yaml = r#"
metadata:
  id: test-openai
  name: Test OpenAI
  protocol: openai

api_spec:
  base_url: https://api.test.com/v1
  endpoint: /chat/completions
  auth:
    type: bearer_header
    header_name: Authorization
    format: "Bearer {key}"

request_format:
  type: openai_standard
  messages_wrapper: messages
  system_prompt_handling: separate_message
  tools_field: tools

response_format:
  type: sse
  stream_parser: openai_sse
  content_extraction: choices.0.delta.content

models:
  - id: test-model
    name: Test Model
    context_tokens: 128000

error_mapping: {}
"#;

        let spec: ProviderSpec = serde_yaml::from_str(spec_yaml).unwrap();
        let adapter = OpenAIFormatAdapter::new(spec);

        let request = StreamRequest {
            model: "test-model".to_string(),
            messages: vec![
                Message {
                    role: MessageRole::System,
                    content: MessageContent::Text("You are helpful".to_string()),
                    tool_calls: None,
                    tool_call_id: None,
                },
                Message {
                    role: MessageRole::User,
                    content: MessageContent::Text("Hello".to_string()),
                    tool_calls: None,
                    tool_call_id: None,
                },
            ],
            max_tokens: 4096,
            system: None,
            temperature: None,
            tools: None,
            stream: true,
        };

        let body = adapter.transform_request_body(&request).unwrap();

        assert_eq!(body["model"], "test-model");
        assert_eq!(body["stream"], true);
        assert_eq!(body["messages"][0]["role"], "system");
        assert_eq!(body["messages"][0]["content"], "You are helpful");
        assert_eq!(body["messages"][1]["role"], "user");
        assert_eq!(body["messages"][1]["content"], "Hello");
    }

    #[test]
    fn test_openai_adapter_build_url() {
        let spec_yaml = r#"
metadata:
  id: test-openai
  name: Test OpenAI
  protocol: openai

api_spec:
  base_url: https://api.test.com/v1
  endpoint: /chat/completions
  auth:
    type: bearer_header
    header_name: Authorization
    format: "Bearer {key}"

request_format:
  type: openai_standard
  messages_wrapper: messages
  system_prompt_handling: separate_message

response_format:
  type: sse
  stream_parser: openai_sse
  content_extraction: choices.0.delta.content

models:
  - id: test-model
    name: Test Model
    context_tokens: 128000

error_mapping: {}
"#;

        let spec: ProviderSpec = serde_yaml::from_str(spec_yaml).unwrap();
        let adapter = OpenAIFormatAdapter::new(spec);

        let url = adapter.build_url("test-model", "sk-test123");

        assert_eq!(url, "https://api.test.com/v1/chat/completions");
    }

    #[test]
    fn test_openai_adapter_build_headers() {
        let spec_yaml = r#"
metadata:
  id: test-openai
  name: Test OpenAI
  protocol: openai

api_spec:
  base_url: https://api.test.com/v1
  endpoint: /chat/completions
  auth:
    type: bearer_header
    header_name: Authorization
    format: "Bearer {key}"

request_format:
  type: openai_standard
  messages_wrapper: messages
  system_prompt_handling: separate_message

response_format:
  type: sse
  stream_parser: openai_sse
  content_extraction: choices.0.delta.content

models:
  - id: test-model
    name: Test Model
    context_tokens: 128000

error_mapping: {}
"#;

        let spec: ProviderSpec = serde_yaml::from_str(spec_yaml).unwrap();
        let adapter = OpenAIFormatAdapter::new(spec);

        let headers = adapter.build_headers("sk-test123");

        assert!(headers.iter().any(|(k, v)| k == "Authorization" && v == "Bearer sk-test123"));
        assert!(headers.iter().any(|(k, v)| k == "Content-Type" && v == "application/json"));
    }

    #[test]
    fn test_gemini_adapter_transform_request() {
        let spec_yaml = r#"
metadata:
  id: test-gemini
  name: Test Gemini
  protocol: gemini

api_spec:
  base_url: https://test.googleapis.com/v1beta
  endpoint: /models/{model}:streamGenerateContent
  auth:
    type: query_param
    param_name: key

request_format:
  type: gemini_custom
  messages_wrapper: contents
  system_prompt_handling: prefix_in_user
  system_prompt_prefix: "System: "
  content_wrapper: parts
  role_mapping:
    user: user
    assistant: model
    system: user

response_format:
  type: sse
  stream_parser: gemini_sse
  content_extraction: parts.0.text

models:
  - id: gemini-test
    name: Gemini Test
    context_tokens: 128000

error_mapping: {}
"#;

        let spec: ProviderSpec = serde_yaml::from_str(spec_yaml).unwrap();
        let adapter = GeminiFormatAdapter::new(spec);

        let request = StreamRequest {
            model: "gemini-test".to_string(),
            messages: vec![
                Message {
                    role: MessageRole::System,
                    content: MessageContent::Text("You are helpful".to_string()),
                    tool_calls: None,
                    tool_call_id: None,
                },
                Message {
                    role: MessageRole::User,
                    content: MessageContent::Text("Hello".to_string()),
                    tool_calls: None,
                    tool_call_id: None,
                },
            ],
            max_tokens: 4096,
            system: None,
            temperature: None,
            tools: None,
            stream: true,
        };

        let body = adapter.transform_request_body(&request).unwrap();

        // 系统消息转换为 "System: " 前缀
        assert_eq!(body["contents"][0]["role"], "user");
        assert_eq!(body["contents"][0]["parts"][0]["text"], "System: You are helpful");
        assert_eq!(body["contents"][1]["role"], "user");
        assert_eq!(body["contents"][1]["parts"][0]["text"], "Hello");
    }

    #[test]
    fn test_gemini_adapter_build_url() {
        let spec_yaml = r#"
metadata:
  id: test-gemini
  name: Test Gemini
  protocol: gemini

api_spec:
  base_url: https://test.googleapis.com/v1beta
  endpoint: /models/{model}:streamGenerateContent
  auth:
    type: query_param
    param_name: key

request_format:
  type: gemini_custom
  messages_wrapper: contents
  system_prompt_handling: prefix_in_user

response_format:
  type: sse
  stream_parser: gemini_sse
  content_extraction: parts.0.text

models:
  - id: gemini-test
    name: Gemini Test
    context_tokens: 128000

error_mapping: {}
"#;

        let spec: ProviderSpec = serde_yaml::from_str(spec_yaml).unwrap();
        let adapter = GeminiFormatAdapter::new(spec);

        let url = adapter.build_url("gemini-test", "test-api-key");

        assert_eq!(url, "https://test.googleapis.com/v1beta/models/gemini-test:streamGenerateContent?key=test-api-key");
    }

    #[test]
    fn test_extract_content_by_path() {
        let json = serde_json::json!({
            "delta": {
                "content": "Hello, world!"
            }
        });

        let content = extract_content_by_path(&json, "delta.content").unwrap();
        assert_eq!(content, "Hello, world!");
    }

    #[test]
    fn test_extract_content_by_path_array() {
        let json = serde_json::json!({
            "parts": [
                {"text": "First part"},
                {"text": "Second part"}
            ]
        });

        let content = extract_content_by_path(&json, "parts.0.text").unwrap();
        assert_eq!(content, "First part");
    }

    #[test]
    fn test_openai_adapter_parse_sse() {
        let spec_yaml = r#"
metadata:
  id: test-openai
  name: Test OpenAI
  protocol: openai

api_spec:
  base_url: https://api.test.com/v1
  endpoint: /chat/completions
  auth:
    type: bearer_header
    header_name: Authorization
    format: "Bearer {key}"

request_format:
  type: openai_standard
  messages_wrapper: messages
  system_prompt_handling: separate_message

response_format:
  type: sse
  stream_parser: openai_sse
  content_extraction: choices.0.delta.content

models:
  - id: test-model
    name: Test Model
    context_tokens: 128000

error_mapping: {}
"#;

        let spec: ProviderSpec = serde_yaml::from_str(spec_yaml).unwrap();
        let adapter = OpenAIFormatAdapter::new(spec);

        let event_data = r#"{"id": "chatcmpl-123", "choices": [{"index": 0, "delta": {"content": "Hello"}}]}"#;

        let event = adapter.parse_sse_event(event_data).unwrap();
        assert!(event.is_some());

        if let Some(StreamEvent::TextDelta { text }) = event {
            assert_eq!(text, "Hello");
        } else {
            panic!("Expected TextDelta event");
        }
    }

    #[test]
    fn test_openai_adapter_parse_sse_done() {
        let spec_yaml = r#"
metadata:
  id: test-openai
  name: Test OpenAI
  protocol: openai

api_spec:
  base_url: https://api.test.com/v1
  endpoint: /chat/completions
  auth:
    type: bearer_header
    header_name: Authorization
    format: "Bearer {key}"

request_format:
  type: openai_standard
  messages_wrapper: messages
  system_prompt_handling: separate_message

response_format:
  type: sse
  stream_parser: openai_sse
  content_extraction: choices.0.delta.content

models:
  - id: test-model
    name: Test Model
    context_tokens: 128000

error_mapping: {}
"#;

        let spec: ProviderSpec = serde_yaml::from_str(spec_yaml).unwrap();
        let adapter = OpenAIFormatAdapter::new(spec);

        let event_data = "[DONE]";
        let event = adapter.parse_sse_event(event_data).unwrap();
        assert!(event.is_none());
    }

    /// 🧪 测试 JSON 路径提取逻辑（包括 Kimi reasoning_content）
    #[test]
    fn test_extract_content_by_path_with_kimi_format() {
        use serde_json::json;

        println!("\n🧪 测试 JSON 路径提取逻辑\n");

        // 1. 测试标准 OpenAI 格式
        let openai_json = json!({
            "choices": [{
                "delta": {
                    "content": "你好"
                }
            }]
        });

        println!("测试 1: choices.0.delta.content");
        let result = extract_content_by_path(&openai_json, "choices.0.delta.content");
        assert!(result.is_ok(), "应该成功提取 content");
        assert_eq!(result.unwrap(), "你好");
        println!("✅ 通过\n");

        // 2. 测试 Kimi reasoning_content 格式
        let kimi_json = json!({
            "choices": [{
                "delta": {
                    "reasoning_content": "用户说你好"
                }
            }]
        });

        println!("测试 2: choices.0.delta.reasoning_content (Kimi K2 thinking)");
        let result = extract_content_by_path(&kimi_json, "choices.0.delta.reasoning_content");
        assert!(result.is_ok(), "应该成功提取 reasoning_content");
        assert_eq!(result.unwrap(), "用户说你好");
        println!("✅ 通过\n");

        // 3. 测试空 content（应该返回空字符串而不是错误）
        let empty_json = json!({
            "choices": [{
                "delta": {
                    "content": ""
                }
            }]
        });

        println!("测试 3: 空 content 字段");
        let result = extract_content_by_path(&empty_json, "choices.0.delta.content");
        assert!(result.is_ok(), "空 content 应该返回 Ok");
        assert_eq!(result.unwrap(), "");
        println!("✅ 通过\n");

        // 4. 测试缺失的键（应该返回错误）
        let missing_json = json!({
            "choices": [{
                "delta": {}
            }]
        });

        println!("测试 4: 缺失的 content 键");
        let result = extract_content_by_path(&missing_json, "choices.0.delta.content");
        assert!(result.is_err(), "缺失的键应该返回错误");
        println!("✅ 通过\n");

        // 5. 测试真实 Kimi 事件格式（reasoning_content）
        let real_kimi_event = json!({
            "id": "chatcmpl-123",
            "object": "chat.completion.chunk",
            "created": 1776942760,
            "model": "kimi-k2.5",
            "choices": [{
                "index": 0,
                "delta": {
                    "reasoning_content": "用"
                },
                "finish_reason": null
            }],
            "system_fingerprint": "fpv0_cc548f90"
        });

        println!("测试 5: 真实 Kimi reasoning_content 事件");
        let result = extract_content_by_path(&real_kimi_event, "choices.0.delta.reasoning_content");
        assert!(result.is_ok(), "应该成功从真实事件中提取");
        assert_eq!(result.unwrap(), "用");
        println!("✅ 通过\n");

        // 6. 测试真实 Kimi 事件格式（content）
        let real_kimi_content_event = json!({
            "id": "chatcmpl-123",
            "object": "chat.completion.chunk",
            "created": 1776942760,
            "model": "kimi-k2.5",
            "choices": [{
                "index": 0,
                "delta": {
                    "content": "你好！"
                },
                "finish_reason": null
            }],
            "system_fingerprint": "fpv0_cc548f90"
        });

        println!("测试 6: 真实 Kimi content 事件");
        let result = extract_content_by_path(&real_kimi_content_event, "choices.0.delta.content");
        assert!(result.is_ok(), "应该成功从真实事件中提取 content");
        assert_eq!(result.unwrap(), "你好！");
        println!("✅ 通过\n");

        println!("🎉 所有路径提取测试通过！");
    }
}
