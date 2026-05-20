//! JSONL Writer - JSONL 格式增量写入器
//!
//! 🎯 设计目标：
//! - 增量追加，不重写整个文件
//! - 文件锁定保证并发安全
//! - 自动创建目录和文件

use crate::session_event::SessionEvent;
use std::fs::{File, OpenOptions};
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};
use thiserror::Error;

/// 🔥 JSONL 增量日志写入器
///
/// 每行一个 JSON 对象，实时追加到文件末尾
pub struct JsonlWriter {
    file_path: PathBuf,
    writer: Option<BufWriter<File>>,
}

/// 🔥 JSONL 写入错误
#[derive(Debug, Error)]
pub enum JsonlError {
    #[error("IO 错误: {0}")]
    Io(#[from] std::io::Error),

    #[error("序列化错误: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("文件未打开")]
    FileNotOpen,
}

impl JsonlWriter {
    /// 🔥 创建新的 JSONL 写入器（不打开文件）
    pub fn new(file_path: PathBuf) -> Self {
        Self {
            file_path,
            writer: None,
        }
    }

    /// 🔥 打开文件（追加模式）
    ///
    /// 如果文件不存在则创建，如果目录不存在则自动创建
    pub fn open(&mut self) -> Result<(), JsonlError> {
        // 确保父目录存在
        if let Some(parent) = self.file_path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        // 以追加模式打开文件
        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.file_path)?;

        self.writer = Some(BufWriter::new(file));
        Ok(())
    }

    /// 🔥 追加事件到 JSONL 文件
    ///
    /// 自动序列化并追加一行 JSON
    pub fn append_event(&mut self, event: &SessionEvent) -> Result<(), JsonlError> {
        let writer = self
            .writer
            .as_mut()
            .ok_or(JsonlError::FileNotOpen)?;

        let jsonl = event.to_jsonl()?;
        writeln!(writer, "{}", jsonl)?;
        writer.flush()?;

        Ok(())
    }

    /// 🔥 批量追加事件
    pub fn append_events(&mut self, events: &[SessionEvent]) -> Result<(), JsonlError> {
        for event in events {
            self.append_event(event)?;
        }
        Ok(())
    }

    /// 🔥 刷新缓冲区到磁盘
    pub fn flush(&mut self) -> Result<(), JsonlError> {
        if let Some(writer) = self.writer.as_mut() {
            writer.flush()?;
        }
        Ok(())
    }

    /// 🔥 关闭文件
    pub fn close(&mut self) -> Result<(), JsonlError> {
        self.flush()?;
        self.writer = None;
        Ok(())
    }

    /// 🔥 获取文件路径
    pub fn path(&self) -> &Path {
        &self.file_path
    }

    /// 🔥 获取文件大小（字节）
    pub fn file_size(&self) -> Result<u64, JsonlError> {
        Ok(std::fs::metadata(&self.file_path)?.len())
    }

    /// 🔥 检查文件是否存在
    pub fn exists(&self) -> bool {
        self.file_path.exists()
    }

    /// 🔥 便捷方法：创建并打开
    pub fn create_and_open(file_path: PathBuf) -> Result<Self, JsonlError> {
        let mut writer = Self::new(file_path);
        writer.open()?;
        Ok(writer)
    }

    /// 🔥 追加单条事件（便捷方法，自动打开和关闭）
    pub fn append_once(file_path: PathBuf, event: &SessionEvent) -> Result<(), JsonlError> {
        let mut writer = Self::create_and_open(file_path)?;
        writer.append_event(event)?;
        writer.close()?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::session_event::EventMetadata;
    use tempfile::TempDir;

    #[test]
    fn test_jsonl_writer_creation() {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("test.jsonl");

        let writer = JsonlWriter::new(file_path.clone());
        assert_eq!(writer.path(), file_path);
        assert!(!writer.exists());
    }

    #[test]
    fn test_jsonl_writer_open() {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("test.jsonl");

        let mut writer = JsonlWriter::new(file_path);
        writer.open().unwrap();

        assert!(writer.exists());
    }

    #[test]
    fn test_jsonl_writer_append_event() {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("test.jsonl");

        let mut writer = JsonlWriter::new(file_path.clone());
        writer.open().unwrap();

        let event = SessionEvent::UserMessage {
            content: "测试消息".to_string(),
            metadata: EventMetadata::default(),
        };

        writer.append_event(&event).unwrap();
        writer.flush().unwrap();

        // 验证文件内容
        let content = std::fs::read_to_string(&file_path).unwrap();
        assert!(content.contains("测试消息"));
        assert!(content.contains("UserMessage"));
    }

    #[test]
    fn test_jsonl_writer_append_multiple_events() {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("test.jsonl");
        let file_path_clone = file_path.clone();

        let mut writer = JsonlWriter::new(file_path);
        writer.open().unwrap();

        for i in 0..5 {
            let event = SessionEvent::UserMessage {
                content: format!("消息 {}", i),
                metadata: EventMetadata::default(),
            };
            writer.append_event(&event).unwrap();
        }

        writer.flush().unwrap();

        // 验证文件有 5 行
        let content = std::fs::read_to_string(&file_path_clone).unwrap();
        let lines: Vec<&str> = content.lines().collect();
        assert_eq!(lines.len(), 5);
    }

    #[test]
    fn test_jsonl_writer_append_events_batch() {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("test.jsonl");
        let file_path_clone = file_path.clone();

        let mut writer = JsonlWriter::new(file_path);
        writer.open().unwrap();

        let events: Vec<SessionEvent> = (0..3)
            .map(|i| SessionEvent::UserMessage {
                content: format!("批量消息 {}", i),
                metadata: EventMetadata::default(),
            })
            .collect();

        writer.append_events(&events).unwrap();
        writer.flush().unwrap();

        // 验证文件有 3 行
        let content = std::fs::read_to_string(&file_path_clone).unwrap();
        let lines: Vec<&str> = content.lines().collect();
        assert_eq!(lines.len(), 3);
    }

    #[test]
    fn test_jsonl_writer_file_size() {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("test.jsonl");

        let mut writer = JsonlWriter::new(file_path.clone());
        writer.open().unwrap();

        let event = SessionEvent::UserMessage {
            content: "测试".to_string(),
            metadata: EventMetadata::default(),
        };

        writer.append_event(&event).unwrap();
        writer.flush().unwrap();

        let size = writer.file_size().unwrap();
        assert!(size > 0);
    }

    #[test]
    fn test_jsonl_writer_close() {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("test.jsonl");
        let file_path_clone = file_path.clone();

        let mut writer = JsonlWriter::new(file_path);
        writer.open().unwrap();

        let event = SessionEvent::UserMessage {
            content: "关闭测试".to_string(),
            metadata: EventMetadata::default(),
        };

        writer.append_event(&event).unwrap();
        writer.close().unwrap();

        // 验证文件仍然存在且内容正确
        let content = std::fs::read_to_string(&file_path_clone).unwrap();
        assert!(content.contains("关闭测试"));
    }

    #[test]
    fn test_jsonl_writer_create_and_open() {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("test.jsonl");

        let mut writer = JsonlWriter::create_and_open(file_path.clone()).unwrap();
        assert!(writer.exists());
        assert_eq!(writer.path(), &file_path);
    }

    #[test]
    fn test_jsonl_writer_append_once() {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("test.jsonl");

        let event = SessionEvent::UserMessage {
            content: "单次写入".to_string(),
            metadata: EventMetadata::default(),
        };

        JsonlWriter::append_once(file_path.clone(), &event).unwrap();

        // 验证文件内容
        let content = std::fs::read_to_string(&file_path).unwrap();
        assert!(content.contains("单次写入"));
    }

    #[test]
    fn test_jsonl_writer_auto_create_directory() {
        let temp_dir = TempDir::new().unwrap();
        let nested_path = temp_dir.path().join("nested/dir/test.jsonl");

        let mut writer = JsonlWriter::new(nested_path.clone());
        writer.open().unwrap();

        assert!(nested_path.exists());
        assert!(nested_path.parent().unwrap().exists());
    }

    #[test]
    fn test_jsonl_error_display() {
        let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "test");
        let err = JsonlError::Io(io_err);
        assert!(format!("{}", err).contains("IO 错误"));
    }
}
