//! SessionPersistence - Persistence layer for DebuggerAgent
//! Saves session snapshots to .ifai/sessions/<id>.json

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use crate::agent_system::debugger::DebugSession;

pub struct SessionPersistence {
    base_path: PathBuf,
}

impl SessionPersistence {
    pub fn new() -> Self {
        let mut path = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
        path.push(".ifai");
        path.push("sessions");
        
        // 确保目录存在
        let _ = fs::create_dir_all(&path);
        
        Self { base_path: path }
    }

    /// 保存会话快照
    pub fn save_session(&self, session: &DebugSession) -> Result<(), String> {
        let mut file_path = self.base_path.clone();
        file_path.push(format!("{}.json", session.id));
        
        let json = serde_json::to_string_pretty(session)
            .map_err(|e| format!("序列化失败: {}", e))?;
            
        fs::write(file_path, json)
            .map_err(|e| format!("写入文件失败: {}", e))?;
            
        Ok(())
    }

    /// 读取会话快照
    pub fn load_session(&self, id: &str) -> Result<DebugSession, String> {
        let mut file_path = self.base_path.clone();
        file_path.push(format!("{}.json", id));
        
        let json = fs::read_to_string(file_path)
            .map_err(|e| format!("读取文件失败: {}", e))?;
            
        let session = serde_json::from_str(&json)
            .map_err(|e| format!("反序列化失败: {}", e))?;
            
        Ok(session)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_session_serialization_cycle() {
        let dir = tempdir().unwrap();
        let persistence = SessionPersistence { base_path: dir.path().to_path_buf() };
        
        let session = DebugSession {
            id: "test-save-001".to_string(),
            current_step: "analyzing".to_string(),
            retry_count: 1,
            ..Default::default()
        };
        
        // 测试保存
        persistence.save_session(&session).expect("保存应成功");
        
        // 测试加载
        let loaded = persistence.load_session("test-save-001").expect("加载应成功");
        
        assert_eq!(loaded.id, session.id);
        assert_eq!(loaded.current_step, "analyzing");
    }
}
