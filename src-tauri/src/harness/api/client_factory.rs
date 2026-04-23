//! 🔥 元编程：HTTP客户端工厂
//!
//! 消除提供商客户端中的重复初始化逻辑

use reqwest::Client as HttpClient;
use std::time::Duration;
use crate::harness::api::types::ProviderConfig;

/// 标准HTTP客户端配置（通过元数据定义）
pub struct HttpClientConfig {
    pub connect_timeout_secs: u64,
    pub read_timeout_secs: u64,
}

impl Default for HttpClientConfig {
    fn default() -> Self {
        Self {
            connect_timeout_secs: 30,
            read_timeout_secs: 600,
        }
    }
}

/// 🔥 工厂函数：根据配置创建标准化的HTTP客户端
///
/// 消除以下重复代码：
/// - zhipu.rs:38-42
/// - openai.rs:33-37
/// - deepseek.rs:38-42
pub fn create_standard_client(config: Option<HttpClientConfig>) -> Result<HttpClient, String> {
    let config = config.unwrap_or_default();

    HttpClient::builder()
        .connect_timeout(Duration::from_secs(config.connect_timeout_secs))
        .read_timeout(Duration::from_secs(config.read_timeout_secs))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))
}

/// 🔥 URL标准化：统一处理base_url的变体
///
/// 处理以下情况：
/// - None → 使用默认URL
/// - Some("https://api.example.com") → 直接使用
/// - Some("https://api.example.com/v1") → 直接使用（包含路径）
/// - Some("https://api.example.com/") → 移除尾部斜杠后添加路径
pub fn normalize_base_url(base_url: &Option<String>, default_url: &str) -> String {
    match base_url {
        Some(url) => {
            let url = url.trim_end_matches('/');
            // 如果URL已经包含路径，直接返回
            if url.contains("/chat") || url.contains("/v1/") || url.contains("/v4/") {
                url.to_string()
            } else {
                format!("{}/chat/completions", url)
            }
        }
        None => default_url.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_standard_client() {
        let client = create_standard_client(None);
        assert!(client.is_ok());
    }

    #[test]
    fn test_normalize_base_url_none() {
        let result = normalize_base_url(&None, "https://default.com/chat/completions");
        assert_eq!(result, "https://default.com/chat/completions");
    }

    #[test]
    fn test_normalize_base_url_with_path() {
        let result = normalize_base_url(
            &Some("https://open.bigmodel.cn/api/paas/v4/chat/completions".to_string()),
            "https://default.com"
        );
        assert_eq!(result, "https://open.bigmodel.cn/api/paas/v4/chat/completions");
    }

    #[test]
    fn test_normalize_base_url_without_path() {
        let result = normalize_base_url(
            &Some("https://api.example.com".to_string()),
            "https://default.com"
        );
        assert_eq!(result, "https://api.example.com/chat/completions");
    }

    #[test]
    fn test_normalize_base_url_with_trailing_slash() {
        let result = normalize_base_url(
            &Some("https://api.example.com/".to_string()),
            "https://default.com"
        );
        assert_eq!(result, "https://api.example.com/chat/completions");
    }
}
