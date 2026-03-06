#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_ifai_config() {
        let content = r#"---
default_language: en-US
ai_provider_id: zhipi
custom_instructions: |
  This is a test.
  Multi-line instructions.
---

# Some notes
"#;

        let config = parse_frontmatter(content).unwrap();
        assert_eq!(config.default_language, Some("en-US".to_string()));
        assert_eq!(config.ai_provider_id, Some("zhipi".to_string()));
        assert!(config.custom_instructions.is_some());
    }

    #[test]
    fn test_parse_chinese_language() {
        let content = r#"---
default_language: zh-CN
custom_instructions: |
  请使用中文回答
---

# 项目说明
"#;

        let config = parse_frontmatter(content).unwrap();
        assert_eq!(config.default_language, Some("zh-CN".to_string()));
    }

    #[test]
    fn test_ensure_prompts_incremental_update() {
        use tempfile::tempdir;
        use std::fs;

        let dir = tempdir().unwrap();
        let project_root = dir.path().to_str().unwrap();
        let ifai_prompts_dir = dir.path().join(".ifai/prompts");
        
        // 1. 模拟旧版本：只存在目录和其中一个文件
        fs::create_dir_all(&ifai_prompts_dir).unwrap();
        let legacy_file = ifai_prompts_dir.join("system/main.md");
        fs::create_dir_all(legacy_file.parent().unwrap()).unwrap();
        fs::write(&legacy_file, "legacy content").unwrap();

        // 2. 执行初始化逻辑
        ensure_prompts_initialized(project_root).unwrap();

        // 3. 验证是否补全了其他内置文件 (例如 system/conversation-summary.md)
        let summary_file = ifai_prompts_dir.join("system/conversation-summary.md");
        assert!(summary_file.exists(), "Should have supplemented missing builtin templates even if directory exists");
        
        // 4. 验证已存在的文件是否被保护（PIVO 原则：不覆盖用户修改）
        let content = fs::read_to_string(&legacy_file).unwrap();
        assert_eq!(content, "legacy content", "Should NOT overwrite existing local modifications");
    }
}
