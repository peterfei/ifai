//! 消息类型定义
//!
//! 定义智能体之间通信的消息格式

use super::{AgentId, MessageId, SessionId};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// 消息优先级
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MessagePriority {
    /// 低优先级
    Low = 0,
    /// 普通优先级
    Normal = 1,
    /// 高优先级
    High = 2,
    /// 紧急
    Critical = 3,
}

impl Default for MessagePriority {
    fn default() -> Self {
        Self::Normal
    }
}

/// 消息头
///
/// 包含消息的元数据信息
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct MessageHeaders {
    /// 消息 ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message_id: Option<MessageId>,

    /// 会话 ID（用于关联一组消息）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<SessionId>,

    /// 消息优先级
    #[serde(default)]
    pub priority: MessagePriority,

    /// 时间戳
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<i64>,

    /// 过期时间（毫秒时间戳）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<i64>,

    /// 自定义属性
    #[serde(flatten)]
    pub custom: HashMap<String, serde_json::Value>,
}

impl MessageHeaders {
    /// 创建新的消息头
    pub fn new() -> Self {
        Self::default()
    }

    /// 设置消息 ID
    pub fn with_message_id(mut self, id: MessageId) -> Self {
        self.message_id = Some(id);
        self
    }

    /// 设置会话 ID
    pub fn with_session_id(mut self, session_id: SessionId) -> Self {
        self.session_id = Some(session_id);
        self
    }

    /// 设置优先级
    pub fn with_priority(mut self, priority: MessagePriority) -> Self {
        self.priority = priority;
        self
    }

    /// 设置时间戳
    pub fn with_timestamp(mut self, timestamp: i64) -> Self {
        self.timestamp = Some(timestamp);
        self
    }

    /// 设置过期时间
    pub fn with_expires_at(mut self, expires_at: i64) -> Self {
        self.expires_at = Some(expires_at);
        self
    }

    /// 添加自定义属性
    pub fn with_custom(mut self, key: String, value: serde_json::Value) -> Self {
        self.custom.insert(key, value);
        self
    }

    /// 检查是否过期
    pub fn is_expired(&self) -> bool {
        if let Some(expires_at) = self.expires_at {
            let now = chrono::Utc::now().timestamp_millis();
            now > expires_at
        } else {
            false
        }
    }
}

/// 数据消息
///
/// 用于智能体之间传递业务数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataMessage {
    /// 数据类型（用于标识数据格式）
    pub data_type: String,

    /// 数据内容
    pub payload: serde_json::Value,

    /// 数据元数据
    #[serde(default)]
    pub metadata: HashMap<String, String>,
}

impl DataMessage {
    /// 创建新的数据消息
    pub fn new(data_type: impl Into<String>, payload: serde_json::Value) -> Self {
        Self {
            data_type: data_type.into(),
            payload,
            metadata: HashMap::new(),
        }
    }

    /// 添加元数据
    pub fn with_metadata(mut self, key: String, value: String) -> Self {
        self.metadata.insert(key, value);
        self
    }

    /// 获取字符串数据
    pub fn get_string(&self) -> Option<&str> {
        self.payload.as_str()
    }

    /// 获取对象数据
    pub fn get_object(&self) -> Option<&serde_json::Map<String, serde_json::Value>> {
        self.payload.as_object()
    }
}

/// 控制消息
///
/// 用于控制智能体的行为和状态
#[derive(Debug, Clone)]
pub enum ControlMessage {
    /// 启动智能体
    Start {
        /// 智能体配置
        config: Option<serde_json::Value>,
    },

    /// 停止智能体
    Stop {
        /// 是否优雅停止（等待当前任务完成）
        graceful: bool,
    },

    /// 暂停智能体
    Pause,

    /// 恢复智能体
    Resume,

    /// 重置智能体状态
    Reset,

    /// 配置更新
    UpdateConfig {
        /// 新配置
        config: serde_json::Value,
    },

    /// 请求状态
    RequestStatus,

    /// 心跳检测
    Heartbeat {
        /// 序列号
        sequence: u64,
    },

    /// 自定义控制命令
    Custom {
        /// 命令名称
        command: String,
        /// 参数
        params: serde_json::Value,
    },
}

// 手动实现序列化
impl serde::Serialize for ControlMessage {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeMap;
        match self {
            ControlMessage::Start { config } => {
                let mut map = serializer.serialize_map(Some(1))?;
                map.serialize_entry("command", "start")?;
                if let Some(cfg) = config {
                    map.serialize_entry("config", cfg)?;
                }
                map.end()
            }
            ControlMessage::Stop { graceful } => {
                let mut map = serializer.serialize_map(Some(2))?;
                map.serialize_entry("command", "stop")?;
                map.serialize_entry("graceful", graceful)?;
                map.end()
            }
            ControlMessage::Pause => {
                let mut map = serializer.serialize_map(Some(1))?;
                map.serialize_entry("command", "pause")?;
                map.end()
            }
            ControlMessage::Resume => {
                let mut map = serializer.serialize_map(Some(1))?;
                map.serialize_entry("command", "resume")?;
                map.end()
            }
            ControlMessage::Reset => {
                let mut map = serializer.serialize_map(Some(1))?;
                map.serialize_entry("command", "reset")?;
                map.end()
            }
            ControlMessage::UpdateConfig { config } => {
                let mut map = serializer.serialize_map(Some(2))?;
                map.serialize_entry("command", "update_config")?;
                map.serialize_entry("config", config)?;
                map.end()
            }
            ControlMessage::RequestStatus => {
                let mut map = serializer.serialize_map(Some(1))?;
                map.serialize_entry("command", "request_status")?;
                map.end()
            }
            ControlMessage::Heartbeat { sequence } => {
                let mut map = serializer.serialize_map(Some(2))?;
                map.serialize_entry("command", "heartbeat")?;
                map.serialize_entry("sequence", sequence)?;
                map.end()
            }
            ControlMessage::Custom { command, params } => {
                let mut map = serializer.serialize_map(Some(2))?;
                map.serialize_entry("command", command)?;
                map.serialize_entry("params", params)?;
                map.end()
            }
        }
    }
}

impl<'de> serde::Deserialize<'de> for ControlMessage {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        use serde::de::{MapAccess, Visitor};
        use std::fmt;

        struct ControlMessageVisitor;

        impl<'de> Visitor<'de> for ControlMessageVisitor {
            type Value = ControlMessage;

            fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
                formatter.write_str("a control message")
            }

            fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
            where
                A: MapAccess<'de>,
            {
                let mut command = None;
                let mut config = None;
                let mut graceful = None;
                let mut sequence = None;
                let mut custom_command = None;
                let mut params = None;

                while let Some(key) = map.next_key::<String>()? {
                    match key.as_str() {
                        "command" => {
                            let cmd: String = map.next_value()?;
                            command = Some(cmd);
                        }
                        "config" => {
                            config = Some(map.next_value()?);
                        }
                        "graceful" => {
                            graceful = Some(map.next_value()?);
                        }
                        "sequence" => {
                            sequence = Some(map.next_value()?);
                        }
                        "params" => {
                            params = Some(map.next_value()?);
                        }
                        _ => {
                            map.next_value::<serde::de::IgnoredAny>()?;
                        }
                    }
                }

                let cmd = command.ok_or_else(|| serde::de::Error::missing_field("command"))?;

                match cmd.as_str() {
                    "start" => Ok(ControlMessage::Start { config }),
                    "stop" => {
                        let graceful = graceful.unwrap_or(false);
                        Ok(ControlMessage::Stop { graceful })
                    }
                    "pause" => Ok(ControlMessage::Pause),
                    "resume" => Ok(ControlMessage::Resume),
                    "reset" => Ok(ControlMessage::Reset),
                    "update_config" => {
                        let config =
                            config.ok_or_else(|| serde::de::Error::missing_field("config"))?;
                        Ok(ControlMessage::UpdateConfig { config })
                    }
                    "request_status" => Ok(ControlMessage::RequestStatus),
                    "heartbeat" => {
                        let sequence =
                            sequence.ok_or_else(|| serde::de::Error::missing_field("sequence"))?;
                        Ok(ControlMessage::Heartbeat { sequence })
                    }
                    _ => {
                        let custom_command = custom_command
                            .ok_or_else(|| serde::de::Error::missing_field("command"))?;
                        let params = params.unwrap_or(serde_json::Value::Null);
                        Ok(ControlMessage::Custom {
                            command: custom_command,
                            params,
                        })
                    }
                }
            }
        }

        deserializer.deserialize_any(ControlMessageVisitor)
    }
}

impl ControlMessage {
    /// 创建启动命令
    pub fn start() -> Self {
        Self::Start { config: None }
    }

    /// 创建带配置的启动命令
    pub fn start_with_config(config: serde_json::Value) -> Self {
        Self::Start {
            config: Some(config),
        }
    }

    /// 创建停止命令
    pub fn stop(graceful: bool) -> Self {
        Self::Stop { graceful }
    }

    /// 创建心跳命令
    pub fn heartbeat(sequence: u64) -> Self {
        Self::Heartbeat { sequence }
    }
}

/// 状态消息
///
/// 用于报告智能体的状态变化
#[derive(Debug, Clone)]
pub enum StatusMessage {
    /// 智能体已就绪
    Ready {
        /// 智能体能力描述
        capabilities: Vec<String>,
    },

    /// 智能体正在处理
    Processing {
        /// 当前进度（0.0 - 1.0）
        progress: f64,
        /// 当前任务描述
        task: Option<String>,
    },

    /// 智能体已完成任务
    Completed {
        /// 任务结果
        result: Option<serde_json::Value>,
        /// 执行时长（毫秒）
        duration_ms: Option<i64>,
    },

    /// 智能体遇到错误
    Error {
        /// 错误信息
        error: String,
        /// 错误码
        code: Option<String>,
        /// 错误详情
        details: Option<serde_json::Value>,
    },

    /// 智能体已停止
    Stopped {
        /// 停止原因
        reason: Option<String>,
    },

    /// 智能体健康状态
    Health {
        /// 是否健康
        healthy: bool,
        /// 健康指标
        metrics: HashMap<String, serde_json::Value>,
    },

    /// 自定义状态
    Custom {
        /// 状态类型
        status_type: String,
        /// 状态数据
        data: serde_json::Value,
    },
}

// 手动实现序列化
impl serde::Serialize for StatusMessage {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeMap;
        match self {
            StatusMessage::Ready { capabilities } => {
                let mut map = serializer.serialize_map(Some(2))?;
                map.serialize_entry("status", "ready")?;
                map.serialize_entry("capabilities", capabilities)?;
                map.end()
            }
            StatusMessage::Processing { progress, task } => {
                let mut map = serializer.serialize_map(Some(3))?;
                map.serialize_entry("status", "processing")?;
                map.serialize_entry("progress", progress)?;
                if let Some(t) = task {
                    map.serialize_entry("task", t)?;
                }
                map.end()
            }
            StatusMessage::Completed {
                result,
                duration_ms,
            } => {
                let mut map = serializer.serialize_map(Some(3))?;
                map.serialize_entry("status", "completed")?;
                if let Some(r) = result {
                    map.serialize_entry("result", r)?;
                }
                if let Some(d) = duration_ms {
                    map.serialize_entry("duration_ms", d)?;
                }
                map.end()
            }
            StatusMessage::Error {
                error,
                code,
                details,
            } => {
                let mut map = serializer.serialize_map(Some(4))?;
                map.serialize_entry("status", "error")?;
                map.serialize_entry("error", error)?;
                if let Some(c) = code {
                    map.serialize_entry("code", c)?;
                }
                if let Some(d) = details {
                    map.serialize_entry("details", d)?;
                }
                map.end()
            }
            StatusMessage::Stopped { reason } => {
                let mut map = serializer.serialize_map(Some(2))?;
                map.serialize_entry("status", "stopped")?;
                if let Some(r) = reason {
                    map.serialize_entry("reason", r)?;
                }
                map.end()
            }
            StatusMessage::Health { healthy, metrics } => {
                let mut map = serializer.serialize_map(Some(3))?;
                map.serialize_entry("status", "health")?;
                map.serialize_entry("healthy", healthy)?;
                map.serialize_entry("metrics", metrics)?;
                map.end()
            }
            StatusMessage::Custom { status_type, data } => {
                let mut map = serializer.serialize_map(Some(3))?;
                map.serialize_entry("status", status_type)?;
                map.serialize_entry("data", data)?;
                map.end()
            }
        }
    }
}

impl<'de> serde::Deserialize<'de> for StatusMessage {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        use serde::de::{MapAccess, Visitor};
        use std::fmt;

        struct StatusMessageVisitor;

        impl<'de> Visitor<'de> for StatusMessageVisitor {
            type Value = StatusMessage;

            fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
                formatter.write_str("a status message")
            }

            fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
            where
                A: MapAccess<'de>,
            {
                let mut status = None;
                let mut capabilities = None;
                let mut progress = None;
                let mut task = None;
                let mut result = None;
                let mut duration_ms = None;
                let mut error = None;
                let mut code = None;
                let mut details = None;
                let mut reason = None;
                let mut healthy = None;
                let mut metrics = None;
                let mut status_type: Option<String> = None;
                let mut data = None;

                while let Some(key) = map.next_key::<String>()? {
                    match key.as_str() {
                        "status" => {
                            let s: String = map.next_value()?;
                            status = Some(s);
                        }
                        "capabilities" => {
                            capabilities = Some(map.next_value()?);
                        }
                        "progress" => {
                            progress = Some(map.next_value()?);
                        }
                        "task" => {
                            task = Some(map.next_value()?);
                        }
                        "result" => {
                            result = Some(map.next_value()?);
                        }
                        "duration_ms" => {
                            duration_ms = Some(map.next_value()?);
                        }
                        "error" => {
                            error = Some(map.next_value()?);
                        }
                        "code" => {
                            code = Some(map.next_value()?);
                        }
                        "details" => {
                            details = Some(map.next_value()?);
                        }
                        "reason" => {
                            reason = Some(map.next_value()?);
                        }
                        "healthy" => {
                            healthy = Some(map.next_value()?);
                        }
                        "metrics" => {
                            metrics = Some(map.next_value()?);
                        }
                        "data" => {
                            data = Some(map.next_value()?);
                        }
                        _ => {
                            map.next_value::<serde::de::IgnoredAny>()?;
                        }
                    }
                }

                let status_str = status.ok_or_else(|| serde::de::Error::missing_field("status"))?;

                match status_str.as_str() {
                    "ready" => {
                        let capabilities = capabilities
                            .ok_or_else(|| serde::de::Error::missing_field("capabilities"))?;
                        Ok(StatusMessage::Ready { capabilities })
                    }
                    "processing" => {
                        let progress =
                            progress.ok_or_else(|| serde::de::Error::missing_field("progress"))?;
                        Ok(StatusMessage::Processing { progress, task })
                    }
                    "completed" => Ok(StatusMessage::Completed {
                        result,
                        duration_ms,
                    }),
                    "error" => {
                        let error =
                            error.ok_or_else(|| serde::de::Error::missing_field("error"))?;
                        Ok(StatusMessage::Error {
                            error,
                            code,
                            details,
                        })
                    }
                    "stopped" => Ok(StatusMessage::Stopped { reason }),
                    "health" => {
                        let healthy =
                            healthy.ok_or_else(|| serde::de::Error::missing_field("healthy"))?;
                        let metrics = metrics.unwrap_or_default();
                        Ok(StatusMessage::Health { healthy, metrics })
                    }
                    _ => {
                        let status_type = status_str;
                        let data = data.unwrap_or(serde_json::Value::Null);
                        Ok(StatusMessage::Custom { status_type, data })
                    }
                }
            }
        }

        deserializer.deserialize_any(StatusMessageVisitor)
    }
}

impl StatusMessage {
    /// 创建就绪状态
    pub fn ready(capabilities: Vec<String>) -> Self {
        Self::Ready { capabilities }
    }

    /// 创建处理中状态
    pub fn processing(progress: f64, task: Option<String>) -> Self {
        Self::Processing { progress, task }
    }

    /// 创建完成状态
    pub fn completed(result: Option<serde_json::Value>, duration_ms: Option<i64>) -> Self {
        Self::Completed {
            result,
            duration_ms,
        }
    }

    /// 创建错误状态
    pub fn error(error: String, code: Option<String>) -> Self {
        Self::Error {
            error,
            code,
            details: None,
        }
    }

    /// 创建停止状态
    pub fn stopped(reason: Option<String>) -> Self {
        Self::Stopped { reason }
    }

    /// 创建健康状态
    pub fn health(healthy: bool, metrics: HashMap<String, serde_json::Value>) -> Self {
        Self::Health { healthy, metrics }
    }
}

/// 消息类型
///
/// 统一的消息枚举，包含所有可能的消息类型
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum MessageType {
    /// 数据消息
    Data(DataMessage),

    /// 控制消息
    Control(ControlMessage),

    /// 状态消息
    Status(StatusMessage),
}

impl MessageType {
    /// 获取消息类型名称
    pub fn type_name(&self) -> &str {
        match self {
            Self::Data(_) => "data",
            Self::Control(_) => "control",
            Self::Status(_) => "status",
        }
    }

    /// 检查是否为数据消息
    pub fn is_data(&self) -> bool {
        matches!(self, Self::Data(_))
    }

    /// 检查是否为控制消息
    pub fn is_control(&self) -> bool {
        matches!(self, Self::Control(_))
    }

    /// 检查是否为状态消息
    pub fn is_status(&self) -> bool {
        matches!(self, Self::Status(_))
    }
}

/// 智能体消息
///
/// 完整的消息结构，包含头和体
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    /// 消息头
    #[serde(flatten)]
    pub headers: MessageHeaders,

    /// 发送者 ID
    pub from: AgentId,

    /// 接收者 ID
    ///
    /// - 如果是点对点消息，这是目标智能体的 ID
    /// - 如果是广播消息，可能为空或使用特殊标识符
    pub to: Option<AgentId>,

    /// 消息体
    pub body: MessageType,
}

impl Message {
    /// 创建新的消息
    pub fn new(from: AgentId, body: MessageType) -> Self {
        Self {
            headers: MessageHeaders::new()
                .with_message_id(Self::generate_message_id())
                .with_timestamp(chrono::Utc::now().timestamp_millis()),
            from,
            to: None,
            body,
        }
    }

    /// 设置接收者
    pub fn with_to(mut self, to: AgentId) -> Self {
        self.to = Some(to);
        self
    }

    /// 设置会话 ID
    pub fn with_session(mut self, session_id: SessionId) -> Self {
        self.headers = self.headers.with_session_id(session_id);
        self
    }

    /// 设置优先级
    pub fn with_priority(mut self, priority: MessagePriority) -> Self {
        self.headers = self.headers.with_priority(priority);
        self
    }

    /// 生成消息 ID
    fn generate_message_id() -> MessageId {
        use uuid::Uuid;
        format!("msg_{}", Uuid::new_v4())
    }

    /// 获取消息 ID
    pub fn message_id(&self) -> &str {
        self.headers.message_id.as_deref().unwrap_or("unknown")
    }

    /// 获取会话 ID
    pub fn session_id(&self) -> Option<&str> {
        self.headers.session_id.as_deref()
    }

    /// 检查是否过期
    pub fn is_expired(&self) -> bool {
        self.headers.is_expired()
    }

    /// 创建数据消息
    pub fn data(from: AgentId, data_type: impl Into<String>, payload: serde_json::Value) -> Self {
        Self::new(
            from,
            MessageType::Data(DataMessage::new(data_type, payload)),
        )
    }

    /// 创建控制消息
    pub fn control(from: AgentId, command: ControlMessage) -> Self {
        Self::new(from, MessageType::Control(command))
    }

    /// 创建状态消息
    pub fn status(from: AgentId, status: StatusMessage) -> Self {
        Self::new(from, MessageType::Status(status))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_message_headers() {
        let headers = MessageHeaders::new()
            .with_message_id("msg_123".to_string())
            .with_priority(MessagePriority::High);

        assert_eq!(headers.message_id, Some("msg_123".to_string()));
        assert_eq!(headers.priority, MessagePriority::High);
    }

    #[test]
    fn test_data_message() {
        let data = DataMessage::new("test_type", serde_json::json!("test_data"))
            .with_metadata("key1".to_string(), "value1".to_string());

        assert_eq!(data.data_type, "test_type");
        assert_eq!(data.get_string(), Some("test_data"));
        assert_eq!(data.metadata.get("key1"), Some(&"value1".to_string()));
    }

    #[test]
    fn test_control_messages() {
        let start = ControlMessage::start();
        assert!(matches!(start, ControlMessage::Start { .. }));

        let stop = ControlMessage::stop(true);
        assert!(matches!(stop, ControlMessage::Stop { graceful: true }));

        let heartbeat = ControlMessage::heartbeat(123);
        assert!(matches!(
            heartbeat,
            ControlMessage::Heartbeat { sequence: 123 }
        ));
    }

    #[test]
    fn test_status_messages() {
        let ready = StatusMessage::ready(vec!["task1".to_string()]);
        assert!(matches!(ready, StatusMessage::Ready { .. }));

        let processing = StatusMessage::processing(0.5, Some("task".to_string()));
        assert!(matches!(
            processing,
            StatusMessage::Processing { progress: 0.5, .. }
        ));

        let error = StatusMessage::error("error".to_string(), Some("E001".to_string()));
        assert!(matches!(error, StatusMessage::Error { .. }));
    }

    #[test]
    fn test_message_creation() {
        let msg = Message::data("agent1".to_string(), "test_type", serde_json::json!("data"))
            .with_to("agent2".to_string())
            .with_priority(MessagePriority::High);

        assert_eq!(msg.from, "agent1");
        assert_eq!(msg.to, Some("agent2".to_string()));
        assert!(msg.body.is_data());
        assert_eq!(msg.headers.priority, MessagePriority::High);
        assert!(msg.message_id().starts_with("msg_"));
    }

    #[test]
    fn test_message_types() {
        let data_msg = MessageType::Data(DataMessage::new("test", serde_json::json!(null)));
        assert!(data_msg.is_data());
        assert_eq!(data_msg.type_name(), "data");

        let control_msg = MessageType::Control(ControlMessage::start());
        assert!(control_msg.is_control());
        assert_eq!(control_msg.type_name(), "control");

        let status_msg = MessageType::Status(StatusMessage::ready(vec![]));
        assert!(status_msg.is_status());
        assert_eq!(status_msg.type_name(), "status");
    }

    #[test]
    fn test_message_expiration() {
        let mut headers = MessageHeaders::new();
        assert!(!headers.is_expired());

        headers.expires_at = Some(chrono::Utc::now().timestamp_millis() - 1000);
        assert!(headers.is_expired());

        headers.expires_at = Some(chrono::Utc::now().timestamp_millis() + 10000);
        assert!(!headers.is_expired());
    }

    #[test]
    fn test_message_with_session() {
        let msg = Message::data("agent1".to_string(), "test", serde_json::json!(null))
            .with_session("session_123".to_string());

        assert_eq!(msg.session_id(), Some("session_123"));
    }
}
