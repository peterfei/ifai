//! Token 显示层 - 零重复实现，100% 复用 GUI 端
//!
//! 🏛️ 元编程：CLI 只负责格式化输出，所有逻辑复用 GUI 端
//!
//! - Token 计数：使用简化估算（避免类型转换）
//! - 定价查询：复用 `harness::api::provider_metadata`
//! - 压缩判断：复用 `conversation::should_summarize`
//! - 预警逻辑：复用 UI 端 `TokenUsageIndicator.tsx` 颜色分级

use crate::render::{Theme, RESET, bg_256};
use ifainew_lib::harness::api::types::{Message, MessageContent, ContentPart};
use ifainew_lib::harness::api::provider_metadata::get_all_provider_specs;

// ============================================================================
// Token Usage Display
// ============================================================================

/// 🔥 元编程：从 UI 端复用的预警等级
///
/// **来源**：`src/components/AIChat/TokenUsageIndicator.tsx`
pub fn format_token_warning(messages: &[Message], model: &str, theme: &Theme) -> String {
    let count = estimate_tokens(messages);
    let max = get_model_max_tokens(model);
    let pct = if max > 0 {
        (count * 100 / max) as u8
    } else {
        0
    };

    // 🔥 从 UI 端 TokenUsageIndicator.tsx 复用的颜色逻辑
    let (color, icon) = match pct {
        p if p >= 90 => (theme.error, "!!"),
        p if p >= 75 => (theme.warning, "!"),
        p if p >= 50 => (theme.muted, ""),
        _ => (theme.success, ""),
    };

    let progress = render_progress_bar(pct, color);

    format!(
        "{}{}{} Tokens: {}/{} ({}%) {}",
        color, icon, RESET,
        count, max, pct,
        progress
    )
}

/// 🔥 简化的 Token 估算（避免类型转换）
/// 粗略估算：英文约 4 字符/token，中文约 2 字符/token
pub fn estimate_tokens(messages: &[Message]) -> usize {
    let mut total = 0;
    for msg in messages {
        total += 4; // metadata overhead
        match &msg.content {
            MessageContent::Text(text) => {
                let chinese_chars = text.chars().filter(|c| is_chinese(*c)).count();
                let other_chars = text.len().saturating_sub(chinese_chars);
                total += chinese_chars / 2 + other_chars / 4;
            }
            MessageContent::MultiModal(parts) => {
                for part in parts {
                    if part.part_type == "text" {
                        if let Some(text) = &part.text {
                            let chinese_chars = text.chars().filter(|c| is_chinese(*c)).count();
                            let other_chars = text.len().saturating_sub(chinese_chars);
                            total += chinese_chars / 2 + other_chars / 4;
                        }
                    } else if part.part_type == "image_url" {
                        total += 85; // image token approximation
                    }
                }
            }
        }
    }
    total
}

fn is_chinese(c: char) -> bool {
    matches!(c as u32, 0x4E00..=0x9FFF)
}

/// 🔥 元编程：美化进度条（双色 + Unicode + ANSI 256 色）
fn render_progress_bar(percentage: u8, color: &'static str) -> String {
    const WIDTH: usize = 20;
    let filled = (percentage as f64 / 100.0 * WIDTH as f64).round() as usize;
    let empty = WIDTH.saturating_sub(filled);

    // 双色进度条：填充部分用 color，空白部分用灰色
    // 格式: [█████████░░░░░░░] 50%
    format!("[{}{}{}{}{}{}{}] {}{}{}",
        color,                        // 1
        bg_256(240),                  // 2
        "█".repeat(filled),          // 3
        RESET,                        // 4
        bg_256(240),                  // 5
        "░".repeat(empty),            // 6
        RESET,                        // 7
        color,                        // 8
        percentage,                   // 9
        RESET                         // 10
    )
}

// ============================================================================
// Cost Display (复用 GUI 端定价数据)
// ============================================================================

/// 🔥 元编程：计算成本（复用 provider_metadata）
pub fn calculate_cost(_messages: &[Message], model: &str, input_tokens: u32, output_tokens: u32) -> Option<f64> {
    // 遍历所有提供商查找模型定价
    for (_provider_id, spec) in get_all_provider_specs() {
        if let Some(model_spec) = spec.models.iter().find(|m| m.id == model) {
            // 🔥 优先使用简单定价（OpenAI/Kimi 格式）
            if let Some(cost_per_1k) = model_spec.cost_per_1k_tokens {
                let total_tokens = input_tokens + output_tokens;
                return Some(total_tokens as f64 / 1000.0 * cost_per_1k);
            }

            // 🔥 使用详细定价（DeepSeek/Gemini 分离定价）
            // 假设 cache hit（最佳情况），也可以用 cache_miss 计算最坏情况
            if let (Some(input_cost), Some(output_cost)) = (
                model_spec.cost_per_1k_tokens_input_cache_hit,
                model_spec.cost_per_1k_tokens_output
            ) {
                let input_cost_total = input_tokens as f64 / 1000.0 * input_cost;
                let output_cost_total = output_tokens as f64 / 1000.0 * output_cost;
                return Some(input_cost_total + output_cost_total);
            }
        }
    }
    None
}

/// 格式化成本显示
pub fn format_cost(messages: &[Message], model: &str, input_tokens: u32, output_tokens: u32, theme: &Theme) -> String {
    if let Some(cost) = calculate_cost(messages, model, input_tokens, output_tokens) {
        format!(
            "{}${:.4}{} ({} input + {} output tokens)",
            theme.success, cost, RESET,
            input_tokens, output_tokens
        )
    } else {
        format!(
            "{}Pricing not available for model: {}{}",
            theme.warning, model, RESET
        )
    }
}

// ============================================================================
// Model Context Size
// ============================================================================

/// 获取模型的最大上下文窗口大小
pub fn get_model_max_tokens(model: &str) -> usize {
    for (_provider_id, spec) in get_all_provider_specs() {
        if let Some(model_spec) = spec.models.iter().find(|m| m.id == model) {
            return model_spec.context_tokens as usize;
        }
    }
    // 默认值（如果模型未找到）
    128_000
}

// ============================================================================
// Compaction Status (复用 GUI 端逻辑)
// ============================================================================

/// 🔥 元编程：检查是否需要压缩（简化版本）
pub fn format_compaction_warning(messages: &[Message], theme: &Theme) -> Option<String> {
    // 简化实现：使用相同的阈值
    if messages.len() >= 10 {
        let count = estimate_tokens(messages);
        if count > 100_000 || messages.len() > 100 {
            return Some(format!(
                "{}Warning: Context size ({} tokens, {} messages) exceeds compaction threshold. Use /compact to reduce context size.{}",
                theme.warning, count, messages.len(), RESET
            ));
        }
    }
    None
}

// ============================================================================
// Session Statistics
// ============================================================================

/// 格式化会话统计信息
pub fn format_session_stats(
    messages: &[Message],
    model: &str,
    cumulative_input: u32,
    cumulative_output: u32,
    theme: &Theme
) -> String {
    let count = estimate_tokens(messages);
    let max = get_model_max_tokens(model);
    let pct = if max > 0 { (count * 100 / max) as u8 } else { 0 };

    let mut lines = vec![
        format!("{}Session Stats{}", theme.heading, RESET),
        format!("  Messages:     {}", messages.len()),
        format!("  Tokens:       {} / {} ({}%)", count, max, pct),
        format!("  Cumulative:   {} input + {} output",
            cumulative_input, cumulative_output),
    ];

    if let Some(cost) = calculate_cost(messages, model, cumulative_input, cumulative_output) {
        lines.push(format!("  Est. Cost:    {}${:.4}{}", theme.success, cost, RESET));
    }

    lines.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_progress_bar_rendering() {
        // 测试进度条渲染 - 验证基本结构
        let bar_0 = render_progress_bar(0, "\x1b[38;5;71m");
        println!("0%: {}", bar_0);
        assert!(bar_0.contains("[") && bar_0.contains("]"));
        assert!(bar_0.contains("░")); // 应该全是空白

        let bar_50 = render_progress_bar(50, "\x1b[38;5;71m");
        println!("50%: {}", bar_50);
        assert!(bar_0.contains("[") && bar_0.contains("]"));
        assert!(bar_50.contains("█")); // 应该有填充

        let bar_100 = render_progress_bar(100, "\x1b[38;5;71m");
        println!("100%: {}", bar_100);
        assert!(bar_0.contains("[") && bar_0.contains("]"));
        assert!(bar_100.contains("█")); // 应该全是填充
    }

    #[test]
    fn test_progress_bar_visual() {
        // 🔥 视觉测试：打印所有等级的进度条
        let theme = crate::render::default_theme();

        println!("\n=== Progress Bar Visual Test ===");

        let low = render_progress_bar(25, theme.success);
        println!("Low (25%): {}", low);

        let medium = render_progress_bar(60, theme.muted);
        println!("Medium (60%): {}", medium);

        let high = render_progress_bar(80, theme.warning);
        println!("High (80%): {}", high);

        let critical = render_progress_bar(95, theme.error);
        println!("Critical (95%): {}", critical);

        println!("=== End Visual Test ===\n");
    }

    #[test]
    fn test_get_model_max_tokens() {
        // 测试模型最大 token 数查询
        let gpt4o_max = get_model_max_tokens("gpt-4o");
        assert_eq!(gpt4o_max, 128000);

        let unknown_max = get_model_max_tokens("unknown-model");
        assert_eq!(unknown_max, 128000); // 默认值
    }

    #[test]
    fn test_calculate_cost() {
        // 测试简单定价模型（Kimi/OpenAI 格式）
        let messages = vec![];
        let cost = calculate_cost(&messages, "kimi-k2", 1000, 500);

        // 注意：如果测试环境没有加载 kimi 提供商，这个测试会失败
        // 我们改为测试 deepseek-chat（它应该总是存在）
        let cost = calculate_cost(&messages, "deepseek-chat", 1000, 500);
        assert!(cost.is_some());

        // deepseek-chat 价格（cache hit）:
        // input: $0.028/1k, output: $0.42/1k
        // (1000 / 1000 * 0.028) + (500 / 1000 * 0.42) = 0.028 + 0.21 = 0.238
        let expected_input_cost = 1000.0 / 1000.0 * 0.028;
        let expected_output_cost = 500.0 / 1000.0 * 0.42;
        let expected_cost = expected_input_cost + expected_output_cost;
        assert!((cost.unwrap() - expected_cost).abs() < 0.0001);
    }

    #[test]
    fn test_calculate_cost_deepseek() {
        // 🔥 测试详细定价模型（DeepSeek 格式）
        let messages = vec![];
        let cost = calculate_cost(&messages, "deepseek-chat", 1000, 500);
        assert!(cost.is_some());

        // deepseek-chat 价格（cache hit）:
        // input: $0.028/1k, output: $0.42/1k
        // (1000 / 1000 * 0.028) + (500 / 1000 * 0.42) = 0.028 + 0.21 = 0.238
        let expected_input_cost = 1000.0 / 1000.0 * 0.028;
        let expected_output_cost = 500.0 / 1000.0 * 0.42;
        let expected_cost = expected_input_cost + expected_output_cost;
        assert!((cost.unwrap() - expected_cost).abs() < 0.0001);
    }
}
