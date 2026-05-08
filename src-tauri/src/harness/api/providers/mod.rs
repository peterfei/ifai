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
