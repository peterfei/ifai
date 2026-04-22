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
impl<A: FormatAdapter + Send + Sync> ApiClient for MetadataDrivenClient<A> {
    async fn stream(
        &self,
        _request: StreamRequest,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<StreamEvent, ApiError>> + Send>>, ApiError> {
        // TODO: 实现 stream 方法
        // 这需要完整实现 SSE 解析逻辑
        Err(ApiError::Sse("Stream not yet implemented for metadata-driven client".to_string()))
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
}
