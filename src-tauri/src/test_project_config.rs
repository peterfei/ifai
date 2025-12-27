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
}
