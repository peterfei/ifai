//! 🏛️ 元编程：通用的元数据驱动客户端
//!
//! 此模块提供了一个使用元数据和适配器的通用客户端实现，
//! 可以支持任何通过 YAML 定义的提供商，无需手动编写代码。

use async_stream::stream;
use async_trait::async_trait;
use futures_core::Stream;
use reqwest::Client as HttpClient;
use std::pin::Pin;
use std::time::Duration;

use super::client::ApiClient;
use super::format_adapter::FormatAdapter;
use super::provider_metadata::ProviderSpec;
use super::sse::SseParser;
use super::types::{ApiError, Message, MessageRole, ModelInfo, StreamEvent, StreamRequest};

/// 🏛️ 元数据驱动的通用客户端
///
/// 此客户端使用 `FormatAdapter` trait 来处理不同提供商的格式差异，
/// 所有逻辑都由 YAML 配置驱动，无需为每个提供商编写重复代码。
pub struct MetadataDrivenClient<A: FormatAdapter> {
    http: HttpClient,
    api_key: String,
    adapter: A,
}

impl<A: FormatAdapter> MetadataDrivenClient<A> {
    /// 创建新的元数据驱动客户端
    pub fn new(api_key: &str, adapter: A) -> Self {
        let http = HttpClient::builder()
            .connect_timeout(Duration::from_secs(30))
            .read_timeout(Duration::from_secs(600))
            .build()
            .expect("Failed to create HTTP client");

        Self {
            http,
            api_key: api_key.to_string(),
            adapter,
        }
    }

    /// 从 ProviderSpec 创建客户端
    pub fn from_spec(api_key: &str, spec: ProviderSpec) -> Self
    where
        A: From<ProviderSpec>,
    {
        let adapter = A::from(spec);
        Self::new(api_key, adapter)
    }
}

#[async_trait]
impl<A: FormatAdapter + Send + Sync + 'static> ApiClient for MetadataDrivenClient<A> {
    async fn stream(
        &self,
        request: StreamRequest,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<StreamEvent, ApiError>> + Send>>, ApiError> {
        // 使用适配器构建请求
        let url = self.adapter.build_url(&request.model, &self.api_key);
        let headers = self.adapter.build_headers(&self.api_key);
        let body = self.adapter.transform_request_body(&request)
            .map_err(|e| ApiError::Sse(format!("Failed to transform request: {}", e)))?;

        // 构建请求
        let mut req_builder = self.http.post(&url);

        // 添加请求头
        for (key, value) in headers {
            req_builder = req_builder.header(&key, &value);
        }

        // 发送请求
        let response = req_builder
            .json(&body)
            .send()
            .await
            .map_err(|e| ApiError::Network(e.to_string()))?;

        // 检查响应状态
        if !response.status().is_success() {
            let status = response.status();
            let message = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            return Err(ApiError::HttpError { status, message });
        }

        // 创建 SSE 流
        let byte_stream = response.bytes_stream();
        let adapter = self.adapter.clone();

        let sse_stream = stream! {
            use futures_util::StreamExt;
            let mut buffer = Vec::new();

            for await chunk_result in byte_stream {
                match chunk_result {
                    Ok(chunk) => {
                        buffer.extend_from_slice(&chunk);

                        // 按 SSE 帧分隔（\n\n 或 \r\n\r\n）
                        loop {
                            let separator_pos = find_separator(&buffer);
                            if separator_pos == 0 {
                                break;
                            }

                            let frame_bytes = buffer.drain(..separator_pos).collect::<Vec<_>>();
                            // 移除分隔符
                            if buffer.starts_with(b"\n\n") {
                                buffer.drain(..2);
                            } else if buffer.starts_with(b"\r\n\r\n") {
                                buffer.drain(..4);
                            }

                            let frame = String::from_utf8_lossy(&frame_bytes);

                            // 解析 SSE 帧
                            if let Some(event_data) = parse_sse_frame(&frame) {
                                // 使用适配器解析事件（克隆适配器）
                                match adapter.clone().parse_sse_event(&event_data) {
                                    Ok(Some(event)) => yield Ok(event),
                                    Ok(None) => {
                                        // 空事件，继续
                                    }
                                    Err(e) => yield Err(ApiError::Sse(format!("Failed to parse SSE event: {}", e))),
                                }
                            }
                        }
                    }
                    Err(e) => yield Err(ApiError::Network(e.to_string())),
                }
            }
        };

        Ok(Box::pin(sse_stream))
    }

    async fn list_models(&self) -> Result<Vec<ModelInfo>, ApiError> {
        // 从 ProviderSpec 中获取模型列表
        let spec = self.adapter.spec();
        Ok(spec
            .models
            .iter()
            .map(|m| ModelInfo {
                id: m.id.clone(),
                name: m.name.clone(),
                context_tokens: m.context_tokens,
            })
            .collect())
    }

    fn estimate_tokens(&self, content: &str) -> usize {
        // 简单估算：英文约 4 字符/token，中文约 2 字符/token
        let chars = content.chars().count();
        let chinese_chars = content.chars().filter(|c| {
            let cp = *c as u32;
            (0x4E00..=0x9FFF).contains(&cp) || // CJK 统一汉字
            (0x3400..=0x4DBF).contains(&cp) || // CJK 扩展 A
            (0x20000..=0x2A6DF).contains(&cp)  // CJK 扩展 B
        }).count();

        let non_chinese_chars = chars - chinese_chars;
        (chinese_chars / 2) + (non_chinese_chars / 4)
    }
}

// ============================================================================
// 特定提供商的类型别名
// ============================================================================

/// OpenAI 官方客户端（元数据驱动）
pub type OpenAIOfficialClient = MetadataDrivenClient<crate::harness::api::generated_clients::OpenAIOfficialClient>;

/// Zhipu 官方客户端（元数据驱动）
pub type ZhipuOfficialMetadataClient = MetadataDrivenClient<crate::harness::api::generated_clients::ZhipuOfficialClient>;

/// Kimi 官方客户端（元数据驱动）
pub type KimiOfficialMetadataClient = MetadataDrivenClient<crate::harness::api::generated_clients::KimiOfficialClient>;

/// Gemini 官方客户端（元数据驱动）
pub type GeminiOfficialMetadataClient = MetadataDrivenClient<crate::harness::api::generated_clients::GeminiOfficialClient>;

// ============================================================================
// 辅助函数：创建客户端
// ============================================================================

/// 创建 OpenAI 官方客户端
pub fn create_openai_client(api_key: &str) -> OpenAIOfficialClient {
    let adapter = crate::harness::api::generated_clients::OpenAIOfficialClient::new();
    MetadataDrivenClient::new(api_key, adapter)
}

/// 创建 Zhipu 官方客户端
pub fn create_zhipu_client(api_key: &str) -> ZhipuOfficialMetadataClient {
    let adapter = crate::harness::api::generated_clients::ZhipuOfficialClient::new();
    MetadataDrivenClient::new(api_key, adapter)
}

/// 创建 Kimi 官方客户端
pub fn create_kimi_client(api_key: &str) -> KimiOfficialMetadataClient {
    let adapter = crate::harness::api::generated_clients::KimiOfficialClient::new();
    MetadataDrivenClient::new(api_key, adapter)
}

/// 创建 Gemini 官方客户端
pub fn create_gemini_client(api_key: &str) -> GeminiOfficialMetadataClient {
    let adapter = crate::harness::api::generated_clients::GeminiOfficialClient::new();
    MetadataDrivenClient::new(api_key, adapter)
}

// ============================================================================
// SSE 解析辅助函数
// ============================================================================

/// 查找 SSE 帧分隔符位置
fn find_separator(buffer: &[u8]) -> usize {
    // 查找 \n\n
    if let Some(pos) = buffer.windows(2).position(|w| w == b"\n\n") {
        return pos;
    }
    // 查找 \r\n\r\n
    if let Some(pos) = buffer.windows(4).position(|w| w == b"\r\n\r\n") {
        return pos;
    }
    0
}

/// 解析 SSE 帧，提取事件数据
fn parse_sse_frame(frame: &str) -> Option<String> {
    let trimmed = frame.trim();
    if trimmed.is_empty() {
        return None;
    }

    // SSE 格式以 "data: " 开头
    if let Some(data) = trimmed.strip_prefix("data:") {
        let payload = data.trim();
        // 检查 [DONE] 标记
        if payload == "[DONE]" {
            return None;
        }
        Some(payload.to_string())
    } else {
        // 尝试直接解析整个帧
        Some(trimmed.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_estimate_tokens() {
        let client = create_openai_client("test-key");

        // 英文文本
        let english = "Hello, world!";
        let english_tokens = client.estimate_tokens(english);
        assert!(english_tokens > 0 && english_tokens < 10);

        // 中文文本
        let chinese = "你好，世界！";
        let chinese_tokens = client.estimate_tokens(chinese);
        assert!(chinese_tokens > 0 && chinese_tokens < 10);

        // 混合文本
        let mixed = "Hello 你好 World 世界";
        let mixed_tokens = client.estimate_tokens(mixed);
        assert!(mixed_tokens > 0);
    }

    #[test]
    fn test_client_creation() {
        // 测试所有客户端创建
        let _openai = create_openai_client("test-key");
        let _zhipu = create_zhipu_client("test-key");
        let _kimi = create_kimi_client("test-key");
        let _gemini = create_gemini_client("test-key");
    }

    #[test]
    fn test_list_models() {
        // 需要异步运行时，这里只测试同步部分
        let zhipu = create_zhipu_client("test-key");

        // 通过 Runtime 运行异步代码
        use tokio::runtime::Runtime;
        let rt = Runtime::new().unwrap();

        let models = rt.block_on(async {
            zhipu.list_models().await
        });

        assert!(models.is_ok());
        let models = models.unwrap();
        assert!(!models.is_empty());

        // 验证 GLM-5.1 存在
        assert!(models.iter().any(|m| m.id == "glm-5.1"));
    }

    #[test]
    fn test_adapter_url_building() {
        let zhipu = create_zhipu_client("test-key");
        let url = zhipu.adapter.build_url("glm-5.1", "test-api-key");

        assert_eq!(url, "https://open.bigmodel.cn/api/paas/v4/chat/completions");
    }

    #[test]
    fn test_adapter_headers_building() {
        let zhipu = create_zhipu_client("test-key");
        let headers = zhipu.adapter.build_headers("test-api-key");

        // 验证 Authorization 头
        assert!(headers.iter().any(|(k, v)| {
            k == "Authorization" && v == "Bearer test-api-key"
        }));
    }

    #[test]
    fn test_kimi_list_models() {
        let kimi = create_kimi_client("test-key");

        use tokio::runtime::Runtime;
        let rt = Runtime::new().unwrap();

        let models = rt.block_on(async {
            kimi.list_models().await
        });

        assert!(models.is_ok());
        let models = models.unwrap();
        assert!(!models.is_empty());

        // 验证 K2.6 存在
        assert!(models.iter().any(|m| m.id == "moonshot-v1-k2.6"));
    }

    #[test]
    fn test_gemini_list_models() {
        let gemini = create_gemini_client("test-key");

        use tokio::runtime::Runtime;
        let rt = Runtime::new().unwrap();

        let models = rt.block_on(async {
            gemini.list_models().await
        });

        assert!(models.is_ok());
        let models = models.unwrap();
        assert!(!models.is_empty());

        // 验证 Gemini 2.0 Flash 存在
        assert!(models.iter().any(|m| m.id == "gemini-2.0-flash-exp"));
    }

    #[test]
    fn test_find_separator() {
        // 测试 \n\n 分隔符
        let buffer1 = b"data: test\n\ndata: test2\n\n";
        let pos1 = find_separator(buffer1);
        assert!(pos1 > 0); // 应该找到分隔符

        // 测试 \r\n\r\n 分隔符
        let buffer2 = b"data: test\r\n\r\ndata: test2\r\n\r\n";
        let pos2 = find_separator(buffer2);
        assert!(pos2 > 0); // 应该找到分隔符

        // 测试没有分隔符
        let buffer3 = b"data: test";
        let pos3 = find_separator(buffer3);
        assert_eq!(pos3, 0);
    }

    #[test]
    fn test_parse_sse_frame() {
        // 测试正常 data: 帧
        let frame1 = "data: {\"content\":\"Hello\"}";
        let result1 = parse_sse_frame(frame1);
        assert_eq!(result1, Some("{\"content\":\"Hello\"}".to_string()));

        // 测试 [DONE] 标记
        let frame2 = "data: [DONE]";
        let result2 = parse_sse_frame(frame2);
        assert_eq!(result2, None);

        // 测试空帧
        let frame3 = "";
        let result3 = parse_sse_frame(frame3);
        assert_eq!(result3, None);

        // 测试带空格的帧
        let frame4 = "data:  {\"content\":\"Hello\"}  ";
        let result4 = parse_sse_frame(frame4);
        assert_eq!(result4, Some("{\"content\":\"Hello\"}".to_string()));
    }

    #[test]
    fn test_zhipu_adapter_parse_sse() {
        let zhipu = create_zhipu_client("test-key");

        // 测试正常的 SSE 事件
        let event_data = r#"{"id":"chatcmpl-123","choices":[{"index":0,"delta":{"content":"你好"}}]}"#;

        let event = zhipu.adapter.parse_sse_event(event_data);
        assert!(event.is_ok());

        if let Ok(Some(StreamEvent::TextDelta { text })) = event {
            assert_eq!(text, "你好");
        } else {
            panic!("Expected TextDelta event with content");
        }
    }

    #[test]
    fn test_kimi_adapter_parse_sse() {
        let kimi = create_kimi_client("test-key");

        // 测试正常的 SSE 事件
        let event_data = r#"{"id":"chatcmpl-456","choices":[{"index":0,"delta":{"content":"Hello from Kimi"}}]}"#;

        let event = kimi.adapter.parse_sse_event(event_data);
        assert!(event.is_ok());

        if let Ok(Some(StreamEvent::TextDelta { text })) = event {
            assert_eq!(text, "Hello from Kimi");
        } else {
            panic!("Expected TextDelta event with content");
        }
    }

    #[test]
    fn test_zhipu_request_transform() {
        use crate::harness::api::types::{Message, MessageRole};

        let zhipu = create_zhipu_client("test-key");

        let request = StreamRequest {
            model: "glm-5.1".to_string(),
            messages: vec![
                Message {
                    role: MessageRole::User,
                    content: "你好".to_string(),
                    tool_calls: None,
                    tool_call_id: None,
                },
            ],
            max_tokens: 4096,
            system: None,
            temperature: Some(0.7),
            tools: None,
            stream: true,
        };

        let body = zhipu.adapter.transform_request_body(&request);
        assert!(body.is_ok());

        let body_json = body.unwrap();
        assert_eq!(body_json["model"], "glm-5.1");
        assert_eq!(body_json["stream"], true);
        // temperature 可能是 null（如果没有值）或具体值
        if !body_json["temperature"].is_null() {
            assert_eq!(body_json["temperature"], 0.7);
        }
    }
}
