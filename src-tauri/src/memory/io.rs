//! 记忆文件 IO 操作
//!
//! 负责读取和写入 `~/.ifai/memories.md` 文件。

use std::fs;
use std::path::PathBuf;
use dirs::home_dir;

/// IfAI 数据目录
pub fn ifai_dir() -> PathBuf {
    home_dir()
        .expect("无法获取 home 目录")
        .join(".ifai")
}

/// 记忆文件路径
pub fn memories_file() -> PathBuf {
    ifai_dir().join("memories.md")
}

/// 加载记忆文件内容
///
/// 如果文件不存在或读取失败，返回 None（降级处理）
pub fn load_memories() -> Option<String> {
    let path = memories_file();
    if !path.exists() {
        return None;
    }

    fs::read_to_string(&path)
        .map_err(|e| {
            eprintln!("⚠️  读取记忆文件失败: {}，继续执行（降级）", e);
            e
        })
        .ok()
}

/// 保存记忆文件内容
pub fn save_memories(content: &str) -> Result<(), std::io::Error> {
    let path = memories_file();

    // 确保 .ifai 目录存在
    if !ifai_dir().exists() {
        fs::create_dir_all(&ifai_dir())?;
    }

    fs::write(&path, content)?;
    Ok(())
}

/// 格式化初始记忆文件
pub fn format_initial_memories(section_title: &str, entry: &str) -> String {
    format!(
        "# User Memories\n# Last updated: {}\n\n{}\n{}\n",
        chrono::Local::now().format("%Y-%m-%d"),
        section_title,
        entry
    )
}

/// 追加条目到指定 section
///
/// # Arguments
/// * `memories` - 现有的记忆文件内容
/// * `section_title` - 目标 section 标题（可能包含多行，如 "## Hall\n### Room"）
/// * `entry` - 要追加的条目
///
/// # Returns
/// 更新后的完整记忆文件内容
pub fn append_to_section(memories: &str, section_title: &str, entry: &str) -> String {
    let lines: Vec<&str> = memories.lines().collect();

    // section_title 可能是多行（如 "## Hall\n### Room"）
    // 我们需要找到最后一个匹配的位置，然后在其后追加
    let section_lines: Vec<&str> = section_title.lines().collect();
    let last_section_line = section_lines.last().expect("section_title 不应为空");

    // 从后往前查找，确保找到的是最后一个匹配
    let mut insert_pos = None;
    for (i, line) in lines.iter().enumerate().rev() {
        if line.trim() == last_section_line.trim() {
            // 向前检查是否匹配所有 section_lines
            let mut matched = true;
            for (j, section_line) in section_lines.iter().enumerate().rev() {
                let line_idx = i as i32 - (section_lines.len() - 1 - j) as i32;
                if line_idx < 0 {
                    matched = false;
                    break;
                }
                let line_idx = line_idx as usize;
                if lines[line_idx].trim() != section_line.trim() {
                    matched = false;
                    break;
                }
            }

            if matched {
                insert_pos = Some(i + 1);
                break;
            }
        }
    }

    match insert_pos {
        Some(pos) => {
            // 找到 section，在其后追加
            let mut result: Vec<String> = lines.iter().map(|s| s.to_string()).collect();

            // 检查 section 后是否已有内容
            // 跳过空行，找到第一个非空行或下一个 section
            let mut content_start = pos;
            while content_start < result.len() && result[content_start].trim().is_empty() {
                content_start += 1;
            }

            // 如果 section 后没有内容，或者下一个是 section，直接追加
            if content_start >= result.len() || result[content_start].starts_with("#") {
                result.insert(pos, entry.to_string());
            } else {
                // section 后已有内容，在内容后追加
                // 找到 section 内容的结束位置（下一个 section 或文件末尾）
                let mut content_end = content_start;
                while content_end < result.len() && !result[content_end].starts_with("#") {
                    content_end += 1;
                }
                result.insert(content_end, entry.to_string());
            }

            result.join("\n")
        }
        None => {
            // 未找到 section，追加到文件末尾
            format!("{}\n\n{}\n{}\n", memories, section_title, entry)
        }
    }
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
    fn test_ifai_dir() {
        let dir = ifai_dir();
        assert!(dir.ends_with(".ifai"));
        assert!(dir.is_absolute());
    }

    #[test]
    fn test_memories_file() {
        let file = memories_file();
        assert!(file.ends_with(".ifai/memories.md"));
        assert!(file.is_absolute());
    }

    #[test]
    fn test_format_initial_memories() {
        let result = format_initial_memories("## Preferences", "- [2025-05-09] 使用 TypeScript");
        assert!(result.contains("# User Memories"));
        assert!(result.contains("## Preferences"));
        assert!(result.contains("- [2025-05-09] 使用 TypeScript"));
        assert!(result.contains("Last updated:"));
    }

    #[test]
    fn test_append_to_section_new_file() {
        let memories = "";
        let section_title = "## Preferences";
        let entry = "- [2025-05-09] 使用 TypeScript";

        let result = append_to_section(memories, section_title, entry);
        assert!(result.contains("## Preferences"));
        assert!(result.contains("- [2025-05-09] 使用 TypeScript"));
    }

    #[test]
    fn test_append_to_section_existing_section() {
        let memories = "# User Memories\n\n## Preferences\n- [2025-05-08] 使用 JavaScript\n";
        let section_title = "## Preferences";
        let entry = "- [2025-05-09] 使用 TypeScript";

        let result = append_to_section(memories, section_title, entry);
        assert!(result.contains("- [2025-05-08] 使用 JavaScript"));
        assert!(result.contains("- [2025-05-09] 使用 TypeScript"));
    }

    #[test]
    fn test_append_to_section_nested_section() {
        // 测试多级 section（2 层 Hall/Room）
        let memories = "# User Memories\n\n## Preferences\n### programming-languages\n- [2025-05-08] 使用 JavaScript\n";
        let section_title = "## Preferences\n### programming-languages";
        let entry = "- [2025-05-09] 使用 TypeScript";

        let result = append_to_section(memories, section_title, entry);
        assert!(result.contains("## Preferences"));
        assert!(result.contains("### programming-languages"));
        assert!(result.contains("- [2025-05-08] 使用 JavaScript"));
        assert!(result.contains("- [2025-05-09] 使用 TypeScript"));
    }

    #[test]
    fn test_append_to_section_create_new_section() {
        let memories = "# User Memories\n\n## Preferences\n- [2025-05-08] 使用 JavaScript\n";
        let section_title = "## Project Knowledge";
        let entry = "- [2025-05-09] 使用 Rust";

        let result = append_to_section(memories, section_title, entry);
        assert!(result.contains("## Preferences"));
        assert!(result.contains("## Project Knowledge"));
        assert!(result.contains("- [2025-05-09] 使用 Rust"));
    }

    #[test]
    fn test_append_to_section_3_layer_wing() {
        // 测试 3 层 Wing/Hall/Room
        let memories = "# User Memories\n\n## Project\n### Preferences\n#### programming-languages\n- [2025-05-08] 使用 C++\n";
        let section_title = "## Project\n### Preferences\n#### programming-languages";
        let entry = "- [2025-05-09] 使用 Rust";

        let result = append_to_section(memories, section_title, entry);
        assert!(result.contains("## Project"));
        assert!(result.contains("### Preferences"));
        assert!(result.contains("#### programming-languages"));
        assert!(result.contains("- [2025-05-08] 使用 C++"));
        assert!(result.contains("- [2025-05-09] 使用 Rust"));
    }

    #[test]
    fn test_append_to_section_multiple_sections_same_name() {
        // 测试多个同名 section（找到最后一个）
        let memories = "# User Memories\n\n## Preferences\n### old-room\n- [2025-05-08] 旧条目\n\n## Project\n\n## Preferences\n### new-room\n- [2025-05-09] 新条目\n";
        let section_title = "## Preferences\n### new-room";
        let entry = "- [2025-05-10] 更新的条目";

        let result = append_to_section(memories, section_title, entry);
        // 应该追加到最后一个 "## Preferences\n### new-room" 后
        let lines: Vec<&str> = result.lines().collect();
        let new_room_pos = lines.iter().rposition(|l| l.contains("### new-room")).unwrap();
        assert!(lines[new_room_pos + 1].contains("- [2025-05-09] 新条目"));
        assert!(lines[new_room_pos + 2].contains("- [2025-05-10] 更新的条目"));
    }

    #[test]
    fn test_load_memories_file_not_exist() {
        // 测试文件不存在的降级处理
        let temp_dir = setup_test_home("load");
        let original_home = std::env::var("HOME").ok();
        std::env::set_var("HOME", temp_dir.to_str().unwrap());

        let result = load_memories();
        assert!(result.is_none(), "文件不存在时应返回 None");

        restore_home(original_home);
        std::fs::remove_dir_all(temp_dir).ok();
    }

    #[test]
    fn test_save_and_load_memories() {
        // 测试保存和加载
        let temp_dir = setup_test_home("save_load");
        let original_home = std::env::var("HOME").ok();
        std::env::set_var("HOME", temp_dir.to_str().unwrap());

        let content = "# Test Memories\n\n## Test\n- entry\n";
        assert!(save_memories(content).is_ok());

        let loaded = load_memories();
        assert!(loaded.is_some());
        assert_eq!(loaded.unwrap(), content);

        restore_home(original_home);
        std::fs::remove_dir_all(temp_dir).ok();
    }
}
