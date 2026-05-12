//! API 提供商实现

pub mod anthropic;
pub mod custom;
pub mod deepseek;
pub mod kimi;
pub mod openai;
pub mod openai_format;
pub mod zhipu;

#[cfg(test)]
mod tests;

pub use anthropic::AnthropicClient;
pub use custom::CustomClient;
pub use deepseek::DeepSeekClient;
pub use kimi::KimiClient;
pub use openai::OpenAIClient;
pub use zhipu::ZhipuClient;

// ============================================================================
// 🏗️ 元编程层：工具调用过滤器（零运行时开销的编译期生成）
// ============================================================================

/// 🔥 宏：生成空参数过滤逻辑
///
/// # 元编程哲学
/// - **编译期生成**：零运行时开销
/// - **声明式**：描述"做什么"而非"怎么做"
/// - **DRY 极限化**：逻辑只定义一次，自动扩散到所有 Provider
///
/// # 环境变量控制
/// - `IFAI_SKIP_EMPTY_ARGS=1`：启用过滤（默认，生产环境）
/// - `IFAI_SKIP_EMPTY_ARGS=0`：禁用过滤（测试环境，验证 breaker）
///
/// # 使用方式
/// ```rust
/// filter_empty_tool_calls!(zhipu, tool_id, args, {
///     yield Ok(StreamEvent::ToolDone {
///         tool_id: tool_id.clone(),
///         result: args.clone(),
///     });
/// });
/// ```
#[macro_export]
macro_rules! filter_empty_tool_calls {
    ($provider:ident, $tool_id:ident, $args:ident, $yield:block) => {
        // 🔥 元编程：自动生成 Provider 感知的过滤逻辑
        // 默认启用过滤（生产环境），通过 IFAI_SKIP_EMPTY_ARGS=0 禁用（测试环境）
        let should_skip = $args.trim() == "{}"
            && std::env::var("IFAI_SKIP_EMPTY_ARGS")
                .unwrap_or_else(|_| "1".to_string()) != "0";

        if should_skip {
            if std::env::var("IFAI_QUIET").is_err() {
                eprintln!(
                    "[{}] 🔧 Skipping empty tool call: tool_id={}",
                    stringify!($provider),
                    $tool_id
                );
            }
            continue; // 空参数直接跳过
        }

        // 非空参数，或测试模式下，执行原始 yield 逻辑
        $yield
    };
}

/// 🔥 宏：生成带索引的空参数过滤逻辑（用于循环遍历）
#[macro_export]
macro_rules! filter_empty_tool_calls_indexed {
    ($provider:ident, $index:ident, $tool_id:ident, $args:ident, $yield:block) => {
        if $args.trim() == "{}" {
            if std::env::var("IFAI_QUIET").is_err() {
                eprintln!(
                    "[{}] 🔧 Skipping empty tool call: tool_id={}, index={}",
                    stringify!($provider),
                    $tool_id,
                    $index
                );
            }
            continue;
        }

        $yield
    };
}

pub use filter_empty_tool_calls;
pub use filter_empty_tool_calls_indexed;

// ============================================================================
// 🔍 HTTP 错误详细日志工具
// ============================================================================

/// 写入调试日志到 `.ifai/debug.log`（同步，可在任何上下文调用）
pub fn log_debug_to_file(message: &str) {
    use std::io::Write;

    let log_path = std::env::var("IFAI_DEBUG_LOG")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| {
            let mut path = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
            path.push(".ifai");
            path.push("debug.log");
            path
        });

    if let Some(parent) = log_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f");
    let log_line = format!("[{}] {}\n", timestamp, message);

    let _ = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .and_then(|mut file| file.write_all(log_line.as_bytes()));
}

/// 在 HTTP 错误（如 400）时，将详细的请求信息写入 `.ifai/debug.log`
///
/// 记录内容包括：
/// - Provider 名称、模型名称
/// - HTTP 状态码、API 返回的错误信息
/// - 请求体大小（字节）
/// - 消息数量和每条消息的 role + 内容长度
/// - 请求体预览（截断到 2000 字符）
pub fn log_http_error_detail(
    provider: &str,
    request_body: &serde_json::Value,
    status_code: u16,
    api_error_message: &str,
) {
    use std::io::Write;

    let log_path = std::env::var("IFAI_DEBUG_LOG")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| {
            let mut path = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
            path.push(".ifai");
            path.push("debug.log");
            path
        });

    // 确保目录存在
    if let Some(parent) = log_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f");

    // 提取请求体信息
    let model = request_body
        .get("model")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown");

    let request_json_str = serde_json::to_string(request_body).unwrap_or_else(|_| "<serialize failed>".to_string());
    let request_size_bytes = request_json_str.len();

    // 提取消息摘要
    let messages_summary = if let Some(messages) = request_body.get("messages").and_then(|v| v.as_array()) {
        let total = messages.len();
        let details: Vec<String> = messages
            .iter()
            .enumerate()
            .map(|(i, msg)| {
                let role = msg.get("role").and_then(|r| r.as_str()).unwrap_or("?");
                let content = msg.get("content");
                let content_len = match content {
                    Some(serde_json::Value::String(s)) => s.len(),
                    Some(serde_json::Value::Array(arr)) => {
                        // 多模态内容，计算总文本长度
                        arr.iter().map(|part| {
                            part.get("text").and_then(|t| t.as_str()).map(|s| s.len()).unwrap_or(0)
                        }).sum()
                    }
                    Some(v) => v.to_string().len(),
                    None => 0,
                };
                // 检查是否有 tool_calls
                let has_tool_calls = msg.get("tool_calls").is_some();
                let has_tool_call_id = msg.get("tool_call_id").is_some();
                let extra = if has_tool_calls { " [tool_calls]" } else if has_tool_call_id { " [tool_result]" } else { "" };
                format!("  [{}] role={}, content_len={} chars{}", i, role, content_len, extra)
            })
            .collect();
        format!("total={}, details:\n{}", total, details.join("\n"))
    } else {
        "N/A".to_string()
    };

    // 请求体预览（截断到 2000 字符）
    let preview_limit = 2000;
    let body_preview = if request_json_str.len() > preview_limit {
        format!("{}... (truncated, total {} bytes)", &request_json_str[..preview_limit], request_size_bytes)
    } else {
        request_json_str.clone()
    };

    let log_entry = format!(
        "\n\
         ═══════════════════════════════════════════════════════════════\n\
         [{}] 🚨 HTTP ERROR {} — {}\n\
         ═══════════════════════════════════════════════════════════════\n\
         Provider:     {}\n\
         Model:        {}\n\
         API Response: {}\n\
         Request Size: {} bytes ({} KB)\n\
         Messages:     {}\n\
         ───────────────────────────────────────────────────────────────\n\
         Request Body Preview:\n\
         {}\n\
         ═══════════════════════════════════════════════════════════════\n\n",
        timestamp,
        status_code,
        provider,
        provider,
        model,
        api_error_message,
        request_size_bytes,
        request_size_bytes / 1024,
        messages_summary,
        body_preview,
    );

    let _ = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .and_then(|mut file| file.write_all(log_entry.as_bytes()));
}

/// 所有提供商支持的模型
pub fn get_all_supported_models() -> Vec<crate::harness::api::types::ModelInfo> {
    vec![
        // Anthropic 模型
        crate::harness::api::types::ModelInfo {
            id: "claude-sonnet-4-20250514".to_string(),
            name: "Claude Sonnet 4".to_string(),
            context_tokens: 200000,
        },
        crate::harness::api::types::ModelInfo {
            id: "claude-opus-4-20250514".to_string(),
            name: "Claude Opus 4".to_string(),
            context_tokens: 200000,
        },
        // DeepSeek 模型
        crate::harness::api::types::ModelInfo {
            id: "deepseek-chat".to_string(),
            name: "DeepSeek Chat".to_string(),
            context_tokens: 128000,
        },
        // OpenAI 模型
        crate::harness::api::types::ModelInfo {
            id: "gpt-4o".to_string(),
            name: "GPT-4o".to_string(),
            context_tokens: 128000,
        },
        crate::harness::api::types::ModelInfo {
            id: "gpt-4o-mini".to_string(),
            name: "GPT-4o Mini".to_string(),
            context_tokens: 128000,
        },
        // 智谱 AI 模型
        crate::harness::api::types::ModelInfo {
            id: "glm-4.7".to_string(),
            name: "GLM-4.7".to_string(),
            context_tokens: 128000,
        },
        crate::harness::api::types::ModelInfo {
            id: "glm-4.7-flash".to_string(),
            name: "GLM-4.7 Flash".to_string(),
            context_tokens: 128000,
        },
        crate::harness::api::types::ModelInfo {
            id: "glm-4.6".to_string(),
            name: "GLM-4.6".to_string(),
            context_tokens: 128000,
        },
        crate::harness::api::types::ModelInfo {
            id: "glm-4-plus".to_string(),
            name: "GLM-4 Plus".to_string(),
            context_tokens: 128000,
        },
    ]
}
