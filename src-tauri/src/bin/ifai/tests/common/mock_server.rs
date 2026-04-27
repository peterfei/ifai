// common/mock_server.rs
//
// Mock API 服务器
// 使用 wiremock 模拟 OpenAI API 响应

use anyhow::Result;
use wiremock::{MockServer, ResponseTemplate};
use wiremock::matchers::{method, path};
use serde_json::json;

/// Mock 服务器
pub struct MockApiServer {
    server: MockServer,
}

impl MockApiServer {
    /// 创建新的 Mock 服务器
    pub async fn new() -> Result<Self> {
        let server = MockServer::start().await;
        Ok(Self { server })
    }

    /// 获取服务器地址
    pub fn uri(&self) -> String {
        self.server.uri()
    }

    /// 设置简单响应
    pub async fn setup_simple_response(&self, text: &str) -> Result<()> {
        use wiremock::{Mock, ResponseTemplate};
        use wiremock::matchers::{method, path};

        let response = json!({
            "id": "chatcmpl-test",
            "object": "chat.completion",
            "created": 1234567890,
            "model": "gpt-4",
            "choices": [{
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": text
                },
                "finish_reason": "stop"
            }]
        });

        Mock::given(method("POST"))
            .and(path("/v1/chat/completions"))
            .respond_with(ResponseTemplate::new(200).set_body_json(response))
            .mount(&self.server)
            .await;

        Ok(())
    }

    /// 设置流式响应
    pub async fn setup_streaming_response(&self, chunks: Vec<&str>) -> Result<()> {
        use wiremock::{Mock, ResponseTemplate};
        use wiremock::matchers::{method, path};

        let sse_data: Vec<String> = chunks
            .iter()
            .map(|text| {
                format!(
                    "data: {}\n\n",
                    json!({
                        "id": "chatcmpl-test",
                        "object": "chat.completion.chunk",
                        "created": 1234567890,
                        "model": "gpt-4",
                        "choices": [{
                            "index": 0,
                            "delta": {"content": text},
                            "finish_reason": null
                        }]
                    })
                )
            })
            .collect();

        // 添加结束标记
        let mut final_sse = sse_data.join("");
        final_sse.push_str("data: [DONE]\n\n");

        Mock::given(method("POST"))
            .and(path("/v1/chat/completions"))
            .respond_with(ResponseTemplate::new(200).set_body_string(final_sse))
            .mount(&self.server)
            .await;

        Ok(())
    }

    /// 设置工具调用响应
    pub async fn setup_tool_call_response(&self, tool_name: &str, tool_args: serde_json::Value) -> Result<()> {
        use wiremock::{Mock, ResponseTemplate};
        use wiremock::matchers::{method, path};

        let response = json!({
            "id": "chatcmpl-test",
            "object": "chat.completion",
            "created": 1234567890,
            "model": "gpt-4",
            "choices": [{
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": null,
                    "tool_calls": [{
                        "id": "call_test",
                        "type": "function",
                        "function": {
                            "name": tool_name,
                            "arguments": tool_args.to_string()
                        }
                    }]
                },
                "finish_reason": "tool_calls"
            }]
        });

        Mock::given(method("POST"))
            .and(path("/v1/chat/completions"))
            .respond_with(ResponseTemplate::new(200).set_body_json(response))
            .mount(&self.server)
            .await;

        Ok(())
    }

    /// 设置会话压缩响应
    pub async fn setup_compression_response(&self) -> Result<()> {
        use wiremock::{Mock, ResponseTemplate};
        use wiremock::matchers::{method, path};

        let response = json!({
            "id": "chatcmpl-test",
            "object": "chat.completion",
            "created": 1234567890,
            "model": "gpt-4",
            "choices": [{
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": "Conversation compressed"
                },
                "finish_reason": "stop"
            }]
        });

        Mock::given(method("POST"))
            .and(path("/v1/chat/completions"))
            .respond_with(ResponseTemplate::new(200).set_body_json(response))
            .mount(&self.server)
            .await;

        Ok(())
    }

    /// 重置所有 Mock
    pub async fn reset(&self) -> Result<()> {
        self.server.reset().await;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_mock_server_creation() {
        let server = MockApiServer::new().await.unwrap();
        let uri = server.uri();
        assert!(uri.contains("http://"));
    }

    #[tokio::test]
    async fn test_simple_response() {
        let server = MockApiServer::new().await.unwrap();
        server.setup_simple_response("Hello, World!").await.unwrap();
        // 验证响应已设置
    }

    #[tokio::test]
    async fn test_streaming_response() {
        let server = MockApiServer::new().await.unwrap();
        server.setup_streaming_response(vec!["Hello", " World"]).await.unwrap();
        // 验证流式响应已设置
    }

    #[tokio::test]
    async fn test_tool_call_response() {
        let server = MockApiServer::new().await.unwrap();
        let args = json!({"command": "ls -la"});
        server.setup_tool_call_response("bash", args).await.unwrap();
        // 验证工具调用响应已设置
    }
}
