//! SSE 解析器测试

#[cfg(test)]
mod tests {
    use super::super::sse::{SseParser, SseEvent};

    #[test]
    fn test_sse_parser_handles_partial_frames() {
        let mut parser = SseParser::new();

        // 模拟不完整的帧
        let result = parser.push(b"data: {\"text\":\"hel");
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());

        // 发送剩余部分
        let result = parser.push(b"lo\"}\n\n");
        assert!(result.is_ok());
        // 注意：由于实际 JSON 解析可能需要完整结构，这里主要测试分帧逻辑
    }

    #[test]
    fn test_sse_parser_handles_complete_frame() {
        let mut parser = SseParser::new();

        let result = parser.push(b"data: {\"text\":\"hello\"}\n\n");
        assert!(result.is_ok());
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

    #[test]
    fn test_sse_parser_handles_empty_data() {
        let mut parser = SseParser::new();

        let result = parser.push(b"\n\n");
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }
}
