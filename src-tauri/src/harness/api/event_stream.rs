/**
 * 🔥 务实的 next_event 接口（折中方案）
 *
 * 使用示例：
 * ```rust
 * // 将现有 Stream 转换为 EventStream
 * let stream = client.stream(request).await?;
 * let mut event_stream = StreamToEventStream::new(stream);
 *
 * while let Some(event) = event_stream.next_event().await? {
 *     println!("Got event: {:?}", event);
 * }
 * ```
 */

use std::collections::VecDeque;
use std::pin::Pin;
use futures_core::Stream;
use futures_util::StreamExt;
use async_trait::async_trait;

use super::types::{ApiError, StreamEvent};

use super::streaming::EventStream;

// ============================================================================
// StreamToEventStream: 将现有 Stream 包装为 EventStream
// ============================================================================

/// 🔥 务实的包装器：将现有 Stream<Item=Result<StreamEvent>> 转换为 EventStream
pub struct StreamToEventStream {
    stream: Pin<Box<dyn Stream<Item = Result<StreamEvent, ApiError>> + Send>>,
    buffer: VecDeque<StreamEvent>,
}

impl StreamToEventStream {
    pub fn new(
        stream: Pin<Box<dyn Stream<Item = Result<StreamEvent, ApiError>> + Send>>,
    ) -> Self {
        Self {
            stream,
            buffer: VecDeque::new(),
        }
    }
}

#[async_trait::async_trait]
impl EventStream for StreamToEventStream {
    async fn next_event(&mut self) -> Result<Option<StreamEvent>, ApiError> {
        // 1. 优先从缓冲区获取
        if let Some(event) = self.buffer.pop_front() {
            return Ok(Some(event));
        }

        // 2. 从底层 Stream 读取
        match self.stream.next().await {
            Some(Ok(event)) => {
                return Ok(Some(event));
            }
            Some(Err(e)) => {
                return Err(e);
            }
            None => {
                return Ok(None);
            }
        }
    }
}

// ============================================================================
// BatchEventStream: 批量获取事件的包装器
// ============================================================================

/// 🔥 批量处理包装器：减少函数调用次数
pub struct BatchEventStream {
    inner: Box<dyn EventStream>,
    batch_size: usize,
}

impl BatchEventStream {
    pub fn new(inner: Box<dyn EventStream>, batch_size: usize) -> Self {
        Self {
            inner,
            batch_size,
        }
    }

    /// 批量获取事件
    pub async fn next_batch(&mut self) -> Result<Vec<StreamEvent>, ApiError> {
        let mut events = Vec::with_capacity(self.batch_size);

        while let Some(event) = self.inner.next_event().await? {
            events.push(event);
            if events.len() >= self.batch_size {
                break;
            }
        }

        Ok(events)
    }
}

#[async_trait::async_trait]
impl EventStream for BatchEventStream {
    async fn next_event(&mut self) -> Result<Option<StreamEvent>, ApiError> {
        self.inner.next_event().await
    }
}

// ============================================================================
// 测试
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_stream_to_event_stream() {
        // 创建测试 Stream
        let events = vec![
            StreamEvent::MessageStart {
                message_id: "msg_1".to_string(),
            },
            StreamEvent::TextDelta {
                text: "Hello".to_string(),
            },
            StreamEvent::TextDelta {
                text: " World".to_string(),
            },
        ];

        let stream = async_stream::stream! {
            for event in events {
                yield Ok(event);
            }
        };

        let mut event_stream = StreamToEventStream::new(Box::pin(stream));

        // 测试 next_event
        let event1 = event_stream.next_event().await.unwrap().unwrap();
        assert!(matches!(event1, StreamEvent::MessageStart { .. }));

        let event2 = event_stream.next_event().await.unwrap().unwrap();
        assert!(matches!(event2, StreamEvent::TextDelta { .. }));

        let event3 = event_stream.next_event().await.unwrap().unwrap();
        assert!(matches!(event3, StreamEvent::TextDelta { .. }));

        let event4 = event_stream.next_event().await.unwrap();
        assert!(event4.is_none());
    }

    #[tokio::test]
    async fn test_batch_event_stream() {
        // 创建测试 EventStream
        struct MockEventStream {
            count: usize,
        }

        #[async_trait::async_trait]
        impl EventStream for MockEventStream {
            async fn next_event(&mut self) -> Result<Option<StreamEvent>, ApiError> {
                if self.count > 0 {
                    self.count -= 1;
                    Ok(Some(StreamEvent::TextDelta {
                        text: format!("delta {}", self.count),
                    }))
                } else {
                    Ok(None)
                }
            }
        }

        let mock = MockEventStream { count: 15 };
        let mut batch_stream = BatchEventStream::new(Box::new(mock), 5);

        // 测试批量获取
        let batch1 = batch_stream.next_batch().await.unwrap();
        assert_eq!(batch1.len(), 5);

        let batch2 = batch_stream.next_batch().await.unwrap();
        assert_eq!(batch2.len(), 5);

        let batch3 = batch_stream.next_batch().await.unwrap();
        assert_eq!(batch3.len(), 5);

        let batch4 = batch_stream.next_batch().await.unwrap();
        assert_eq!(batch4.len(), 0);
    }
}
