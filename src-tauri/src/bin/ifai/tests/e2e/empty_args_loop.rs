// tests/e2e/empty_args_loop.rs
//
// E2E 测试：验证空参数放行到 execute_tools 的行为（对齐 GUI）
//
// 方案 A（放行到 execute_tools）：
//   - 空参数不再在 Provider 层过滤
//   - 空参数进入 execute_tools，由 breaker（FirstOffense/PerToolTripped/GlobalTripped）处理
//   - AI 收到工具返回的具体错误（如 Missing 'path' parameter）
//   - 全局熔断由 LoopDetector 的 GlobalTripped 控制
//
// 测试覆盖：
//   1. 空参数放行到 execute_tools，返回具体错误
//   2. 有效参数正常执行
//   3. 混合空参数和有效参数正常工作
//   4. 全局熔断触发终止
//
// ⚠️ 重要：这些测试验证 breaker 机制，因此需要禁用 Provider 层的空参数过滤
// 通过设置 IFAI_SKIP_EMPTY_ARGS=0 来禁用过滤，让空参数到达 breaker

use crate::tests::common::*;
use std::sync::atomic::Ordering;

// 🔥 全局测试初始化：使用 build.rs 或在测试脚本中设置环境变量更优雅
// 这里使用简单方案：在测试文件顶部定义一个静态变量来触发初始化
#[cfg(test)]
mod test_init {
    #[ctor::ctor]
    fn global_init() {
        std::env::set_var("IFAI_SKIP_EMPTY_ARGS", "0");
    }
}

/// 空参数放行到 execute_tools，breaker 返回错误，AI 看到错误后下一轮可能修正
///
/// 流程：
///   Turn 1: read_file({}) → 放行到 execute_tools → breaker FirstOffense → 返回错误
///   Turn 2: text "done" → 正常结束
#[tokio::test]
async fn test_empty_args_passes_to_execute_tools() {
    // 🔥 测试模式：禁用 Provider 层过滤，验证 breaker 机制
    std::env::set_var("IFAI_SKIP_EMPTY_ARGS", "0");

    let env = TestEnv::with_mock().await.unwrap();

    let turn_responses = vec![
        build_tool_call_sse("read_file", "{}", "call_1"),
        // 空参数通过 execute_tools breaker 处理，返回错误给 AI
        build_text_sse("done"),
    ];

    let turn_counter = if let Some(mock) = env.mock_server() {
        mock.setup_multi_turn_streaming(turn_responses).await
    } else {
        panic!("Mock server not available");
    };

    let output = env.run_cli(&["读取文件"]).await.unwrap();
    output.assert_success();

    let actual_turns = turn_counter.load(Ordering::SeqCst);
    // Turn 1: 空参数通过 execute_tools → breaker 返回错误 → 写入消息
    // Turn 2: text "done" → 正常结束
    assert_eq!(
        actual_turns, 2,
        "Expected 2 API turns (empty args → execute_tools breaker → text done), got {}",
        actual_turns
    );

    eprintln!("  Actual API turns: {} (expected 2)", actual_turns);
}

/// 多个空参数在同一轮全部放行到 execute_tools
///
/// 流程：
///   Turn 1: [write_file({}), TodoWrite({})] → 两个都放行到 execute_tools → breaker 处理
///   Turn 2: text "done" → 正常结束
#[tokio::test]
async fn test_multiple_empty_args_all_pass_through() {
    let env = TestEnv::with_mock().await.unwrap();

    let turn_responses = vec![
        build_multi_tool_call_sse(&[
            ("c1", "write_file", "{}"),
            ("c2", "TodoWrite", "{}"),
        ]),
        // 空参数通过 execute_tools breaker 处理
        build_text_sse("done"),
    ];

    let turn_counter = if let Some(mock) = env.mock_server() {
        mock.setup_multi_turn_streaming(turn_responses).await
    } else {
        panic!("Mock server not available");
    };

    let output = env.run_cli(&["test"]).await.unwrap();
    output.assert_success();

    let actual_turns = turn_counter.load(Ordering::SeqCst);
    assert_eq!(
        actual_turns, 2,
        "Expected 2 API turns (all empty args → execute_tools → text done), got {}",
        actual_turns
    );

    eprintln!("  Actual API turns: {} (expected 2)", actual_turns);
}

/// 有效参数正常执行
///
/// 流程：
///   Turn 1: bash({"command":"ls"}) → 有效参数 → 正常收集 → 执行 → 返回结果
///   Turn 2: text "done" → 正常结束
#[tokio::test]
async fn test_valid_args_executes_normally() {
    let env = TestEnv::with_mock().await.unwrap();

    let turn_responses = vec![
        build_tool_call_sse("bash", r#"{"command":"ls -la /tmp"}"#, "c1"),
        build_text_sse("done"),
    ];

    let turn_counter = if let Some(mock) = env.mock_server() {
        mock.setup_multi_turn_streaming(turn_responses).await
    } else {
        panic!("Mock server not available");
    };

    let output = env.run_cli(&["test"]).await.unwrap();
    output.assert_success();

    let actual_turns = turn_counter.load(Ordering::SeqCst);
    assert_eq!(
        actual_turns, 2,
        "Expected 2 API turns (valid tool → text done), got {}",
        actual_turns
    );

    eprintln!("  Actual API turns: {} (expected 2)", actual_turns);
}

/// 混合有效参数和空参数：空参数放行到 execute_tools，有效参数正常执行
///
/// 流程：
///   Turn 1: [write_file({}), bash({"command":"ls"})]
///          → 两个都放行到 execute_tools
///          → write_file({}) breaker 返回错误
///          → bash({"command":"ls"}) 正常执行
///   Turn 2: text "done" → 正常结束
#[tokio::test]
async fn test_mixed_empty_and_valid_both_pass_through() {
    let env = TestEnv::with_mock().await.unwrap();

    let turn_responses = vec![
        build_multi_tool_call_sse(&[
            ("c1", "write_file", "{}"),
            ("c2", "bash", r#"{"command":"ls -la /tmp"}"#),
        ]),
        build_text_sse("done"),
    ];

    let turn_counter = if let Some(mock) = env.mock_server() {
        mock.setup_multi_turn_streaming(turn_responses).await
    } else {
        panic!("Mock server not available");
    };

    let output = env.run_cli(&["test"]).await.unwrap();
    output.assert_success();

    let actual_turns = turn_counter.load(Ordering::SeqCst);
    assert_eq!(
        actual_turns, 2,
        "Expected 2 API turns (mixed → execute_tools → text done), got {}",
        actual_turns
    );

    eprintln!("  Actual API turns: {} (expected 2)", actual_turns);
}

/// 高保真场景：AI 先有效工作，然后发空参数，空参数通过 breaker 返回错误
///
/// 流程：
///   Turn 1: bash({"command":"ls"}) → 有效执行 ✓
///   Turn 2: write_file({}) → 放行到 execute_tools → breaker 返回错误
///   Turn 3: text "done" → 正常结束
#[tokio::test]
async fn test_valid_then_empty_then_done() {
    let env = TestEnv::with_mock().await.unwrap();

    let turn_responses = vec![
        build_tool_call_sse("bash", r#"{"command":"ls -la /tmp"}"#, "c1"),
        build_tool_call_sse("write_file", "{}", "c2"),
        // 空参数通过 execute_tools breaker 处理，返回错误
        build_text_sse("done"),
    ];

    let turn_counter = if let Some(mock) = env.mock_server() {
        mock.setup_multi_turn_streaming(turn_responses).await
    } else {
        panic!("Mock server not available");
    };

    let output = env.run_cli(&["test"]).await.unwrap();
    output.assert_success();

    let actual_turns = turn_counter.load(Ordering::SeqCst);
    assert_eq!(
        actual_turns, 3,
        "Expected 3 API turns (valid → empty → text done), got {}",
        actual_turns
    );

    eprintln!("  Actual API turns: {} (expected 3)", actual_turns);
}

/// AI 连续多轮有效工作（正常场景不受影响）
///
/// 流程：
///   Turn 1: TodoWrite → 有效
///   Turn 2: write_file → 有效
///   Turn 3: bash → 有效
///   Turn 4: text "done" → 正常结束
#[tokio::test]
async fn test_multiple_valid_turns_normal_flow() {
    let env = TestEnv::with_mock().await.unwrap();

    let turn_responses = vec![
        build_tool_call_sse("TodoWrite", r#"{"todos":[{"content":"task1","status":"pending","activeForm":"doing"}]}"#, "c1"),
        build_tool_call_sse("write_file", r#"{"path":"/tmp/a.txt","content":"hello"}"#, "c2"),
        build_tool_call_sse("bash", r#"{"command":"cat /tmp/a.txt"}"#, "c3"),
        build_text_sse("done"),
    ];

    let turn_counter = if let Some(mock) = env.mock_server() {
        mock.setup_multi_turn_streaming(turn_responses).await
    } else {
        panic!("Mock server not available");
    };

    let output = env.run_cli(&["创建文件"]).await.unwrap();
    output.assert_success();

    let actual_turns = turn_counter.load(Ordering::SeqCst);
    assert_eq!(
        actual_turns, 4,
        "Expected 4 API turns (3 valid tools + text done), got {}",
        actual_turns
    );

    eprintln!("  Actual API turns: {actual_turns} (expected 4)");
}

// ═══════════════════════════════════════════════════════════
// Provider 流结束 flush：finish_reason 缺失时 ToolDone 仍被发送
// ═══════════════════════════════════════════════════════════

/// finish_reason 缺失时，Provider flush 发送 ToolDone（有效参数正常放行）
#[tokio::test]
async fn test_finish_reason_missing_valid_args_not_filtered() {
    let env = TestEnv::with_mock().await.unwrap();

    let turn_responses = vec![
        build_tool_call_sse_no_finish_reason("bash", r#"{"command":"ls -la /tmp"}"#, "c1"),
        build_text_sse("done"),
    ];

    let turn_counter = if let Some(mock) = env.mock_server() {
        mock.setup_multi_turn_streaming(turn_responses).await
    } else {
        panic!("Mock server not available");
    };

    let output = env.run_cli(&["test"]).await.unwrap();
    output.assert_success();

    let actual_turns = turn_counter.load(Ordering::SeqCst);
    assert_eq!(
        actual_turns, 2,
        "Expected 2 turns (valid tool via flush → text done), got {}",
        actual_turns
    );
    eprintln!("  Actual API turns: {} (expected 2)", actual_turns);
}

/// finish_reason 缺失 + 空参数：flush 发送空 ToolDone → 放行到 execute_tools
#[tokio::test]
async fn test_finish_reason_missing_empty_args_passes_through() {
    let env = TestEnv::with_mock().await.unwrap();

    let turn_responses = vec![
        build_tool_call_sse_no_finish_reason("read_file", "{}", "c1"),
        // 空参数放行到 execute_tools breaker
        build_text_sse("done"),
    ];

    let turn_counter = if let Some(mock) = env.mock_server() {
        mock.setup_multi_turn_streaming(turn_responses).await
    } else {
        panic!("Mock server not available");
    };

    let output = env.run_cli(&["test"]).await.unwrap();
    output.assert_success();

    let actual_turns = turn_counter.load(Ordering::SeqCst);
    assert_eq!(
        actual_turns, 2,
        "Expected 2 turns (empty args flushed → execute_tools → text done), got {}",
        actual_turns
    );
    eprintln!("  Actual API turns: {} (expected 2)", actual_turns);
}

// ═══════════════════════════════════════════════════════════
// 空参数放行到 execute_tools：AI 收到具体工具错误（对齐 GUI）
// ═══════════════════════════════════════════════════════════
//
// 放行后行为：
//   1. 空参数进入 execute_tools → breaker FirstOffense 返回具体错误（如 Missing 'path' parameter）
//   2. AI 收到具体错误，有机会自我修正
//   3. 全局熔断由 LoopDetector GlobalTripped 控制（阈值由 permission.rs 定义）

/// 跨工具空参数：AI 轮换不同工具发空参数，breaker 处理但第 16 次触发全局熔断
///
/// 放行后行为：
///   Turn 1-8: 4 个不同工具各 2 次 FirstOffense（per-tool streak=2）
///   Turn 9: write_file 第 3 次 → PerToolTripped → "Skipped" → 全部 Skipped → 终止
///   注意：修复 PerToolTripped 返回 "Skipped" 后，不再需要等到 GlobalTripped
#[tokio::test]
async fn test_cross_tool_empty_args_global_trip() {
    let env = TestEnv::with_mock().await.unwrap();

    // 模拟 AI 轮换 4 个不同工具，全部空参数
    // Per-tool breaker: 每个 tool 连续 3 次空参数后 PerToolTripped
    // Turn 9: write_file 第 3 次 → PerToolTripped → Skipped → 全部 Skipped → 终止
    let tools = ["write_file", "read_file", "TodoWrite", "bash"];
    let mut empty_turns: Vec<String> = Vec::new();
    for i in 0..16 {
        let tool = tools[i % 4];
        let call_id = format!("c{}", i + 1);
        empty_turns.push(build_tool_call_sse(tool, "{}", &call_id));
    }

    let turn_counter = if let Some(mock) = env.mock_server() {
        mock.setup_multi_turn_streaming(empty_turns).await
    } else {
        panic!("Mock server not available");
    };

    let output = env.run_cli(&["test"]).await.unwrap();
    output.assert_success();

    let actual_turns = turn_counter.load(Ordering::SeqCst);
    // 8 轮 FirstOffense（4 工具 × 2 次）+ 第 9 轮 write_file PerToolTripped
    // → 所有结果 "Skipped" → 终止条件触发
    assert_eq!(
        actual_turns, 9,
        "Expected 9 API turns (8 FirstOffense + 9th PerToolTripped → all Skipped → terminate). \
         Actual: {actual_turns}"
    );

    eprintln!("  Actual API turns: {actual_turns} (expected 9) — PerToolTripped at 9th, Skipped terminates");
}

/// 有效工作后空参数退化：breaker 返回错误但继续
///
/// 放行后行为：
///   Turn 1-3: 有效参数执行 ✓
///   Turn 4-6: 空参数 → execute_tools breaker → 返回错误
///   Turn 7: text "done" → 正常结束
#[tokio::test]
async fn test_valid_then_degraded_to_empty_args() {
    let env = TestEnv::with_mock().await.unwrap();

    let turn_responses = vec![
        // Phase 1: 正常工作（3 轮有效工具调用）
        build_tool_call_sse("read_file", r#"{"path":"/tmp/a.txt"}"#, "c1"),
        build_tool_call_sse("write_file", r#"{"path":"/tmp/b.txt","content":"hello"}"#, "c2"),
        build_tool_call_sse("bash", r#"{"command":"cat /tmp/b.txt"}"#, "c3"),
        // Phase 2: 退化（3 轮空参数，模拟上下文过长后模型质量下降）
        build_tool_call_sse("write_file", "{}", "c4"),
        build_tool_call_sse("read_file", "{}", "c5"),
        build_tool_call_sse("bash", "{}", "c6"),
        // Phase 3: AI 终于返回文本
        build_text_sse("done"),
    ];

    let turn_counter = if let Some(mock) = env.mock_server() {
        mock.setup_multi_turn_streaming(turn_responses).await
    } else {
        panic!("Mock server not available");
    };

    let output = env.run_cli(&["创建文件"]).await.unwrap();
    output.assert_success();

    let actual_turns = turn_counter.load(Ordering::SeqCst);
    // 3 轮有效 + 3 轮空参数（breaker 处理）+ 1 轮 text done = 7
    assert_eq!(
        actual_turns, 7,
        "Expected 7 API turns (3 valid + 3 empty + text done), got {}. \
         Empty args handled by breaker, not Provider filter.",
        actual_turns
    );

    eprintln!("  Actual API turns: {} (expected 7) — valid args then degraded", actual_turns);
}

/// 混合有效/空参数：正常交替工作
///
///   Turn 1: bash(valid) → 执行 ✓
///   Turn 2: write_file({}) → breaker → 错误
///   Turn 3: bash(valid) → 执行 ✓
///   Turn 4: read_file({}) → breaker → 错误
///   Turn 5: write_file({}) → breaker → 错误
///   Turn 6: text "done" → 结束
#[tokio::test]
async fn test_interleaved_valid_and_empty_no_termination() {
    let env = TestEnv::with_mock().await.unwrap();

    let turn_responses = vec![
        build_tool_call_sse("bash", r#"{"command":"echo hello"}"#, "c1"),
        build_tool_call_sse("write_file", "{}", "c2"),
        build_tool_call_sse("bash", r#"{"command":"ls /tmp"}"#, "c3"),
        build_tool_call_sse("read_file", "{}", "c4"),
        build_tool_call_sse("write_file", "{}", "c5"),
        build_text_sse("done"),
    ];

    let turn_counter = if let Some(mock) = env.mock_server() {
        mock.setup_multi_turn_streaming(turn_responses).await
    } else {
        panic!("Mock server not available");
    };

    let output = env.run_cli(&["test"]).await.unwrap();
    output.assert_success();

    let actual_turns = turn_counter.load(Ordering::SeqCst);
    assert_eq!(
        actual_turns, 6,
        "Expected 6 API turns (2 valid + 3 empty + text done), got {}",
        actual_turns
    );

    eprintln!("  Actual API turns: {} (expected 6) — interleaved valid and empty", actual_turns);
}

/// 空参数后 AI 收到具体工具错误（对齐 GUI 行为）
///
/// 放行后：空参数进入 execute_tools → breaker FirstOffense → 返回 "Missing 'path' parameter" 等具体错误
/// AI 能看到具体错误信息，与 GUI 行为一致
#[tokio::test]
async fn test_empty_args_gets_specific_error_from_tool() {
    let env = TestEnv::with_mock().await.unwrap();

    // AI 尝试 3 次，每次都是空参数
    let turn_responses = vec![
        build_tool_call_sse("write_file", "{}", "c1"),
        build_tool_call_sse("write_file", "{}", "c2"),
        build_tool_call_sse("write_file", "{}", "c3"),
        build_text_sse("done"),
    ];

    let turn_counter = if let Some(mock) = env.mock_server() {
        mock.setup_multi_turn_streaming(turn_responses).await
    } else {
        panic!("Mock server not available");
    };

    let output = env.run_cli(&["创建文件"]).await.unwrap();
    output.assert_success();

    let actual_turns = turn_counter.load(Ordering::SeqCst);
    // 3 轮空参数：Turn 1-2 FirstOffense（返回 error 含 "空参数"），
    // Turn 3 PerToolTripped（返回 "Skipped"）→ 全部 Skipped → 终止
    // text "done" 不会被执行（因为 Turn 3 的 Skipped 触发了终止条件）
    assert_eq!(
        actual_turns, 3,
        "Expected 3 API turns (2 FirstOffense + 1 PerToolTripped → all Skipped → terminate). \
         Actual: {actual_turns}"
    );

    eprintln!("  Actual API turns: {actual_turns} (expected 3)");
    eprintln!("  FIX: AI received specific error from tool — can self-correct (aligned with GUI)");
}

// ═══════════════════════════════════════════════════════════
// 长序列测试：验证无 Provider 层过滤后的正常行为
// ═══════════════════════════════════════════════════════════

/// 大量交替空参数和有效参数：有效参数重置全局计数，不会触发 GlobalTripped
///
///   Turn 1: write_file({}) → global=1
///   Turn 2: bash(valid) → global=0（有效参数重置全局计数）
///   Turn 3: read_file({}) → global=1
///   Turn 4: write_file(valid) → global=0
///   Turn 5: bash({}) → global=1
///   Turn 6: TodoWrite(valid) → global=0
///   Turn 7: read_file({}) → global=1
///   Turn 8: text "done" → 正常结束
///
/// 有效参数重置 per-tool streak 和全局计数，交替工作流永远不会 GlobalTripped。
#[tokio::test]
async fn test_long_sequence_global_trip_by_loop_detector() {
    let env = TestEnv::with_mock().await.unwrap();

    let turn_responses = vec![
        build_tool_call_sse("write_file", "{}", "c1"),       // empty → global=1
        build_tool_call_sse("bash", r#"{"command":"ls"}"#, "c2"), // valid → global=0
        build_tool_call_sse("read_file", "{}", "c3"),       // empty → global=1
        build_tool_call_sse("write_file", r#"{"path":"/tmp/a.txt","content":"hi"}"#, "c4"), // valid → global=0
        build_tool_call_sse("bash", "{}", "c5"),            // empty → global=1
        build_tool_call_sse("TodoWrite", r#"{"todos":[{"content":"t","status":"done","activeForm":"done"}]}"#, "c6"), // valid → global=0
        build_tool_call_sse("read_file", "{}", "c7"),       // empty → global=1
        build_text_sse("done"),                             // 正常结束
    ];

    let turn_counter = if let Some(mock) = env.mock_server() {
        mock.setup_multi_turn_streaming(turn_responses).await
    } else {
        panic!("Mock server not available");
    };

    let output = env.run_cli(&["test"]).await.unwrap();
    output.assert_success();

    let actual_turns = turn_counter.load(Ordering::SeqCst);
    // 8 轮（7 工具 + 1 text done）— 有效参数重置 global count，不会 GlobalTripped
    assert_eq!(
        actual_turns, 8,
        "Expected 8 API turns (valid args reset global count → no GlobalTripped). \
         Actual: {actual_turns}"
    );

    eprintln!("  Actual API turns: {actual_turns} (expected 8) — valid args reset global count, no GlobalTripped");
}

// ═══════════════════════════════════════════════════════════
// TodoWrite 空参数专项测试
// ═══════════════════════════════════════════════════════════
//
// 目标：确认 TodoWrite({}) 空参数问题确实存在
// 场景：模拟智谱 GLM 模型在续播后反复发送 TodoWrite({}) 的行为

/// TodoWrite 空参数触发 breaker FirstOffense
///
/// 场景：AI 先正常调用 TodoWrite，然后发送空参数
/// 验证：空参数被 breaker 捕获并返回错误
#[tokio::test]
async fn test_todowrite_empty_args_triggers_first_offense() {
    let env = TestEnv::with_mock().await.unwrap();

    // Turn 1: 正常 TodoWrite 调用
    // Turn 2: TodoWrite({}) 空参数 → FirstOffense → 返回错误
    // Turn 3: text "done" → 正常结束
    let turn_responses = vec![
        build_tool_call_sse(
            "TodoWrite",
            r#"{"todos":[{"content":"Task 1","activeForm":"Doing Task 1","status":"pending"}]}"#,
            "c1"
        ),
        build_tool_call_sse("TodoWrite", "{}", "c2"),  // 空参数
        build_text_sse("done"),
    ];

    let turn_counter = if let Some(mock) = env.mock_server() {
        mock.setup_multi_turn_streaming(turn_responses).await
    } else {
        panic!("Mock server not available");
    };

    let output = env.run_cli(&["创建任务"]).await.unwrap();
    output.assert_success();

    let actual_turns = turn_counter.load(Ordering::SeqCst);
    assert_eq!(
        actual_turns, 3,
        "Expected 3 API turns (valid TodoWrite → empty TodoWrite FirstOffense → text done), got {}",
        actual_turns
    );

    let combined = format!("{}\n{}", output.stdout, output.stderr);
    // 验证空参数阻止确实发生
    assert!(
        combined.contains("空参数阻止") || combined.contains("TodoWrite"),
        "Expected evidence of empty args blocking in output"
    );

    eprintln!("  ✓ TodoWrite empty args confirmed: FirstOffense triggered");
}

/// TodoWrite 连续空参数触发 PerToolTripped 熔断
///
/// 场景：AI 连续 3 次发送 TodoWrite({})
/// 验证：熔断机制生效，返回 "Skipped"
#[tokio::test]
async fn test_todowrite_consecutive_empty_args_trips_breaker() {
    let env = TestEnv::with_mock().await.unwrap();

    // 连续 3 次 TodoWrite({}) → PerToolTripped → 所有工具被跳过
    let turn_responses = vec![
        build_tool_call_sse("TodoWrite", "{}", "c1"),  // Turn 1: FirstOffense
        build_tool_call_sse("TodoWrite", "{}", "c2"),  // Turn 2: FirstOffense
        build_tool_call_sse("TodoWrite", "{}", "c3"),  // Turn 3: PerToolTripped → Skipped
        build_text_sse("done"),  // 不会被执行（Skipped 触发终止）
    ];

    let turn_counter = if let Some(mock) = env.mock_server() {
        mock.setup_multi_turn_streaming(turn_responses).await
    } else {
        panic!("Mock server not available");
    };

    let output = env.run_cli(&["测试"]).await.unwrap();
    output.assert_success();

    let actual_turns = turn_counter.load(Ordering::SeqCst);
    // 3 轮工具调用（第 3 轮 PerToolTripped 后 Skipped 终止）
    assert_eq!(
        actual_turns, 3,
        "Expected 3 API turns (2 FirstOffense + 1 PerToolTripped → terminate), got {}",
        actual_turns
    );

    let combined = format!("{}\n{}", output.stdout, output.stderr);
    // 验证熔断确实发生
    assert!(
        combined.contains("熔断") || combined.contains("跳过") || combined.contains("Skipped"),
        "Expected evidence of breaker tripping in output"
    );

    eprintln!("  ✓ TodoWrite breaker confirmed: PerToolTripped triggered after 3 empty args");
}

/// TodoWrite 有效参数重置空参数计数
///
/// 场景：空参数 → 有效参数 → 空参数
/// 验证：有效参数重置 per-tool 计数，第二个空参数仍是 FirstOffense
#[tokio::test]
async fn test_todowrite_valid_args_resets_empty_counter() {
    let env = TestEnv::with_mock().await.unwrap();

    // Turn 1: TodoWrite({}) → FirstOffense (streak=1)
    // Turn 2: 有效 TodoWrite → 重置计数 (streak=0)
    // Turn 3: TodoWrite({}) → 再次 FirstOffense (streak=1, 重置后重新计数)
    // Turn 4: text "done" → 正常结束
    let turn_responses = vec![
        build_tool_call_sse("TodoWrite", "{}", "c1"),
        build_tool_call_sse(
            "TodoWrite",
            r#"{"todos":[{"content":"Task 2","activeForm":"Doing Task 2","status":"in_progress"}]}"#,
            "c2"
        ),
        build_tool_call_sse("TodoWrite", "{}", "c3"),
        build_text_sse("done"),
    ];

    let turn_counter = if let Some(mock) = env.mock_server() {
        mock.setup_multi_turn_streaming(turn_responses).await
    } else {
        panic!("Mock server not available");
    };

    let output = env.run_cli(&["测试"]).await.unwrap();
    output.assert_success();

    let actual_turns = turn_counter.load(Ordering::SeqCst);
    assert_eq!(
        actual_turns, 4,
        "Expected 4 API turns (empty → valid resets → empty → done), got {}",
        actual_turns
    );

    let combined = format!("{}\n{}", output.stdout, output.stderr);

    // 验证：两个空参数都是 FirstOffense（因为有效参数重置了计数）
    // 应该有 2 次"空参数阻止"，但不会有熔断
    let empty_block_count = combined.matches("空参数阻止").count();
    assert!(
        empty_block_count == 2,
        "Expected 2 empty-arg blocks (both FirstOffense after reset), got {}",
        empty_block_count
    );

    // 验证：输出中包含 TodoWrite 工具调用
    assert!(
        combined.contains("TodoWrite"),
        "Expected TodoWrite in output"
    );

    // 验证：没有"熔断跳过"（PerToolTripped 的输出）
    let breaker_trip_count = combined.matches("熔断跳过").count();
    assert!(
        breaker_trip_count == 0,
        "Expected no breaker trip (valid args reset counter), but found {} '熔断跳过'",
        breaker_trip_count
    );

    eprintln!("  ✓ TodoWrite valid args reset confirmed: 2 FirstOffense (no trip)");
}

/// 混合工具：TodoWrite 空参数不影响其他工具
///
/// 场景：TodoWrite({}) + bash(valid) → TodoWrite({}) + write_file(valid)
/// 验证：其他工具正常执行，空参数只影响 TodoWrite
#[tokio::test]
async fn test_todowrite_empty_args_mixed_with_other_tools() {
    let env = TestEnv::with_mock().await.unwrap();

    // Turn 1: [TodoWrite({}), bash(valid)] → TodoWrite FirstOffense, bash 执行
    // Turn 2: [TodoWrite({}), write_file(valid)] → TodoWrite FirstOffense, write_file 执行
    // Turn 3: text "done" → 正常结束
    let turn_responses = vec![
        build_multi_tool_call_sse(&[
            ("c1", "TodoWrite", "{}"),
            ("c2", "bash", r#"{"command":"echo hello"}"#),
        ]),
        build_multi_tool_call_sse(&[
            ("c3", "TodoWrite", "{}"),
            ("c4", "write_file", r#"{"path":"/tmp/test.txt","content":"content"}"#),
        ]),
        build_text_sse("done"),
    ];

    let turn_counter = if let Some(mock) = env.mock_server() {
        mock.setup_multi_turn_streaming(turn_responses).await
    } else {
        panic!("Mock server not available");
    };

    let output = env.run_cli(&["测试"]).await.unwrap();
    output.assert_success();

    let actual_turns = turn_counter.load(Ordering::SeqCst);
    assert_eq!(
        actual_turns, 3,
        "Expected 3 API turns (mixed → mixed → done), got {}",
        actual_turns
    );

    let combined = format!("{}\n{}", output.stdout, output.stderr);
    // 验证其他工具正常执行
    assert!(
        combined.contains("bash") || combined.contains("write_file"),
        "Expected other tools to execute normally"
    );

    eprintln!("  ✓ TodoWrite empty args isolation confirmed: other tools work normally");
}
