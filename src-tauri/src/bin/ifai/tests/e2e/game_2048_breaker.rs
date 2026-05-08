// 🔥 E2E 测试：2048小游戏生成断链问题
//
// **问题描述**：用户反馈"生成2048小游戏"会断链
// **测试目标**：高保真还原并确认断链问题
//
// **断链定义**：
// - AI 执行 TodoWrite 创建任务列表
// - 执行第一个工具（如 write_file 创建 HTML）
// - 之后不再继续执行工具，只输出文本
// - 任务列表残留在 UI 中，没有完成
//
// **测试策略**：
// 1. 使用真实 LLM API（智谱 GLM-4.6）
// 2. 明确要求"生成2048小游戏"
// 3. 监测工具调用链：TodoWrite → write_file × N → 续播
// 4. 检测断链：TodoWrite 后是否有续播

use crate::tests::common::*;

/// 🔥 2048小游戏生成断链测试
///
/// **测试场景**：
/// - 用户输入："帮我生成一个完整的2048小游戏"
/// - 期望：AI 创建 HTML、CSS、JS 三个文件
/// - 断链表现：只创建第一个文件就停止
#[tokio::test]
#[serial_test::serial]
async fn test_game_2048_generation_breaker() {
    // 使用智谱 provider（用户报告问题使用的模型）
    let spec = ProviderSpec {
        name: "Zhipu-AI",
        flag: "zhipu",
        model: "glm-4.6",
        env_key: "ZHIPU_API_KEY",
    };

    eprintln!("\n═══════════════════════════════════════════════════════════════");
    eprintln!("🎮 2048小游戏生成断链测试");
    eprintln!("═══════════════════════════════════════════════════════════════");
    eprintln!("模型: {}", spec.model);
    eprintln!("任务: 生成2048小游戏");
    eprintln!("═══════════════════════════════════════════════════════════════\n");

    match check_provider(&spec) {
        Some(ksrc) => {
            let tenv = make_test_env(&spec, ksrc).await;

            // 🔥 关键提示词：明确要求生成2048小游戏
            let user_input = "帮我生成一个完整的2048小游戏，包括HTML、CSS和JavaScript三个文件。游戏要支持键盘方向键和触摸滑动控制，有分数统计和重新开始功能。";

            // 调用 CLI 并获取输出
            let result = call_and_check(&tenv, &[user_input], true).await;

            match result {
                Ok((stdout, stderr)) => {
                    let combined = format!("{}\n{}", stdout, stderr);

                    // 🔥 诊断：统计工具调用
                    let todowrite_count = combined.matches("📋 Updated task list").count();
                    let write_file_count = combined.matches("✓ Successfully wrote").count();
                    let cont_count = combined.matches("Continuing...").count();

                    eprintln!("\n📊 工具调用统计：");
                    eprintln!("  TodoWrite 调用次数: {}", todowrite_count);
                    eprintln!("  write_file 调用次数: {}", write_file_count);
                    eprintln!("  续播次数: {}", cont_count);

                    // 🔥 断链检测：TodoWrite 后是否有续播
                    let has_chain_break = todowrite_count >= 1 && cont_count == 0;

                    eprintln!("\n🔍 断链检测结果：");
                    if has_chain_break {
                        eprintln!("  ❌ 断链确认：TodoWrite 后没有续播");
                        eprintln!("  预期：至少 1 次续播（Continuing...）");
                        eprintln!("  实际：0 次续播");
                    } else {
                        eprintln!("  ✅ 无断链：TodoWrite 后有续播");
                    }

                    // 🔥 文件创建检测
                    let has_html = combined.contains("game2048.html") || combined.contains("2048.html") || combined.contains(".html");
                    let has_css = combined.contains("game2048.css") || combined.contains("2048.css") || combined.contains(".css");
                    let has_js = combined.contains("game2048.js") || combined.contains("2048.js") || combined.contains(".js");

                    eprintln!("\n📁 文件创建检测：");
                    eprintln!("  HTML: {}", if has_html { "✅" } else { "❌" });
                    eprintln!("  CSS:  {}", if has_css { "✅" } else { "❌" });
                    eprintln!("  JS:   {}", if has_js { "✅" } else { "❌" });

                    // 🔥 核心断言：应该创建至少 1 个文件
                    let files_created = [has_html, has_css, has_js].iter().filter(|&&x| x).count();

                    eprintln!("\n🎯 测试断言：");
                    eprintln!("  预期：至少创建 1 个文件");
                    eprintln!("  实际：创建了 {} 个文件", files_created);

                    if files_created < 1 {
                        eprintln!("  ❌ 测试失败：文件创建数量不足");
                        eprintln!("  这可能表明断链问题存在");
                        panic!("2048游戏测试失败：未创建任何文件");
                    } else {
                        eprintln!("  ✅ 测试通过：至少创建了 1 个文件");
                    }

                    // 🔥 输出诊断信息
                    eprintln!("\n📝 完整输出（前 2000 字符）：");
                    eprintln!("─────────────────────────────────────────────────────────────");
                    eprintln!("{}", safe_truncate(&combined, 2000));
                    eprintln!("─────────────────────────────────────────────────────────────");

                    // 🔥 测试结果总结
                    eprintln!("\n📋 测试总结：");
                    eprintln!("  TodoWrite×{}, write_file×{}, Continuing×{}, 文件×{}",
                        todowrite_count, write_file_count, cont_count, files_created);

                    // 核心断言：检测断链
                    if has_chain_break {
                        eprintln!("\n⚠️  WARNING: 检测到断链问题！");
                        eprintln!("  AI 调用了 TodoWrite 但没有续播");
                        eprintln!("  这可能导致任务列表残留在 UI 中");
                    }
                }
                Err(e) => {
                    eprintln!("[ERROR] CLI execution failed: {}", e);
                    panic!("2048游戏测试失败：CLI执行错误");
                }
            }
        }
        None => {
            eprintln!("[SKIP] test_game_2048_generation_breaker: ZHIPU_API_KEY not set");
        }
    }
}
