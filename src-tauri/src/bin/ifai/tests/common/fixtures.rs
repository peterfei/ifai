// common/fixtures.rs
//
// SSE 事件构建器和测试数据
// 提供 SSE 事件构建辅助函数

use serde_json::json;

/// SSE 事件类型
pub enum SseEvent {
    ResponseCreated,
    TextDelta(String),
    ToolCall { id: String, name: String, args: String },
    CompressionStarted,
    CompressionCompleted,
    Done,
}

impl SseEvent {
    /// 转换为 SSE 格式字符串
    pub fn to_sse_string(&self) -> String {
        match self {
            SseEvent::ResponseCreated => {
                let data = json!({
                    "id": "chatcmpl-test",
                    "object": "chat.completion.chunk",
                    "created": 1234567890,
                    "model": "gpt-4",
                    "choices": [{
                        "index": 0,
                        "delta": {"role": "assistant", "content": ""},
                        "finish_reason": null
                    }]
                });
                format!("data: {}\n\n", data)
            }
            SseEvent::TextDelta(text) => {
                let data = json!({
                    "id": "chatcmpl-test",
                    "object": "chat.completion.chunk",
                    "created": 1234567890,
                    "model": "gpt-4",
                    "choices": [{
                        "index": 0,
                        "delta": {"content": text},
                        "finish_reason": null
                    }]
                });
                format!("data: {}\n\n", data)
            }
            SseEvent::ToolCall { id, name, args } => {
                let data = json!({
                    "id": "chatcmpl-test",
                    "object": "chat.completion.chunk",
                    "created": 1234567890,
                    "model": "gpt-4",
                    "choices": [{
                        "index": 0,
                        "delta": {
                            "content": null,
                            "tool_calls": [{
                                "index": 0,
                                "id": id,
                                "type": "function",
                                "function": {
                                    "name": name,
                                    "arguments": args
                                }
                            }]
                        },
                        "finish_reason": null
                    }]
                });
                format!("data: {}\n\n", data)
            }
            SseEvent::CompressionStarted => {
                let data = json!({
                    "type": "compression.started",
                    "data": {
                        "original_tokens": 12000,
                        "threshold": 10000
                    }
                });
                format!("event: compression\ndata: {}\n\n", data)
            }
            SseEvent::CompressionCompleted => {
                let data = json!({
                    "type": "compression.completed",
                    "data": {
                        "compressed_tokens": 3000,
                        "compression_ratio": 0.75
                    }
                });
                format!("event: compression\ndata: {}\n\n", data)
            }
            SseEvent::Done => {
                "data: [DONE]\n\n".to_string()
            }
        }
    }
}

/// 构建完整 SSE 流
pub struct SseStreamBuilder {
    events: Vec<String>,
}

impl SseStreamBuilder {
    pub fn new() -> Self {
        Self { events: Vec::new() }
    }

    pub fn add_response_created(mut self) -> Self {
        self.events.push(SseEvent::ResponseCreated.to_sse_string());
        self
    }

    pub fn add_text_delta(mut self, text: &str) -> Self {
        self.events.push(SseEvent::TextDelta(text.to_string()).to_sse_string());
        self
    }

    pub fn add_tool_call(mut self, id: &str, name: &str, args: &str) -> Self {
        self.events.push(SseEvent::ToolCall {
            id: id.to_string(),
            name: name.to_string(),
            args: args.to_string(),
        }.to_sse_string());
        self
    }

    pub fn add_compression_started(mut self) -> Self {
        self.events.push(SseEvent::CompressionStarted.to_sse_string());
        self
    }

    pub fn add_compression_completed(mut self) -> Self {
        self.events.push(SseEvent::CompressionCompleted.to_sse_string());
        self
    }

    pub fn add_done(mut self) -> Self {
        self.events.push(SseEvent::Done.to_sse_string());
        self
    }

    pub fn build(self) -> String {
        self.events.join("")
    }
}

impl Default for SseStreamBuilder {
    fn default() -> Self {
        Self::new()
    }
}

/// 预定义的测试响应
pub struct MockResponses;

impl MockResponses {
    /// 简单文本响应
    pub fn simple_response() -> String {
        SseStreamBuilder::new()
            .add_response_created()
            .add_text_delta("Hello")
            .add_text_delta("!")
            .add_done()
            .build()
    }

    /// 工具调用响应
    pub fn tool_call_response(tool: &str, args: &str) -> String {
        SseStreamBuilder::new()
            .add_response_created()
            .add_tool_call("call_123", tool, args)
            .add_done()
            .build()
    }

    /// 会话压缩响应
    pub fn compression_response() -> String {
        SseStreamBuilder::new()
            .add_compression_started()
            .add_compression_completed()
            .add_response_created()
            .add_text_delta("Compressed")
            .add_done()
            .build()
    }

    /// 长对话响应（触发压缩）
    pub fn long_conversation_response() -> String {
        SseStreamBuilder::new()
            .add_compression_started()
            .add_compression_completed()
            .add_response_created()
            .add_text_delta("Response after compression")
            .add_done()
            .build()
    }
}

#[cfg(test)]
mod fixtures_tests {
    use super::*;

    #[test]
    fn test_sse_event_response_created() {
        let event = SseEvent::ResponseCreated.to_sse_string();
        assert!(event.contains("data:"));
        assert!(event.contains("\"role\": \"assistant\""));
    }

    #[test]
    fn test_sse_event_text_delta() {
        let event = SseEvent::TextDelta("Hello".to_string()).to_sse_string();
        assert!(event.contains("Hello"));
        assert!(event.contains("\"delta\""));
    }

    #[test]
    fn test_sse_event_tool_call() {
        let event = SseEvent::ToolCall {
            id: "call_123".to_string(),
            name: "bash".to_string(),
            args: "{\"cmd\": \"ls\"}".to_string(),
        }.to_sse_string();
        assert!(event.contains("\"tool_calls\""));
        assert!(event.contains("bash"));
    }

    #[test]
    fn test_sse_event_compression() {
        let started = SseEvent::CompressionStarted.to_sse_string();
        assert!(started.contains("compression.started"));
        assert!(started.contains("original_tokens"));

        let completed = SseEvent::CompressionCompleted.to_sse_string();
        assert!(completed.contains("compression.completed"));
        assert!(completed.contains("compressed_tokens"));
    }

    #[test]
    fn test_sse_event_done() {
        let event = SseEvent::Done.to_sse_string();
        assert_eq!(event, "data: [DONE]\n\n");
    }

    #[test]
    fn test_sse_stream_builder() {
        let stream = SseStreamBuilder::new()
            .add_response_created()
            .add_text_delta("Hello")
            .add_text_delta(" World")
            .add_done()
            .build();

        assert!(stream.contains("Hello"));
        assert!(stream.contains("World"));
        assert!(stream.contains("[DONE]"));
    }

    #[test]
    fn test_mock_responses_simple() {
        let response = MockResponses::simple_response();
        assert!(response.contains("Hello"));
        assert!(response.contains("[DONE]"));
    }

    #[test]
    fn test_mock_responses_tool_call() {
        let response = MockResponses::tool_call_response("bash", "{\"cmd\": \"ls\"}");
        assert!(response.contains("bash"));
        assert!(response.contains("tool_calls"));
    }

    #[test]
    fn test_mock_responses_compression() {
        let response = MockResponses::compression_response();
        assert!(response.contains("compression.started"));
        assert!(response.contains("compression.completed"));
    }
}
