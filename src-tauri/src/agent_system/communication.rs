//! 智能体通信系统
//!
//! 提供智能体之间的消息传递、点对点通信和广播功能

pub mod bus;
pub mod channel;
pub mod message;

pub use bus::{BusConfig, EventBus, MessageBus};
pub use channel::{AgentChannel, ChannelId, MessageReceiver, MessageSender};
pub use message::{
    ControlMessage, DataMessage, Message, MessageHeaders, MessagePriority, MessageType,
    StatusMessage,
};

use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{mpsc, RwLock};

/// 消息 ID 类型
pub type MessageId = String;

/// 智能体 ID 类型
pub type AgentId = String;

/// 会话 ID 类型（用于关联一组消息）
pub type SessionId = String;
