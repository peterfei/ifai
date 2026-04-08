//! 智能体通信通道
//!
//! 提供智能体之间通信的高级抽象

use super::message::{Message, MessageType, ControlMessage, StatusMessage, MessagePriority};
use super::{AgentId, MessageId, SessionId};
use super::bus::{MessageBus, RouteKey};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tokio::sync::{mpsc, RwLock};
use anyhow::Result;
use serde::{Deserialize, Serialize};

/// 通道 ID
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct ChannelId(pub String);

impl ChannelId {
    /// 生成新的通道 ID
    pub fn new() -> Self {
        use uuid::Uuid;
        Self(format!("ch_{}", Uuid::new_v4()))
    }

    /// 从字符串创建
    pub fn from_string(s: String) -> Self {
        Self(s)
    }

    /// 获取字符串表示
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl Default for ChannelId {
    fn default() -> Self {
        Self::new()
    }
}

/// 消息发送器
pub struct MessageSender {
    /// 发送者 ID
    agent_id: AgentId,

    /// 消息总线
    bus: Arc<MessageBus>,
}

impl MessageSender {
    /// 创建新的消息发送器
    pub fn new(agent_id: AgentId, bus: Arc<MessageBus>) -> Self {
        Self { agent_id, bus }
    }

    /// 发送消息
    pub async fn send(&self, mut message: Message) -> Result<()> {
        message.from = self.agent_id.clone();
        self.bus.send(message).await
    }

    /// 发送数据消息
    pub async fn send_data(
        &self,
        to: AgentId,
        data_type: impl Into<String>,
        payload: serde_json::Value,
    ) -> Result<()> {
        let msg = Message::data(self.agent_id.clone(), data_type, payload)
            .with_to(to);
        self.send(msg).await
    }

    /// 发送控制消息
    pub async fn send_control(&self, to: AgentId, command: ControlMessage) -> Result<()> {
        let msg = Message::control(self.agent_id.clone(), command)
            .with_to(to);
        self.send(msg).await
    }

    /// 发送状态消息
    pub async fn send_status(&self, to: AgentId, status: StatusMessage) -> Result<()> {
        let msg = Message::status(self.agent_id.clone(), status)
            .with_to(to);
        self.send(msg).await
    }

    /// 广播消息
    pub async fn broadcast(&self, message: Message) -> Result<()> {
        let mut msg = message;
        msg.from = self.agent_id.clone();
        self.bus.send(msg).await
    }

    /// 发布到主题
    pub async fn publish(&self, topic: String, message: Message) -> Result<()> {
        let mut msg = message;
        msg.from = self.agent_id.clone();
        self.bus.publish(topic, msg).await
    }
}

impl Clone for MessageSender {
    fn clone(&self) -> Self {
        Self {
            agent_id: self.agent_id.clone(),
            bus: Arc::clone(&self.bus),
        }
    }
}

/// 消息接收器
pub struct MessageReceiver {
    /// 接收者 ID
    agent_id: AgentId,

    /// 消息通道
    rx: mpsc::UnboundedReceiver<Message>,

    /// 消息总线（用于取消订阅）
    bus: Arc<MessageBus>,
}

impl MessageReceiver {
    /// 创建新的消息接收器
    pub fn new(agent_id: AgentId, rx: mpsc::UnboundedReceiver<Message>, bus: Arc<MessageBus>) -> Self {
        Self { agent_id, rx, bus }
    }

    /// 接收消息
    pub async fn recv(&mut self) -> Option<Message> {
        self.rx.recv().await
    }

    /// 尝试立即接收消息（不阻塞）
    pub fn try_recv(&mut self) -> Result<Message, mpsc::error::TryRecvError> {
        self.rx.try_recv()
    }

    /// 关闭接收器
    pub async fn close(self) {
        self.bus.unsubscribe(&self.agent_id).await.ok();
    }
}

/// 智能体通道
///
/// 提供完整的发送和接收功能
pub struct AgentChannel {
    /// 智能体 ID
    agent_id: AgentId,

    /// 通道 ID
    channel_id: ChannelId,

    /// 消息发送器
    sender: MessageSender,

    /// 消息接收器
    receiver: Option<MessageReceiver>,
}

impl AgentChannel {
    /// 创建新的智能体通道
    pub async fn new(
        agent_id: AgentId,
        bus: Arc<MessageBus>,
        routes: Vec<RouteKey>,
    ) -> Result<Self> {
        let routes_set: HashSet<RouteKey> = routes.into_iter().collect();
        let rx = bus.subscribe(agent_id.clone(), routes_set).await?;

        let sender = MessageSender::new(agent_id.clone(), Arc::clone(&bus));
        let receiver = Some(MessageReceiver::new(agent_id.clone(), rx, bus));

        Ok(Self {
            agent_id,
            channel_id: ChannelId::new(),
            sender,
            receiver,
        })
    }

    /// 创建点对点通道
    pub async fn direct(agent_id: AgentId, bus: Arc<MessageBus>) -> Result<Self> {
        Self::new(
            agent_id.clone(),
            bus,
            vec![RouteKey::Direct(agent_id)],
        ).await
    }

    /// 创建广播通道
    pub async fn broadcast(agent_id: AgentId, bus: Arc<MessageBus>) -> Result<Self> {
        Self::new(
            agent_id,
            bus,
            vec![RouteKey::Broadcast],
        ).await
    }

    /// 获取发送器
    pub fn sender(&self) -> &MessageSender {
        &self.sender
    }

    /// 获取接收器（消耗性）
    pub fn receiver(mut self) -> MessageReceiver {
        self.receiver.take().expect("Receiver already taken")
    }

    /// 分离发送器和接收器
    pub fn split(self) -> (MessageSender, MessageReceiver) {
        let receiver = self.receiver.expect("Receiver already taken");
        (self.sender, receiver)
    }

    /// 获取智能体 ID
    pub fn agent_id(&self) -> &AgentId {
        &self.agent_id
    }

    /// 获取通道 ID
    pub fn channel_id(&self) -> &ChannelId {
        &self.channel_id
    }
}

/// 会话
///
/// 用于管理一组相关的消息
#[derive(Clone)]
pub struct Session {
    /// 会话 ID
    id: SessionId,

    /// 参与者
    participants: Vec<AgentId>,

    /// 创建时间
    created_at: i64,

    /// 消息计数
    message_count: Arc<RwLock<usize>>,
}

impl Session {
    /// 创建新会话
    pub fn new(participants: Vec<AgentId>) -> Self {
        use uuid::Uuid;
        Self {
            id: format!("session_{}", Uuid::new_v4()),
            participants,
            created_at: chrono::Utc::now().timestamp_millis(),
            message_count: Arc::new(RwLock::new(0)),
        }
    }

    /// 获取会话 ID
    pub fn id(&self) -> &str {
        &self.id
    }

    /// 获取参与者
    pub fn participants(&self) -> &[AgentId] {
        &self.participants
    }

    /// 检查是否为参与者
    pub fn is_participant(&self, agent_id: &AgentId) -> bool {
        self.participants.contains(agent_id)
    }

    /// 增加消息计数
    pub async fn increment_message_count(&self) {
        let mut count = self.message_count.write().await;
        *count += 1;
    }

    /// 获取消息计数
    pub async fn message_count(&self) -> usize {
        *self.message_count.read().await
    }
}

/// 会话管理器
///
/// 管理多个会话
pub struct SessionManager {
    /// 会话存储
    sessions: Arc<RwLock<HashMap<SessionId, Session>>>,
}

impl SessionManager {
    /// 创建新的会话管理器
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// 创建新会话
    pub async fn create_session(&self, participants: Vec<AgentId>) -> Session {
        let session = Session::new(participants);

        let mut sessions = self.sessions.write().await;
        sessions.insert(session.id.clone(), session.clone());

        session
    }

    /// 获取会话
    pub async fn get_session(&self, session_id: &str) -> Option<Session> {
        let sessions = self.sessions.read().await;
        sessions.get(session_id).cloned()
    }

    /// 删除会话
    pub async fn remove_session(&self, session_id: &str) -> Result<()> {
        let mut sessions = self.sessions.write().await;
        sessions.remove(session_id);
        Ok(())
    }

    /// 获取智能体的所有会话
    pub async fn get_agent_sessions(&self, agent_id: &AgentId) -> Vec<Session> {
        let sessions = self.sessions.read().await;
        sessions
            .values()
            .filter(|session| session.is_participant(agent_id))
            .cloned()
            .collect()
    }
}

impl Default for SessionManager {
    fn default() -> Self {
        Self::new()
    }
}

/// 请求-响应模式
///
/// 实现同步请求-响应通信
pub struct RequestResponse {
    /// 待处理的请求
    pending_requests: Arc<RwLock<HashMap<MessageId, tokio::sync::oneshot::Sender<Message>>>>,

    /// 消息发送器
    sender: MessageSender,
}

impl RequestResponse {
    /// 创建新的请求-响应处理器
    pub fn new(sender: MessageSender) -> Self {
        Self {
            pending_requests: Arc::new(RwLock::new(HashMap::new())),
            sender,
        }
    }

    /// 发送请求并等待响应
    pub async fn request(&self, to: AgentId, request: Message) -> Result<Message> {
        let message_id = request.message_id().to_string();
        let (tx, rx) = tokio::sync::oneshot::channel();

        // 注册待处理的请求
        {
            let mut pending = self.pending_requests.write().await;
            pending.insert(message_id.clone(), tx);
        }

        // 发送请求
        self.sender.send(request).await?;

        // 等待响应
        let response = rx.await?;
        Ok(response)
    }

    /// 响应请求
    pub async fn respond(&self, request: &Message, response: Message) -> Result<()> {
        let request_id = request.message_id();

        // 查找并移除待处理的请求
        let tx = {
            let mut pending = self.pending_requests.write().await;
            pending.remove(request_id)
        };

        if let Some(tx) = tx {
            // 发送响应
            let _ = tx.send(response);
            Ok(())
        } else {
            anyhow::bail!("No pending request found for {}", request_id);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::bus::MessageBus;

    #[tokio::test]
    async fn test_channel_id() {
        let id1 = ChannelId::new();
        let id2 = ChannelId::new();
        assert_ne!(id1, id2);

        let id3 = ChannelId::from_string("test_channel".to_string());
        assert_eq!(id3.as_str(), "test_channel");
    }

    #[tokio::test]
    async fn test_agent_channel_direct() {
        let bus = Arc::new(MessageBus::with_default_config());
        let channel = AgentChannel::direct("agent1".to_string(), Arc::clone(&bus)).await.unwrap();

        assert_eq!(channel.agent_id(), "agent1");
    }

    #[tokio::test]
    async fn test_send_and_receive() {
        let bus = Arc::new(MessageBus::with_default_config());

        // 创建接收通道
        let mut receiver = {
            let channel = AgentChannel::direct("agent1".to_string(), Arc::clone(&bus)).await.unwrap();
            channel.receiver()
        };

        // 创建发送器
        let sender = MessageSender::new("sender".to_string(), bus);

        // 发送消息
        sender.send_data(
            "agent1".to_string(),
            "test",
            serde_json::json!("data"),
        ).await.unwrap();

        // 接收消息
        let msg = receiver.recv().await;
        assert!(msg.is_some());
        let received = msg.unwrap();
        assert_eq!(received.from, "sender");
        assert_eq!(received.to, Some("agent1".to_string()));
    }

    #[tokio::test]
    async fn test_session() {
        let participants = vec!["agent1".to_string(), "agent2".to_string()];
        let session = Session::new(participants);

        assert!(session.is_participant(&"agent1".to_string()));
        assert!(!session.is_participant(&"agent3".to_string()));

        session.increment_message_count().await;
        assert_eq!(session.message_count().await, 1);
    }

    #[tokio::test]
    async fn test_session_manager() {
        let manager = SessionManager::new();
        let participants = vec!["agent1".to_string()];
        let session = manager.create_session(participants).await;

        let retrieved = manager.get_session(session.id()).await;
        assert!(retrieved.is_some());
        assert_eq!(retrieved.unwrap().id(), session.id());

        let agent_sessions = manager.get_agent_sessions(&"agent1".to_string()).await;
        assert_eq!(agent_sessions.len(), 1);
    }

    #[tokio::test]
    async fn test_request_response() {
        let bus = Arc::new(MessageBus::with_default_config());
        let sender = MessageSender::new("client".to_string(), bus);
        let req_res = RequestResponse::new(sender);

        // 注意：这个测试需要更复杂的设置来完整测试请求-响应模式
        // 在实际使用中，响应方需要能够访问 RequestResponse 实例
        assert_eq!(req_res.pending_requests.read().await.len(), 0);
    }
}
