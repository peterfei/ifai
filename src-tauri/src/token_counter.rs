// Token 计数模块 - v0.2.6 新增
// 支持 tiktoken（云端模型）

use tiktoken_rs::{cl100k_base, get_bpe_from_model, o200k_base, p50k_base};

/// Token 计数结果
#[derive(serde::Serialize, serde::Deserialize, Debug)]
pub struct TokenCountResult {
    pub count: usize,
    pub encoding: String,
}

/// 为 AI 模型计数 Token
pub fn count_tokens_openai(text: &str, model: &str) -> usize {
    // 规范化模型名称，处理国产模型和特殊模型映射
    let normalized_model = if model.starts_with("deepseek")
        || model.starts_with("glm")
        || model.starts_with("moonshot")
    {
        "gpt-4" // 这些模型通常使用与 GPT-4 类似的 cl100k_base 分词器
    } else if model.contains("gpt-4o") {
        "gpt-4o" // 使用 o200k_base
    } else {
        model
    };

    // 根据模型选择编码器
    let bpe = get_bpe_from_model(normalized_model);

    match bpe {
        Ok(bpe) => bpe.encode_with_special_tokens(text).len(),
        Err(_) => {
            // 🔥 安全回退
            match cl100k_base() {
                Ok(fallback) => fallback.encode_with_special_tokens(text).len(),
                Err(_) => estimate_tokens(text),
            }
        }
    }
}

/// 简化的 Token 计数（用于快速估算）
/// 基于字符数和常见 Token 比例
pub fn estimate_tokens(text: &str) -> usize {
    if text.is_empty() {
        return 0;
    }

    let mut chinese_chars = 0;
    let mut other_chars = 0;

    for c in text.chars() {
        let cp = c as u32;
        let is_chinese = (0x4E00..=0x9FFF).contains(&cp) || // CJK 统一汉字
                        (0x3400..=0x4DBF).contains(&cp) || // CJK 扩展 A
                        (0x20000..=0x2A6DF).contains(&cp); // CJK 扩展 B

        if is_chinese {
            chinese_chars += 1;
        } else {
            other_chars += 1;
        }
    }

    // 科学估算：
    // 1. 中文：在 cl100k_base 中，一个常用汉字约 1.5 - 2.0 tokens
    // 2. 英文/符号：约 0.3 - 0.5 tokens 每字符
    // 3. 换行/缩进：也会占用 token

    let estimated = (chinese_chars as f64 * 1.8) + (other_chars as f64 * 0.4);

    // 向上取整，且至少为 1（如果文本不为空）
    let result = estimated.ceil() as usize;
    if result == 0 && !text.is_empty() {
        1
    } else {
        result
    }
}

/// 批量计数多个文本片段的 Token
pub fn count_tokens_batch_internal(texts: &[String], model: &str) -> Vec<usize> {
    let bpe = get_bpe_from_model(model);

    match bpe {
        Ok(bpe) => texts
            .iter()
            .map(|text| bpe.encode_with_special_tokens(text).len())
            .collect(),
        Err(_) => {
            // 🔥 安全回退：不再使用 unwrap()
            let fallback_bpe = cl100k_base().ok();
            texts
                .iter()
                .map(|text| match &fallback_bpe {
                    Some(f) => f.encode_with_special_tokens(text).len(),
                    None => estimate_tokens(text),
                })
                .collect()
        }
    }
}

// ============== Tauri 命令 ==============

/// 计数单个文本的 Token 数量
///
/// # 参数
/// - `text`: 要计数的文本
/// - `model`: 模型名称（用于选择编码器）
///
/// # 返回
/// 返回 Token 数量
#[tauri::command]
pub fn count_tokens(text: String, model: String) -> usize {
    count_tokens_openai(&text, &model)
}

/// 批量计数多个文本的 Token 数量
///
/// # 参数
/// - `texts`: 文本数组
/// - `model`: 模型名称
///
/// # 返回
/// 返回每个文本的 Token 数量数组
#[tauri::command]
pub fn count_tokens_batch(texts: Vec<String>, model: String) -> Vec<usize> {
    count_tokens_batch_internal(&texts, &model)
}

/// 快速估算 Token 数量（不使用 tiktoken，基于字符数）
///
/// # 参数
/// - `text`: 要估算的文本
///
/// # 返回
/// 返回估算的 Token 数量
#[tauri::command]
pub fn estimate_tokens_cmd(text: String) -> usize {
    estimate_tokens(&text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_count_tokens_english() {
        let text = "Hello, world!";
        let count = count_tokens_openai(text, "gpt-4");
        assert!(count > 0);
        println!("'{}' has {} tokens (gpt-4)", text, count);
    }

    #[test]
    fn test_count_tokens_chinese() {
        let text = "你好，世界！";
        let count = count_tokens_openai(text, "gpt-4");
        assert!(count > 0);
        println!("'{}' has {} tokens (gpt-4)", text, count);
    }

    #[test]
    fn test_estimate_tokens() {
        let text = "Hello world 你好世界";
        let estimate = estimate_tokens(text);
        assert!(estimate > 0);
        println!("'{}' estimated {} tokens", text, estimate);
    }

    #[test]
    fn test_batch_count() {
        let texts = vec!["Hello".to_string(), "World".to_string(), "Test".to_string()];
        let counts = count_tokens_batch_internal(&texts, "gpt-4");
        assert_eq!(counts.len(), 3);
        println!("Batch counts: {:?}", counts);
    }
}
