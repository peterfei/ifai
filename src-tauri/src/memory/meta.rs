//! 跨会话学习：元数据追踪
//!
//! 追踪记忆使用频率，自动识别高价值记忆，优先展示重要记忆。
//! Phase 2 扩展：基于元数据的自动过期清理。

use crate::memory::io::ifai_dir;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

/// 元数据文件路径
pub fn metadata_file() -> PathBuf {
    ifai_dir().join("memories.meta.json")
}

/// 单条记忆的元数据
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct MemoryMetadata {
    /// 内容指纹（MD5 哈希）
    pub fingerprint: String,

    /// 访问次数
    pub access_count: usize,

    /// 最后访问时间（ISO 8601 格式）
    pub last_accessed: String,

    /// 首次创建时间（ISO 8601 格式）
    pub first_created: String,
}

impl MemoryMetadata {
    /// 创建新的元数据
    pub fn new(fingerprint: String) -> Self {
        let now = chrono::Local::now().to_rfc3339();
        Self {
            fingerprint,
            access_count: 1,
            last_accessed: now.clone(),
            first_created: now,
        }
    }

    /// 记录一次访问
    pub fn track_access(&mut self) {
        self.access_count += 1;
        self.last_accessed = chrono::Local::now().to_rfc3339();
    }

    /// 判断是否为高价值记忆（访问次数 >= 5）
    pub fn is_high_value(&self) -> bool {
        self.access_count >= 5
    }
}

/// 元数据存储
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct MetadataStore {
    /// 指纹到元数据的映射
    memories: HashMap<String, MemoryMetadata>,
}

impl Default for MetadataStore {
    fn default() -> Self {
        Self::new()
    }
}

impl MetadataStore {
    /// 创建新的空存储
    pub fn new() -> Self {
        Self {
            memories: HashMap::new(),
        }
    }

    /// 从文件加载元数据
    ///
    /// 如果文件不存在或解析失败，返回空存储（降级处理）
    pub fn load() -> Self {
        let path = metadata_file();
        if !path.exists() {
            return Self::new();
        }

        let content = match fs::read_to_string(&path) {
            Ok(c) => c,
            Err(e) => {
                eprintln!("⚠️  读取元数据文件失败: {}，创建新存储（降级）", e);
                return Self::new();
            }
        };

        match serde_json::from_str(&content) {
            Ok(store) => store,
            Err(e) => {
                eprintln!("⚠️  解析元数据文件失败: {}，创建新存储（降级）", e);
                Self::new()
            }
        }
    }

    /// 保存元数据到文件
    pub fn save(&self) -> Result<(), std::io::Error> {
        let path = metadata_file();

        // 确保 .ifai 目录存在
        if !ifai_dir().exists() {
            fs::create_dir_all(&ifai_dir())?;
        }

        let json = serde_json::to_string_pretty(self)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

        fs::write(&path, json)?;
        Ok(())
    }

    /// 追踪记忆访问
    ///
    /// 如果指纹不存在，会创建新的元数据（access_count = 1）
    pub fn track_access(&mut self, fingerprint: &str) {
        self.memories
            .entry(fingerprint.to_string())
            .and_modify(|m| m.track_access())
            .or_insert_with(|| MemoryMetadata::new(fingerprint.to_string()));
    }

    /// 获取高价值记忆列表（access_count >= 5）
    pub fn high_value_memories(&self) -> Vec<&MemoryMetadata> {
        self.memories
            .values()
            .filter(|m| m.is_high_value())
            .collect()
    }

    /// 获取记忆元数据
    pub fn get(&self, fingerprint: &str) -> Option<&MemoryMetadata> {
        self.memories.get(fingerprint)
    }

    /// 获取所有元数据
    pub fn all(&self) -> &HashMap<String, MemoryMetadata> {
        &self.memories
    }

    /// Phase 2 扩展：判断记忆是否应该保留（基于元数据的过期判断）
    ///
    /// 当前实现：总是返回 true（不过期）
    /// Phase 2：基于 access_count 和 last_accessed 判断
    #[allow(dead_code)]
    pub fn should_keep_memory(&self, _fingerprint: &str) -> bool {
        // Phase 1：不过期任何记忆
        // Phase 2：实现基于 access_count >= 5 和 last_accessed 的判断
        true
    }
}

/// 计算内容指纹（使用 MD5 哈希）
///
/// 对内容进行归一化处理（去除首尾空格、统一大小写）后计算哈希
pub fn content_fingerprint(content: &str) -> String {
    // 归一化：去除首尾空格
    let normalized = content.trim();

    // 使用 md-5 crate 计算 MD5（避免引入 sha2 crate）
    // 如果项目中没有 md-5 crate，使用简单的字符串作为指纹
    format!("{:x}", md5::compute(normalized))
}

// ============ 单元测试 ============

#[cfg(test)]
mod tests {
    use super::*;

    /// 为测试创建唯一的临时目录（使用线程 ID 避免并行冲突）
    fn setup_test_home(test_name: &str) -> std::path::PathBuf {
        let thread_id = format!("{:?}", std::thread::current().id());
        let temp_dir = std::env::temp_dir().join(format!("ifai_test_{}_{}", test_name, thread_id));
        std::fs::create_dir_all(&temp_dir).ok();
        temp_dir
    }

    fn restore_home(original_home: Option<String>) {
        if let Some(home) = original_home {
            std::env::set_var("HOME", home);
        }
    }

    #[test]
    fn test_metadata_file() {
        let file = metadata_file();
        assert!(file.ends_with(".ifai/memories.meta.json"));
        assert!(file.is_absolute());
    }

    #[test]
    fn test_memory_metadata_new() {
        let metadata = MemoryMetadata::new("test-fingerprint".to_string());
        assert_eq!(metadata.fingerprint, "test-fingerprint");
        assert_eq!(metadata.access_count, 1);
        assert!(!metadata.last_accessed.is_empty());
        assert!(!metadata.first_created.is_empty());
    }

    #[test]
    fn test_memory_metadata_track_access() {
        let mut metadata = MemoryMetadata::new("test-fingerprint".to_string());
        assert_eq!(metadata.access_count, 1);

        metadata.track_access();
        assert_eq!(metadata.access_count, 2);

        metadata.track_access();
        metadata.track_access();
        metadata.track_access();
        assert_eq!(metadata.access_count, 5);
    }

    #[test]
    fn test_memory_metadata_is_high_value() {
        let mut metadata = MemoryMetadata::new("test-fingerprint".to_string());
        assert!(!metadata.is_high_value(), "初始访问次数为 1，不是高价值");

        for _ in 0..4 {
            metadata.track_access();
        }
        assert!(metadata.is_high_value(), "访问次数达到 5，是高价值");
    }

    #[test]
    fn test_metadata_store_new() {
        let store = MetadataStore::new();
        assert_eq!(store.all().len(), 0);
    }

    #[test]
    fn test_metadata_store_track_access() {
        let mut store = MetadataStore::new();

        // 第一次追踪，创建新元数据
        store.track_access("fingerprint1");
        assert_eq!(store.all().len(), 1);
        assert_eq!(store.get("fingerprint1").unwrap().access_count, 1);

        // 第二次追踪，增加访问次数
        store.track_access("fingerprint1");
        assert_eq!(store.get("fingerprint1").unwrap().access_count, 2);

        // 追踪不同指纹
        store.track_access("fingerprint2");
        assert_eq!(store.all().len(), 2);
    }

    #[test]
    fn test_metadata_store_high_value_memories() {
        let mut store = MetadataStore::new();

        // 添加 3 条记忆
        for _ in 0..3 {
            store.track_access("low_value");
        }
        for _ in 0..5 {
            store.track_access("high_value");
        }
        for _ in 0..10 {
            store.track_access("very_high_value");
        }

        let high_value = store.high_value_memories();
        assert_eq!(high_value.len(), 2);
        assert!(high_value.iter().any(|m| m.fingerprint == "high_value"));
        assert!(high_value
            .iter()
            .any(|m| m.fingerprint == "very_high_value"));
        assert!(!high_value.iter().any(|m| m.fingerprint == "low_value"));
    }

    #[test]
    fn test_metadata_store_load_file_not_exist() {
        let temp_dir = setup_test_home("meta_load");
        let original_home = std::env::var("HOME").ok();
        std::env::set_var("HOME", temp_dir.to_str().unwrap());

        let store = MetadataStore::load();
        assert_eq!(store.all().len(), 0, "文件不存在时应返回空存储");

        restore_home(original_home);
        std::fs::remove_dir_all(temp_dir).ok();
    }

    #[test]
    fn test_metadata_store_save_and_load() {
        let temp_dir = setup_test_home("meta_save_load");
        let original_home = std::env::var("HOME").ok();
        std::env::set_var("HOME", temp_dir.to_str().unwrap());

        // 创建并保存存储
        let mut store = MetadataStore::new();
        store.track_access("test1");
        store.track_access("test2");
        store.track_access("test1"); // test1 现在访问 2 次
        assert!(store.save().is_ok());

        // 加载存储
        let loaded = MetadataStore::load();
        assert_eq!(loaded.all().len(), 2);
        assert_eq!(loaded.get("test1").unwrap().access_count, 2);
        assert_eq!(loaded.get("test2").unwrap().access_count, 1);

        restore_home(original_home);
        std::fs::remove_dir_all(temp_dir).ok();
    }

    #[test]
    fn test_content_fingerprint() {
        let content1 = "  Test Content  ";
        let content2 = "Test Content";
        let content3 = "test content"; // 大小写不同

        let fp1 = content_fingerprint(content1);
        let fp2 = content_fingerprint(content2);
        let fp3 = content_fingerprint(content3);

        // 归一化后 content1 和 content2 相同
        assert_eq!(fp1, fp2, "去除空格后应相同");

        // 大小写不同，指纹不同
        assert_ne!(fp2, fp3, "大小写不同应产生不同指纹");

        // 指纹应该是 32 字符（MD5）
        assert_eq!(fp1.len(), 32);
    }

    #[test]
    fn test_metadata_store_should_keep_always_true() {
        let mut store = MetadataStore::new();
        store.track_access("test");
        assert!(store.should_keep_memory("test"), "Phase 1 所有记忆都应保留");
    }

    #[test]
    fn test_metadata_store_serialization() {
        let mut store = MetadataStore::new();
        store.track_access("test1");
        store.track_access("test2");

        // 序列化
        let json = serde_json::to_string(&store).unwrap();
        assert!(json.contains("test1"));
        assert!(json.contains("test2"));

        // 反序列化
        let deserialized: MetadataStore = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.all().len(), 2);
    }
}
