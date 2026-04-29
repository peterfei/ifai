// common/mock_server.rs
//
// Mock API 服务器
// 使用 wiremock 模拟 OpenAI API 响应

use anyhow::Result;
use wiremock::{MockServer, ResponseTemplate, Respond, Request};
use wiremock::matchers::{method, path};
use serde_json::json;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

use super::fixtures::SseStreamBuilder;

/// Mock 服务器
pub struct MockApiServer {
    server: MockServer,
}

// ═══════════════════════════════════════════════════════════
// 多轮动态响应
// ═══════════════════════════════════════════════════════════

/// 多轮 SSE 响应器
///
/// 根据请求轮次返回不同的 SSE 流内容
/// 每次收到 POST 请求时递增轮次计数器
pub struct MultiTurnSseResponder {
    /// 预定义的每轮 SSE 响应（streaming 格式）
    turn_responses: Vec<String>,
    /// 当前轮次计数器
    turn_counter: Arc<AtomicUsize>,
    /// 最大轮次（超出后返回纯文本结束响应）
    max_turns: usize,
}

impl MultiTurnSseResponder {
    pub fn new(turn_responses: Vec<String>) -> Self {
        let max_turns = turn_responses.len();
        Self {
            turn_responses,
            turn_counter: Arc::new(AtomicUsize::new(0)),
            max_turns,
        }
    }

    /// 获取当前轮次
    pub fn current_turn(&self) -> usize {
        self.turn_counter.load(Ordering::SeqCst)
    }
}

impl Respond for MultiTurnSseResponder {
    fn respond(&self, _request: &Request) -> ResponseTemplate {
        let turn = self.turn_counter.fetch_add(1, Ordering::SeqCst);

        if turn < self.max_turns {
            ResponseTemplate::new(200)
                .set_body_string(self.turn_responses[turn].clone())
                .insert_header("Content-Type", "text/event-stream")
        } else {
            // 超出预定义轮次，返回纯文本结束响应
            let done_response = SseStreamBuilder::new()
                .add_response_created()
                .add_text_delta("Task completed.")
                .add_finish_reason("stop")
                .add_done()
                .build();
            ResponseTemplate::new(200)
                .set_body_string(done_response)
                .insert_header("Content-Type", "text/event-stream")
        }
    }
}

/// 构建单轮 SSE 流的辅助函数（导出供外部使用）
pub fn build_tool_call_sse(tool_name: &str, tool_args: &str, call_id: &str) -> String {
    SseStreamBuilder::new()
        .add_response_created()
        .add_tool_call(call_id, tool_name, tool_args)
        .add_finish_reason("tool_calls")  // 触发 provider 发送 ToolDone 事件
        .add_done()
        .build()
}

/// 构建纯文本 SSE 流
pub fn build_text_sse(text: &str) -> String {
    SseStreamBuilder::new()
        .add_response_created()
        .add_text_delta(text)
        .add_finish_reason("stop")
        .add_done()
        .build()
}

/// 构建包含多个工具调用的 SSE 流
pub fn build_multi_tool_call_sse(tool_calls: &[(&str, &str, &str)]) -> String {
    let mut builder = SseStreamBuilder::new()
        .add_response_created();
    for (i, (call_id, tool_name, tool_args)) in tool_calls.iter().enumerate() {
        builder = builder.add_tool_call_with_index(call_id, tool_name, tool_args, i);
    }
    builder.add_finish_reason("tool_calls").add_done().build()
}

/// 构建缺 finish_reason 的工具调用 SSE 流（模拟 LLM 流异常中断）
///
/// 正常 SSE 流：response_created → tool_call → finish_reason("tool_calls") → [DONE]
/// 异常 SSE 流：response_created → tool_call → [DONE]  （无 finish_reason）
///
/// Provider 应在流结束时 flush 残留的 tool_args_buffer，发送 ToolDone
pub fn build_tool_call_sse_no_finish_reason(tool_name: &str, tool_args: &str, call_id: &str) -> String {
    SseStreamBuilder::new()
        .add_response_created()
        .add_tool_call(call_id, tool_name, tool_args)
        // 故意不调用 add_finish_reason — 模拟 LLM 流异常中断
        .add_done()
        .build()
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

    /// 设置多轮流式响应
    ///
    /// 每轮 API 请求返回不同的 SSE 流
    /// turn_responses[i] 是第 i 轮的 SSE 内容
    /// 超出预定义轮次后返回纯文本结束响应
    ///
    /// 返回 Arc<AtomicUsize> 以便测试断言实际轮次数
    pub async fn setup_multi_turn_streaming(
        &self,
        turn_responses: Vec<String>,
    ) -> Arc<AtomicUsize> {
        use wiremock::Mock;

        let responder = MultiTurnSseResponder::new(turn_responses);
        let turn_counter = responder.turn_counter.clone();

        Mock::given(method("POST"))
            .and(path("/v1/chat/completions"))
            .respond_with(responder)
            .mount(&self.server)
            .await;

        turn_counter
    }

    /// 设置 API 错误响应（HTTP 4xx/5xx）
    pub async fn setup_error_response(&self, status: u16, message: &str) -> Result<()> {
        use wiremock::{Mock, ResponseTemplate};
        use wiremock::matchers::{method, path};

        let response = json!({
            "error": {
                "message": message,
                "type": "api_error",
                "code": status
            }
        });

        Mock::given(method("POST"))
            .and(path("/v1/chat/completions"))
            .respond_with(ResponseTemplate::new(status).set_body_json(response))
            .mount(&self.server)
            .await;

        Ok(())
    }

    /// 设置网络错误（模拟连接拒绝）
    pub async fn setup_network_error(&self) -> Result<()> {
        use wiremock::{Mock, ResponseTemplate};
        use wiremock::matchers::{method, path};

        Mock::given(method("POST"))
            .and(path("/v1/chat/completions"))
            .respond_with(ResponseTemplate::new(503).set_body_string("Connection refused"))
            .mount(&self.server)
            .await;

        Ok(())
    }

    /// 设置超时响应
    pub async fn setup_timeout_response(&self) -> Result<()> {
        use wiremock::{Mock, ResponseTemplate};
        use wiremock::matchers::{method, path};

        Mock::given(method("POST"))
            .and(path("/v1/chat/completions"))
            .respond_with(ResponseTemplate::new(408).set_body_string("Request timeout"))
            .mount(&self.server)
            .await;

        Ok(())
    }

    /// 设置原始文本响应（用于模拟畸形 JSON）
    pub async fn setup_raw_response(&self, body: &str) -> Result<()> {
        use wiremock::{Mock, ResponseTemplate};
        use wiremock::matchers::{method, path};

        Mock::given(method("POST"))
            .and(path("/v1/chat/completions"))
            .respond_with(ResponseTemplate::new(200).set_body_string(body))
            .mount(&self.server)
            .await;

        Ok(())
    }
}

#[cfg(test)]
mod mock_server_tests {
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
