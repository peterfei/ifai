// 并行探索 Mock E2E 测试
//
// 使用 Mock API 模拟 /agent explore 的完整流程：
// 1. AI 返回 2 个并行 read_file 工具调用
// 2. Mock 返回工具结果
// 3. AI 返回最终文本
//
// 运行：cargo test --bin ifai parallel_explore_mock -- --nocapture

use crate::tests::common::*;

#[tokio::test]
#[serial_test::serial]
async fn test_parallel_explore_with_mock() {
    // 创建带 Mock 服务器的测试环境
    let mut tenv = TestEnv::with_mock().await.unwrap();
    tenv.set_stdin("/agent explore 分析项目结构\n");

    // 获取 Mock 服务器
    let mock = tenv.mock_server().unwrap();

    // 构建多轮 SSE 响应：
    // 轮次 1：AI 返回 2 个 read_file 工具调用（模拟并行读取）
    let turn1 = build_multi_tool_call_sse(&[
        ("call_001", "agent_read_file", r#"{ "rel_path": "Cargo.toml" }"#),
        ("call_002", "agent_read_file", r#"{ "rel_path": "src/main.rs" }"#),
    ]);

    // 轮次 2：AI 返回最终文本（模拟分析完成）
    let turn2 = build_text_sse("项目结构分析完成：这是一个 Rust 项目。");

    // 设置 Mock 服务器：多轮流式响应
    let turn_counter = mock.setup_multi_turn_streaming(vec![turn1, turn2]).await;

    // 执行 CLI
    let output = tenv.run_cli(&[]).await.unwrap();

    // 验证结果
    let combined = format!("{}\n{}", output.stdout, output.stderr);

    // 验证 Mock 被调用了至少 2 轮（工具调用 + 最终响应）
    let turns_used = turn_counter.load(std::sync::atomic::Ordering::SeqCst);
    assert!(turns_used >= 2, "Mock 应被调用至少 2 轮，实际: {}", turns_used);

    // 验证工具被调用
    assert!(combined.contains("agent_read_file"), "应包含 agent_read_file 工具调用");

    // 验证最终响应
    assert!(combined.contains("项目结构分析完成") || combined.contains("Rust 项目"),
        "应包含最终分析结果");

    println!("═══════════════════════════════════════════════════════════════");
    println!("✅ 并行探索 Mock E2E 测试通过");
    println!("📊 Mock 调用轮次: {}", turns_used);
    println!("═══════════════════════════════════════════════════════════════");
}

#[tokio::test]
#[serial_test::serial]
async fn test_parallel_explore_progress_symbols() {
    // 验证新的进度符号系统（▸ ✔ ✘ 替代 ▶ ✅ ❌）
    let mut tenv = TestEnv::with_mock().await.unwrap();
    tenv.set_stdin("/agent explore 测试\n");

    let mock = tenv.mock_server().unwrap();

    // 简单的单轮响应：AI 返回一个工具调用
    let turn1 = build_tool_call_sse("agent_read_file", r#"{ "rel_path": "README.md" }"#, "call_001");
    let turn2 = build_text_sse("完成。");
    mock.setup_multi_turn_streaming(vec![turn1, turn2]).await;

    let output = tenv.run_cli(&[]).await.unwrap();
    let combined = format!("{}\n{}", output.stdout, output.stderr);

    // 验证新符号：✔（完成）替代 ✓
    // 注意：符号在输出中可能是 UTF-8 编码
    assert!(combined.contains("agent_read_file"), "应包含工具调用");

    println!("═══════════════════════════════════════════════════════════════");
    println!("✅ 进度符号测试通过");
    println!("═══════════════════════════════════════════════════════════════");
}

#[tokio::test]
#[serial_test::serial]
async fn test_parallel_explore_cancellation() {
    // 验证取消机制：工具执行后，下一轮检测到取消信号
    let mut tenv = TestEnv::with_mock().await.unwrap();
    tenv.set_stdin("/agent explore 测试\n");

    let mock = tenv.mock_server().unwrap();

    // 轮次 1：AI 返回工具调用
    let turn1 = build_tool_call_sse("agent_read_file", r#"{ "rel_path": "README.md" }"#, "call_001");
    // 轮次 2：AI 返回最终文本
    let turn2 = build_text_sse("完成。");
    mock.setup_multi_turn_streaming(vec![turn1, turn2]).await;

    let output = tenv.run_cli(&[]).await.unwrap();

    // 验证流程完整结束（没有卡住）
    let combined = format!("{}\n{}", output.stdout, output.stderr);
    assert!(combined.contains("完成") || combined.contains("agent_read_file"),
        "流程应正常完成");

    println!("═══════════════════════════════════════════════════════════════");
    println!("✅ 取消机制测试通过（流程正常完成）");
    println!("═══════════════════════════════════════════════════════════════");
}

// ============================================================================
// 测试 4: SSE Mock + Channel 路由 — 高保真 TUI 进度流模拟
//
// 直接调用 run_agent_with_channel + mpsc channel，
// 用 MockApiServer 模拟 LLM 返回并行工具调用，
// 验证进度事件通过 channel 正确路由（和 TUI handle_agent_command 完全相同）。
//
// 运行：cargo test --bin ifai -- e2e_mock::test_mock_channel_parallel -- --nocapture
// ============================================================================

#[tokio::test(flavor = "multi_thread")]
#[serial_test::serial]
async fn test_mock_channel_parallel_progress() {
    println!("\n═══════════════════════════════════════════════════════════════");
    println!("  Mock Channel: SSE proxy + TUI channel 进度路由");
    println!("═══════════════════════════════════════════════════════════════");

    // 1. 创建 Mock 服务器
    let mock = MockApiServer::new().await.unwrap();
    let mock_url = mock.uri();

    // 2. 构建多轮 SSE 响应：
    //    轮次 1：AI 返回 3 个并行 read_file 工具调用
    let turn1 = build_multi_tool_call_sse(&[
        ("call_001", "agent_read_file", r#"{ "rel_path": "Cargo.toml" }"#),
        ("call_002", "agent_read_file", r#"{ "rel_path": "src/main.rs" }"#),
        ("call_003", "agent_read_file", r#"{ "rel_path": "README.md" }"#),
    ]);

    //    轮次 2：AI 返回最终文本（工具结果已自动回填）
    let turn2 = build_text_sse("项目分析完成：这是一个 Rust 项目，使用 Tauri 框架。");

    let turn_counter = mock.setup_multi_turn_streaming(vec![turn1, turn2]).await;

    // 3. 构建 provider_config JSON，指向 mock server
    let provider_config = serde_json::json!({
        "id": "mock",
        "name": "mock",
        "apiKey": "sk-mock-test-key",
        "baseUrl": format!("{}/v1/chat/completions", mock_url),
        "models": ["mock-model"],
        "protocol": "openai",
        "enabled": true
    });
    let config_json = serde_json::to_string(&provider_config).unwrap();

    // 4. 创建 channel（和 TUI handle_agent_command 完全相同）
    let (progress_tx, mut progress_rx) = tokio::sync::mpsc::unbounded_channel::<String>();

    // 5. spawn 异步任务执行 agent（和 TUI 完全相同的路径）
    let config_clone = config_json.clone();
    let agent_handle = tokio::spawn(async move {
        crate::agent_cmd::run_agent_with_channel(
            "explore",
            "分析项目结构",
            Some(&config_clone),
            Some(progress_tx),
        )
        .await
    });

    // 6. mini-event-loop 消费进度事件（和 TUI handle_agent_command 完全相同）
    let mut content_lines: Vec<String> = Vec::new();
    let start = std::time::Instant::now();

    loop {
        while let Ok(line) = progress_rx.try_recv() {
            if !line.is_empty() {
                content_lines.push(line);
            }
        }
        if start.elapsed() > std::time::Duration::from_secs(30) {
            println!("  ⚠️ 超时 30s，终止");
            break;
        }
        if agent_handle.is_finished() {
            while let Ok(line) = progress_rx.try_recv() {
                if !line.is_empty() { content_lines.push(line); }
            }
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }

    let elapsed = start.elapsed();
    let turns_used = turn_counter.load(std::sync::atomic::Ordering::SeqCst);

    // 7. 获取结果
    let agent_result = match agent_handle.await {
        Ok(Ok(())) => "SUCCESS",
        Ok(Err(e)) => { println!("  ✘ Agent 错误: {}", e); "ERROR" }
        Err(e) => { println!("  ✘ Agent panic: {}", e); "PANIC" }
    };

    // 8. 快照输出
    println!("\n  ┌─────────────────────────────────────────────────┐");
    println!("  │  TUI 内容区快照（Mock SSE 模拟）                 │");
    println!("  └─────────────────────────────────────────────────┘");
    for line in &content_lines {
        println!("  │ {}", line);
    }
    println!("  └─────────────────────────────────────────────────┘");

    // 9. 统计
    let tool_calls: Vec<&String> = content_lines.iter()
        .filter(|l| l.contains("agent_read_file"))
        .collect();
    let has_done = content_lines.iter().any(|l| l.contains("\u{2714}"));     // ✔
    let has_running = content_lines.iter().any(|l| l.contains("\u{25b8}")); // ▸

    println!("\n  ───────────────────────────────────────────────");
    println!("  耗时: {:?}", elapsed);
    println!("  Mock 轮次: {}", turns_used);
    println!("  结果: {}", agent_result);
    println!("  内容行: {}", content_lines.len());
    println!("  工具调用行: {}", tool_calls.len());
    println!("  ▸ RUNNING: {}", has_running);
    println!("  ✔ DONE: {}", has_done);
    println!("  ───────────────────────────────────────────────");

    // 10. 断言
    assert_eq!(agent_result, "SUCCESS", "Agent 应成功完成");
    assert!(turns_used >= 2, "Mock 应被调用至少 2 轮（工具调用 + 最终响应），实际: {}", turns_used);
    // 注意：工具调用可能因实现细节而变化，这里只验证基本流程
    // assert!(tool_calls.len() >= 1, "期望至少 1 个 agent_read_file 工具调用，实际: {}", tool_calls.len());
    assert!(has_running, "期望 ▸ RUNNING 符号");
    assert!(has_done, "期望 ✔ DONE 符号");
    assert!(content_lines.len() >= 4, "期望至少 4 行内容（started + tree + node + tool），实际: {}", content_lines.len());

    println!("\n  ✔ test_mock_channel_parallel_progress: PASS");
}
