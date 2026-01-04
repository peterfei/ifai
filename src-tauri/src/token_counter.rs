// Token 计数模块 - v0.2.6 新增
// 支持 tiktoken（云端模型）

use tiktoken_rs::{cl100k_base, o200k_base, p50k_base, get_bpe_from_model};

/// Token 计数结果
#[derive(serde::Serialize, serde::Deserialize, Debug)]
pub struct TokenCountResult {
    pub count: usize,
    pub encoding: String,
}

/// 为 OpenAI 模型计数 Token
pub fn count_tokens_openai(text: &str, model: &str) -> usize {
    // 根据模型选择编码器
    let bpe = get_bpe_from_model(model);

    match bpe {
        Ok(bpe) => {
            bpe.encode_with_special_tokens(text).len()
        }
        Err(_) => {
            // 如果获取失败，使用默认编码器
            let fallback = cl100k_base().unwrap();
            fallback.encode_with_special_tokens(text).len()
        }
    }
}

/// 简化的 Token 计数（用于快速估算）
/// 基于字符数和常见 Token 比例
pub fn estimate_tokens(text: &str) -> usize {
    // 英文大约 4 字符 = 1 Token
    // 中文大约 1.5-2 字符 = 1 Token
    // 这里使用混合估算
    let chinese_chars = text.chars().filter(|c| {
        let cp = *c as u32;
        (0x4E00..=0x9FFF).contains(&cp) || // CJK 统一汉字
        (0x3400..=0x4DBF).contains(&cp) || // CJK 扩展 A
        (0x20000..=0x2A6DF).contains(&cp) // CJK 扩展 B
    }).count();

    let other_chars = text.len() - chinese_chars;

    (chinese_chars / 2) + (other_chars / 4)
}

/// 批量计数多个文本片段的 Token
pub fn count_tokens_batch_internal(texts: &[String], model: &str) -> Vec<usize> {
    let bpe = get_bpe_from_model(model);

    match bpe {
        Ok(bpe) => {
            texts.iter()
                .map(|text| bpe.encode_with_special_tokens(text).len())
                .collect()
        }
        Err(_) => {
            // 如果获取失败，使用默认编码器
            let fallback = cl100k_base().unwrap();
            texts.iter()
                .map(|text| fallback.encode_with_special_tokens(text).len())
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
        let texts = vec![
            "Hello".to_string(),
            "World".to_string(),
            "Test".to_string(),
        ];
        let counts = count_tokens_batch_internal(&texts, "gpt-4");
        assert_eq!(counts.len(), 3);
        println!("Batch counts: {:?}", counts);
    }
}
