//! 消息总线
//!
//! 实现智能体之间的消息路由和分发

use super::message::{Message, MessagePriority};
use super::{AgentId, MessageId};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tokio::sync::{mpsc, RwLock, broadcast};
use anyhow::Result;
use serde::{Deserialize, Serialize};

/// 消息总线配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BusConfig {
    /// 消息队列大小
    pub queue_size: usize,

    /// 广播频道容量
    pub broadcast_capacity: usize,

    /// 是否启用消息持久化
    pub enable_persistence: bool,

    /// 消息过期时间（毫秒，None 表示永不过期）
    pub message_ttl_ms: Option<u64>,
}

impl Default for BusConfig {
    fn default() -> Self {
        Self {
            queue_size: 1000,
            broadcast_capacity: 100,
            enable_persistence: false,
            message_ttl_ms: None,
        }
    }
}

/// 路由键
///
/// 用于消息路由和订阅
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum RouteKey {
    /// 点对点路由（特定智能体）
    Direct(AgentId),

    /// 广播路由（所有智能体）
    Broadcast,

    /// 主题路由（按主题订阅）
    Topic(String),

    /// 组播路由（按组订阅）
    Group(String),
}

/// 消息订阅者
#[derive(Debug, Clone)]
struct Subscriber {
    /// 订阅者 ID
    id: AgentId,

    /// 消息发送器
    sender: mpsc::UnboundedSender<Message>,

    /// 订阅的路由键
    routes: HashSet<RouteKey>,
}

/// 消息总线
///
/// 负责消息的路由和分发
pub struct MessageBus {
    /// 配置
    config: BusConfig,

    /// 订阅者
    subscribers: Arc<RwLock<HashMap<AgentId, Subscriber>>>,

    /// 广播发送器
    broadcast_tx: broadcast::Sender<Message>,

    /// 消息历史（用于重放）
    message_history: Arc<RwLock<Vec<Message>>>,

    /// 最大历史记录数
    max_history_size: usize,
}

impl MessageBus {
    /// 创建新的消息总线
    pub fn new(config: BusConfig) -> Self {
        let (broadcast_tx, _) = broadcast::channel(config.broadcast_capacity);

        Self {
            config,
            subscribers: Arc::new(RwLock::new(HashMap::new())),
            broadcast_tx,
            message_history: Arc::new(RwLock::new(Vec::new())),
            max_history_size: 1000,
        }
    }

    /// 使用默认配置创建消息总线
    pub fn with_default_config() -> Self {
        Self::new(BusConfig::default())
    }

    /// 订阅消息
    ///
    /// 返回一个消息接收器
    pub async fn subscribe(&self, agent_id: AgentId, routes: HashSet<RouteKey>) -> Result<mpsc::UnboundedReceiver<Message>> {
        let (tx, rx) = mpsc::unbounded_channel();

        let subscriber = Subscriber {
            id: agent_id.clone(),
            sender: tx,
            routes,
        };

        {
            let mut subscribers = self.subscribers.write().await;
            subscribers.insert(agent_id, subscriber);
        }

        Ok(rx)
    }

    /// 取消订阅
    pub async fn unsubscribe(&self, agent_id: &AgentId) -> Result<()> {
        let mut subscribers = self.subscribers.write().await;
        subscribers.remove(agent_id);
        Ok(())
    }

    /// 发送点对点消息
    pub async fn send(&self, mut message: Message) -> Result<()> {
        // 设置 TTL
        if let Some(ttl) = self.config.message_ttl_ms {
            let now = chrono::Utc::now().timestamp_millis();
            message.headers.expires_at = Some(now + ttl as i64);
        }

        // 保存到历史记录
        self.save_to_history(message.clone()).await;

        // 获取目标接收者
        let to = message.to.clone();
        let from = message.from.clone();

        if let Some(target_id) = to {
            // 点对点消息
            self.send_to_agent(target_id, message).await?;
        } else {
            // 广播消息
            self.broadcast(message).await?;
        }

        Ok(())
    }

    /// 发送到特定智能体
    async fn send_to_agent(&self, agent_id: AgentId, message: Message) -> Result<()> {
        let subscribers = self.subscribers.read().await;

        if let Some(subscriber) = subscribers.get(&agent_id) {
            if let Err(_) = subscriber.sender.send(message) {
                // 发送失败，可能是接收者已关闭
                anyhow::bail!("Failed to send message to agent {}", agent_id);
            }
        } else {
            anyhow::bail!("Agent {} not found", agent_id);
        }

        Ok(())
    }

    /// 广播消息到所有订阅者
    async fn broadcast(&self, message: Message) -> Result<()> {
        let _ = self.broadcast_tx.send(message.clone());

        let subscribers = self.subscribers.read().await;
        let mut failed_senders = Vec::new();

        for (id, subscriber) in subscribers.iter() {
            // 检查订阅者是否订阅了广播
            if subscriber.routes.contains(&RouteKey::Broadcast) {
                if let Err(_) = subscriber.sender.send(message.clone()) {
                    failed_senders.push(id.clone());
                }
            }
        }

        // 清理失败的发送者
        if !failed_senders.is_empty() {
            let mut subscribers = self.subscribers.write().await;
            for id in failed_senders {
                subscribers.remove(&id);
            }
        }

        Ok(())
    }

    /// 按主题发送消息
    pub async fn publish(&self, topic: String, message: Message) -> Result<()> {
        let subscribers = self.subscribers.read().await;
        let mut failed_senders = Vec::new();

        for (id, subscriber) in subscribers.iter() {
            // 检查是否订阅了该主题
            if subscriber.routes.contains(&RouteKey::Topic(topic.clone())) {
                if let Err(_) = subscriber.sender.send(message.clone()) {
                    failed_senders.push(id.clone());
                }
            }
        }

        // 清理失败的发送者
        if !failed_senders.is_empty() {
            let mut subscribers = self.subscribers.write().await;
            for id in failed_senders {
                subscribers.remove(&id);
            }
        }

        Ok(())
    }

    /// 订阅广播消息
    pub async fn subscribe_broadcast(&self, agent_id: AgentId) -> Result<broadcast::Receiver<Message>> {
        Ok(self.broadcast_tx.subscribe())
    }

    /// 保存消息到历史记录
    async fn save_to_history(&self, message: Message) {
        let mut history = self.message_history.write().await;
        history.push(message);

        // 限制历史记录大小
        if history.len() > self.max_history_size {
            history.remove(0);
        }
    }

    /// 获取消息历史
    pub async fn get_history(&self, limit: Option<usize>) -> Vec<Message> {
        let history = self.message_history.read().await;

        if let Some(limit) = limit {
            let start = if history.len() > limit {
                history.len() - limit
            } else {
                0
            };
            history[start..].to_vec()
        } else {
            history.clone()
        }
    }

    /// 获取特定会话的消息
    pub async fn get_session_messages(&self, session_id: &str) -> Vec<Message> {
        let history = self.message_history.read().await;
        history
            .iter()
            .filter(|msg| msg.session_id() == Some(session_id))
            .cloned()
            .collect()
    }

    /// 获取订阅者数量
    pub async fn subscriber_count(&self) -> usize {
        let subscribers = self.subscribers.read().await;
        subscribers.len()
    }

    /// 获取所有订阅者 ID
    pub async fn get_subscribers(&self) -> Vec<AgentId> {
        let subscribers = self.subscribers.read().await;
        subscribers.keys().cloned().collect()
    }
}

/// 事件总线
///
/// 用于发布和订阅系统级事件
pub struct EventBus {
    /// 内部消息总线
    bus: MessageBus,

    /// 事件主题
    topics: Arc<RwLock<HashSet<String>>>,
}

impl EventBus {
    /// 创建新的事件总线
    pub fn new() -> Self {
        Self {
            bus: MessageBus::with_default_config(),
            topics: Arc::new(RwLock::new(HashSet::new())),
        }
    }

    /// 发布事件
    pub async fn publish(&self, topic: String, event: Message) -> Result<()> {
        // 确保主题存在
        {
            let mut topics = self.topics.write().await;
            topics.insert(topic.clone());
        }

        self.bus.publish(topic, event).await
    }

    /// 订阅事件
    pub async fn subscribe(&self, agent_id: AgentId, topics: Vec<String>) -> Result<mpsc::UnboundedReceiver<Message>> {
        let routes: HashSet<RouteKey> = topics
            .into_iter()
            .map(RouteKey::Topic)
            .collect();

        // 确保主题存在
        {
            let mut all_topics = self.topics.write().await;
            for route in &routes {
                if let RouteKey::Topic(topic) = route {
                    all_topics.insert(topic.clone());
                }
            }
        }

        self.bus.subscribe(agent_id, routes).await
    }

    /// 获取所有主题
    pub async fn get_topics(&self) -> Vec<String> {
        let topics = self.topics.read().await;
        topics.iter().cloned().collect()
    }
}

impl Default for EventBus {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent_system::communication::message::{DataMessage, MessageType};

    #[tokio::test]
    async fn test_message_bus_creation() {
        let bus = MessageBus::with_default_config();
        assert_eq!(bus.subscriber_count().await, 0);
    }

    #[tokio::test]
    async fn test_subscribe_unsubscribe() {
        let bus = MessageBus::with_default_config();
        let agent_id = "agent1".to_string();

        let mut routes = HashSet::new();
        routes.insert(RouteKey::Broadcast);

        let mut rx = bus.subscribe(agent_id.clone(), routes).await.unwrap();
        assert_eq!(bus.subscriber_count().await, 1);

        bus.unsubscribe(&agent_id).await.unwrap();
        assert_eq!(bus.subscriber_count().await, 0);
    }

    #[tokio::test]
    async fn test_send_direct_message() {
        let bus = MessageBus::with_default_config();

        // 订阅者 1
        let mut routes1 = HashSet::new();
        routes1.insert(RouteKey::Direct("agent1".to_string()));
        let mut rx1 = bus.subscribe("agent1".to_string(), routes1).await.unwrap();

        // 订阅者 2
        let mut routes2 = HashSet::new();
        routes2.insert(RouteKey::Direct("agent2".to_string()));
        let mut rx2 = bus.subscribe("agent2".to_string(), routes2).await.unwrap();

        // 发送消息给 agent1
        let msg = Message::data(
            "sender".to_string(),
            "test",
            serde_json::json!("data"),
        )
        .with_to("agent1".to_string());

        bus.send(msg).await.unwrap();

        // 只有 agent1 应该收到消息
        let received1 = rx1.recv().await;
        let received2 = rx2.try_recv();

        assert!(received1.is_some());
        assert!(matches!(received2, Err(mpsc::error::TryRecvError::Empty)));
    }

    #[tokio::test]
    async fn test_broadcast_message() {
        let bus = MessageBus::with_default_config();

        // 订阅者 1
        let mut routes1 = HashSet::new();
        routes1.insert(RouteKey::Broadcast);
        let mut rx1 = bus.subscribe("agent1".to_string(), routes1).await.unwrap();

        // 订阅者 2
        let mut routes2 = HashSet::new();
        routes2.insert(RouteKey::Broadcast);
        let mut rx2 = bus.subscribe("agent2".to_string(), routes2).await.unwrap();

        // 广播消息
        let msg = Message::data(
            "sender".to_string(),
            "test",
            serde_json::json!("data"),
        );

        bus.send(msg).await.unwrap();

        // 两个订阅者都应该收到消息
        let received1 = rx1.recv().await;
        let received2 = rx2.recv().await;

        assert!(received1.is_some());
        assert!(received2.is_some());
    }

    #[tokio::test]
    async fn test_message_history() {
        let bus = MessageBus::with_default_config();

        let msg1 = Message::data(
            "sender".to_string(),
            "test",
            serde_json::json!("data1"),
        )
        .with_session("session1".to_string());

        let msg2 = Message::data(
            "sender".to_string(),
            "test",
            serde_json::json!("data2"),
        )
        .with_session("session2".to_string());

        bus.send(msg1).await.unwrap();
        bus.send(msg2).await.unwrap();

        let history = bus.get_history(None).await;
        assert_eq!(history.len(), 2);

        let session1_msgs = bus.get_session_messages("session1").await;
        assert_eq!(session1_msgs.len(), 1);
    }

    #[tokio::test]
    async fn test_event_bus() {
        let event_bus = EventBus::new();

        let agent_id = "agent1".to_string();
        let mut rx = event_bus.subscribe(agent_id.clone(), vec!["topic1".to_string()]).await.unwrap();

        let msg = Message::data(
            "sender".to_string(),
            "event",
            serde_json::json!("data"),
        );

        event_bus.publish("topic1".to_string(), msg).await.unwrap();

        let received = rx.recv().await;
        assert!(received.is_some());

        let topics = event_bus.get_topics().await;
        assert!(topics.contains(&"topic1".to_string()));
    }

    #[test]
    fn test_route_key() {
        let key1 = RouteKey::Direct("agent1".to_string());
        let key2 = RouteKey::Direct("agent1".to_string());
        let key3 = RouteKey::Direct("agent2".to_string());
        let key4 = RouteKey::Broadcast;

        assert_eq!(key1, key2);
        assert_ne!(key1, key3);
        assert_ne!(key1, key4);
    }
}
