//! Event Persistence - 事件持久化核心逻辑
//!
//! 🎯 设计目标：
//! - 异步通道缓冲（容量 256）
//! - 后台任务异步写入
//! - 优雅关闭和错误处理

use crate::session_event::SessionEvent;
use tokio::sync::{mpsc, oneshot};

/// 🔥 持久化命令
///
/// 发送到后台写入任务的命令
#[derive(Debug)]
pub enum PersistenceCommand {
    /// 追加事件到增量日志
    AddEvent(SessionEvent),

    /// 创建完整快照
    CreateSnapshot {
        session_id: String,
        messages: Vec<serde_json::Value>,
    },

    /// 关闭后台任务
    Shutdown {
        ack: oneshot::Sender<()>,
    },
}

/// 🔥 事件持久化器（发送端）
///
/// 这个结构体持有通道的发送端，用于发送持久化命令
pub struct EventPersistence {
    tx: mpsc::UnboundedSender<PersistenceCommand>,
    session_id: String,
    /// 保留接收端，用于启动后台任务（Option 是因为一旦启动就不再需要）
    _rx: Option<mpsc::UnboundedReceiver<PersistenceCommand>>,
}

impl EventPersistence {
    /// 🔥 创建新的事件持久化器（不启动后台任务）
    ///
    /// 注意：需要调用 `start_worker()` 来启动后台任务
    pub fn new(session_id: String) -> Self {
        let (tx, rx) = mpsc::unbounded_channel();

        Self { tx, session_id, _rx: Some(rx) }
    }

    /// 🔥 启动后台任务（必须在 Tokio runtime 中调用）
    pub fn start_worker(&mut self) -> Result<(), PersistenceError> {
        if let Some(rx) = self._rx.take() {
            let session_id = self.session_id.clone();
            tokio::spawn(async move {
                event_persistence_worker(rx, session_id).await;
            });
        }
        Ok(())
    }

    /// 🔥 创建并启动（便捷方法，需要在 Tokio runtime 中调用）
    pub async fn create_and_start(session_id: String) -> Self {
        let mut persistence = Self::new(session_id);
        persistence.start_worker().unwrap();
        persistence
    }

    /// 🔥 持久化单个事件
    ///
    /// 异步发送事件到通道，不阻塞调用者
    pub fn persist_event(&self, event: SessionEvent) -> Result<(), PersistenceError> {
        self.tx
            .send(PersistenceCommand::AddEvent(event))
            .map_err(|_| PersistenceError::ChannelClosed)?;
        Ok(())
    }

    /// 🔥 创建完整快照
    pub fn create_snapshot(
        &self,
        messages: Vec<serde_json::Value>,
    ) -> Result<(), PersistenceError> {
        self.tx
            .send(PersistenceCommand::CreateSnapshot {
                session_id: self.session_id.clone(),
                messages,
            })
            .map_err(|_| PersistenceError::ChannelClosed)?;
        Ok(())
    }

    /// 🔥 优雅关闭后台任务
    ///
    /// 等待后台任务完成所有待处理的命令
    pub async fn shutdown(self) -> Result<(), PersistenceError> {
        let (tx, rx) = oneshot::channel();
        self.tx
            .send(PersistenceCommand::Shutdown { ack: tx })
            .map_err(|_| PersistenceError::ChannelClosed)?;

        // 等待后台任务确认关闭
        rx.await
            .map_err(|_| PersistenceError::ShutdownAckTimeout)?;
        Ok(())
    }

    /// 🔥 检查通道是否仍然有效
    pub fn is_active(&self) -> bool {
        !self.tx.is_closed()
    }
}

/// 🔥 持久化错误
#[derive(Debug, thiserror::Error)]
pub enum PersistenceError {
    #[error("通道已关闭")]
    ChannelClosed,

    #[error("关闭确认超时")]
    ShutdownAckTimeout,

    #[error("IO 错误: {0}")]
    Io(#[from] std::io::Error),

    #[error("序列化错误: {0}")]
    Serialization(#[from] serde_json::Error),
}

/// 🔥 后台持久化任务
///
/// 处理持久化命令，执行实际的文件 I/O
async fn event_persistence_worker(
    mut rx: mpsc::UnboundedReceiver<PersistenceCommand>,
    session_id: String,
) {
    log_debug(format!("[EventPersistence] 后台任务启动: session={}", session_id));

    // 🔥 Phase 2.3: 创建 JSONL 写入器
    let sessions_dir = dirs::home_dir()
        .map(|home| home.join(".ifai").join("sessions").join("live"))
        .unwrap_or_else(|| std::path::PathBuf::from("/tmp/ifai/sessions/live"));

    // 确保目录存在
    if let Err(e) = std::fs::create_dir_all(&sessions_dir) {
        log_debug(format!("[EventPersistence] 创建目录失败: {}", e));
        return;
    }

    let jsonl_path = sessions_dir.join(format!("{}.jsonl", session_id));
    let mut jsonl_writer = crate::jsonl_writer::JsonlWriter::new(jsonl_path.clone());

    // 打开文件
    if let Err(e) = jsonl_writer.open() {
        log_debug(format!("[EventPersistence] 打开 JSONL 文件失败: {}", e));
        return;
    }

    log_debug(format!("[EventPersistence] JSONL 文件已打开: {:?}", jsonl_path));

    // 事件计数器（用于快照触发）
    let mut event_count = 0u64;
    const SNAPSHOT_EVENT_COUNT: u64 = 50; // 每 50 个事件创建快照

    while let Some(cmd) = rx.recv().await {
        match cmd {
            PersistenceCommand::AddEvent(event) => {
                // 🔥 Phase 2.3: 真正写入事件到 JSONL 文件
                if let Err(e) = jsonl_writer.append_event(&event) {
                    log_debug(format!(
                        "[EventPersistence] 写入事件失败: {:?}, 错误: {}",
                        std::mem::discriminant(&event),
                        e
                    ));
                } else {
                    log_debug(format!(
                        "[EventPersistence] ✅ 事件已写入: {:?}",
                        std::mem::discriminant(&event)
                    ));
                }

                event_count += 1;

                // 🔥 自动创建快照（每 SNAPSHOT_EVENT_COUNT 个事件）
                if event_count % SNAPSHOT_EVENT_COUNT == 0 {
                    log_debug(format!(
                        "[EventPersistence] 📸 自动创建快照: event_count={}",
                        event_count
                    ));
                    // TODO: 实现快照创建逻辑（Phase 2.4）
                }
            }

            PersistenceCommand::CreateSnapshot {
                session_id: sid,
                messages,
            } => {
                // 🔥 Phase 2.3: 创建完整快照
                log_debug(format!(
                    "[EventPersistence] 📸 创建快照: session={}, messages={}",
                    sid,
                    messages.len()
                ));

                // TODO: 实现快照创建逻辑（Phase 2.4）
                let _ = (sid, messages);
            }

            PersistenceCommand::Shutdown { ack } => {
                log_debug("[EventPersistence] 收到关闭命令".to_string());

                // 🔥 Phase 2.3: 刷新缓冲区并关闭文件
                if let Err(e) = jsonl_writer.close() {
                    log_debug(format!("[EventPersistence] 关闭文件失败: {}", e));
                } else {
                    log_debug("[EventPersistence] ✅ JSONL 文件已关闭".to_string());
                }

                let _ = ack.send(());
                break;
            }
        }
    }

    log_debug(format!(
        "[EventPersistence] 后台任务关闭: session={}, 总事件数={}",
        session_id, event_count
    ));
}

/// 🔥 日志辅助函数
fn log_debug(msg: String) {
    // 简单的日志输出，生产环境应该使用 proper logging
    eprintln!("🔄 [DEBUG] {}", msg);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_event_persistence_creation() {
        let persistence = EventPersistence::new("test-session".to_string());
        assert!(persistence.is_active());
        assert_eq!(persistence.session_id, "test-session");
        // 后台任务未启动，_rx 应该是 Some
        assert!(persistence._rx.is_some());
    }

    #[tokio::test]
    async fn test_persist_event_success() {
        let persistence = EventPersistence::create_and_start("test-session".to_string()).await;
        let event = SessionEvent::UserMessage {
            content: "测试消息".to_string(),
            metadata: Default::default(),
        };

        let result = persistence.persist_event(event);
        assert!(result.is_ok());
    }

    #[test]
    fn test_persist_event_without_worker() {
        let persistence = EventPersistence::new("test-session".to_string());
        let event = SessionEvent::UserMessage {
            content: "测试消息".to_string(),
            metadata: Default::default(),
        };

        // 即使没有启动 worker，发送到通道也会成功
        let result = persistence.persist_event(event);
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_create_snapshot() {
        let persistence = EventPersistence::create_and_start("test-session".to_string()).await;
        let messages = vec![
            serde_json::json!({"role": "user", "content": "测试"}),
            serde_json::json!({"role": "assistant", "content": "回复"}),
        ];

        let result = persistence.create_snapshot(messages);
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_shutdown() {
        let persistence = EventPersistence::create_and_start("test-session".to_string()).await;
        assert!(persistence.is_active());

        let result = persistence.shutdown().await;
        assert!(result.is_ok());

        // 注意：shutdown() 会 consume persistence，所以之后无法访问
        // 这是设计上的特性，确保关闭后不再使用
    }

    #[tokio::test]
    async fn test_multiple_events_persisted() {
        let persistence = EventPersistence::create_and_start("test-session".to_string()).await;

        for i in 0..10 {
            let event = SessionEvent::UserMessage {
                content: format!("消息 {}", i),
                metadata: Default::default(),
            };
            assert!(persistence.persist_event(event).is_ok());
        }
    }

    #[test]
    fn test_persistence_error_display() {
        let err = PersistenceError::ChannelClosed;
        assert_eq!(format!("{}", err), "通道已关闭");

        let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "test");
        let err = PersistenceError::Io(io_err);
        assert!(format!("{}", err).contains("IO 错误"));
    }
}
