//! 记忆注入（热记忆）
//!
//! 加载并格式化记忆用于注入到 system prompt。

use crate::memory::io::load_memories;
use crate::memory::meta::{content_fingerprint, MetadataStore};

/// 记忆注入配置
const MAX_TOKENS: usize = 2000; // 最大注入 tokens
const APPROX_CHARS_PER_TOKEN: usize = 4; // 粗略估算：1 token ≈ 4 chars

/// 加载并格式化记忆用于注入到 system prompt
///
/// 返回格式化的 Markdown 块，如果没有记忆则返回空字符串
pub fn load_memories_for_injection() -> String {
    // 1. 加载记忆文件
    let memories = match load_memories() {
        Some(m) => m,
        None => return String::new(), // 降级：无记忆文件
    };

    // 2. 加载元数据
    let metadata_store = MetadataStore::load();

    // 3. 解析记忆条目并计算优先级
    let entries = parse_memory_entries(&memories, &metadata_store);

    // 4. 按优先级排序（高价值优先）
    let mut sorted_entries: Vec<_> = entries.into_iter().collect();
    sorted_entries.sort_by(|a, b| {
        // 先按高价值排序
        b.is_high_value
            .cmp(&a.is_high_value)
            // 再按访问次数排序
            .then_with(|| b.access_count.cmp(&a.access_count))
            // 最后按日期排序（新的优先）
            .then_with(|| b.date.cmp(&a.date))
    });

    // 5. 选择记忆条目（Token 控制）
    let selected_entries = select_entries_by_token_limit(&sorted_entries);

    // 6. 格式化为 Markdown
    format_memory_injection(&selected_entries)
}

/// 单条记忆条目（解析后）
#[derive(Debug, Clone)]
struct MemoryEntry {
    /// 原始内容
    content: String,
    /// 日期（用于排序）
    date: String,
    /// 访问次数（从元数据获取）
    access_count: usize,
    /// 是否为高价值记忆
    is_high_value: bool,
}

/// 解析记忆文件中的所有条目
fn parse_memory_entries(memories: &str, metadata_store: &MetadataStore) -> Vec<MemoryEntry> {
    let mut entries = Vec::new();

    for line in memories.lines() {
        // 解析格式：- [YYYY-MM-DD] content
        if let Some(entry) = parse_memory_line(line, metadata_store) {
            entries.push(entry);
        }
    }

    entries
}

/// 解析单行记忆
fn parse_memory_line(line: &str, metadata_store: &MetadataStore) -> Option<MemoryEntry> {
    let line = line.trim();

    // 跳过空行和非条目行
    if !line.starts_with("- [") {
        return None;
    }

    // 解析：- [YYYY-MM-DD] content
    let content_start = line.find(']')? + 1;
    let content = line[content_start..].trim();

    if content.is_empty() {
        return None;
    }

    // 提取日期
    let date_start = line.find('[')? + 1;
    let date_end = line.find(']')?;
    let date = line[date_start..date_end].to_string();

    // 计算内容指纹
    let fingerprint = content_fingerprint(content);

    // 从元数据获取访问次数
    let (access_count, is_high_value) = metadata_store
        .get(&fingerprint)
        .map(|meta| (meta.access_count, meta.is_high_value()))
        .unwrap_or((1, false));

    Some(MemoryEntry {
        content: content.to_string(),
        date,
        access_count,
        is_high_value,
    })
}

/// 按 Token 限制选择记忆条目
fn select_entries_by_token_limit(entries: &[MemoryEntry]) -> Vec<&MemoryEntry> {
    let mut selected = Vec::new();
    let mut current_chars = 0;
    let max_chars = MAX_TOKENS * APPROX_CHARS_PER_TOKEN;

    // 预留一些空间用于 Markdown 包装
    let wrapper_chars = "[USER_MEMORY]\n\n[/USER_MEMORY]".len() + 20; // 额外缓冲

    for entry in entries {
        let entry_chars = entry.content.len() + 10; // 加上日期格式

        if current_chars + entry_chars + wrapper_chars <= max_chars {
            selected.push(entry);
            current_chars += entry_chars;
        } else {
            break; // 达到 Token 限制
        }
    }

    selected
}

/// 格式化记忆注入块
fn format_memory_injection(entries: &[&MemoryEntry]) -> String {
    if entries.is_empty() {
        return String::new();
    }

    let mut result = String::from("[USER_MEMORY]\n\n");

    for entry in entries {
        result.push_str(&entry.content);
        result.push('\n');
    }

    result.push_str("\n[/USER_MEMORY]");
    result
}

/// 注入记忆到 system prompt
pub fn inject_memories_into_system_prompt(system_prompt: &str) -> String {
    let memories = load_memories_for_injection();

    if memories.is_empty() {
        return system_prompt.to_string();
    }

    format!("{}\n\n{}", system_prompt, memories)
}

// ============ 单元测试 ============

#[cfg(test)]
mod tests {
    use super::*;
    use serial_test::serial;
    use std::sync::Mutex;

    /// 保护 HOME 环境变量的互斥锁（set_var 不是线程安全的）
    static HOME_LOCK: Mutex<()> = Mutex::new(());

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
    fn test_parse_memory_line_valid() {
        let metadata_store = MetadataStore::new();
        let line = "- [2025-05-09] 使用 TypeScript 而非 JavaScript";

        let entry = parse_memory_line(line, &metadata_store).unwrap();
        assert_eq!(entry.content, "使用 TypeScript 而非 JavaScript");
        assert_eq!(entry.date, "2025-05-09");
        assert_eq!(entry.access_count, 1); // 无元数据时默认 1
        assert!(!entry.is_high_value);
    }

    #[test]
    fn test_parse_memory_line_invalid() {
        let metadata_store = MetadataStore::new();

        // 空行
        assert!(parse_memory_line("", &metadata_store).is_none());
        // 不以 "- [" 开头
        assert!(parse_memory_line("not a memory", &metadata_store).is_none());
        // 空内容
        assert!(parse_memory_line("- []", &metadata_store).is_none());
        assert!(parse_memory_line("- []   ", &metadata_store).is_none());
    }

    #[test]
    fn test_parse_memory_entries() {
        let memories = "# User Memories\n\n## Preferences\n\
            - [2025-05-09] 使用 TypeScript\n\
            - [2025-05-08] 用中文回答\n";

        let metadata_store = MetadataStore::new();
        let entries = parse_memory_entries(memories, &metadata_store);

        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].content, "使用 TypeScript");
        assert_eq!(entries[1].content, "用中文回答");
    }

    #[test]
    fn test_select_entries_by_token_limit() {
        let entries = vec![
            MemoryEntry {
                content: "Entry 1".to_string(),
                date: "2025-05-09".to_string(),
                access_count: 1,
                is_high_value: false,
            },
            MemoryEntry {
                content: "Entry 2".to_string(),
                date: "2025-05-08".to_string(),
                access_count: 1,
                is_high_value: false,
            },
        ];

        let selected = select_entries_by_token_limit(&entries);
        assert_eq!(selected.len(), 2);
    }

    #[test]
    fn test_format_memory_injection() {
        let entry1 = MemoryEntry {
            content: "使用 TypeScript".to_string(),
            date: "2025-05-09".to_string(),
            access_count: 1,
            is_high_value: false,
        };
        let entry2 = MemoryEntry {
            content: "用中文回答".to_string(),
            date: "2025-05-08".to_string(),
            access_count: 1,
            is_high_value: false,
        };

        let entries = vec![&entry1, &entry2];

        let result = format_memory_injection(&entries);
        assert!(result.contains("[USER_MEMORY]"));
        assert!(result.contains("使用 TypeScript"));
        assert!(result.contains("用中文回答"));
        assert!(result.contains("[/USER_MEMORY]"));
    }

    #[test]
    fn test_format_memory_injection_empty() {
        let result = format_memory_injection(&[]);
        assert!(result.is_empty());
    }

    #[test]
    fn test_load_memories_for_injection_no_file() {
        let _lock = HOME_LOCK.lock().unwrap();
        let temp_dir = setup_test_home("injection_no_file");
        let original_home = std::env::var("HOME").ok();
        std::env::set_var("HOME", temp_dir.to_str().unwrap());

        let result = load_memories_for_injection();
        assert!(result.is_empty(), "无记忆文件时应返回空字符串");

        restore_home(original_home);
        std::fs::remove_dir_all(temp_dir).ok();
    }

    #[test]
    #[serial]
    fn test_load_memories_for_injection_with_file() {
        let _lock = HOME_LOCK.lock().unwrap();
        let temp_dir = setup_test_home("injection_with_file");
        let original_home = std::env::var("HOME").ok();
        std::env::set_var("HOME", temp_dir.to_str().unwrap());

        // 创建 .ifai 目录
        let ifai_dir = temp_dir.join(".ifai");
        std::fs::create_dir_all(&ifai_dir).ok();

        // 创建测试记忆文件
        let memories = "# User Memories\n\n## Preferences\n\
            - [2025-05-09] 使用 TypeScript\n\
            - [2025-05-08] 用中文回答\n";
        let memory_path = ifai_dir.join("memories.md");
        std::fs::write(&memory_path, memories).expect("Failed to write memory file");

        let result = load_memories_for_injection();
        assert!(
            result.contains("[USER_MEMORY]"),
            "Result should contain [USER_MEMORY]: {}",
            result
        );
        assert!(result.contains("使用 TypeScript"));
        assert!(result.contains("用中文回答"));
        assert!(result.contains("[/USER_MEMORY]"));

        restore_home(original_home);
        std::fs::remove_dir_all(temp_dir).ok();
    }

    #[test]
    fn test_inject_memories_into_system_prompt() {
        let _lock = HOME_LOCK.lock().unwrap();
        let system_prompt = "You are a helpful assistant.";
        let temp_dir = setup_test_home("inject");
        let original_home = std::env::var("HOME").ok();
        std::env::set_var("HOME", temp_dir.to_str().unwrap());

        // 确保 .ifai 目录不存在
        let ifai_dir = temp_dir.join(".ifai");
        std::fs::remove_dir_all(&ifai_dir).ok();

        // 无记忆文件时
        let result = inject_memories_into_system_prompt(system_prompt);
        assert_eq!(
            result, system_prompt,
            "Without memory file, should return original prompt"
        );

        // 有记忆文件时
        std::fs::create_dir_all(&ifai_dir).ok();
        let memories = "# User Memories\n\n## Preferences\n- [2025-05-09] 使用 TypeScript\n";
        let memory_path = ifai_dir.join("memories.md");
        std::fs::write(&memory_path, memories).expect("Failed to write memory file");

        let result = inject_memories_into_system_prompt(system_prompt);
        assert!(
            result.contains(system_prompt),
            "Result should contain system prompt"
        );
        assert!(
            result.contains("[USER_MEMORY]"),
            "Result should contain [USER_MEMORY]: {}",
            result
        );
        assert!(
            result.contains("使用 TypeScript"),
            "Result should contain memory content: {}",
            result
        );

        restore_home(original_home);
        std::fs::remove_dir_all(temp_dir).ok();
    }
}
