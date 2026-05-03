//! ThreadEvent TDD 测试 - 消息路由事件系统
//!
//! 测试策略：
//! 1. 单元测试：ThreadEvent 枚举本身
//! 2. 集成测试：ThreadEvent channel 发送和接收
//! 3. 路由测试：消息正确分发到对应线程

#[cfg(test)]
mod tests {
    use crate::thread::*;
    use crate::thread::ThreadEvent;
    use std::time::Duration;
    use tokio::sync::mpsc;

    // ========================================================================
    // ThreadEvent 枚举测试
    // ========================================================================

    #[test]
    fn test_thread_event_new_message() {
        let thread_id = ThreadId::new();
        let message = "Hello from thread".to_string();

        let event = ThreadEvent::NewMessage {
            thread_id,
            message: message.clone(),
        };

        match event {
            ThreadEvent::NewMessage {
                thread_id: id,
                message: msg,
            } => {
                assert_eq!(id, thread_id);
                assert_eq!(msg, message);
            }
            _ => panic!("Wrong event type"),
        }
    }

    #[test]
    fn test_thread_event_status_change() {
        let thread_id = ThreadId::new();
        let status = ThreadStatus::Paused;

        let event = ThreadEvent::StatusChange {
            thread_id,
            status,
        };

        match event {
            ThreadEvent::StatusChange {
                thread_id: id,
                status: s,
            } => {
                assert_eq!(id, thread_id);
                assert_eq!(s, status);
            }
            _ => panic!("Wrong event type"),
        }
    }

    #[test]
    fn test_thread_event_closed() {
        let thread_id = ThreadId::new();

        let event = ThreadEvent::Closed { thread_id };

        match event {
            ThreadEvent::Closed { thread_id: id } => {
                assert_eq!(id, thread_id);
            }
            _ => panic!("Wrong event type"),
        }
    }

    // ========================================================================
    // ThreadEvent Channel 发送/接收测试
    // ========================================================================

    #[tokio::test]
    async fn test_thread_event_channel_send_recv() {
        let (tx, mut rx) = mpsc::unbounded_channel::<ThreadEvent>();

        let thread_id = ThreadId::new();
        let event = ThreadEvent::NewMessage {
            thread_id,
            message: "Test message".to_string(),
        };

        // 发送事件
        tx.send(event).unwrap();

        // 接收事件
        let received = rx.recv().await.unwrap();
        match received {
            ThreadEvent::NewMessage { thread_id: _, message } => {
                assert_eq!(message, "Test message");
            }
            _ => panic!("Wrong event type"),
        }
    }

    #[tokio::test]
    async fn test_thread_event_multiple_events() {
        let (tx, mut rx) = mpsc::unbounded_channel::<ThreadEvent>();

        let thread_id = ThreadId::new();

        // 发送多个事件
        tx.send(ThreadEvent::NewMessage {
            thread_id,
            message: "Message 1".to_string(),
        })
        .unwrap();

        tx.send(ThreadEvent::StatusChange {
            thread_id,
            status: ThreadStatus::Paused,
        })
        .unwrap();

        // 接收并验证
        let event1 = rx.recv().await.unwrap();
        match event1 {
            ThreadEvent::NewMessage { message, .. } => {
                assert_eq!(message, "Message 1");
            }
            _ => panic!("Expected NewMessage"),
        }

        let event2 = rx.recv().await.unwrap();
        match event2 {
            ThreadEvent::StatusChange { status, .. } => {
                assert_eq!(status, ThreadStatus::Paused);
            }
            _ => panic!("Expected StatusChange"),
        }
    }

    // ========================================================================
    // ThreadEvent 路由测试
    // ========================================================================

    #[tokio::test]
    async fn test_thread_event_message_routing() {
        let mut store = ThreadStore::new();
        let mut messages = ThreadMessages::new();
        let (tx, mut rx) = mpsc::unbounded_channel::<ThreadEvent>();

        let primary_id = store.primary_id();
        let side_id = store.create_side_thread(primary_id, Some("Query".to_string()));

        // 发送消息到主线程
        tx.send(ThreadEvent::NewMessage {
            thread_id: primary_id,
            message: "Main thread message".to_string(),
        })
        .unwrap();

        // 发送消息到侧线程
        tx.send(ThreadEvent::NewMessage {
            thread_id: side_id,
            message: "Side thread message".to_string(),
        })
        .unwrap();

        // 模拟路由处理
        let event1 = rx.recv().await.unwrap();
        if let ThreadEvent::NewMessage {
            thread_id,
            message,
        } = event1
        {
            messages.push(thread_id, Message::user(message));
        }

        let event2 = rx.recv().await.unwrap();
        if let ThreadEvent::NewMessage {
            thread_id,
            message,
        } = event2
        {
            messages.push(thread_id, Message::user(message));
        }

        // 验证消息路由正确
        let primary_msgs = messages.get(primary_id);
        assert_eq!(primary_msgs.unwrap().len(), 1);
        assert_eq!(primary_msgs.unwrap()[0].content, "Main thread message");

        let side_msgs = messages.get(side_id);
        assert_eq!(side_msgs.unwrap().len(), 1);
        assert_eq!(side_msgs.unwrap()[0].content, "Side thread message");
    }

    #[tokio::test]
    async fn test_thread_event_status_update() {
        let mut store = ThreadStore::new();
        let (tx, mut rx) = mpsc::unbounded_channel::<ThreadEvent>();

        let primary_id = store.primary_id();
        let side_id = store.create_side_thread(primary_id, Some("Query".to_string()));

        // 发送状态变更事件
        tx.send(ThreadEvent::StatusChange {
            thread_id: side_id,
            status: ThreadStatus::Paused,
        })
        .unwrap();

        // 模拟路由处理
        let event = rx.recv().await.unwrap();
        if let ThreadEvent::StatusChange { thread_id, status } = event {
            store.update_status(thread_id, status);
        }

        // 验证状态更新
        let side_thread = store.get_thread(side_id).unwrap();
        assert_eq!(side_thread.status, ThreadStatus::Paused);
    }

    #[tokio::test]
    async fn test_thread_event_closed_cleanup() {
        let mut store = ThreadStore::new();
        let mut messages = ThreadMessages::new();
        let (tx, mut rx) = mpsc::unbounded_channel::<ThreadEvent>();

        let primary_id = store.primary_id();
        let side_id = store.create_side_thread(primary_id, Some("Query".to_string()));

        // 添加一些消息
        messages.push(side_id, Message::user("Test".to_string()));
        assert_eq!(messages.get(side_id).unwrap().len(), 1);

        // 发送关闭事件
        tx.send(ThreadEvent::Closed { thread_id: side_id })
            .unwrap();

        // 模拟路由处理
        let event = rx.recv().await.unwrap();
        if let ThreadEvent::Closed { thread_id } = event {
            store.remove_thread(thread_id);
            messages.remove_thread(thread_id);
        }

        // 验证清理
        assert_eq!(store.len(), 1); // 只剩主线程
        assert!(messages.get(side_id).is_none());
    }

    // ========================================================================
    // 边界条件测试
    // ========================================================================

    #[test]
    fn test_thread_event_copy() {
        // ThreadEvent 应该支持 Copy（如果需要）
        // 目前我们使用 Channel 发送，不需要 Copy
        let event1 = ThreadEvent::NewMessage {
            thread_id: ThreadId::new(),
            message: "Test".to_string(),
        };

        // ThreadEvent::NewMessage 包含 String，不是 Copy
        // 但可以通过克隆发送
        let _ = event1.clone();
    }

    #[tokio::test]
    async fn test_thread_event_channel_capacity() {
        // unbounded_channel 理论上无容量限制
        let (tx, mut rx) = mpsc::unbounded_channel::<ThreadEvent>();

        let thread_id = ThreadId::new();

        // 发送大量事件
        for i in 0..100 {
            tx.send(ThreadEvent::NewMessage {
                thread_id,
                message: format!("Message {}", i),
            })
            .unwrap();
        }

        // 接收并计数
        let mut count = 0;
        while timeout(Duration::from_millis(100), rx.recv()).await.is_ok() {
            count += 1;
        }

        assert_eq!(count, 100);
    }

    // ========================================================================
    // 辅助函数
    // ========================================================================

    async fn timeout<T, F>(duration: Duration, future: F) -> Result<T, ()>
    where
        F: std::future::Future<Output = T>,
    {
        tokio::time::timeout(duration, future).await.map_err(|_| ())
    }
}
