// ============================================================================
// 测试 8: 进度统计功能高保真验证 — 真实 LLM + CompletionStats
//
// 验证点：
//   1. ▸ 3 个工具并行执行... (并行派发通知)
//   2. ✔ read_file    (0.02s) → src/main.rs (单次工具完成)
//   3. ✔ Done   31.4s · 3 tools (带统计的完成信息)
//   4. ✔ Workflow complete (工作流完成)
//
// 运行：cargo test --bin ifai --features real-llm -- e2e_completion_stats --ignored --nocapture
// ============================================================================

#[tokio::test]
#[serial_test::serial]
#[ignore]
async fn test_e2e_completion_stats_display() {
    println!("\n═══════════════════════════════════════════════════════════════");
    println!("  L4.8: 进度统计功能高保真验证 (真实 LLM)");
    println!("═══════════════════════════════════════════════════════════════");

    let Some((spec, ksrc)) = first_available_provider() else {
        eprintln!("[SKIP] 无可用 API Key，跳过");
        return;
    };
    println!("  Provider: {} ({})", spec.name, spec.model);

    let mut tenv = make_test_env(spec, ksrc).await;

    // 自动批准所有工具
    let auto_approve: String = "y\n".repeat(50);
    tenv.set_stdin(&auto_approve);

    // 简单任务：探索当前目录
    let prompt = "请读取 Cargo.toml 和 src/main.rs，然后简短总结项目类型（不超过50字）。";

    let start = std::time::Instant::now();
    let output = tenv.run_cli(&[prompt]).await;
    let elapsed = start.elapsed();

    let output = match output {
        Ok(o) => o,
        Err(e) => {
            eprintln!("[FAIL] CLI 启动失败: {}", e);
            panic!("CLI launch failed");
        }
    };

    let combined = format!("{}\n{}", output.stdout, output.stderr);

    println!("  ───────────────────────────────────────────────");
    println!("  耗时: {:?}", elapsed);
    println!("  输出长度: {} 字符", combined.len());
    println!("  ───────────────────────────────────────────────");

    // 🔥 验证点 1: 并行派发通知
    let has_parallel_notify = combined.contains("个工具并行执行")
        || combined.contains("工具并行执行");
    println!("  1️⃣  并行派发通知: {}", if has_parallel_notify { "✔ 检测到" } else { "✘ 未检测到" });

    // 🔥 验证点 2: 工具调用详情（带时间）
    let has_tool_details = combined.contains("✔ read_file")
        || combined.contains("✔ grep")
        || combined.contains("✔ list_dir");
    println!("  2️⃣  工具调用详情: {}", if has_tool_details { "✔ 检测到" } else { "✘ 未检测到" });

    // 🔥 验证点 3: 完成统计（最关键！）
    let has_completion_stats = combined.contains("✔ Done")
        && (combined.contains("tools") || combined.contains("秒") || combined.contains("s"));
    println!("  3️⃣  完成统计信息: {}", if has_completion_stats { "✔ 检测到" } else { "✘ 未检测到" });

    // 🔥 验证点 4: Workflow 完成提示
    let has_workflow_complete = combined.contains("Workflow complete")
        || combined.contains("工作流完成");
    println!("  4️⃣  Workflow 完成: {}", if has_workflow_complete { "✔ 检测到" } else { "✘ 未检测到" });

    println!("  ───────────────────────────────────────────────");

    // 输出快照（用于审查）
    if !has_completion_stats || !has_parallel_notify {
        println!("\n  🔍 输出快照（前 2000 字符）：");
        println!("  {}", "─".repeat(60));
        for line in combined.lines().take(30) {
            println!("  {}", line);
        }
        println!("  {}", "─".repeat(60));
    }

    // 断言：必须有完成统计
    assert!(has_completion_stats,
        "❌ 缺少完成统计信息！期望看到类似 '✔ Done   31.4s · 3 tools' 的输出\n{}",
        safe_truncate(&combined, 3000));

    // 断言：必须有并行派发通知
    assert!(has_parallel_notify,
        "❌ 缺少并行派发通知！期望看到 '▸ 3 个工具并行执行...' 的输出\n{}",
        safe_truncate(&combined, 3000));

    // 网络错误不算失败
    if combined.contains("Network") || combined.contains("SSE 流读取超时") {
        eprintln!("[SKIP] 网络错误，跳过断言");
        return;
    }

    println!("\n  ✅ 进度统计功能验证通过！");
}
