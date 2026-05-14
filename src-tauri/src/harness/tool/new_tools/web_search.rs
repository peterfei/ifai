//! WebSearch 工具 - 使用 #[derive(Tool)] 宏实现
//!
//! 提供网络搜索功能，支持搜索 API 调用和结果返回。

use serde_json::Value;
use tool_macro::Tool;

/// WebSearch 工具
#[derive(Tool)]
#[tool(
    name = "web_search",
    description = "Search the web and return relevant results",
    params(query: str, count: int)
)]
pub struct WebSearchTool {
    // 工具无状态，保持简单
}

/// 搜索结果
#[derive(Debug, Clone)]
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
#[derive(Debug, thiserror::Error)]
pub enum WebSearchError {
    #[error("Missing API key")]
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

impl WebSearchTool {
    /// 执行网络搜索
    ///
    /// 注意：当前实现返回模拟结果，需要配置搜索 API 后才能使用
    pub fn execute_web_search(&self, query: &str, count: u64) -> Result<WebSearchResult, WebSearchError> {
        // TODO: 实现真实的搜索 API 调用
        // 当前返回模拟结果用于测试

        let count = count.min(10) as usize;
        let mut results = Vec::new();

        // 模拟搜索结果
        for i in 0..count {
            results.push(SearchResult {
                title: format!("Result {} for '{}'", i + 1, query),
                url: format!("https://example.com/result/{}", i + 1),
                snippet: format!("This is a simulated search result for query '{}'", query),
            });
        }

        Ok(WebSearchResult {
            query: query.to_string(),
            results,
            count,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tool_creation() {
        let tool = WebSearchTool::new();
        assert_eq!(WebSearchTool::TOOL_NAME, "web_search");
        assert!(WebSearchTool::TOOL_DESCRIPTION.contains("Search"));
    }

    #[test]
    fn test_web_search_success() {
        let tool = WebSearchTool::new();
        let result = tool.execute_web_search("Rust programming", 5).unwrap();

        assert_eq!(result.query, "Rust programming");
        assert_eq!(result.count, 5);
        assert_eq!(result.results.len(), 5);
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
        let tool = WebSearchTool::new();
        let result = tool.execute_web_search("test", 15).unwrap();

        // 应该限制为 10
        assert_eq!(result.count, 10);
    }
}
