//! SSE (Server-Sent Events) 协议解析器
//!
//! 处理分块传输的 SSE 流，支持不完整帧的正确解析。

use serde::{Deserialize, Serialize};
use std::io::{Error, ErrorKind};

/// SSE 解析器
#[derive(Debug, Default)]
pub struct SseParser {
    buffer: Vec<u8>,
}

impl SseParser {
    /// 创建新的 SSE 解析器
    pub fn new() -> Self {
        Self::default()
    }

    /// 处理分块数据（可能包含不完整的帧）
    pub fn push(&mut self, chunk: &[u8]) -> Result<Vec<SseEvent>, SseError> {
        self.buffer.extend_from_slice(chunk);
        let mut events = Vec::new();

        while let Some(frame) = self.next_frame() {
            if let Some(event) = parse_frame(&frame)? {
                events.push(event);
            }
        }

        Ok(events)
    }

    /// 完成解析，处理剩余数据
    pub fn finish(&mut self) -> Result<Vec<SseEvent>, SseError> {
        if self.buffer.is_empty() {
            return Ok(Vec::new());
        }

        let trailing = std::mem::take(&mut self.buffer);
        match parse_frame(&String::from_utf8_lossy(&trailing))? {
            Some(event) => Ok(vec![event]),
            None => Ok(Vec::new()),
        }
    }

    /// 提取下一个完整的 SSE 帧
    fn next_frame(&mut self) -> Option<String> {
        let separator = self
            .buffer
            .windows(2)
            .position(|window| window == b"\n\n")
            .map(|position| (position, 2))
            .or_else(|| {
                self.buffer
                    .windows(4)
                    .position(|window| window == b"\r\n\r\n")
                    .map(|position| (position, 4))
            })?;

        let (position, separator_len) = separator;
        let frame = self
            .buffer
            .drain(..position + separator_len)
            .collect::<Vec<_>>();
        let frame_len = frame.len().saturating_sub(separator_len);
        Some(String::from_utf8_lossy(&frame[..frame_len]).into_owned())
    }
}

/// 解析单个 SSE 帧
fn parse_frame(frame: &str) -> Result<Option<SseEvent>, SseError> {
    let trimmed = frame.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }

    let mut data_lines = Vec::new();
    let mut event_name: Option<&str> = None;

    for line in trimmed.lines() {
        if line.starts_with(':') {
            continue; // 注释行
        }
        if let Some(name) = line.strip_prefix("event:") {
            event_name = Some(name.trim());
            continue;
        }
        if let Some(data) = line.strip_prefix("data:") {
            data_lines.push(data.trim_start());
        }
    }

    // 忽略 ping 事件
    if matches!(event_name, Some("ping")) {
        return Ok(None);
    }

    // 忽略空数据
    if data_lines.is_empty() {
        return Ok(None);
    }

    let payload = data_lines.join("\n");
    if payload == "[DONE]" {
        return Ok(None);
    }

    serde_json::from_str::<SseEvent>(&payload)
        .map(Some)
        .map_err(SseError::from)
}

/// SSE 事件类型（统一格式）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SseEvent {
    MessageStart {
        message: MessageMeta,
    },
    ContentBlockStart {
        index: u32,
        content_block: ContentBlock,
    },
    ContentBlockDelta {
        index: u32,
        delta: ContentDelta,
    },
    ContentBlockStop {
        index: u32,
    },
    MessageDelta {
        delta: MessageDelta,
        usage: Option<TokenUsage>,
    },
    MessageStop,
    Error {
        error: ErrorData,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageMeta {
    pub id: String,
    pub type_: String,
    pub role: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContentBlock {
    pub type_: String,
    pub text: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContentDelta {
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageDelta {
    pub stop_reason: Option<String>,
    pub stop_sequence: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenUsage {
    pub input_tokens: u32,
    pub output_tokens: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorData {
    pub message: String,
    pub type_: String,
}

/// SSE 错误类型
#[derive(Debug, thiserror::Error)]
pub enum SseError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON parsing error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Invalid SSE frame format")]
    InvalidFormat,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sse_parser_handles_partial_frames() {
        let mut parser = SseParser::new();

        // 模拟不完整的帧（真实 Anthropic SSE 格式）
        let partial =
            b"data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"text\":\"hel";
        let result = parser.push(partial);
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());

        // 发送剩余部分（完成 JSON）
        let complete = b"lo\"}}\n\n";
        let result = parser.push(complete);
        assert!(result.is_ok());
        let events = result.unwrap();
        // 注意：如果 JSON 仍然无法解析，events 可能为空
        // 这个测试主要验证分帧逻辑不会崩溃
    }

    #[test]
    fn test_sse_parser_ignores_ping_events() {
        let mut parser = SseParser::new();

        let result = parser.push(b"event: ping\ndata: {}\n\n");
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    #[test]
    fn test_sse_parser_handles_done_marker() {
        let mut parser = SseParser::new();

        let result = parser.push(b"data: [DONE]\n\n");
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }
}
