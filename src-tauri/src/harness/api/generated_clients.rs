//! 🏛️ 元编程：自动生成的提供商客户端
//!
//! 此文件展示了如何使用 `generate_provider_client!` 宏从 YAML 配置
//! 自动生成提供商客户端代码。
//!
//! ## 使用方式
//!
//! 每个提供商只需要 **1 行代码**：
//!
//! ```rust,ignore
//! generate_provider_client!("provider-id", ClientName, AdapterType);
//! ```
//!
//! 宏会自动生成：
//! - 客户端结构体
//! - `new()` 构造函数
//! - `build_url()` 方法
//! - `build_headers()` 方法
//! - `transform_request_body()` 方法
//! - `parse_sse_event()` 方法
//! - `Default` trait 实现

use crate::harness::api::format_adapter::{OpenAIFormatAdapter, GeminiFormatAdapter};

// ============================================================================
// OpenAI 兼容提供商（使用 OpenAIFormatAdapter）
// ============================================================================

/// 🏛️ 自动生成：OpenAI 官方客户端
///
/// 从 `providers/registry/openai.yaml` 配置生成
crate::generate_provider_client!("openai-official", OpenAIOfficialClient, OpenAIFormatAdapter);

/// 🏛️ 自动生成：Zhipu AI 客户端
///
/// 从 `providers/registry/zhipu.yaml` 配置生成
crate::generate_provider_client!("zhipu-official", ZhipuOfficialClient, OpenAIFormatAdapter);

/// 🏛️ 自动生成：Kimi (Moonshot AI) 客户端
///
/// 从 `providers/registry/kimi.yaml` 配置生成
crate::generate_provider_client!("kimi-official", KimiOfficialClient, OpenAIFormatAdapter);

// ============================================================================
// 特殊格式提供商
// ============================================================================

/// 🏛️ 自动生成：Google Gemini 客户端
///
/// 从 `providers/registry/gemini.yaml` 配置生成
/// 使用 GeminiFormatAdapter 处理独特的 Gemini API 格式
crate::generate_provider_client!("gemini-official", GeminiOfficialClient, GeminiFormatAdapter);

#[cfg(test)]
mod tests {
    // 导入宏生成的客户端类型（完整路径）
    use crate::harness::api::generated_clients::OpenAIOfficialClient;
    use crate::harness::api::generated_clients::ZhipuOfficialClient;
    use crate::harness::api::generated_clients::KimiOfficialClient;
    use crate::harness::api::generated_clients::GeminiOfficialClient;
    use crate::harness::api::types::{StreamRequest, Message, MessageRole};

    #[test]
    fn test_openai_client_creation() {
        // 测试 OpenAI 客户端创建
        let client = OpenAIOfficialClient::new();

        // 验证客户端有正确的配置
        let spec = client.spec();
        assert_eq!(spec.metadata.id, "openai-official");
        assert_eq!(spec.metadata.name, "OpenAI");
        assert_eq!(spec.metadata.protocol, "openai");

        // 验证模型列表包含 GPT-4o
        assert!(spec.models.iter().any(|m| m.id == "gpt-4o"));
    }

    #[test]
    fn test_zhipu_client_creation() {
        // 测试 Zhipu 客户端创建
        let client = ZhipuOfficialClient::new();

        // 验证客户端有正确的配置
        let spec = client.spec();
        assert_eq!(spec.metadata.id, "zhipu-official");
        assert_eq!(spec.metadata.name, "Zhipu AI (智谱)");
        assert_eq!(spec.metadata.protocol, "openai");

        // 验证模型列表包含 GLM-5.1
        assert!(spec.models.iter().any(|m| m.id == "glm-5.1"));
    }

    #[test]
    fn test_zhipu_client_default() {
        // 测试 Default trait 实现
        let client = ZhipuOfficialClient::default();

        let spec = client.spec();
        assert_eq!(spec.metadata.id, "zhipu-official");
    }

    #[test]
    fn test_zhipu_client_build_url() {
        let client = ZhipuOfficialClient::new();

        let url = client.build_url("glm-5.1", "test-api-key");

        assert_eq!(url, "https://open.bigmodel.cn/api/paas/v4/chat/completions");
    }

    #[test]
    fn test_zhipu_client_build_headers() {
        let client = ZhipuOfficialClient::new();

        let headers = client.build_headers("test-api-key");

        // 验证 Authorization 头
        assert!(headers.iter().any(|(k, v)| {
            k == "Authorization" && v == "Bearer test-api-key"
        }));

        // 验证 Content-Type 头
        assert!(headers.iter().any(|(k, v)| {
            k == "Content-Type" && v == "application/json"
        }));
    }

    #[test]
    fn test_kimi_client_creation() {
        let client = KimiOfficialClient::new();

        let spec = client.spec();
        assert_eq!(spec.metadata.id, "kimi-official");
        assert_eq!(spec.metadata.name, "Kimi (Moonshot AI)");

        // 验证模型列表包含 K2.6
        assert!(spec.models.iter().any(|m| m.id == "moonshot-v1-k2.6"));
    }

    #[test]
    fn test_gemini_client_creation() {
        let client = GeminiOfficialClient::new();

        let spec = client.spec();
        assert_eq!(spec.metadata.id, "gemini-official");
        assert_eq!(spec.metadata.name, "Google Gemini");
        assert_eq!(spec.metadata.protocol, "gemini");
    }

    #[test]
    fn test_gemini_client_build_url() {
        let client = GeminiOfficialClient::new();

        let url = client.build_url("gemini-2.0-flash-exp", "test-api-key");

        // Gemini 使用 query 参数认证
        assert!(url.contains("key=test-api-key"));
        assert!(url.contains("gemini-2.0-flash-exp"));
    }

    #[test]
    fn test_zhipu_client_transform_request() {
        use crate::harness::api::types::{Message, MessageRole};

        let client = ZhipuOfficialClient::new();

        let request = StreamRequest {
            model: "glm-5.1".to_string(),
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

        let body = client.transform_request_body(&request).unwrap();

        assert_eq!(body["model"], "glm-5.1");
        assert_eq!(body["stream"], true);
        assert_eq!(body["messages"][0]["role"], "system");
        assert_eq!(body["messages"][0]["content"], "You are helpful");
    }

    #[test]
    fn test_gemini_client_transform_request() {
        use crate::harness::api::types::{Message, MessageRole};

        let client = GeminiOfficialClient::new();

        let request = StreamRequest {
            model: "gemini-2.0-flash-exp".to_string(),
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

        let body = client.transform_request_body(&request).unwrap();

        // Gemini 格式：系统消息添加 "System: " 前缀
        assert_eq!(body["contents"][0]["role"], "user");
        assert_eq!(body["contents"][0]["parts"][0]["text"], "System: You are helpful");
        assert_eq!(body["contents"][1]["role"], "user");
        assert_eq!(body["contents"][1]["parts"][0]["text"], "Hello");
    }

    #[test]
    fn test_zhipu_client_parse_sse() {
        let client = ZhipuOfficialClient::new();

        let event_data = r#"{"id":"chatcmpl-123","choices":[{"index":0,"delta":{"content":"你好"}}]}"#;

        let event = client.parse_sse_event(event_data).unwrap();

        assert!(event.is_some());

        if let Some(crate::harness::api::types::StreamEvent::TextDelta { text }) = event {
            assert_eq!(text, "你好");
        } else {
            panic!("Expected TextDelta event");
        }
    }
}
