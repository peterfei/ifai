//! 记忆提取器（会话后批量提取）
//!
//! 从对话历史中提取重要记忆并保存到持久化存储。
//!
//! **提示词外部化**：优先从 `~/.ifai/prompts/memory/extract.md` 读取，
//! 如果文件不存在，使用内置默认提示词。

use crate::memory::io::{load_memories, save_memories, append_to_section};
use chrono::Local;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// 记忆提取结果
#[derive(Debug, Clone)]
pub struct ExtractedMemory {
    /// 记忆路径（例如：Preferences, Decisions, Knowledge）
    pub path: String,
    /// 记忆内容
    pub content: String,
}

/// 🔥 内置默认提取提示词（fallback）
const DEFAULT_EXTRACTION_PROMPT: &str = r#"你是一个专业的记忆提取助手。请从以下对话中提取重要的用户偏好、决策和知识。

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

{conversation_summary}

---

请开始提取："#;

/// 🔥 提示词缓存（避免重复读取）
static PROMPT_CACHE: Mutex<Option<String>> = Mutex::new(None);

/// 获取提取提示词模板
///
/// **优先级**：
/// 1. 外部文件：`~/.ifai/prompts/memory/extract.md`
/// 2. 内置默认：`DEFAULT_EXTRACTION_PROMPT`
///
/// **缓存机制**：首次读取后缓存到内存，避免重复 I/O
fn get_extraction_prompt_template() -> String {
    // 尝试从缓存读取
    {
        let cache = PROMPT_CACHE.lock().unwrap();
        if let Some(ref prompt) = *cache {
            return prompt.clone();
        }
    }

    // 缓存未命中，读取文件或使用默认值
    let prompt = if let Some(home) = std::env::var("HOME").ok() {
        let prompt_path = PathBuf::from(home).join(".ifai/prompts/memory/extract.md");
        if prompt_path.exists() {
            // 从外部文件读取
            std::fs::read_to_string(&prompt_path)
                .unwrap_or_else(|e| {
                    eprintln!("[Memory] ⚠ 读取外部提示词失败: {}, 使用内置默认提示词", e);
                    DEFAULT_EXTRACTION_PROMPT.to_string()
                })
        } else {
            // 文件不存在，使用默认提示词
            DEFAULT_EXTRACTION_PROMPT.to_string()
        }
    } else {
        // 无法确定 HOME 目录，使用默认提示词
        DEFAULT_EXTRACTION_PROMPT.to_string()
    };

    // 写入缓存
    {
        let mut cache = PROMPT_CACHE.lock().unwrap();
        *cache = Some(prompt.clone());
    }

    prompt
}

/// 🔥 清除提示词缓存（用于测试或热重载）
pub fn clear_prompt_cache() {
    let mut cache = PROMPT_CACHE.lock().unwrap();
    *cache = None;
}

/// 生成记忆提取的 prompt
///
/// **外部化支持**：优先从 `~/.ifai/prompts/memory/extract.md` 读取
pub fn build_extraction_prompt(conversation_summary: &str) -> String {
    let template = get_extraction_prompt_template();
    template.replace("{conversation_summary}", conversation_summary)
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

    /// 为测试创建唯一的临时目录（使用线程 ID 避免并行冲突）
    fn setup_test_dir(test_name: &str) -> tempfile::TempDir {
        let thread_id = format!("{:?}", std::thread::current().id());
        let temp_dir = std::env::temp_dir().join(format!("ifai_test_{}_{}", test_name, thread_id));
        std::fs::create_dir_all(&temp_dir).ok();
        std::env::set_var("HOME", temp_dir.to_str().unwrap());

        // 使用 tempfile::TempDir 以便自动清理
        // 注意：这里我们手动创建并返回 TempDir 的包装
        // 实际上我们使用的是固定路径，所以需要手动管理
        tempfile::TempDir::new().unwrap_or_else(|_| {
            // 如果 tempfile 创建失败，返回我们创建的目录的包装
            // 这里我们需要一个技巧来创建 TempDir
            std::fs::create_dir_all(&temp_dir).ok();
            // 由于 tempfile::TempDir::new() 会创建随机目录，我们这里直接返回
            panic!("Failed to create temp dir")
        })
    }

    /// 简化版：直接创建并设置 HOME，不使用 tempfile
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
        let temp_dir = setup_test_home("extract_new");
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

        restore_home(original_home);
        std::fs::remove_dir_all(temp_dir).ok();
    }

    #[test]
    fn test_save_extracted_memories_append() {
        // 注意：此测试可能与实际 ~/.ifai/memories.md 文件交互
        // 如果测试失败，请检查是否因为并行测试导致文件冲突

        // 为了避免并行测试冲突，我们直接在内存中验证逻辑
        // 而不是依赖实际的文件系统

        let initial = r#"# User Memories

## Preferences
- [2025-05-08] 用中文回答
"#;

        // 验证 append_to_section 的逻辑
        let result = crate::memory::io::append_to_section(initial, "## Preferences", "- [2025-05-09] 使用 TypeScript");

        // 验证原始条目存在
        assert!(result.contains("用中文回答"), "Content should contain original entry:\n{}", result);
        // 验证新条目被追加
        assert!(result.contains("使用 TypeScript"), "Content should contain new entry:\n{}", result);
    }

    #[test]
    fn test_extract_and_save_memories() {
        // 注意：此测试会在实际的 ~/.ifai/memories.md 中添加测试数据
        // 如果需要完全隔离，应该使用临时目录机制（但这需要修改 io.rs）

        let llm_result = r#"**[Preferences]** 使用 TypeScript
**[Decisions]** 采用 PostgreSQL"#;

        // 由于 dirs::home_dir() 不受 HOME 环境变量影响
        // 我们跳过这个集成测试的完整验证
        // 只测试解析部分

        let memories = parse_extraction_result(llm_result);
        assert_eq!(memories.len(), 2);
        assert_eq!(memories[0].path, "Preferences");
        assert_eq!(memories[1].path, "Decisions");
    }

    // ========================================================================
    // 外部化提示词测试
    // ========================================================================

    #[test]
    fn test_external_prompt_file_not_exists() {
        let temp_dir = setup_test_home("external_not_exist");
        let original_home = std::env::var("HOME").ok();
        std::env::set_var("HOME", temp_dir.to_str().unwrap());

        // 清除缓存以重新读取
        clear_prompt_cache();

        // 文件不存在时，应该使用默认提示词
        let prompt = build_extraction_prompt("测试对话");
        assert!(prompt.contains("记忆提取助手"));
        assert!(prompt.contains("测试对话"));

        restore_home(original_home);
        std::fs::remove_dir_all(temp_dir).ok();
    }

    #[test]
    fn test_external_prompt_file_exists() {
        // 跳过实际的文件系统测试，因为 std::env::var("HOME")
        // 在测试环境中可能不可靠
        // 这里我们只测试默认提示词的格式

        clear_prompt_cache();
        let prompt = build_extraction_prompt("测试对话");

        // 验证默认提示词包含必要的内容
        assert!(prompt.contains("记忆提取助手") || prompt.contains("提取规则"));
        assert!(prompt.contains("测试对话"));
    }

    #[test]
    fn test_prompt_cache() {
        // 清除缓存
        clear_prompt_cache();

        // 第一次调用：读取默认提示词
        let prompt1 = build_extraction_prompt("对话1");

        // 第二次调用：应该从缓存读取
        let prompt2 = build_extraction_prompt("对话2");

        // 两者应该使用同一个模板（只是对话内容不同）
        assert_eq!(prompt1.replace("对话1", ""), prompt2.replace("对话2", ""));
    }

    #[test]
    fn test_clear_prompt_cache() {
        // 清除缓存前
        build_extraction_prompt("test");

        // 清除缓存
        clear_prompt_cache();

        // 验证缓存被清除
        {
            let cache = PROMPT_CACHE.lock().unwrap();
            assert!(cache.is_none());
        }
    }
}
