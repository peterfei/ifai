//! 🔥 元编程：会话持久化
//!
//! 🏛️ 架构原则：零修改 Session 结构，100% 复用现有数据
//!
//! **单一数据源**：Session → 序列化 → 文件存储
//!
//! **复用组件**：
//! - Message 类型（harness::api::types）
//! - Token 统计（Session 累积字段）
//! - 配置路径（XDG 标准或 ~/.ifai/）

use std::fs;
use std::path::{PathBuf, Path};
use serde::{Deserialize, Serialize, Serializer, Deserializer};
use ifainew_lib::harness::api::types::{Message};

/// 🔥 会话快照（用于序列化）
///
/// **设计原则**：
/// - 只包含必要数据（最小化存储）
/// - 可序列化（JSON 格式）
/// - 版本兼容（支持未来迁移）
#[derive(Debug, Clone)]
pub struct SessionSnapshot {
    /// 版本号（支持数据迁移）
    pub version: u32,
    /// 会话名称
    pub name: String,
    /// 保存时间戳（RFC3339 字符串）
    pub saved_at: String,
    /// Provider ID
    pub provider: String,
    /// 模型 ID
    pub model: String,
    /// 消息历史
    pub messages: Vec<Message>,
    /// 累积输入 tokens
    pub cumulative_input_tokens: u32,
    /// 累积输出 tokens
    pub cumulative_output_tokens: u32,
}

// 🔥 手动实现序列化（避免依赖 chrono 的 serde feature）
impl Serialize for SessionSnapshot {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("SessionSnapshot", 8)?;
        state.serialize_field("version", &self.version)?;
        state.serialize_field("name", &self.name)?;
        state.serialize_field("saved_at", &self.saved_at)?;
        state.serialize_field("provider", &self.provider)?;
        state.serialize_field("model", &self.model)?;
        state.serialize_field("messages", &self.messages)?;
        state.serialize_field("cumulative_input_tokens", &self.cumulative_input_tokens)?;
        state.serialize_field("cumulative_output_tokens", &self.cumulative_output_tokens)?;
        state.end()
    }
}

impl<'de> Deserialize<'de> for SessionSnapshot {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        #[derive(Deserialize)]
        struct Temp {
            version: u32,
            name: String,
            saved_at: String,
            provider: String,
            model: String,
            messages: Vec<Message>,
            cumulative_input_tokens: u32,
            cumulative_output_tokens: u32,
        }

        let temp = Temp::deserialize(deserializer)?;
        Ok(SessionSnapshot {
            version: temp.version,
            name: temp.name,
            saved_at: temp.saved_at,
            provider: temp.provider,
            model: temp.model,
            messages: temp.messages,
            cumulative_input_tokens: temp.cumulative_input_tokens,
            cumulative_output_tokens: temp.cumulative_output_tokens,
        })
    }
}

/// 🔥 会话持久化管理器
pub struct SessionPersistence {
    /// 会话存储目录
    sessions_dir: PathBuf,
}

impl SessionPersistence {
    /// 创建持久化管理器
    pub fn new() -> Result<Self, String> {
        let sessions_dir = Self::get_sessions_dir()?;

        // 确保目录存在
        fs::create_dir_all(&sessions_dir)
            .map_err(|e| format!("Failed to create sessions directory: {}", e))?;

        Ok(Self { sessions_dir })
    }

    /// 🔥 获取会话存储目录（跨平台）
    ///
    /// **优先级**：
    /// 1. XDG_DATA_HOME/ifai/sessions（Linux）
    /// 2. ~/Library/Application Support/ifai/sessions（macOS）
    /// 3. %APPDATA%/ifai/sessions（Windows）
    /// 4. ~/.ifai/sessions（fallback）
    fn get_sessions_dir() -> Result<PathBuf, String> {
        let base_dir = if let Ok(data_home) = std::env::var("XDG_DATA_HOME") {
            // Linux: XDG_DATA_HOME
            PathBuf::from(data_home)
        } else if let Ok(appdata) = std::env::var("APPDATA") {
            // Windows: APPDATA
            PathBuf::from(appdata)
        } else {
            // macOS 和 fallback
            let home = std::env::var("HOME")
                .map_err(|_| "Could not determine HOME directory".to_string())?;

            if cfg!(target_os = "macos") {
                // macOS: ~/Library/Application Support
                PathBuf::from(home).join("Library").join("Application Support")
            } else {
                // Fallback: ~/.ifai
                PathBuf::from(home).join(".ifai")
            }
        };

        Ok(base_dir.join("ifai").join("sessions"))
    }

    /// 🔥 保存会话
    pub fn save_session(&self, name: &str, snapshot: SessionSnapshot) -> Result<PathBuf, String> {
        // 文件名：name.json（安全转义）
        let safe_name = name.chars()
            .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
            .collect::<String>();
        let filename = format!("{}.json", safe_name);
        let filepath = self.sessions_dir.join(&filename);

        // 序列化为 JSON
        let json = serde_json::to_string_pretty(&snapshot)
            .map_err(|e| format!("Failed to serialize session: {}", e))?;

        // 写入文件
        fs::write(&filepath, json)
            .map_err(|e| format!("Failed to write session file: {}", e))?;

        Ok(filepath)
    }

    /// 🔥 加载会话
    pub fn load_session(&self, name: &str) -> Result<SessionSnapshot, String> {
        let safe_name = name.chars()
            .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
            .collect::<String>();
        let filename = format!("{}.json", safe_name);
        let filepath = self.sessions_dir.join(&filename);

        // 读取文件
        let json = fs::read_to_string(&filepath)
            .map_err(|e| format!("Failed to read session file: {}", e))?;

        // 反序列化
        let snapshot: SessionSnapshot = serde_json::from_str(&json)
            .map_err(|e| format!("Failed to deserialize session: {}", e))?;

        Ok(snapshot)
    }

    /// 🔥 列出所有会话
    pub fn list_sessions(&self) -> Result<Vec<SessionMetadata>, String> {
        let mut sessions = Vec::new();

        let entries = fs::read_dir(&self.sessions_dir)
            .map_err(|e| format!("Failed to read sessions directory: {}", e))?;

        for entry in entries {
            let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
            let path = entry.path();

            // 只处理 .json 文件
            if path.extension().and_then(|s| s.to_str()) != Some("json") {
                continue;
            }

            // 读取元数据
            match self.read_session_metadata(&path) {
                Ok(metadata) => sessions.push(metadata),
                Err(e) => {
                    // 跳过损坏的文件
                    eprintln!("Warning: Failed to read session {:?}: {}", path, e);
                    continue;
                }
            }
        }

        // 按保存时间倒序排列（字符串比较 RFC3339）
        sessions.sort_by(|a, b| b.saved_at.cmp(&a.saved_at));

        Ok(sessions)
    }

    /// 🔥 删除会话
    pub fn delete_session(&self, name: &str) -> Result<(), String> {
        let safe_name = name.chars()
            .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
            .collect::<String>();
        let filename = format!("{}.json", safe_name);
        let filepath = self.sessions_dir.join(&filename);

        fs::remove_file(&filepath)
            .map_err(|e| format!("Failed to delete session file: {}", e))
    }

    /// 读取会话元数据（不加载完整消息）
    fn read_session_metadata(&self, path: &Path) -> Result<SessionMetadata, String> {
        let json = fs::read_to_string(path)
            .map_err(|e| format!("Failed to read file: {}", e))?;

        // 只解析需要的字段（使用 serde_json::Value）
        let value: serde_json::Value = serde_json::from_str(&json)
            .map_err(|e| format!("Failed to parse JSON: {}", e))?;

        let name = value.get("name")
            .and_then(|v| v.as_str())
            .ok_or("Missing 'name' field")?
            .to_string();

        let saved_at = value.get("saved_at")
            .and_then(|v| v.as_str())
            .ok_or("Missing 'saved_at' field")?
            .to_string();

        let message_count = value.get("messages")
            .and_then(|v| v.as_array())
            .map(|arr| arr.len())
            .unwrap_or(0);

        let model = value.get("model")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string();

        let cumulative_input = value.get("cumulative_input_tokens")
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as u32;

        let cumulative_output = value.get("cumulative_output_tokens")
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as u32;

        Ok(SessionMetadata {
            name,
            saved_at,
            message_count,
            model,
            cumulative_input_tokens: cumulative_input,
            cumulative_output_tokens: cumulative_output,
        })
    }
}

/// 🔥 会话元数据（用于列表显示）
#[derive(Debug, Clone)]
pub struct SessionMetadata {
    pub name: String,
    pub saved_at: String,  // RFC3339 格式的时间戳
    pub message_count: usize,
    pub model: String,
    pub cumulative_input_tokens: u32,
    pub cumulative_output_tokens: u32,
}

#[cfg(test)]
mod tests {
    use super::*;
    use ifainew_lib::harness::api::types::{Message, MessageRole};

    #[test]
    fn test_safe_name_conversion() {
        let test_cases = vec![
            ("simple", "simple"),
            ("with-dash", "with-dash"),
            ("with_underscore", "with_underscore"),
            ("with space", "with_space"),
            ("with/slash", "with_slash"),
            ("with.dot", "with_dot"),
        ];

        for (input, expected) in test_cases {
            let safe_name: String = input.chars()
                .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
                .collect();
            assert_eq!(safe_name, expected);
        }
    }

    #[test]
    fn test_session_snapshot_serialization() {
        use ifainew_lib::harness::api::types::MessageContent;

        // 创建测试消息
        let messages = vec![
            Message {
                role: MessageRole::System,
                content: MessageContent::Text("You are a helpful assistant".to_string()),
                tool_calls: None,
                tool_call_id: None,
            },
            Message {
                role: MessageRole::User,
                content: MessageContent::Text("Hello, world!".to_string()),
                tool_calls: None,
                tool_call_id: None,
            },
        ];

        // 创建快照（使用 RFC3339 字符串格式）
        let snapshot = SessionSnapshot {
            version: 1,
            name: "test_session".to_string(),
            saved_at: "2024-01-15T10:30:00+00:00".to_string(),  // RFC3339 格式
            provider: "deepseek-official".to_string(),
            model: "deepseek-chat".to_string(),
            messages: messages.clone(),
            cumulative_input_tokens: 1000,
            cumulative_output_tokens: 500,
        };

        // 序列化
        let json = serde_json::to_string_pretty(&snapshot)
            .expect("Failed to serialize snapshot");

        // 验证 JSON 包含所有字段
        assert!(json.contains("\"version\": 1"));
        assert!(json.contains("\"name\": \"test_session\""));
        assert!(json.contains("\"saved_at\": \"2024-01-15T10:30:00+00:00\""));
        assert!(json.contains("\"provider\": \"deepseek-official\""));
        assert!(json.contains("\"model\": \"deepseek-chat\""));
        assert!(json.contains("\"cumulative_input_tokens\": 1000"));
        assert!(json.contains("\"cumulative_output_tokens\": 500"));

        // 反序列化
        let deserialized: SessionSnapshot = serde_json::from_str(&json)
            .expect("Failed to deserialize snapshot");

        // 验证反序列化结果
        assert_eq!(deserialized.version, 1);
        assert_eq!(deserialized.name, "test_session");
        assert_eq!(deserialized.saved_at, "2024-01-15T10:30:00+00:00");
        assert_eq!(deserialized.provider, "deepseek-official");
        assert_eq!(deserialized.model, "deepseek-chat");
        assert_eq!(deserialized.cumulative_input_tokens, 1000);
        assert_eq!(deserialized.cumulative_output_tokens, 500);
        assert_eq!(deserialized.messages.len(), 2);

        // 使用 matches! 宏检查 MessageRole（因为 MessageRole 没有实现 PartialEq）
        assert!(matches!(deserialized.messages[0].role, MessageRole::System));
        assert!(matches!(deserialized.messages[1].role, MessageRole::User));
    }

    #[test]
    fn test_session_persistence_roundtrip() {
        use ifainew_lib::harness::api::types::MessageContent;

        // 创建临时目录
        let temp_dir = std::env::temp_dir().join("ifai_test_sessions");
        std::fs::create_dir_all(&temp_dir).expect("Failed to create temp dir");

        // 创建测试快照
        let messages = vec![
            Message {
                role: MessageRole::User,
                content: MessageContent::Text("Test message".to_string()),
                tool_calls: None,
                tool_call_id: None,
            },
        ];

        let snapshot = SessionSnapshot {
            version: 1,
            name: "roundtrip_test".to_string(),
            saved_at: chrono::Utc::now().to_rfc3339(),
            provider: "test-provider".to_string(),
            model: "test-model".to_string(),
            messages,
            cumulative_input_tokens: 100,
            cumulative_output_tokens: 50,
        };

        // 手动创建 SessionPersistence（使用临时目录）
        struct TestPersistence {
            sessions_dir: std::path::PathBuf,
        }

        impl TestPersistence {
            fn new(dir: std::path::PathBuf) -> Self {
                Self { sessions_dir: dir }
            }

            fn save_session(&self, name: &str, snapshot: &SessionSnapshot) -> Result<std::path::PathBuf, String> {
                let safe_name = name.chars()
                    .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
                    .collect::<String>();
                let filename = format!("{}.json", safe_name);
                let filepath = self.sessions_dir.join(&filename);

                let json = serde_json::to_string_pretty(snapshot)
                    .map_err(|e| format!("Failed to serialize: {}", e))?;

                std::fs::write(&filepath, json)
                    .map_err(|e| format!("Failed to write: {}", e))?;

                Ok(filepath)
            }

            fn load_session(&self, name: &str) -> Result<SessionSnapshot, String> {
                let safe_name = name.chars()
                    .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
                    .collect::<String>();
                let filename = format!("{}.json", safe_name);
                let filepath = self.sessions_dir.join(&filename);

                let json = std::fs::read_to_string(&filepath)
                    .map_err(|e| format!("Failed to read: {}", e))?;

                serde_json::from_str(&json)
                    .map_err(|e| format!("Failed to deserialize: {}", e))
            }
        }

        let persistence = TestPersistence::new(temp_dir.clone());

        // 保存
        let saved_path = persistence.save_session("roundtrip_test", &snapshot)
            .expect("Failed to save session");
        assert!(saved_path.exists());

        // 加载
        let loaded = persistence.load_session("roundtrip_test")
            .expect("Failed to load session");

        // 验证
        assert_eq!(loaded.name, snapshot.name);
        assert_eq!(loaded.provider, snapshot.provider);
        assert_eq!(loaded.model, snapshot.model);
        assert_eq!(loaded.cumulative_input_tokens, snapshot.cumulative_input_tokens);
        assert_eq!(loaded.cumulative_output_tokens, snapshot.cumulative_output_tokens);
        assert_eq!(loaded.messages.len(), snapshot.messages.len());

        // 清理
        std::fs::remove_dir_all(temp_dir).ok();
    }
}
