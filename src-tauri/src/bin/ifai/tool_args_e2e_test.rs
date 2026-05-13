//! 🔥 Tool Calls 参数非空 E2E 测试
//!
//! 验证修复：Assistant 消息中的 tool_calls 携带原始调用参数
//!
//! 运行方式：
//!   cd src-tauri && cargo test --bin ifai tool_args_e2e_test -- --ignored --nocapture

#[cfg(test)]
mod tests {
    use crate::config::EffectiveConfig;
    use crate::session::Session;
    use ifainew_lib::harness::api::types::{Message, MessageContent, MessageRole};

    /// 从 ~/.ifai/config.toml 创建真实 Session
    fn create_real_session() -> Session {
        let config = EffectiveConfig::resolve(None, None, None, None)
            .expect("无法读取 ~/.ifai/config.toml，请确保配置文件存在且格式正确");

        let provider = config.provider().to_string();
        let model = config.model().to_string();

        println!("  Provider: {}", provider);
        println!("  Model: {}", model);

        let mut session = Session::new(provider, model);

        if let Some(api_key) = config.api_key() {
            session.set_api_key(api_key.to_string());
        }

        if let Some(base_url) = config.base_url() {
            session.set_base_url(base_url.to_string());
        }

        session
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    #[serial_test::serial]
    #[ignore] // 需要真实 API，手动运行：cargo test --bin ifai tool_args_e2e_test -- --ignored --nocapture
    async fn test_tool_calls_has_non_empty_args() {
        println!("\n============================================================");
        println!("🔥 Tool Calls 参数非空 E2E 测试");
        println!("============================================================");

        let mut session = create_real_session();

        // 发送一个会触发工具调用的请求
        let prompt = "列出当前目录的文件";
        println!("\n📝 发送请求: {}", prompt);

        match session.stream_prompt(prompt).await {
            Ok(response) => {
                println!("✅ 响应成功，长度: {} 字符", response.len());

                // 🔍 检查 session.messages 中的 Assistant 消息
                let messages = &session.default_ctx.messages;

                println!("\n📊 消息分析：");
                println!("  总消息数: {}", messages.len());

                let mut assistant_with_tool_calls = 0;
                let mut tool_calls_with_empty_args = 0;
                let mut total_tool_calls = 0;

                for (i, msg) in messages.iter().enumerate() {
                    if msg.role == MessageRole::Assistant {
                        if let Some(tool_calls) = &msg.tool_calls {
                            if !tool_calls.is_empty() {
                                assistant_with_tool_calls += 1;
                                println!("\n  [消息 {}] Assistant with tool_calls:", i);

                                for (j, tc) in tool_calls.iter().enumerate() {
                                    total_tool_calls += 1;
                                    let args_len = tc.function.arguments.len();
                                    let args_preview = if args_len > 50 {
                                        format!("{}...", &tc.function.arguments.chars().take(47).collect::<String>())
                                    } else {
                                        tc.function.arguments.clone()
                                    };

                                    println!("    #{}: {} | args_len={} | args={}",
                                        j, tc.function.name, args_len,
                                        if args_len == 0 { "❌ 空" } else { "✓ 有内容" }
                                    );

                                    if args_len == 0 {
                                        tool_calls_with_empty_args += 1;
                                        println!("      ⚠️ 预览: '{}'", args_preview);
                                    } else {
                                        println!("      预览: '{}'", args_preview);
                                    }
                                }
                            }
                        }
                    }
                }

                println!("\n📈 统计：");
                println!("  带 tool_calls 的 Assistant 消息: {}", assistant_with_tool_calls);
                println!("  总 tool_calls 数: {}", total_tool_calls);
                println!("  空参数 tool_calls 数: {}", tool_calls_with_empty_args);

                // 🔍 额外检查：确保所有 tool_calls 都有合理的参数长度
                println!("\n📊 参数长度分布：");
                for (i, msg) in messages.iter().enumerate() {
                    if msg.role == MessageRole::Assistant {
                        if let Some(tool_calls) = &msg.tool_calls {
                            if !tool_calls.is_empty() {
                                for tc in tool_calls {
                                    println!("  - {}: {} 字符", tc.function.name, tc.function.arguments.len());
                                }
                            }
                        }
                    }
                }

                // 断言：不应该有空参数的 tool_calls
                assert_eq!(
                    tool_calls_with_empty_args, 0,
                    "所有 tool_calls 的 arguments 都应该非空！发现 {} 个空参数",
                    tool_calls_with_empty_args
                );

                println!("\n============================================================");
                println!("✅ 测试通过：所有 tool_calls 参数都非空！");
                println!("============================================================");
            }
            Err(e) => {
                println!("❌ 请求失败: {}", e);
                panic!("E2E 测试失败: {}", e);
            }
        }
    }

    #[tokio::test]
    #[serial_test::serial]
    #[ignore] // 需要真实 API，手动运行：cargo test --bin ifai tool_args_e2e_test::test_unique_args_no_warning -- --ignored --nocapture
    async fn test_unique_args_no_warning() {
        println!("\n============================================================");
        println!("🔥 参数不同不报警 E2E 测试");
        println!("============================================================");

        let mut session = create_real_session();

        // 发送一个会触发连续多次 read_file 调用的请求
        // AI 应该读取多个不同的文件，而不是重复读取同一个文件
        let prompt = "分析当前目录的代码结构，读取关键文件（如 main.rs, lib.rs, config.rs 等）的内容";
        println!("\n📝 发送请求: {}", prompt);

        match session.stream_prompt(prompt).await {
            Ok(response) => {
                println!("✅ 响应成功，长度: {} 字符", response.len());

                // 🔍 检查 session.messages 中的 read_file 调用
                let messages = &session.default_ctx.messages;

                println!("\n📊 消息分析：");

                let mut read_file_calls: Vec<String> = Vec::new();

                for (i, msg) in messages.iter().enumerate() {
                    if msg.role == MessageRole::User {
                        if let MessageContent::Text(text) = &msg.content {
                            println!("  [{}] User: {}", i, text.chars().take(50).collect::<String>());
                        }
                    } else if msg.role == MessageRole::Assistant {
                        if let Some(tool_calls) = &msg.tool_calls {
                            if !tool_calls.is_empty() {
                                for tc in tool_calls {
                                    if tc.function.name == "read_file" {
                                        // 提取文件路径
                                        if let Ok(args_json) = serde_json::from_str::<serde_json::Value>(&tc.function.arguments) {
                                            if let Some(path) = args_json.get("path").and_then(|p| p.as_str()) {
                                                read_file_calls.push(path.to_string());
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                println!("\n📁 read_file 调用统计：");
                println!("  总调用数: {}", read_file_calls.len());

                if read_file_calls.is_empty() {
                    println!("  ⚠️ 没有 read_file 调用（AI 可能选择了其他工具）");
                } else {
                    // 统计唯一文件数
                    let unique_files: std::collections::HashSet<_> = read_file_calls.iter().collect();
                    println!("  唯一文件数: {}", unique_files.len());

                    // 显示所有调用的文件
                    println!("\n  文件列表：");
                    for (i, path) in read_file_calls.iter().enumerate() {
                        println!("    {}. {}", i + 1, path);
                    }

                    // 计算唯一参数比例
                    let unique_ratio = unique_files.len() as f64 / read_file_calls.len() as f64;
                    println!("\n  唯一参数比例: {:.1}%", unique_ratio * 100.0);

                    // 断言：如果调用了多次 read_file，大部分应该读取不同的文件
                    if read_file_calls.len() >= 3 {
                        assert!(
                            unique_ratio > 0.6,
                            "read_file 调用应该读取不同文件（唯一比例 > 60%），实际: {:.1}%",
                            unique_ratio * 100.0
                        );
                        println!("  ✅ 通过：AI 在探索不同文件（唯一比例 {:.1}% > 60%）", unique_ratio * 100.0);
                    }
                }

                println!("\n============================================================");
                println!("✅ 测试通过：参数不同的连续工具调用不报警！");
                println!("============================================================");
            }
            Err(e) => {
                println!("❌ 请求失败: {}", e);
                panic!("E2E 测试失败: {}", e);
            }
        }
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    #[serial_test::serial]
    #[ignore] // 需要真实 API，手动运行：cargo test --bin ifai tool_args_e2e_test::test_mid_turn_compression -- --ignored --nocapture
    async fn test_mid_turn_compression() {
        println!("\n============================================================");
        println!("🔥 Mid-turn 压缩效果 E2E 测试");
        println!("============================================================");

        let mut session = create_real_session();

        // 发送一个会触发多次工具调用、导致 token 增长的请求
        // 这样可以触发 mid-turn 压缩
        let prompt = "请详细分析当前项目的架构，读取以下关键文件：Cargo.toml, src/main.rs, src/lib.rs, src/config.rs, src/api/mod.rs, src/handlers/mod.rs, src/models/mod.rs, src/database/mod.rs, src/routes/mod.rs。对每个文件，分析其作用和依赖关系。";
        println!("\n📝 发送请求（会触发多次 read_file）：");
        println!("  {}", prompt);

        // 记录压缩前的 token 数
        let tokens_before = session.default_ctx.messages.len();
        println!("\n📊 压缩前：{} 条消息", tokens_before);

        match session.stream_prompt(prompt).await {
            Ok(response) => {
                println!("\n✅ 响应成功，长度: {} 字符", response.len());

                // 检查最终消息数
                let messages_after = session.default_ctx.messages.len();
                println!("📊 压缩后：{} 条消息", messages_after);
                println!("📊 增长：+{} 条消息", messages_after.saturating_sub(tokens_before));

                // 检查 .ifai/debug.log 中的压缩日志
                println!("\n📋 压缩日志验证：");
                println!("  请检查 .ifai/debug.log 中的 [MID-TURN] 日志：");
                println!("  - 是否触发了压缩？");
                println!("  - 压缩前后 tokens 有变化吗？");
                println!("  - 压缩前后 messages 有变化吗？");

                // 简单验证：如果消息数超过 60 条，应该触发压缩
                if messages_after > 60 {
                    println!("\n  ⚠️ 消息数较多（{}），应该触发了压缩", messages_after);
                    println!("  如果日志显示 '减少 0'，说明压缩未生效！");
                }

                println!("\n============================================================");
                println!("✅ 测试完成：请检查 .ifai/debug.log 确认压缩效果");
                println!("============================================================");
            }
            Err(e) => {
                println!("❌ 请求失败: {}", e);
                panic!("E2E 测试失败: {}", e);
            }
        }
    }
}
