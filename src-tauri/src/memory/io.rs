//! 记忆文件 IO 操作
//!
//! 负责读取和写入 `~/.ifai/memories.md` 文件。

use dirs::home_dir;
use std::fs;
use std::path::PathBuf;

/// IfAI 数据目录
pub fn ifai_dir() -> PathBuf {
    home_dir().expect("无法获取 home 目录").join(".ifai")
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

/// 🔥 确保 memories.md 文件存在（首次运行自动创建骨架文件）
pub fn ensure_memories_file() -> Result<PathBuf, String> {
    let path = memories_file();
    if path.exists() {
        return Ok(path);
    }
    let content = "\
# User Memories
# 首次初始化自动创建

## Preferences
# 在这里记录用户的偏好设置，例如：- [YYYY-MM-DD] 偏好使用 TypeScript

## Decisions
# 在这里记录技术决策，例如：- [YYYY-MM-DD] 采用 PostgreSQL 作为主数据库

## Knowledge
# 在这里记录项目知识点，例如：- [YYYY-MM-DD] Rust 的所有权系统...
"
    .to_string();
    // 确保.ifai 目录存在
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }
    fs::write(&path, content).map_err(|e| format!("Failed to write memories.md: {}", e))?;
    Ok(path)
}

/// 提取条目内容（去除日期部分）
///
/// 例如："- [2025-05-09] 使用 TypeScript" -> "使用 TypeScript"
fn extract_entry_content(entry: &str) -> String {
    entry
        .trim()
        .trim_start_matches('-')
        .trim()
        .trim_start_matches('[')
        .split(']')
        .nth(1)
        .unwrap_or("")
        .trim()
        .to_string()
}

/// 追加条目到指定 section（带去重）
///
/// # Arguments
/// * `memories` - 现有的记忆文件内容
/// * `section_title` - 目标 section 标题（可能包含多行，如 "## Hall\n### Room"）
/// * `entry` - 要追加的条目
///
/// # Returns
/// 更新后的完整记忆文件内容
///
/// # 去重逻辑
/// - 如果 section 中已存在相同内容的条目（忽略日期），则更新日期
/// - 如果不存在，则追加新条目
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

            // 🔥 去重检查：提取新条目的内容（不含日期）
            let new_entry_content = extract_entry_content(entry);

            // 找到 section 内容的结束位置（下一个 section 或文件末尾）
            let mut content_end = content_start;
            while content_end < result.len() && !result[content_end].starts_with("#") {
                content_end += 1;
            }

            // 在 section 内容中查找是否已存在相同内容
            let mut duplicate_found = false;
            for i in content_start..content_end {
                let existing_content = extract_entry_content(&result[i]);
                if existing_content == new_entry_content {
                    // 找到重复，更新日期（替换整行）
                    result[i] = entry.to_string();
                    duplicate_found = true;
                    break;
                }
            }

            // 如果没有重复，追加新条目
            if !duplicate_found {
                if content_start >= result.len() || result[content_start].starts_with("#") {
                    result.insert(pos, entry.to_string());
                } else {
                    result.insert(content_end, entry.to_string());
                }
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
    use serial_test::serial;

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
        let new_room_pos = lines
            .iter()
            .rposition(|l| l.contains("### new-room"))
            .unwrap();
        assert!(lines[new_room_pos + 1].contains("- [2025-05-09] 新条目"));
        assert!(lines[new_room_pos + 2].contains("- [2025-05-10] 更新的条目"));
    }

    #[test]
    fn test_append_to_section_deduplication() {
        // 测试去重：相同内容应该更新日期，而不是添加新条目
        let memories = "# User Memories\n\n## Preferences\n- [2025-05-08] 使用 TypeScript\n";
        let section_title = "## Preferences";
        let entry = "- [2025-05-10] 使用 TypeScript";

        let result = append_to_section(memories, section_title, entry);

        // 应该只有一条记录，且日期已更新
        assert_eq!(
            result.matches("使用 TypeScript").count(),
            1,
            "应该只有一条 TypeScript 记录"
        );
        assert!(
            result.contains("- [2025-05-10] 使用 TypeScript"),
            "日期应该更新"
        );
        assert!(
            !result.contains("- [2025-05-08] 使用 TypeScript"),
            "旧日期应该被替换"
        );
    }

    #[test]
    fn test_append_to_section_no_duplication_for_different_content() {
        // 测试不同内容应该正常添加
        let memories = "# User Memories\n\n## Preferences\n- [2025-05-08] 使用 JavaScript\n";
        let section_title = "## Preferences";
        let entry = "- [2025-05-10] 使用 TypeScript";

        let result = append_to_section(memories, section_title, entry);

        // 应该有两条记录
        assert!(result.contains("- [2025-05-08] 使用 JavaScript"));
        assert!(result.contains("- [2025-05-10] 使用 TypeScript"));
    }

    #[test]
    fn test_append_to_section_deduplication_nested() {
        // 测试嵌套 section 的去重
        let memories = "# User Memories\n\n## Preferences\n### programming-languages\n- [2025-05-08] 使用 Rust\n";
        let section_title = "## Preferences\n### programming-languages";
        let entry = "- [2025-05-10] 使用 Rust";

        let result = append_to_section(memories, section_title, entry);

        // 应该只有一条记录
        assert_eq!(result.matches("使用 Rust").count(), 1);
        assert!(result.contains("- [2025-05-10] 使用 Rust"));
        assert!(!result.contains("- [2025-05-08] 使用 Rust"));
    }

    #[test]
    fn test_extract_entry_content() {
        // 测试内容提取函数
        assert_eq!(
            extract_entry_content("- [2025-05-09] 使用 TypeScript"),
            "使用 TypeScript"
        );
        assert_eq!(
            extract_entry_content("  - [2025-05-09] 测试内容  "),
            "测试内容"
        );
        assert_eq!(extract_entry_content("- [2025-05-09] Content"), "Content");
    }

    #[test]
    #[serial]
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
    #[serial]
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
