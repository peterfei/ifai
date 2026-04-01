//! OpenAI 格式的 SSE 解析
//!
//! 处理 OpenAI/DeepSeek 等 API 的 SSE 流格式。

use serde::Deserialize;

/// OpenAI 格式的 SSE 数据
#[derive(Debug, Deserialize)]
pub struct OpenAiSseData {
    pub id: Option<String>,
    pub object: Option<String>,
    pub created: Option<u64>,
    pub model: Option<String>,
    pub choices: Vec<Choice>,
}

#[derive(Debug, Deserialize)]
pub struct Choice {
    pub index: u32,
    pub delta: Delta,
    pub finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct Delta {
    pub content: Option<String>,
    pub role: Option<String>,
    /// 🆕 P2: 工具调用（OpenAI/DeepSeek 格式）
    pub tool_calls: Option<Vec<ToolCallDelta>>,
}

/// 🆕 P2: 工具调用增量数据
#[derive(Debug, Deserialize)]
pub struct ToolCallDelta {
    pub index: i32,
    pub id: Option<String>,
    #[serde(rename = "type")]
    pub call_type: Option<String>,
    pub function: Option<FunctionDelta>,
}

/// 🆕 P2: 函数调用增量数据
#[derive(Debug, Deserialize)]
pub struct FunctionDelta {
    pub name: Option<String>,
    pub arguments: Option<String>,
}

/// 解析 OpenAI 格式的 SSE 帧
pub fn parse_openai_frame(frame: &str) -> Result<Option<OpenAiSseData>, String> {
    let trimmed = frame.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }

    // OpenAI 格式以 "data: " 开头
    let payload = if let Some(data) = trimmed.strip_prefix("data:") {
        data.trim()
    } else {
        // 尝试直接解析整个帧
        trimmed
    };

    // 检查 [DONE] 标记
    if payload == "[DONE]" {
        return Ok(None);
    }

    // 解析 JSON
    serde_json::from_str::<OpenAiSseData>(payload)
        .map(Some)
        .map_err(|e| format!("JSON parsing error: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_openai_content_delta() {
        let frame = r#"data: {"id":"chatcmpl-123","choices":[{"index":0,"delta":{"content":"Hello"}}]}"#;
        let result = parse_openai_frame(frame).unwrap();
        assert!(result.is_some());
        let data = result.unwrap();
        assert_eq!(data.choices[0].delta.content.as_ref().unwrap(), "Hello");
    }

    #[test]
    fn test_parse_openai_done() {
        let frame = "data: [DONE]";
        let result = parse_openai_frame(frame).unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_parse_openai_finish() {
        let frame = r#"data: {"id":"chatcmpl-123","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}"#;
        let result = parse_openai_frame(frame).unwrap();
        assert!(result.is_some());
        let data = result.unwrap();
        assert_eq!(data.choices[0].finish_reason.as_ref().unwrap(), "stop");
    }
}
