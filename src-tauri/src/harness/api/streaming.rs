use async_stream::stream;
use futures_core::Stream;
use serde::{Deserialize, Serialize};
/**
 * 🔥 务实的 next_event 接口（折中方案）
 *
 * 设计理念：
 * - 保留现有 callback 架构
 * - 添加 next_event 包装器
 * - 零破坏性变更
 * - 渐进式迁移
 */
use std::collections::VecDeque;
use std::pin::Pin;

use super::types::{ApiError, StreamEvent};

// ============================================================================
// EventStream Trait: 统一的 next_event 接口
// ============================================================================

/// 🔥 简洁的事件流 Trait（务实：不需要 Sync，流式处理不需要跨线程共享）
#[async_trait::async_trait]
pub trait EventStream: Send {
    /// 获取下一个事件（参考 claw-code）
    async fn next_event(&mut self) -> Result<Option<StreamEvent>, ApiError>;
}

// ============================================================================
// StreamWrapper: 将 callback 包装为 next_event
// ============================================================================

/// 🔥 务实的包装器：将现有 callback 风格转换为 next_event 风格
pub struct StreamWrapper<F>
where
    F: Fn(StreamEvent) + Send + Sync,
{
    callback: F,
    buffer: VecDeque<StreamEvent>,
    done: bool,
}

impl<F> StreamWrapper<F>
where
    F: Fn(StreamEvent) + Send + Sync,
{
    pub fn new(callback: F) -> Self {
        Self {
            callback,
            buffer: VecDeque::new(),
            done: false,
        }
    }

    /// 🔥 处理事件（由生产者调用）
    pub fn process(&mut self, event: StreamEvent) {
        self.buffer.push_back(event);
    }

    /// 🔥 完成流（由生产者调用）
    pub fn finish(&mut self) {
        self.done = true;
    }
}

#[async_trait::async_trait]
impl<F> EventStream for StreamWrapper<F>
where
    F: Fn(StreamEvent) + Send + Sync,
{
    async fn next_event(&mut self) -> Result<Option<StreamEvent>, ApiError> {
        // 1. 优先从缓冲区获取
        if let Some(event) = self.buffer.pop_front() {
            // 调用原始 callback
            (self.callback)(event.clone());
            return Ok(Some(event));
        }

        // 2. 检查是否完成
        if self.done {
            return Ok(None);
        }

        // 3. 等待新事件（简单实现）
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;

        // 再次检查
        if let Some(event) = self.buffer.pop_front() {
            (self.callback)(event.clone());
            Ok(Some(event))
        } else {
            Ok(None)
        }
    }
}

// ============================================================================
// CallbackStream: 基于 callback 的 Stream 实现
// ============================================================================

/// 🔥 将 callback 函数转换为 Stream
pub fn callback_stream<F>(
    callback: F,
) -> Pin<Box<dyn Stream<Item = Result<StreamEvent, ApiError>> + Send>>
where
    F: Fn(StreamEvent) + Send + Sync + 'static,
{
    Box::pin(stream! {
        let mut wrapper = StreamWrapper::new(callback);

        loop {
            match wrapper.next_event().await {
                Ok(Some(event)) => {
                    yield Ok(event);
                }
                Ok(None) => break,
                Err(e) => {
                    yield Err(e);
                    break;
                }
            }
        }
    })
}

// ============================================================================
// 测试
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_stream_wrapper() {
        let events = vec![1, 2, 3, 4, 5]
            .into_iter()
            .map(|i| StreamEvent::TextDelta {
                text: format!("delta {}", i),
            })
            .collect::<Vec<_>>();

        let mut wrapper = StreamWrapper::new(|event| {
            println!("Received: {:?}", event);
        });

        for event in events {
            wrapper.process(event);
        }
        wrapper.finish();

        // 验证缓冲区
        assert_eq!(wrapper.buffer.len(), 5);
    }

    #[tokio::test]
    async fn test_event_stream_trait() {
        let mut wrapper = StreamWrapper::new(|event| {
            println!("Received: {:?}", event);
        });

        wrapper.process(StreamEvent::TextDelta {
            text: "test".to_string(),
        });
        wrapper.finish();

        let result = wrapper.next_event().await;
        assert!(result.is_ok());
        assert!(result.unwrap().is_some());
    }
}
