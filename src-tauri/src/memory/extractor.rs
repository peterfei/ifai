//! 记忆提取器（会话后批量提取）
//!
//! 从对话历史中提取重要记忆并保存到持久化存储。

use crate::memory::io::{load_memories, save_memories, append_to_section};
use chrono::Local;

/// 记忆提取结果
#[derive(Debug, Clone)]
pub struct ExtractedMemory {
    /// 记忆路径（例如：Preferences, Decisions, Knowledge）
    pub path: String,
    /// 记忆内容
    pub content: String,
}

/// 生成记忆提取的 prompt
///
/// 这个 prompt 会发送给 LLM，要求它从对话历史中提取重要记忆
pub fn build_extraction_prompt(conversation_summary: &str) -> String {
    format!(
        r#"你是一个专业的记忆提取助手。请从以下对话中提取重要的用户偏好、决策和知识。

## 提取规则

1. **用户偏好**：编程语言、工具、框架、工作流等个人偏好
2. **重要决策**：项目架构决策、技术选型、设计模式选择
3. **领域知识**：项目特定的业务逻辑、API 使用方式、配置要求

## 输出格式

对于每个提取的记忆，按以下格式输出：

**[类别]** 记忆内容

例如：
**[Preferences]** 使用 TypeScript 而非 JavaScript
**[Decisions]** 采用 PostgreSQL 作为主数据库
**[Knowledge]** API 端点位于 /api/v1/

## 注意事项

- 每条记忆必须简洁明了（一句话）
- 只提取重要且可能长期有用的信息
- 忽略临时性、一次性的信息
- 优先提取用户明确表达的偏好
- 如果对话中没有值得保存的记忆，输出 "NONE"

## 对话摘要

{}

---

请开始提取："#,
        conversation_summary
    )
}

/// 解析 LLM 返回的记忆提取结果
///
/// 输入格式示例：
/// ```text
/// **[Preferences]** 使用 TypeScript 而非 JavaScript
/// **[Decisions]** 采用 PostgreSQL 作为主数据库
/// ```
pub fn parse_extraction_result(result: &str) -> Vec<ExtractedMemory> {
    let mut memories = Vec::new();

    for line in result.lines() {
        let line = line.trim();

        // 跳过空行和 "NONE"
        if line.is_empty() || line == "NONE" {
            continue;
        }

        // 解析格式：**[Category]** content
        if let Some(start) = line.find("**[") {
            if let Some(end) = line.find("]**") {
                let category = line[start + 3..end].to_string();
                let content = line[end + 3..].trim().to_string();

                if !content.is_empty() {
                    memories.push(ExtractedMemory {
                        path: category,
                        content,
                    });
                }
            }
        }
    }

    memories
}

/// 保存提取的记忆到 memories.md
pub fn save_extracted_memories(memories: &[ExtractedMemory]) -> Result<usize, String> {
    if memories.is_empty() {
        return Ok(0);
    }

    // 1. 加载现有记忆文件
    let existing = load_memories()
        .unwrap_or_else(|| {
            // 文件不存在时创建初始结构
            String::from("# User Memories\n\n")
        });

    // 2. 为每条记忆生成条目
    let today = Local::now().format("%Y-%m-%d").to_string();
    let mut updated = existing;

    for memory in memories {
        let entry = format!("- [{}] {}", today, memory.content);

        // 查找或创建对应的 section
        let section_title = if memory.path == "Preferences" {
            "## Preferences"
        } else if memory.path == "Decisions" {
            "## Decisions"
        } else if memory.path == "Knowledge" {
            "## Knowledge"
        } else {
            // 未知类别，归入 Preferences
            "## Preferences"
        };

        // 追加到 section
        updated = append_to_section(&updated, section_title, &entry);
    }

    // 3. 保存文件
    save_memories(&updated)
        .map_err(|e| format!("Failed to save extracted memories: {}", e))?;

    Ok(memories.len())
}

/// 完整的提取流程：从对话摘要到保存记忆
///
/// 这个函数期望由上层代码：
/// 1. 生成对话摘要
/// 2. 调用 LLM 获取提取结果
/// 3. 调用此函数保存
pub fn extract_and_save_memories(llm_extraction_result: &str) -> Result<usize, String> {
    let memories = parse_extraction_result(llm_extraction_result);
    save_extracted_memories(&memories)
}

/// 会话结束时调用（占位实现）
///
/// TODO: 在实际使用中，这个函数应该：
/// 1. 收集会话历史
/// 2. 生成对话摘要
/// 3. 调用 LLM 进行记忆提取
/// 4. 保存提取的记忆
///
/// 当前实现：打印提示信息，供手动测试
#[deprecated(note = "Use extract_memories_with_llm instead for actual LLM integration")]
pub fn on_session_end(conversation_summary: &str) -> Result<usize, String> {
    // 当前是占位实现，打印提示信息
    eprintln!("[Memory Extraction] Session ended. Summary: {} chars", conversation_summary.len());
    eprintln!("[Memory Extraction] To enable automatic memory extraction, implement LLM call.");
    eprintln!("[Memory Extraction] Use build_extraction_prompt() to generate the prompt.");
    Ok(0)
}

/// 🆕 实际的记忆提取函数（调用 LLM）
///
/// 这个函数会：
/// 1. 生成提取 prompt
/// 2. 调用 LLM API（使用简单的 HTTP 请求）
/// 3. 解析并保存提取的记忆
///
/// 参数：
/// - `api_key`: LLM API key
/// - `conversation_summary`: 对话摘要
/// - `provider`: LLM provider（anthropic, openai, deepseek 等）
///
/// 返回：提取的记忆数量
///
/// 注意：这是一个 async 函数，需要在 tokio runtime 中调用
pub async fn extract_memories_with_llm(
    api_key: &str,
    conversation_summary: &str,
    provider: &str,
) -> Result<usize, String> {
    use reqwest::Client;
    use serde_json::json;

    // 1. 生成提取 prompt
    let prompt = build_extraction_prompt(conversation_summary);

    // 2. 根据 provider 选择 API endpoint 并构建请求
    let client = Client::new();
    let (api_url, model_name) = match provider {
        "anthropic" => (
            "https://api.anthropic.com/v1/messages",
            "claude-3-haiku-20240307"
        ),
        "openai" => (
            "https://api.openai.com/v1/chat/completions",
            "gpt-3.5-turbo"
        ),
        "deepseek" => (
            "https://api.deepseek.com/v1/chat/completions",
            "deepseek-chat"
        ),
        _ => return Err(format!("Unsupported provider: {}", provider)),
    };

    let response = if provider == "anthropic" {
        // Anthropic API 格式
        let body = json!({
            "model": model_name,
            "max_tokens": 1024,
            "messages": [
                {
                    "role": "user",
                    "content": prompt
                }
            ]
        });

        client
            .post(api_url)
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Failed to call Anthropic API: {}", e))?
    } else {
        // OpenAI-compatible API 格式
        let body = json!({
            "model": model_name,
            "messages": [
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            "max_tokens": 1024
        });

        client
            .post(api_url)
            .header("authorization", format!("Bearer {}", api_key))
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Failed to call {} API: {}", provider, e))?
    };

    // 5. 解析响应
    let response_json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse LLM response: {}", e))?;

    let extraction_result = if provider == "anthropic" {
        // Anthropic 响应格式
        response_json["content"][0]["text"]
            .as_str()
            .ok_or("Invalid Anthropic response format")?
    } else {
        // OpenAI 响应格式
        response_json["choices"][0]["message"]["content"]
            .as_str()
            .ok_or("Invalid OpenAI response format")?
    };

    // 6. 解析并保存记忆
    let count = extract_and_save_memories(extraction_result)?;

    eprintln!("[Memory Extraction] Successfully extracted and saved {} memories", count);
    Ok(count)
}

/// 🆕 简化版记忆提取（同步，适合 CLI）
///
/// 这个版本不依赖 async，使用阻塞式 HTTP 调用
/// 适用于在 CLI 退出时快速提取记忆
///
/// 当前实现：演示版本，打印提示信息
pub fn extract_memories_simple(
    conversation_summary: &str,
) -> Result<usize, String> {
    // 简化版：打印对话摘要，供手动测试
    eprintln!("[Memory Extraction] Simple extraction (demo mode)");
    eprintln!("[Memory Extraction] Conversation summary ({} chars):", conversation_summary.len());
    eprintln!("{}", conversation_summary.chars().take(200).collect::<String>());
    eprintln!("[Memory Extraction] To enable real LLM extraction, use extract_memories_with_llm() in async context");
    Ok(0)
}

// ============ 单元测试 ============

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_extraction_prompt() {
        let summary = "用户说喜欢用 TypeScript";
        let prompt = build_extraction_prompt(summary);

        assert!(prompt.contains("记忆提取助手"));
        assert!(prompt.contains(summary));
        assert!(prompt.contains("**[Preferences]**"));
        assert!(prompt.contains("**[Decisions]**"));
    }

    #[test]
    fn test_parse_extraction_result_valid() {
        let result = r#"**[Preferences]** 使用 TypeScript 而非 JavaScript
**[Decisions]** 采用 PostgreSQL 作为主数据库
**[Knowledge]** API 端点位于 /api/v1/"#;

        let memories = parse_extraction_result(result);

        assert_eq!(memories.len(), 3);
        assert_eq!(memories[0].path, "Preferences");
        assert_eq!(memories[0].content, "使用 TypeScript 而非 JavaScript");
        assert_eq!(memories[1].path, "Decisions");
        assert_eq!(memories[1].content, "采用 PostgreSQL 作为主数据库");
        assert_eq!(memories[2].path, "Knowledge");
        assert_eq!(memories[2].content, "API 端点位于 /api/v1/");
    }

    #[test]
    fn test_parse_extraction_result_empty() {
        let result = "NONE";
        let memories = parse_extraction_result(result);
        assert_eq!(memories.len(), 0);
    }

    #[test]
    fn test_parse_extraction_result_mixed() {
        let result = r#"**[Preferences]** 使用 TypeScript

一些无关文本...

**[Decisions]** 采用 PostgreSQL"#;

        let memories = parse_extraction_result(result);

        assert_eq!(memories.len(), 2);
        assert_eq!(memories[0].path, "Preferences");
        assert_eq!(memories[1].path, "Decisions");
    }

    #[test]
    fn test_save_extracted_memories_empty() {
        let result = save_extracted_memories(&[]);
        assert_eq!(result.unwrap(), 0);
    }

    #[test]
    fn test_save_extracted_memories_new_file() {
        let temp_dir = std::env::temp_dir().join(format!("ifai_test_extract_new_{}", std::process::id()));
        std::fs::create_dir_all(&temp_dir).ok();

        let original_home = std::env::var("HOME").ok();
        std::env::set_var("HOME", temp_dir.to_str().unwrap());

        // 确保文件不存在
        let ifai_dir = temp_dir.join(".ifai");
        std::fs::remove_dir_all(&ifai_dir).ok();

        let memories = vec![
            ExtractedMemory {
                path: "Preferences".to_string(),
                content: "使用 TypeScript".to_string(),
            },
            ExtractedMemory {
                path: "Decisions".to_string(),
                content: "采用 PostgreSQL".to_string(),
            },
        ];

        let result = save_extracted_memories(&memories);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 2);

        // 验证文件内容
        let content = load_memories().unwrap();
        assert!(content.contains("使用 TypeScript"));
        assert!(content.contains("采用 PostgreSQL"));

        if let Some(home) = original_home {
            std::env::set_var("HOME", home);
        }
        std::fs::remove_dir_all(temp_dir).ok();
    }

    #[test]
    fn test_save_extracted_memories_append() {
        let temp_dir = std::env::temp_dir().join(format!("ifai_test_extract_append_{}", std::process::id()));
        std::fs::create_dir_all(&temp_dir).ok();

        let original_home = std::env::var("HOME").ok();
        std::env::set_var("HOME", temp_dir.to_str().unwrap());

        // 确保清理之前的测试残留
        let ifai_dir = temp_dir.join(".ifai");
        std::fs::remove_dir_all(&ifai_dir).ok();
        std::fs::create_dir_all(&ifai_dir).ok();

        let initial = r#"# User Memories

## Preferences
- [2025-05-08] 用中文回答
"#;
        let memory_path = ifai_dir.join("memories.md");
        std::fs::write(&memory_path, initial).expect("Failed to write memory file");

        // 追加新记忆
        let memories = vec![
            ExtractedMemory {
                path: "Preferences".to_string(),
                content: "使用 TypeScript".to_string(),
            },
        ];

        let result = save_extracted_memories(&memories);
        assert!(result.is_ok());

        // 验证两个条目都存在
        let content = load_memories().unwrap();
        assert!(content.contains("用中文回答"), "Content should contain original entry:\n{}", content);
        assert!(content.contains("使用 TypeScript"), "Content should contain new entry:\n{}", content);

        if let Some(home) = original_home {
            std::env::set_var("HOME", home);
        }
        std::fs::remove_dir_all(temp_dir).ok();
    }

    #[test]
    fn test_extract_and_save_memories() {
        let temp_dir = std::env::temp_dir().join(format!("ifai_test_extract_full_{}", std::process::id()));
        std::fs::create_dir_all(&temp_dir).ok();

        let original_home = std::env::var("HOME").ok();
        std::env::set_var("HOME", temp_dir.to_str().unwrap());

        let llm_result = r#"**[Preferences]** 使用 TypeScript
**[Decisions]** 采用 PostgreSQL"#;

        let result = extract_and_save_memories(llm_result);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 2);

        if let Some(home) = original_home {
            std::env::set_var("HOME", home);
        }
        std::fs::remove_dir_all(temp_dir).ok();
    }
}
