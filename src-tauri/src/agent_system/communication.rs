//! 智能体通信系统
//!
//! 提供智能体之间的消息传递、点对点通信和广播功能

pub mod message;
pub mod bus;
pub mod channel;

pub use message::{
    Message, MessageType, DataMessage, ControlMessage, StatusMessage,
    MessagePriority, MessageHeaders,
};
pub use bus::{MessageBus, BusConfig, EventBus};
pub use channel::{AgentChannel, ChannelId, MessageSender, MessageReceiver};

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{mpsc, RwLock};
use anyhow::Result;
use chrono::{DateTime, Utc};

/// 消息 ID 类型
pub type MessageId = String;

/// 智能体 ID 类型
pub type AgentId = String;

/// 会话 ID 类型（用于关联一组消息）
pub type SessionId = String;
