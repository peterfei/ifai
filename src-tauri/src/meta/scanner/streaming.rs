//! 流式输出支持
//!
//! 提供实时的扫描进度更新，支持通过 channel 发送进度事件

use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Arc;
use tokio::sync::mpsc;

use super::progress::{ProgressEvent, ProgressTracker};
use super::{ScanError, ScannerConfig};

/// 流式扫描进度事件
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamProgressEvent {
    /// 阶段
    pub stage: StreamStage,

    /// 当前进度
    pub current: usize,

    /// 总数
    pub total: usize,

    /// 消息
    pub message: String,

    /// 时间戳（毫秒）
    pub timestamp: u64,
}

/// 流式扫描阶段
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum StreamStage {
    /// 开始扫描
    Starting,

    /// 收集文件
    Collecting,

    /// 分析文件
    Analyzing,

    /// 构建结构
    Building,

    /// 完成
    Completed,

    /// 错误
    Error,
}

/// 流式扫描器包装器
pub struct StreamingScanner<F, R>
where
    F: Fn(&Path) -> Result<R, ScanError> + Send + Sync,
{
    /// 扫描函数
    scan_func: F,

    /// 配置
    config: ScannerConfig,

    /// 进度发送器
    progress_tx: Option<mpsc::UnboundedSender<StreamProgressEvent>>,
}

impl<F, R> StreamingScanner<F, R>
where
    F: Fn(&Path) -> Result<R, ScanError> + Send + Sync,
    R: Send + 'static,
{
    /// 创建新的流式扫描器
    pub fn new(scan_func: F, config: ScannerConfig) -> Self {
        Self {
            scan_func,
            config,
            progress_tx: None,
        }
    }

    /// 设置进度发送器
    pub fn with_progress(mut self, tx: mpsc::UnboundedSender<StreamProgressEvent>) -> Self {
        self.progress_tx = Some(tx);
        self
    }

    /// 发送进度事件
    fn send_progress(&self, stage: StreamStage, current: usize, total: usize, message: String) {
        if let Some(tx) = &self.progress_tx {
            let event = StreamProgressEvent {
                stage,
                current,
                total,
                message,
                timestamp: std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_millis() as u64,
            };

            let _ = tx.send(event);
        }
    }

    /// 执行扫描（带进度报告）
    pub fn scan(&self, path: &Path) -> Result<R, ScanError> {
        // 发送开始事件
        self.send_progress(
            StreamStage::Starting,
            0,
            100,
            format!("开始扫描: {}", path.display()),
        );

        // 创建进度跟踪器
        let progress_tx = self.progress_tx.clone();
        let _tracker = ProgressTracker::new(100, self.config.progress.interval_ms, move |event| {
            if let Some(tx) = &progress_tx {
                let stream_event = StreamProgressEvent {
                    stage: StreamStage::Analyzing,
                    current: event.current,
                    total: event.total,
                    message: event.message,
                    timestamp: std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap()
                        .as_millis() as u64,
                };
                let _ = tx.send(stream_event);
            }
        });

        // 执行实际扫描
        let result = (self.scan_func)(path);

        match &result {
            Ok(_) => {
                self.send_progress(StreamStage::Completed, 100, 100, "扫描完成".to_string());
            }
            Err(e) => {
                self.send_progress(StreamStage::Error, 0, 100, format!("扫描错误: {}", e));
            }
        }

        result
    }
}

/// 创建流式扫描通道
pub fn create_streaming_channel() -> (
    mpsc::UnboundedSender<StreamProgressEvent>,
    mpsc::UnboundedReceiver<StreamProgressEvent>,
) {
    mpsc::unbounded_channel()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_streaming_scanner() {
        let (tx, mut rx) = create_streaming_channel();

        let scanner = StreamingScanner::new(
            |_path| -> Result<(), ScanError> { Ok(()) },
            ScannerConfig::default(),
        )
        .with_progress(tx);

        let result = scanner.scan(Path::new("."));

        assert!(result.is_ok());

        // 验证进度事件
        let mut events = Vec::new();
        while let Ok(event) = rx.try_recv() {
            events.push(event);
        }

        assert!(events.len() >= 2); // 至少有开始和完成事件
        assert_eq!(events[0].stage, StreamStage::Starting);
        assert_eq!(events.last().unwrap().stage, StreamStage::Completed);
    }

    #[test]
    fn test_streaming_error() {
        let (tx, mut rx) = create_streaming_channel();

        let scanner = StreamingScanner::new(
            |_path| -> Result<(), ScanError> { Err(ScanError::NotImplemented) },
            ScannerConfig::default(),
        )
        .with_progress(tx);

        let result = scanner.scan(Path::new("."));

        assert!(result.is_err());

        // 验证错误事件
        let mut events = Vec::new();
        while let Ok(event) = rx.try_recv() {
            events.push(event);
        }

        assert!(events.iter().any(|e| e.stage == StreamStage::Error));
    }
}
