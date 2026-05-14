//! WebSearch 工具 - 使用 #[derive(Tool)] 宏实现
//!
//! 提供网络搜索功能，集成博查 AI（Bocha AI）搜索 API。

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::env;
use std::time::Duration;
use tool_macro::Tool;
use thiserror::Error;

/// 博查 Web Search API 配置
#[derive(Debug, Clone)]
pub struct BochaConfig {
    /// API Key
    pub api_key: Option<String>,
    /// API 端点
    pub endpoint: String,
    /// 请求超时（秒）
    pub timeout: u64,
}

impl Default for BochaConfig {
    fn default() -> Self {
        Self {
            api_key: env::var("BOCHA_API_KEY").ok(),
            endpoint: "https://api.bocha.cn/v1/web-search".to_string(),
            timeout: 30,
        }
    }
}

impl BochaConfig {
    /// 从环境变量创建配置
    pub fn from_env() -> Self {
        Self::default()
    }

    /// 设置自定义 API Key
    pub fn with_api_key(mut self, api_key: String) -> Self {
        self.api_key = Some(api_key);
        self
    }

    /// 检查是否有可用的 API Key
    pub fn has_api_key(&self) -> bool {
        self.api_key.as_ref().map_or(false, |k| !k.is_empty())
    }
}

/// 博查 Web Search API 请求
#[derive(Debug, Serialize)]
struct BochaRequest {
    query: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    summary: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    freshness: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    count: Option<u64>,
}

/// 博查 Web Search API 响应
#[derive(Debug, Deserialize)]
struct BochaResponse {
    web_results: Option<Vec<BochaWebResult>>,
}

#[derive(Debug, Deserialize, Clone)]
struct BochaWebResult {
    title: String,
    url: String,
    snippet: String,
    #[serde(default)]
    site_name: String,
    #[serde(default)]
    icon: Option<String>,
    #[serde(default)]
    published_time: Option<String>,
}

/// WebSearch 工具
#[derive(Tool)]
#[tool(
    name = "web_search",
    description = "Search the web using Bocha AI and return relevant results",
    params(query: str, count: int)
)]
pub struct WebSearchTool {
    #[tool(config)]
    config: BochaConfig,
}

impl WebSearchTool {
    /// 创建带有默认配置的实例
    pub fn with_config(config: BochaConfig) -> Self {
        Self { config }
    }

    /// 执行网络搜索
    ///
    /// 集成博查 AI（Bocha AI）Web Search API
    pub async fn execute_web_search_async(&self, query: &str, count: u64) -> Result<WebSearchResult, WebSearchError> {
        // 如果没有 API Key，返回模拟结果
        if !self.config.has_api_key() {
            return self.mock_search(query, count);
        }

        // 限制结果数量（博查最多支持 50 条）
        let count = count.min(50);

        // 构建请求
        let request = BochaRequest {
            query: query.to_string(),
            summary: Some(true),
            freshness: Some("noLimit".to_string()),
            count: Some(count),
        };

        // 创建 HTTP 客户端
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(self.config.timeout))
            .build()
            .map_err(|e| WebSearchError::Network(format!("Failed to create client: {}", e)))?;

        // 发送请求
        let api_key = self.config.api_key.as_ref().ok_or(WebSearchError::MissingApiKey)?;

        let response = client
            .post(&self.config.endpoint)
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await
            .map_err(|e| WebSearchError::Network(format!("Request failed: {}", e)))?;

        // 检查响应状态
        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            return Err(WebSearchError::Api(format!("API returned {}: {}", status, error_text)));
        }

        // 解析响应
        let bocha_response: BochaResponse = response
            .json()
            .await
            .map_err(|e| WebSearchError::Parse(format!("Failed to parse response: {}", e)))?;

        // 转换结果
        let web_results = bocha_response.web_results.unwrap_or_default();
        let results: Vec<SearchResult> = web_results
            .into_iter()
            .map(|r| SearchResult {
                title: r.title,
                url: r.url,
                snippet: r.snippet,
            })
            .collect();

        let count = results.len();
        Ok(WebSearchResult {
            query: query.to_string(),
            results,
            count,
        })
    }

    /// 同步版本的搜索（用于非异步上下文）
    pub fn execute_web_search(&self, query: &str, count: u64) -> Result<WebSearchResult, WebSearchError> {
        // 使用 tokio 运行时执行异步代码
        let rt = tokio::runtime::Runtime::new()
            .map_err(|e| WebSearchError::Network(format!("Failed to create runtime: {}", e)))?;

        rt.block_on(self.execute_web_search_async(query, count))
    }

    /// 模拟搜索结果（当没有 API Key 时使用）
    fn mock_search(&self, query: &str, count: u64) -> Result<WebSearchResult, WebSearchError> {
        let count = count.min(10) as usize;
        let mut results = Vec::new();

        for i in 0..count {
            results.push(SearchResult {
                title: format!("Result {} for '{}'", i + 1, query),
                url: format!("https://example.com/result/{}", i + 1),
                snippet: format!("This is a simulated search result for query '{}'. Set BOCHA_API_KEY environment variable to use real search.", query),
            });
        }

        Ok(WebSearchResult {
            query: query.to_string(),
            results,
            count,
        })
    }
}

/// 搜索结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    /// 标题
    pub title: String,
    /// URL
    pub url: String,
    /// 摘要
    pub snippet: String,
}

/// WebSearch 结果
#[derive(Debug, Clone)]
pub struct WebSearchResult {
    /// 搜索查询
    pub query: String,
    /// 结果列表
    pub results: Vec<SearchResult>,
    /// 结果数量
    pub count: usize,
}

impl WebSearchResult {
    /// 格式化为输出字符串
    pub fn to_output_string(&self) -> String {
        let mut output = format!("🔍 Search Results for: {}\n", self.query);
        output.push_str(&format!("Found {} results:\n\n", self.count));

        for (i, result) in self.results.iter().enumerate() {
            output.push_str(&format!("{}. {}\n", i + 1, result.title));
            output.push_str(&format!("   URL: {}\n", result.url));
            output.push_str(&format!("   {}\n\n", result.snippet));
        }

        output
    }
}

/// WebSearch 错误类型
#[derive(Debug, Error)]
pub enum WebSearchError {
    #[error("Missing BOCHA_API_KEY environment variable")]
    MissingApiKey,

    #[error("Network error: {0}")]
    Network(String),

    #[error("API error: {0}")]
    Api(String),

    #[error("Parse error: {0}")]
    Parse(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tool_creation() {
        let tool = WebSearchTool::new(BochaConfig::default());
        assert_eq!(WebSearchTool::TOOL_NAME, "web_search");
        assert!(WebSearchTool::TOOL_DESCRIPTION.contains("Search"));
        assert!(WebSearchTool::TOOL_DESCRIPTION.contains("Bocha"));
    }

    #[test]
    fn test_web_search_mock() {
        // 测试没有 API Key 时的模拟搜索
        let config = BochaConfig {
            api_key: None,
            ..Default::default()
        };
        let tool = WebSearchTool::new(config);
        let result = tool.execute_web_search("Rust programming", 5).unwrap();

        assert_eq!(result.query, "Rust programming");
        assert_eq!(result.count, 5);
        assert_eq!(result.results.len(), 5);
        // 验证是模拟结果
        assert!(result.results[0].url.contains("example.com"));
    }

    #[test]
    fn test_result_formatting() {
        let result = WebSearchResult {
            query: "test".to_string(),
            results: vec![
                SearchResult {
                    title: "Test Result".to_string(),
                    url: "https://example.com".to_string(),
                    snippet: "Test snippet".to_string(),
                },
            ],
            count: 1,
        };

        let output = result.to_output_string();
        assert!(output.contains("🔍"));
        assert!(output.contains("test"));
        assert!(output.contains("Test Result"));
    }

    #[test]
    fn test_count_limit() {
        let config = BochaConfig {
            api_key: None,
            ..Default::default()
        };
        let tool = WebSearchTool::new(config);
        let result = tool.execute_web_search("test", 15).unwrap();

        // 没有 apiKey 时限制为 10
        assert_eq!(result.count, 10);
    }

    #[test]
    fn test_bocha_config_default() {
        let config = BochaConfig::default();
        assert_eq!(config.endpoint, "https://api.bocha.cn/v1/web-search");
        assert_eq!(config.timeout, 30);
        // API Key 可能为空（取决于环境变量）
    }

    #[test]
    fn test_bocha_config_with_api_key() {
        let config = BochaConfig::default().with_api_key("test-key".to_string());
        assert!(config.has_api_key());
        assert_eq!(config.api_key, Some("test-key".to_string()));
    }

    #[test]
    fn test_bocha_config_no_api_key() {
        let config = BochaConfig {
            api_key: None,
            ..Default::default()
        };
        assert!(!config.has_api_key());
    }

    #[test]
    fn test_bocha_config_empty_api_key() {
        let config = BochaConfig {
            api_key: Some("".to_string()),
            ..Default::default()
        };
        assert!(!config.has_api_key());
    }
}
