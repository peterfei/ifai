//! MemorySave 工具定义
//!
//! AI 主动保存记忆的工具，支持 3 层空间隐喻。

use crate::memory::categories::path_schema;
use serde_json::json;

/// MemorySave 工具的 JSON Schema
pub fn memory_save_schema() -> serde_json::Value {
    json!({
        "type": "object",
        "properties": {
            "path": path_schema(),
            "content": {
                "type": "string",
                "description": "The memory content (one sentence, concise)"
            }
        },
        "required": ["path", "content"]
    })
}

/// 处理 MemorySave 工具调用
pub fn handle_memory_save(path: &str, content: &str) -> Result<String, String> {
    use crate::memory::categories::MemoryPath;
    use crate::memory::io::{load_memories, save_memories, append_to_section, format_initial_memories};
    use crate::memory::meta::content_fingerprint;
    use chrono::Local;

    // 1. 解析路径
    let memory_path = path.parse::<MemoryPath>()
        .map_err(|e| format!("Invalid path: {}", e))?;

    // 2. 验证内容
    let content = content.trim();
    if content.is_empty() {
        return Err("Content cannot be empty".to_string());
    }

    // 3. 生成条目
    let today = Local::now().format("%Y-%m-%d").to_string();
    let entry = format!("- [{}] {}", today, content);

    // 4. 保存到文件
    match load_memories() {
        Some(mut existing) => {
            // 文件已存在，追加到 section
            let section_title = memory_path.section_title();
            let updated = append_to_section(&existing, &section_title, &entry);
            save_memories(&updated)
                .map_err(|e| format!("Failed to save memories: {}", e))?;
            Ok(format!("✓ Saved to {}: {}", memory_path.display(), content))
        }
        None => {
            // 文件不存在，创建新文件
            let section_title = memory_path.section_title();
            let full = format_initial_memories(&section_title, &entry);
            save_memories(&full)
                .map_err(|e| format!("Failed to save memories: {}", e))?;
            Ok(format!("✓ Created in {}: {}", memory_path.display(), content))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_memory_save_schema() {
        let schema = memory_save_schema();
        assert_eq!(schema["type"], "object");
        assert!(schema["properties"]["path"].is_object());
        assert!(schema["properties"]["content"].is_object());
        assert_eq!(schema["required"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn test_handle_memory_save_invalid_path() {
        let result = handle_memory_save("InvalidPath", "content");
        assert!(result.is_err());
    }

    #[test]
    fn test_handle_memory_save_empty_content() {
        let result = handle_memory_save("Preferences/test", "   ");
        assert!(result.is_err());
    }

    #[test]
    fn test_handle_memory_save_2_layer_path() {
        let temp_dir = std::env::temp_dir().join("ifai_test_save_2layer");
        std::fs::create_dir_all(&temp_dir).ok();

        let original_home = std::env::var("HOME").ok();
        std::env::set_var("HOME", temp_dir.to_str().unwrap());

        let result = handle_memory_save("Preferences/programming-languages", "使用 Rust");
        assert!(result.is_ok());
        assert!(result.unwrap().contains("使用 Rust"));

        if let Some(home) = original_home {
            std::env::set_var("HOME", home);
        }
        std::fs::remove_dir_all(temp_dir).ok();
    }

    #[test]
    fn test_handle_memory_save_3_layer_path() {
        let temp_dir = std::env::temp_dir().join("ifai_test_save_3layer");
        std::fs::create_dir_all(&temp_dir).ok();

        let original_home = std::env::var("HOME").ok();
        std::env::set_var("HOME", temp_dir.to_str().unwrap());

        let result = handle_memory_save("project/Preferences/programming-languages", "使用 TypeScript");
        assert!(result.is_ok());
        assert!(result.unwrap().contains("使用 TypeScript"));

        if let Some(home) = original_home {
            std::env::set_var("HOME", home);
        }
        std::fs::remove_dir_all(temp_dir).ok();
    }

    #[test]
    fn test_handle_memory_save_append_to_existing() {
        let temp_dir = std::env::temp_dir().join("ifai_test_save_append");
        std::fs::create_dir_all(&temp_dir).ok();

        let original_home = std::env::var("HOME").ok();
        std::env::set_var("HOME", temp_dir.to_str().unwrap());

        // 第一次保存
        let result1 = handle_memory_save("Preferences/test", "第一个条目");
        assert!(result1.is_ok());
        println!("第一次保存后:\n{}", crate::memory::io::load_memories().unwrap_or_default());

        // 第二次保存到同一个 section
        let result2 = handle_memory_save("Preferences/test", "第二个条目");
        assert!(result2.is_ok());
        assert!(result2.unwrap().contains("第二个条目"));

        // 验证文件包含两个条目
        let content = crate::memory::io::load_memories().unwrap_or_default();
        println!("第二次保存后:\n{}", content);
        assert!(content.contains("第一个条目"), "文件应包含第一个条目:\n{}", content);
        assert!(content.contains("第二个条目"), "文件应包含第二个条目:\n{}", content);

        if let Some(home) = original_home {
            std::env::set_var("HOME", home);
        }
        std::fs::remove_dir_all(temp_dir).ok();
    }
}
