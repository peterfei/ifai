/*!
Text Generator - llama.cpp Text Generation
=========================================

使用 llama.cpp 生成文本补全。

使用 llama-cpp-2 v0.1 库实现。
*/

use crate::llm_inference::{InferenceError, model::Model};

#[cfg(feature = "llm-inference")]
use llama_cpp_2::{
    context::params::LlamaContextParams,
    llama_batch::LlamaBatch,
    sampling::LlamaSampler,
    model::{AddBos, Special},
};

/// 文本生成器
pub struct TextGenerator {
    max_tokens: usize,
    seed: u32,
}

impl Default for TextGenerator {
    fn default() -> Self {
        Self {
            max_tokens: 50,
            seed: 1234,
        }
    }
}

impl TextGenerator {
    /// 创建新的文本生成器
    pub fn new() -> Self {
        Self::default()
    }

    /// 设置最大 token 数
    pub fn with_max_tokens(mut self, max_tokens: usize) -> Self {
        self.max_tokens = max_tokens;
        self
    }

    /// 设置随机种子
    pub fn with_seed(mut self, seed: u32) -> Self {
        self.seed = seed;
        self
    }

    /// 生成文本补全
    #[cfg(feature = "llm-inference")]
    pub fn generate(&self, prompt: &str, model: &Model) -> Result<String, InferenceError> {
        println!("[TextGenerator] Generating completion");
        println!("[TextGenerator]   Prompt length: {} chars", prompt.len());
        println!("[TextGenerator]   Max tokens: {}", self.max_tokens);

        // 创建上下文参数，设置更大的上下文窗口
        let ctx_params = LlamaContextParams::default()
            .with_n_ctx(std::num::NonZeroU32::new(2048));

        // 创建上下文
        let mut ctx = model.model.new_context(&model.backend, ctx_params)
            .map_err(|e| InferenceError::InferenceFailed(format!("创建上下文失败: {}", e)))?;

        // 分词输入
        let tokens_list = model.model.str_to_token(prompt, AddBos::Always)
            .map_err(|e| InferenceError::InferenceFailed(format!("分词失败: {}", e)))?;

        let n_len = self.max_tokens as i32;
        let n_ctx = ctx.n_ctx() as i32;
        let n_kv_req = tokens_list.len() as i32 + n_len;

        if n_kv_req > n_ctx {
            return Err(InferenceError::InferenceFailed(
                format!("请求长度 {} 超过上下文大小 {}", n_kv_req, n_ctx)
            ));
        }

        // 创建批处理
        let mut batch = LlamaBatch::new(512, 1);
        let last_index: i32 = (tokens_list.len() - 1) as i32;

        for (i, token) in (0_i32..).zip(tokens_list.into_iter()) {
            let is_last = i == last_index;
            batch.add(token, i, &[0], is_last)
                .map_err(|e| InferenceError::InferenceFailed(format!("添加 token 到批处理失败: {}", e)))?;
        }

        // 解码输入
        ctx.decode(&mut batch)
            .map_err(|e| InferenceError::InferenceFailed(format!("解码失败: {}", e)))?;

        let mut n_cur = batch.n_tokens();
        let mut n_decode = 0;

        // 创建采样器
        let mut sampler = LlamaSampler::chain_simple([
            LlamaSampler::dist(self.seed),
            LlamaSampler::greedy(),
        ]);

        let mut result = String::new();

        // 生成循环
        while n_decode < n_len {
            // 采样 token
            let token = sampler.sample(&ctx, batch.n_tokens() - 1);
            sampler.accept(token);

            // 检查是否为结束 token
            if model.model.is_eog_token(token) {
                break;
            }

            // 转换为字符串
            let output_bytes = model.model.token_to_bytes(token, Special::Tokenize)
                .map_err(|e| InferenceError::InferenceFailed(format!("token 转字节失败: {}", e)))?;

            let output_string = String::from_utf8_lossy(&output_bytes);
            result.push_str(&output_string);

            // 如果遇到换行符，提前停止（适合代码补全场景）
            if output_string.contains('\n') {
                break;
            }

            // 清空批处理并添加新 token
            batch.clear();
            batch.add(token, n_cur, &[0], true)
                .map_err(|e| InferenceError::InferenceFailed(format!("添加 token 到批处理失败: {}", e)))?;

            n_cur += 1;

            // 解码
            ctx.decode(&mut batch)
                .map_err(|e| InferenceError::InferenceFailed(format!("解码失败: {}", e)))?;

            n_decode += 1;

            if n_decode >= n_len {
                break;
            }
        }

        println!("[TextGenerator] Generated {} tokens, {} chars", n_decode, result.len());
        Ok(result)
    }
}

/// 便捷函数：生成文本补全
///
/// 使用全局模型实例生成文本补全。
#[cfg(feature = "llm-inference")]
pub fn generate_completion(prompt: &str, max_tokens: usize) -> Result<String, InferenceError> {
    use crate::llm_inference::model::{get_or_init_model, ensure_model_loaded};

    // 确保模型已加载
    ensure_model_loaded()?;

    // 获取模型实例
    let model_ref = get_or_init_model()?;
    let model_guard = model_ref.lock()
        .map_err(|_| InferenceError::InferenceFailed("获取模型锁失败".to_string()))?;

    let model = model_guard.as_ref()
        .ok_or(InferenceError::ModelNotLoaded)?;

    // 创建生成器并生成
    let generator = TextGenerator::new()
        .with_max_tokens(max_tokens);

    generator.generate(prompt, model)
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generator_creation() {
        let generator = TextGenerator::new()
            .with_max_tokens(100)
            .with_seed(42);

        assert_eq!(generator.max_tokens, 100);
        assert_eq!(generator.seed, 42);
    }

    #[test]
    fn test_default_generator() {
        let generator = TextGenerator::default();
        assert_eq!(generator.max_tokens, 50);
        assert_eq!(generator.seed, 1234);
    }
}
