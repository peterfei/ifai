//! 🔥 Mid-turn 压缩触发测试
//!
//! 通过构造大量消息来强制触发 Mid-turn 压缩

#[cfg(test)]
mod tests {
    use crate::session::Session;
    use ifainew_lib::harness::api::types::{Message, MessageContent, MessageRole};

    /// 创建一个包含大量消息的 session
    fn create_large_session() -> Session {
        let mut session = Session::new("deepseek".to_string(), "deepseek-chat".to_string());
        session.set_api_key(std::env::var("DEEPSEEK_API_KEY").unwrap_or_default());

        // 添加大量消息来触发压缩（增加到 120 次循环，每次 3 条消息 = 360 条消息）
        for i in 0..120 {
            // User 消息（长文本，增加 token 数）
            session.default_ctx.messages.push(Message {
                role: MessageRole::User,
                content: MessageContent::Text(format!(
                    "请分析第 {} 个文件的内容，这个文件包含了大量的代码和文档，需要仔细阅读和理解其中的逻辑结构和设计模式。",
                    i
                )),
                tool_calls: None,
                tool_call_id: None,
            });

            // Assistant 消息（带 tool_calls）
            if i % 2 == 0 {
                session.default_ctx.messages.push(Message {
                    role: MessageRole::Assistant,
                    content: MessageContent::Text("好的，我来读取文件。".to_string()),
                    tool_calls: Some(vec![]),
                    tool_call_id: None,
                });
            }

            // Tool 消息（长结果）
            session.default_ctx.messages.push(Message {
                role: MessageRole::Tool,
                content: MessageContent::Text(format!(
                    "文件内容：\n{}\n{}\n{}\n{}（省略 {} 行）",
                    "use crate::config::Config;".repeat(10),
                    "pub struct MyStruct { field: i32 }".repeat(10),
                    "impl MyStruct { fn new() -> Self { Self { field: 0 } } }".repeat(10),
                    "// 这是一段很长的代码注释".repeat(10),
                    100
                )),
                tool_calls: None,
                tool_call_id: Some(format!("call_{}", i)),
            });
        }

        session
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    #[ignore] // 手动运行：cargo test --bin ifai test_mid_turn_trigger -- --ignored --nocapture
    async fn test_mid_turn_trigger() {
        println!("\n============================================================");
        println!("🔥 Mid-turn 压缩触发测试");
        println!("============================================================");

        let mut session = create_large_session();

        // 检查初始状态
        let initial_count = session.default_ctx.messages.len();
        let initial_tokens = crate::token::estimate_tokens(&session.default_ctx.messages);
        println!("\n📊 初始状态：");
        println!("  消息数: {}", initial_count);
        println!("  估算 tokens: {}", initial_tokens);

        // 计算 Mid-turn 阈值
        let threshold = crate::token::display::compute_compress_threshold(&session.model);
        let mid_turn_threshold = (threshold as f64 * 0.833) as usize;
        println!("\n📊 阈值：");
        println!("  基础阈值: {} (60%)", threshold);
        println!("  Mid-turn 阈值: {} (50%)", mid_turn_threshold);
        println!("  当前占比: {:.1}%", (initial_tokens as f64 / mid_turn_threshold as f64) * 100.0);

        if initial_tokens > mid_turn_threshold {
            println!("\n✅ 应该触发 Mid-turn 压缩！");

            // 手动触发压缩（模拟续接循环中的压缩逻辑）
            let provider_config = ifainew_lib::harness::api::ProviderConfig {
                base_url: Some("https://api.deepseek.com/chat/completions".to_string()),
                api_key: std::env::var("DEEPSEEK_API_KEY").unwrap_or_default(),
                organization: None,
            };

            let old_len = session.default_ctx.messages.len();
            let old_tokens = initial_tokens;

            let compacted = crate::session::perform_compaction(
                &session.default_ctx.messages.clone(),
                &session.model,
                &provider_config,
                "",
                crate::session::CompactionMode::MidTurn,
            ).await;

            session.default_ctx.messages = compacted;
            let new_len = session.default_ctx.messages.len();
            let new_tokens = crate::token::estimate_tokens(&session.default_ctx.messages);

            println!("\n📊 压缩结果：");
            println!("  消息数: {} → {} (减少 {})", old_len, new_len, old_len.saturating_sub(new_len));
            println!("  Tokens: {} → {} (减少 {})", old_tokens, new_tokens, old_tokens.saturating_sub(new_tokens));

            // 验证压缩效果
            assert!(new_len < old_len, "压缩后消息数应该减少");
            assert!(new_tokens < old_tokens, "压缩后 tokens 应该减少");

            println!("\n✅ 压缩测试通过！");
        } else {
            println!("\n⚠️  Token 数不足，无法触发 Mid-turn 压缩");
            println!("  当前: {} < 阈值: {}", initial_tokens, mid_turn_threshold);
        }

        println!("\n============================================================");
    }
}
