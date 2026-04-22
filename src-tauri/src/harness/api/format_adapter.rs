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

use crate::harness::api::types::{Message, StreamRequest, StreamEvent};
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
pub trait FormatAdapter: Send + Sync {
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

        // 提取内容
        let content = extract_content_by_path(&json, &self.spec.response_format.content_extraction)?;

        Ok(Some(StreamEvent::TextDelta {
            text: content,
        }))
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
        // Gemini SSE 格式: data: [{...}]
        let json_array: Vec<JsonValue> = serde_json::from_str(event_data)
            .map_err(|e| format!("Failed to parse SSE JSON array: {}", e))?;

        if let Some(first_item) = json_array.first() {
            let content = extract_content_by_path(first_item, &self.spec.response_format.content_extraction)?;
            Ok(Some(StreamEvent::TextDelta {
                text: content,
            }))
        } else {
            Ok(None)
        }
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
                format!("System: {}", msg.content)
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
    messages
        .iter()
        .map(|msg| {
            let role = match &msg.role {
                crate::harness::api::types::MessageRole::System => "user",  // Gemini 没有 system 角色
                crate::harness::api::types::MessageRole::User => "user",
                crate::harness::api::types::MessageRole::Assistant => "model",
                _ => "user",
            };

            let content = if matches!(msg.role, crate::harness::api::types::MessageRole::System) {
                // 系统提示词添加 "System: " 前缀
                format!("System: {}", msg.content)
            } else {
                msg.content.clone()
            };

            Ok(serde_json::json!({
                "role": role,
                "parts": [{"text": content}],
            }))
        })
        .collect()
}

/// 根据路径从 JSON 中提取内容
///
/// ## 路径语法
/// - `delta.content` → `json["delta"]["content"]`
/// - `parts.0.text` → `json["parts"][0]["text"]`
fn extract_content_by_path(json: &JsonValue, path: &str) -> Result<String, String> {
    let parts: Vec<&str> = path.split('.').collect();

    let mut current = json;
    for part in parts {
        current = if let Ok(idx) = part.parse::<usize>() {
            // 数组索引
            current
                .get(idx)
                .ok_or_else(|| format!("Index {} out of bounds", idx))?
        } else {
            // 对象键
            current
                .get(part)
                .ok_or_else(|| format!("Key '{}' not found", part))?
        };
    }

    current
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Value is not a string".to_string())
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
                    content: "You are helpful".to_string(),
                    tool_calls: None,
                    tool_call_id: None,
                },
                Message {
                    role: MessageRole::User,
                    content: "Hello".to_string(),
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
                    content: "You are helpful".to_string(),
                    tool_calls: None,
                    tool_call_id: None,
                },
                Message {
                    role: MessageRole::User,
                    content: "Hello".to_string(),
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
}
