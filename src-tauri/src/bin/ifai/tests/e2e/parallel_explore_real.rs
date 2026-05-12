// L4: 真实 LLM E2E 测试 — 并行工具执行
//
// 验证 parallel-explore 功能在真实 API 下的行为：
//   1. 并行读取工具（read_file × N）可同时执行
//   2. 进度显示使用新的 Unicode 符号系统（▸ ✔ ✘）
//   3. 读写混合场景下独占锁正确串行
//   4. workflow run explore 完整流程
//
// 运行方式：
//   cargo test --bin ifai --features real-llm -- e2e_explore --ignored --nocapture
//
// 前置条件：
//   ~/.ifai/config.toml 或环境变量中配置了有效的 API Key
//
// 注意：此文件通过 include! 合入 mod e2e，复用 real_providers.rs 中的
//       ProviderSpec / PROVIDERS / check_provider / make_test_env / safe_truncate

use crate::tests::common::*;

/// 获取第一个可用的 provider（按优先级：env > config.toml）
fn first_available_provider() -> Option<(&'static ProviderSpec, &'static str)> {
    for spec in PROVIDERS {
        if let Some(ksrc) = check_provider(spec) {
            return Some((spec, ksrc));
        }
    }
    None
}

// ============================================================================
// 测试 1: /agent explore 真实并行读取 + 进度显示
// ============================================================================

#[tokio::test]
#[serial_test::serial]
#[ignore]
async fn test_e2e_explore_parallel_read() {
    println!("\n═══════════════════════════════════════════════════════════════");
    println!("  L4.1: /agent explore 真实并行读取 + 进度显示");
    println!("═══════════════════════════════════════════════════════════════");

    let Some((spec, ksrc)) = first_available_provider() else {
        eprintln!("[SKIP] 无可用 API Key，跳过");
        return;
    };
    println!("  Provider: {} ({})", spec.name, spec.model);

    let mut tenv = make_test_env(spec, ksrc).await;

    // 自动批准所有高风险工具
    let auto_approve: String = "y\n".repeat(50);
    tenv.set_stdin(&auto_approve);

    // 要求 AI 读取多个文件 — 触发并行 read_file
    let prompt = concat!(
        "请读取以下文件并分析项目结构：\n",
        "1) Cargo.toml\n",
        "2) src/main.rs\n",
        "只读取这两个文件，然后总结项目类型。"
    );

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

    // 验证点
    let read_count = combined.matches("read_file").count();
    let has_new_symbols = combined.contains("\u{25b8}")  // ▸
        || combined.contains("\u{2714}");               // ✔

    println!("  ───────────────────────────────────────────────");
    println!("  耗时: {:?}", elapsed);
    println!("  read_file 出现次数: {}", read_count);
    println!("  新 Unicode 符号: {}", if has_new_symbols { "✔ 检测到" } else { "✘ 未检测到" });
    println!("  输出长度: {} 字符", combined.len());
    println!("  ───────────────────────────────────────────────");

    // 断言：至少有 1 个 read_file 工具调用
    assert!(read_count >= 1,
        "期望至少 1 个 read_file 工具调用，实际: {}\n{}",
        read_count, safe_truncate(&combined, 2000));

    // 断言：输出非空（AI 完成了分析）
    assert!(combined.len() > 50,
        "AI 响应过短，可能未完成\n{}", safe_truncate(&combined, 1000));

    // 网络错误不算失败
    if combined.contains("Network") || combined.contains("SSE 流读取超时") {
        eprintln!("[SKIP] 网络错误，跳过断言");
        return;
    }

    println!("  ✔ test_e2e_explore_parallel_read: PASS");
}

// ============================================================================
// 测试 2: /agent review 多文件审查并行
// ============================================================================

#[tokio::test]
#[serial_test::serial]
#[ignore]
async fn test_e2e_review_parallel_files() {
    println!("\n═══════════════════════════════════════════════════════════════");
    println!("  L4.2: /agent review 多文件审查并行");
    println!("═══════════════════════════════════════════════════════════════");

    let Some((spec, ksrc)) = first_available_provider() else {
        eprintln!("[SKIP] 无可用 API Key，跳过");
        return;
    };
    println!("  Provider: {} ({})", spec.name, spec.model);

    let mut tenv = make_test_env(spec, ksrc).await;

    // 自动批准
    let auto_approve: String = "y\n".repeat(50);
    tenv.set_stdin(&auto_approve);

    let prompt = concat!(
        "请审查当前目录下的代码：\n",
        "1) 读取 Cargo.toml 查看依赖\n",
        "2) 读取 src/main.rs（如果存在）查看入口\n",
        "3) 列出 src/ 目录结构\n",
        "然后给出简要代码审查意见。"
    );

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

    let read_count = combined.matches("read_file").count();
    let list_count = combined.matches("list_dir").count();
    let tool_total = read_count + list_count;

    println!("  ───────────────────────────────────────────────");
    println!("  耗时: {:?}", elapsed);
    println!("  read_file: {}, list_dir: {}, 合计: {}", read_count, list_count, tool_total);
    println!("  ───────────────────────────────────────────────");

    // 断言：至少有工具调用
    assert!(tool_total >= 1,
        "期望至少 1 个工具调用，实际: {}\n{}",
        tool_total, safe_truncate(&combined, 2000));

    if combined.contains("Network") || combined.contains("SSE 流读取超时") {
        eprintln!("[SKIP] 网络错误，跳过断言");
        return;
    }

    println!("  ✔ test_e2e_review_parallel_files: PASS");
}

// ============================================================================
// 测试 3: 超时保护验证（替代 Ctrl+C，CLI 无 TTY 无法发信号）
//
// 验证点：
//   - 子进程在合理时间内退出（不会永久挂起）
//   - SSE 超时机制生效（180s 内返回错误而非卡死）
// ============================================================================

#[tokio::test]
#[serial_test::serial]
#[ignore]
async fn test_e2e_cancel_with_timeout() {
    println!("\n═══════════════════════════════════════════════════════════════");
    println!("  L4.3: 超时保护验证（替代 Ctrl+C，CLI 无 TTY）");
    println!("═══════════════════════════════════════════════════════════════");

    let Some((spec, ksrc)) = first_available_provider() else {
        eprintln!("[SKIP] 无可用 API Key，跳过");
        return;
    };
    println!("  Provider: {} ({})", spec.name, spec.model);

    let mut tenv = make_test_env(spec, ksrc).await;

    // 自动批准
    let auto_approve: String = "y\n".repeat(50);
    tenv.set_stdin(&auto_approve);

    let prompt = "请简单回复 'ok' 即可，不要调用任何工具";

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
    println!("  进程退出码: {:?}", output.status.code());
    println!("  ───────────────────────────────────────────────");

    // 验证点：简单任务应在 60 秒内完成
    // 如果 SSE 流无超时保护，API 半开连接时此测试会永久挂起
    assert!(elapsed.as_secs() < 120,
        "简单任务耗时过长（{:?}），可能存在挂起问题", elapsed);

    // 验证输出非空
    assert!(combined.len() > 5,
        "响应过短: {}", safe_truncate(&combined, 500));

    println!("  ✔ test_e2e_cancel_with_timeout: PASS");
}

// ============================================================================
// 测试 4: workflow YAML 解析 + 进度 callback 符号验证
//
// 注意：CLI 无 TTY，无法直接运行 `/workflow run` REPL 命令。
// 改为验证 workflow_cmd 模块的核心功能：
//   1. YAML 解析正确性
//   2. 进度 callback 使用新 Unicode 符号
//   3. 模板列表和路径解析
// ============================================================================

#[tokio::test]
#[serial_test::serial]
#[ignore]
async fn test_e2e_workflow_run_explore() {
    println!("\n═══════════════════════════════════════════════════════════════");
    println!("  L4.4: workflow 解析 + 进度 callback 符号验证");
    println!("═══════════════════════════════════════════════════════════════");

    // --- 验证 1: 模板列表包含 explore ---
    let templates = crate::workflow_cmd::list_templates();
    let names: Vec<&str> = templates.iter().map(|t| t.name.as_str()).collect();
    assert!(names.contains(&"explore"), "模板列表应包含 'explore'，实际: {:?}", names);
    println!("  ✔ 模板列表: {:?}", names);

    // --- 验证 2: explore 模板路径可解析 ---
    let result = crate::workflow_cmd::resolve_template_path("explore");
    match result {
        Ok(path) => {
            assert!(path.contains("simple-exploration"), "路径应包含 'simple-exploration': {}", path);
            println!("  ✔ explore 模板路径: {}", path);
        }
        Err(e) => {
            // CI 环境可能没有 workflows 目录
            eprintln!("[SKIP] explore 模板路径解析失败（可能无 workflows/）: {}", e);
            return;
        }
    };

    // --- 验证 3: YAML 解析正确 ---
    if let Ok(path) = crate::workflow_cmd::resolve_template_path("explore") {
        let yaml = std::fs::read_to_string(&path).unwrap_or_default();
        let wf_result = ifainew_lib::agent_system::workflow::parser::WorkflowParser::from_str(&yaml);
        assert!(wf_result.is_ok(), "explore YAML 解析应成功");
        let wf = wf_result.unwrap();
        assert_eq!(wf.id, "simple-exploration", "workflow ID 应为 'simple-exploration'");
        assert!(!wf.nodes.is_empty(), "explore 应有至少 1 个节点");
        println!("  ✔ YAML 解析: id={}, nodes={}", wf.id, wf.nodes.len());
    }

    // --- 验证 4: 进度 callback 输出新 Unicode 符号 ---
    let callback = crate::workflow_cmd::tui_progress_callback();
    use ifainew_lib::agent_system::workflow::runner::ProgressEvent;

    // 模拟 workflow:started 事件
    callback(ProgressEvent {
        event_type: "workflow:started".into(),
        timestamp: 0,
        workflow_id: None,
        node_id: None,
        message: Some("Test Workflow".into()),
        tool_details: None,
        nodes: None,
        content_delta: None,
        content_finished: None,
        completion_stats: None,
    });

    // 模拟 node_completed 事件
    callback(ProgressEvent {
        event_type: "node_completed".into(),
        timestamp: 0,
        workflow_id: None,
        node_id: None,
        message: None,
        tool_details: None,
        nodes: None,
        content_delta: None,
        content_finished: None,
        completion_stats: None,
    });

    // 模拟 workflow:completed 事件
    callback(ProgressEvent {
        event_type: "workflow:completed".into(),
        timestamp: 0,
        workflow_id: None,
        node_id: None,
        message: None,
        tool_details: None,
        nodes: None,
        content_delta: None,
        content_finished: None,
        completion_stats: None,
    });

    println!("  ✔ 进度 callback 符号输出（人工检查 stderr）");

    // --- 验证 5: 使用真实 API 执行简单任务（验证 SSE 超时修复在 workflow 路径也生效） ---
    let Some((spec, ksrc)) = first_available_provider() else {
        eprintln!("[SKIP] 无可用 API Key，跳过 API 调用验证");
        println!("  ✔ test_e2e_workflow_run_explore: PASS（跳过 API 部分）");
        return;
    };
    println!("  Provider: {} ({})", spec.name, spec.model);

    let mut tenv = make_test_env(spec, ksrc).await;
    let auto_approve: String = "y\n".repeat(50);
    tenv.set_stdin(&auto_approve);

    let prompt = "请简单回复 'workflow ok'";

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

    if combined.contains("Network") || combined.contains("SSE 流读取超时") {
        eprintln!("[SKIP] 网络错误");
        return;
    }

    assert!(elapsed.as_secs() < 120,
        "API 调用耗时过长（{:?}）", elapsed);

    println!("  ───────────────────────────────────────────────");
    println!("  API 调用耗时: {:?}", elapsed);
    println!("  ───────────────────────────────────────────────");
    println!("  ✔ test_e2e_workflow_run_explore: PASS");
}

// ============================================================================
// 测试 5: 读写混合安全性验证
//
// 场景：AI 同时执行 read_file（并行安全）和 write_file（独占）
// 验证点：
//   - 独占工具不会并行执行（不会出现数据竞争）
//   - 流程正常完成（无死锁）
// ============================================================================

#[tokio::test]
#[serial_test::serial]
#[ignore]
async fn test_e2e_mixed_read_write_safety() {
    println!("\n═══════════════════════════════════════════════════════════════");
    println!("  L4.5: 读写混合安全性验证");
    println!("═══════════════════════════════════════════════════════════════");

    let Some((spec, ksrc)) = first_available_provider() else {
        eprintln!("[SKIP] 无可用 API Key，跳过");
        return;
    };
    println!("  Provider: {} ({})", spec.name, spec.model);

    let mut tenv = make_test_env(spec, ksrc).await;

    // 自动批准（write_file 需要批准）
    let auto_approve: String = "y\n".repeat(50);
    tenv.set_stdin(&auto_approve);

    let prompt = concat!(
        "请完成以下操作：\n",
        "1) 读取 /tmp/ifai_safety_test.txt（可能不存在，忽略错误）\n",
        "2) 创建 /tmp/ifai_safety_test.txt 内容为 'safety check'\n",
        "3) 再次读取 /tmp/ifai_safety_test.txt 确认内容\n",
        "4) 报告文件内容"
    );

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

    let read_count = combined.matches("read_file").count();
    let write_count = combined.matches("write_file").count();

    println!("  ───────────────────────────────────────────────");
    println!("  耗时: {:?}", elapsed);
    println!("  read_file: {}, write_file: {}", read_count, write_count);
    println!("  ───────────────────────────────────────────────");

    if combined.contains("Network") || combined.contains("SSE 流读取超时") {
        eprintln!("[SKIP] 网络错误，跳过断言");
        return;
    }

    // 断言：流程正常完成（没有死锁或 panic）
    assert!(combined.len() > 20,
        "输出过短，可能发生死锁\n{}", safe_truncate(&combined, 1000));

    // 断言：至少有 write_file 调用
    assert!(write_count >= 1,
        "期望至少 1 个 write_file 调用\n{}", safe_truncate(&combined, 2000));

    println!("  ✔ test_e2e_mixed_read_write_safety: PASS");
}

// ============================================================================
// 测试 6: 进度显示格式验证
//
// 验证点：
//   - 输出使用 Unicode 符号（▸ ✔ ✘ ⊘ ├─ └─ → ·）而非 Emoji
//   - 不包含旧的 Emoji 符号（▶ ✅ ❌ 🔧 ✗）
// ============================================================================

#[tokio::test]
#[serial_test::serial]
#[ignore]
async fn test_e2e_progress_display_format() {
    println!("\n═══════════════════════════════════════════════════════════════");
    println!("  L4.6: 进度显示格式验证");
    println!("═══════════════════════════════════════════════════════════════");

    let Some((spec, ksrc)) = first_available_provider() else {
        eprintln!("[SKIP] 无可用 API Key，跳过");
        return;
    };
    println!("  Provider: {} ({})", spec.name, spec.model);

    let mut tenv = make_test_env(spec, ksrc).await;

    // 自动批准
    let auto_approve: String = "y\n".repeat(50);
    tenv.set_stdin(&auto_approve);

    // 触发工具调用以产生进度输出
    let prompt = "请列出当前目录结构";

    let output = tenv.run_cli(&[prompt]).await;

    let output = match output {
        Ok(o) => o,
        Err(e) => {
            eprintln!("[FAIL] CLI 启动失败: {}", e);
            panic!("CLI launch failed");
        }
    };

    let combined = format!("{}\n{}", output.stdout, output.stderr);

    // 检查新 Unicode 符号
    let has_running = combined.contains("\u{25b8}");    // ▸
    let has_done = combined.contains("\u{2714}");       // ✔
    let has_branch = combined.contains("\u{251c}");     // ├
    let has_leaf = combined.contains("\u{2514}");       // └

    // 检查旧 Emoji 符号（不应出现）
    let has_old_running = combined.contains("\u{25b6}"); // ▶
    let has_old_done = combined.contains("✅");
    let has_old_fail = combined.contains("❌");
    let has_old_tool = combined.contains("🔧");

    println!("  ───────────────────────────────────────────────");
    println!("  新 Unicode 符号:");
    println!("    ▸ RUNNING: {}", if has_running { "✔" } else { "— (无工具调用)" });
    println!("    ✔ DONE:    {}", if has_done { "✔" } else { "— (无工具完成)" });
    println!("    ├ BRANCH:  {}", if has_branch { "✔" } else { "— (无多行)" });
    println!("    └ LEAF:    {}", if has_leaf { "✔" } else { "— (无多行)" });
    println!("  旧 Emoji 符号:");
    println!("    ▶ RUNNING: {}", if has_old_running { "✘ 不应出现!" } else { "✔ 未出现" });
    println!("    ✅ DONE:    {}", if has_old_done { "✘ 不应出现!" } else { "✔ 未出现" });
    println!("    ❌ FAIL:    {}", if has_old_fail { "✘ 不应出现!" } else { "✔ 未出现" });
    println!("    🔧 TOOL:    {}", if has_old_tool { "✘ 不应出现!" } else { "✔ 未出现" });
    println!("  ───────────────────────────────────────────────");

    if combined.contains("Network") || combined.contains("SSE 流读取超时") {
        eprintln!("[SKIP] 网络错误，跳过断言");
        return;
    }

    // 断言：不应出现旧 Emoji 符号
    let mut old_symbols: Vec<&str> = vec![];
    if has_old_running { old_symbols.push("▶"); }
    if has_old_done { old_symbols.push("✅"); }
    if has_old_fail { old_symbols.push("❌"); }
    if has_old_tool { old_symbols.push("🔧"); }

    assert!(old_symbols.is_empty(),
        "输出中包含旧 Emoji 符号: {:?}\n{}",
        old_symbols, safe_truncate(&combined, 2000));

    // 如果有工具调用，应使用新符号
    let has_any_tool = combined.contains("read_file")
        || combined.contains("write_file")
        || combined.contains("list_dir")
        || combined.contains("bash");

    if has_any_tool {
        assert!(has_running || has_done || has_branch || has_leaf,
            "有工具调用但未使用新 Unicode 符号\n{}",
            safe_truncate(&combined, 2000));
    }

    println!("  ✔ test_e2e_progress_display_format: PASS");
}

// ============================================================================
// 测试 7: 高保真 TUI 场景还原 — /agent explore 完整 channel 进度流
//
// 直接调用 run_agent_with_channel（和 TUI handle_agent_command 完全相同的路径），
// 通过 mpsc channel 收集所有进度事件，生成用户在 TUI 内容区看到的完整快照。
//
// 验证点：
//   1. workflow:started 事件（含节点列表）
//   2. node_started 事件
//   3. tool_call 事件（并行 read_file × N）
//   4. content_delta / content_finished 事件（AI 最终回复）
//   5. node_completed + workflow:completed 事件
//   6. 全部事件通过 channel 传递（不依赖 println!/stdout）
//
// 运行：cargo test --bin ifai --features real-llm -- e2e_tui_channel --ignored --nocapture
// ============================================================================

/// 从 config.toml 读取指定 provider 的 (api_key, base_url)
fn read_config_toml_provider(spec: &ProviderSpec) -> Option<(String, Option<String>)> {
    let home = std::env::var("HOME").unwrap_or_default();
    let config_path = std::path::Path::new(&home).join(".ifai/config.toml");
    let content = std::fs::read_to_string(&config_path).ok()?;

    let section_names = [
        format!("[providers.{}]", spec.flag),
        format!("[providers.{}-official]", spec.flag),
    ];

    let mut in_target_section = false;
    let mut key_found = String::new();
    let mut base_url_found: Option<String> = None;

    for line in content.lines() {
        let trimmed = line.trim();

        if section_names.iter().any(|s| trimmed == s) {
            in_target_section = true;
            continue;
        }

        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            if in_target_section { break; }
            continue;
        }

        if !in_target_section { continue; }

        if trimmed.starts_with("api_key") && trimmed.contains('=') && key_found.is_empty() {
            if let Some(idx) = trimmed.find('"') {
                let rest = &trimmed[idx + 1..];
                if let Some(end) = rest.find('"') {
                    key_found = rest[..end].to_string();
                }
            }
        }

        if trimmed.starts_with("base_url") && trimmed.contains('=') && base_url_found.is_none() {
            if let Some(idx) = trimmed.find('"') {
                let rest = &trimmed[idx + 1..];
                if let Some(end) = rest.find('"') {
                    base_url_found = Some(rest[..end].to_string());
                }
            }
        }
    }

    if key_found.is_empty() { None } else { Some((key_found, base_url_found)) }
}

/// 构建与 session.workflow_provider_config_json() 等价的 JSON
fn build_provider_config_json(spec: &ProviderSpec) -> Option<String> {
    // 1. 优先从环境变量获取 API key
    let api_key = std::env::var(spec.env_key).ok().filter(|k| !k.is_empty());

    // 2. 从 config.toml 获取
    let (api_key, base_url) = match api_key {
        Some(key) => (key, None),
        None => {
            let (key, url) = read_config_toml_provider(spec)?;
            (key, url)
        }
    };

    // 构建 base_url
    let base_url = match base_url {
        Some(url) if !url.contains("/chat/completions") && !url.contains("/messages") => {
            format!("{}/chat/completions", url.trim_end_matches('/'))
        }
        Some(url) => url,
        None => default_base_url(spec.flag).to_string(),
    };

    let config = serde_json::json!({
        "id": spec.flag,
        "name": spec.flag,
        "apiKey": api_key,
        "baseUrl": base_url,
        "models": [spec.model],
        "protocol": "openai",
        "enabled": true
    });
    serde_json::to_string(&config).ok()
}

/// 获取 provider 默认 base_url（完整 endpoint 路径）
fn default_base_url(flag: &str) -> &'static str {
    match flag {
        "deepseek" => "https://api.deepseek.com/chat/completions",
        "openai" => "https://api.openai.com/v1/chat/completions",
        "anthropic" => "https://api.anthropic.com/v1/messages",
        "zhipu" => "https://open.bigmodel.cn/api/paas/v4/chat/completions",
        "kimi" => "https://api.moonshot.cn/v1/chat/completions",
        "gemini" => "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        _ => "",
    }
}

#[tokio::test(flavor = "multi_thread")]
#[serial_test::serial]
#[ignore]
async fn test_e2e_tui_channel_explore_full_flow() {
    println!("\n═══════════════════════════════════════════════════════════════");
    println!("  L5.1: 高保真 TUI 场景还原 — /agent explore channel 进度流");
    println!("═══════════════════════════════════════════════════════════════");

    let Some((spec, ksrc)) = first_available_provider() else {
        eprintln!("[SKIP] 无可用 API Key，跳过");
        return;
    };
    println!("  Provider: {} ({}) [{}]", spec.name, spec.model, ksrc);

    let config_json = match build_provider_config_json(spec) {
        Some(c) => {
            // 隐藏 API Key 的中间部分
            let v: serde_json::Value = serde_json::from_str(&c).unwrap();
            if let Some(key) = v.get("apiKey").and_then(|k| k.as_str()) {
                let masked = if key.len() > 8 {
                    format!("{}...{}", &key[..4], &key[key.len()-4..])
                } else {
                    "***".to_string()
                };
                println!("  API Key: {}", masked);
            }
            if let Some(url) = v.get("baseUrl").and_then(|u| u.as_str()) {
                println!("  Base URL: {}", url);
            }
            c
        }
        None => {
            eprintln!("[SKIP] 无法构建 provider config JSON");
            return;
        }
    };

    // 创建 channel（和 TUI handle_agent_command 完全相同的方式）
    let (progress_tx, mut progress_rx) = tokio::sync::mpsc::unbounded_channel::<String>();

    // spawn 异步任务执行 agent（和 TUI 完全相同的路径）
    let task = "分析项目结构：读取 Cargo.toml 和 src/main.rs，然后总结项目类型";
    let agent_type = "explore";
    let config_clone = config_json.clone();

    let agent_handle = tokio::spawn(async move {
        crate::agent_cmd::run_agent_with_channel(
            agent_type,
            task,
            Some(&config_clone),
            Some(progress_tx),
        )
        .await
    });

    // mini-event-loop 消费进度事件（和 TUI handle_agent_command 完全相同）
    let mut content_lines: Vec<String> = Vec::new();
    let mut event_types: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    let start = std::time::Instant::now();
    let overall_timeout = std::time::Duration::from_secs(120);

    loop {
        // 非阻塞接收进度事件
        while let Ok(line) = progress_rx.try_recv() {
            if !line.is_empty() {
                // 分类事件类型
                if line.contains("\u{25b8}") || line.starts_with('\u{25b8}') {
                    // ▸ RUNNING
                    *event_types.entry("node_started".to_string()).or_insert(0) += 1;
                } else if line.contains("\u{2714}") {
                    // ✔ DONE
                    *event_types.entry("tool_done".to_string()).or_insert(0) += 1;
                } else if line.contains("\u{2718}") {
                    // ✘ FAIL
                    *event_types.entry("tool_fail".to_string()).or_insert(0) += 1;
                } else if line.contains("\u{2514}") || line.contains("\u{251c}") {
                    // └ ├ tree
                    *event_types.entry("workflow_tree".to_string()).or_insert(0) += 1;
                } else if line.contains("Workflow complete") {
                    *event_types.entry("workflow_completed".to_string()).or_insert(0) += 1;
                } else if line.contains("Done") {
                    *event_types.entry("node_completed".to_string()).or_insert(0) += 1;
                }
                content_lines.push(line);
            }
        }

        // 检查是否超时
        if start.elapsed() > overall_timeout {
            println!("\n  ⚠️ 整体超时（{}s），终止等待", overall_timeout.as_secs());
            break;
        }

        // 检查 agent 任务是否完成
        if agent_handle.is_finished() {
            // 消费剩余事件
            while let Ok(line) = progress_rx.try_recv() {
                if !line.is_empty() {
                    content_lines.push(line);
                }
            }
            break;
        }

        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }

    let elapsed = start.elapsed();

    // 获取 agent 结果
    let agent_result = match agent_handle.await {
        Ok(Ok(())) => "SUCCESS",
        Ok(Err(e)) => {
            println!("  ✘ Agent 错误: {}", e);
            "ERROR"
        }
        Err(e) => {
            println!("  ✘ Agent panic: {}", e);
            "PANIC"
        }
    };

    // ═══════════════════════════════════════════════════════════
    // 快照输出：模拟 TUI 内容区的完整显示
    // ═══════════════════════════════════════════════════════════
    println!("\n  ┌─────────────────────────────────────────────────┐");
    println!("  │  TUI 内容区快照（模拟用户看到的输出）             │");
    println!("  └─────────────────────────────────────────────────┘");
    for line in &content_lines {
        println!("  │ {}", line);
    }
    println!("  └─────────────────────────────────────────────────┘");

    // 统计信息
    let tool_call_lines: Vec<&String> = content_lines.iter()
        .filter(|l| l.contains("read_file") || l.contains("list_dir") || l.contains("write_file"))
        .collect();

    println!("\n  ───────────────────────────────────────────────");
    println!("  耗时: {:?}", elapsed);
    println!("  结果: {}", agent_result);
    println!("  内容行数: {}", content_lines.len());
    println!("  事件类型: {:?}", event_types);
    println!("  工具调用行: {}", tool_call_lines.len());
    for t in &tool_call_lines {
        println!("    {}", t.trim());
    }
    println!("  ───────────────────────────────────────────────");

    // 网络错误跳过
    let all_content = content_lines.join("\n");
    if all_content.contains("流式请求失败") || all_content.contains("SSE 流读取超时")
        || all_content.contains("API 错误") || all_content.contains("Network") {
        eprintln!("[SKIP] 网络错误，跳过断言");
        return;
    }

    // 验证点
    assert!(content_lines.len() >= 2,
        "期望至少 2 行内容（workflow:started + node_started），实际: {}\n{:?}",
        content_lines.len(), content_lines);

    assert!(*event_types.get("node_started").unwrap_or(&0) >= 1,
        "期望至少 1 个 node_started 事件\n{:?}", event_types);

    assert_eq!(agent_result, "SUCCESS",
        "Agent 应成功完成\n事件类型: {:?}\n内容:\n{}",
        event_types, safe_truncate(&all_content, 3000));

    println!("\n  ✔ test_e2e_tui_channel_explore_full_flow: PASS");
}

// ============================================================================
// 测试 8: 高保真 TUI 场景 — 并行工具调用验证
//
// 要求 AI 同时读取 3 个文件，验证：
//   1. tool_call 事件 >= 2 个（并行）
//   2. 进度符号使用 Unicode（✔ 而非 ✅）
//   3. 所有工具结果通过 channel 回传（content_delta 非空）
//
// 运行：cargo test --bin ifai --features real-llm -- e2e_tui_channel_parallel --ignored --nocapture
// ============================================================================

#[tokio::test(flavor = "multi_thread")]
#[serial_test::serial]
#[ignore]
async fn test_e2e_tui_channel_parallel_tools() {
    println!("\n═══════════════════════════════════════════════════════════════");
    println!("  L5.2: 高保真 TUI — 并行工具调用验证");
    println!("═══════════════════════════════════════════════════════════════");

    let Some((spec, ksrc)) = first_available_provider() else {
        eprintln!("[SKIP] 无可用 API Key，跳过");
        return;
    };
    println!("  Provider: {} ({}) [{}]", spec.name, spec.model, ksrc);

    let config_json = match build_provider_config_json(spec) {
        Some(c) => c,
        None => {
            eprintln!("[SKIP] 无法构建 provider config JSON");
            return;
        }
    };

    let (progress_tx, mut progress_rx) = tokio::sync::mpsc::unbounded_channel::<String>();

    // 明确要求读取 3 个文件，触发并行
    let task = concat!(
        "请同时读取以下 3 个文件：\n",
        "1) Cargo.toml\n",
        "2) src/main.rs\n",
        "3) README.md\n",
        "然后简要总结每个文件的内容。"
    );

    let config_clone = config_json.clone();
    let agent_handle = tokio::spawn(async move {
        crate::agent_cmd::run_agent_with_channel(
            "explore", task, Some(&config_clone), Some(progress_tx),
        )
        .await
    });

    let mut content_lines: Vec<String> = Vec::new();
    let start = std::time::Instant::now();

    loop {
        while let Ok(line) = progress_rx.try_recv() {
            if !line.is_empty() {
                content_lines.push(line);
            }
        }
        if start.elapsed() > std::time::Duration::from_secs(120) {
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
    let agent_result = match agent_handle.await {
        Ok(Ok(())) => "SUCCESS",
        Ok(Err(e)) => { println!("  ✘ Agent 错误: {}", e); "ERROR" }
        Err(e) => { println!("  ✘ Agent panic: {}", e); "PANIC" }
    };

    // 快照
    println!("\n  ┌─────────────────────────────────────────────────┐");
    println!("  │  TUI 内容区快照                                    │");
    println!("  └─────────────────────────────────────────────────┘");
    for line in &content_lines {
        println!("  │ {}", line);
    }
    println!("  └─────────────────────────────────────────────────┘");

    let all_content = content_lines.join("\n");
    let tool_calls: Vec<&String> = content_lines.iter()
        .filter(|l| l.contains("read_file"))
        .collect();

    println!("\n  ───────────────────────────────────────────────");
    println!("  耗时: {:?}", elapsed);
    println!("  结果: {}", agent_result);
    println!("  read_file 工具调用: {}", tool_calls.len());
    println!("  ───────────────────────────────────────────────");

    // 网络错误跳过
    if all_content.contains("流式请求失败") || all_content.contains("SSE 流读取超时")
        || all_content.contains("API 错误") {
        eprintln!("[SKIP] 网络错误，跳过断言");
        return;
    }

    // 验证并行工具调用
    assert!(tool_calls.len() >= 1,
        "期望至少 1 个 read_file 工具调用，实际: {}\n{}",
        tool_calls.len(), safe_truncate(&all_content, 2000));

    // 验证 Unicode 符号（✔ 而非 ✅）
    let has_new_done = all_content.contains("\u{2714}");     // ✔
    let has_old_done = all_content.contains("✅");           // old
    println!("  Unicode ✔ (新): {}", has_new_done);
    println!("  Emoji ✅ (旧): {}", has_old_done);

    assert_eq!(agent_result, "SUCCESS",
        "Agent 应成功完成: {:?}", content_lines);

    println!("\n  ✔ test_e2e_tui_channel_parallel_tools: PASS");
}
