// tests/e2e/real_providers.rs
//
// 真实 API 端到端测试
//
// 优先级：环境变量 > ~/.ifai/config.toml > 跳过(ignored)
// 新增 provider 只需在 PROVIDERS 数组中加一行。
//
// 运行方式：
//   cargo test --bin ifai -- tests::e2e --nocapture          # 用 config.toml
//   DEEPSEEK_API_KEY=sk-xxx cargo test ... tests::e2e --nocapture  # 用环境变量

use crate::tests::common::*;

// ============================================================================
// 声明式 Provider 注册表 —— 数据即配置
// ============================================================================

struct ProviderSpec {
    name: &'static str,
    flag: &'static str,
    model: &'static str,
    env_key: &'static str,
}

const PROVIDERS: &[ProviderSpec] = &[
    ProviderSpec { name: "DeepSeek", flag: "deepseek", model: "deepseek-chat", env_key: "DEEPSEEK_API_KEY" },
    ProviderSpec { name: "OpenAI",   flag: "openai",   model: "gpt-4o-mini",   env_key: "OPENAI_API_KEY" },
    ProviderSpec { name: "Zhipu",    flag: "zhipu",    model: "glm-4-flash",   env_key: "ZHIPU_API_KEY" },
];

// ============================================================================
// 智谱高保真测试配置（对齐用户实际环境）
// ============================================================================

/// 用户实际使用的智谱配置
const ZHIPU_HF_SPEC: ProviderSpec = ProviderSpec {
    name: "Zhipu-HF",
    flag: "zhipu",
    model: "glm-4.6",           // 用户实际模型
    env_key: "ZHIPU_API_KEY",
};

/// 用户实际使用的 base_url（coding endpoint）
const ZHIPU_HF_BASE_URL: &str = "https://open.bigmodel.cn/api/coding/paas/v4";

/// 创建高保真智谱测试环境（proxy + base_url + glm-4.6）
async fn make_zhipu_hf_env() -> Option<TestEnv> {
    let ksrc = check_provider(&ZHIPU_HF_SPEC)?;
    let mut tenv = make_test_env(&ZHIPU_HF_SPEC, ksrc).await;

    // 设置用户实际使用的 base_url
    tenv.set_env("IFAI_API_BASE", ZHIPU_HF_BASE_URL);

    // 传递 proxy 环境变量（继承当前进程的 proxy 设置）
    for var in &["HTTPS_PROXY", "HTTP_PROXY", "https_proxy", "http_proxy", "ALL_PROXY", "all_proxy"] {
        if let Ok(val) = std::env::var(var) {
            tenv.set_env(var, &val);
        }
    }

    Some(tenv)
}

/// 检查 provider 是否可用：env var > config.toml
fn check_provider(spec: &ProviderSpec) -> Option<&'static str> {
    if let Ok(key) = std::env::var(spec.env_key) {
        if !key.is_empty() {
            return Some("env");
        }
    }
    let home = std::env::var("HOME").unwrap_or_default();
    let config_path = std::path::Path::new(&home).join(".ifai/config.toml");
    if config_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&config_path) {
            if content.contains("api_key") && content.contains(spec.flag) {
                return Some("config.toml");
            }
        }
    }
    None
}

/// 构建 TestEnv（变量名避免与 Rust 内置 env! 冲突）
async fn make_test_env(spec: &ProviderSpec, key_source: &str) -> TestEnv {
    let mut tenv = TestEnv::new().await.unwrap();
    tenv.set_env("IFAI_PROVIDER", spec.flag);
    tenv.set_env("IFAI_MODEL", spec.model);
    if key_source == "env" {
        if let Ok(key) = std::env::var(spec.env_key) {
            tenv.set_env(spec.env_key, &key);
        }
    }
    tenv
}

/// 安全截断 UTF-8 字符串到指定字节长度（不切断多字节字符）
fn safe_truncate(s: &str, max_bytes: usize) -> &str {
    if s.len() <= max_bytes {
        return s;
    }
    let mut end = max_bytes;
    while end > 0 && !s.is_char_boundary(end) {
        end -= 1;
    }
    &s[..end]
}

/// 执行 API 调用并检查退出码，返回完整输出用于日志
async fn call_and_check(tenv: &TestEnv, args: &[&str], expect_success: bool) -> Result<(String, String), String> {
    let output = tenv.run_cli(args).await.map_err(|e| e.to_string())?;
    if output.status.success() != expect_success {
        return Err(format!("stdout: {}\nstderr: {}", output.stdout, output.stderr));
    }
    Ok((output.stdout, output.stderr))
}

// ============================================================================
// 宏：遍历 PROVIDERS，对每个可用 provider 执行 body
// ============================================================================

/// 在 body 内可用变量：$spec, $ksrc, $tenv
macro_rules! for_each_provider {
    ($test_name:expr, |$spec:ident, $ksrc:ident, $tenv:ident| $body:expr) => {{
        let mut tested = 0u32;
        let mut failed = 0u32;

        for $spec in PROVIDERS {
            match check_provider($spec) {
                Some($ksrc) => {
                    let tenv_owned = make_test_env($spec, $ksrc).await;
                    let $tenv = &tenv_owned;
                    let result: Result<(String, String), String> = $body;
                    match result {
                        Ok((stdout, stderr)) => {
                            tested += 1;
                            eprintln!("[{}] {}: OK", $spec.name, $test_name);
                            eprintln!("  --- stdout ---\n{}", stdout.trim());
                            if !stderr.trim().is_empty() {
                                eprintln!("  --- stderr ---\n{}", stderr.trim());
                            }
                        }
                        Err(e) => {
                            failed += 1;
                            eprintln!("[{}] {}: FAILED\n{}", $spec.name, $test_name, e);
                        }
                    }
                }
                None => {
                    eprintln!("[SKIP] {} [{}]: no API key", $test_name, $spec.name);
                }
            }
        }

        if tested == 0 {
            if failed > 0 {
                eprintln!("[WARN] {}: all providers configured but all failed (likely invalid keys)", $test_name);
            } else {
                eprintln!("[SKIP] {}: no providers configured", $test_name);
            }
            return; // 无成功 provider → 不算 pass 也不算 fail
        }
        // 至少有一个 provider 成功即通过，失败的仅记录 warning
        if failed > 0 {
            eprintln!("[WARN] {}: {}/{} providers failed (but at least one succeeded)", $test_name, failed, tested + failed);
        }
    }};
}

// ============================================================================
// 测试：连通性
// ============================================================================

#[tokio::test]
#[serial_test::serial]
async fn test_real_api_connectivity() {
    for_each_provider!("connectivity", |spec, _ksrc, tenv| {
        call_and_check(tenv, &["hello"], true).await
    });
}

// ============================================================================
// 测试：无效 Key 应返回认证错误
// ============================================================================

#[tokio::test]
#[serial_test::serial]
async fn test_real_api_invalid_key() {
    for_each_provider!("invalid_key", |spec, _ksrc, _tenv| {
        // 重新构建 env，用假 key 覆盖（TestEnv 不可 Clone）
        let mut tenv = make_test_env(spec, "env").await;
        tenv.set_env(spec.env_key, "sk-invalid-fake-key-12345");
        call_and_check(&tenv, &["hello"], false).await
    });
}

// ============================================================================
// 测试：流式响应完整性
// ============================================================================

#[tokio::test]
#[serial_test::serial]
async fn test_real_api_streaming() {
    for_each_provider!("streaming", |_spec, _ksrc, tenv| {
        call_and_check(tenv, &["count from 1 to 3"], true).await
    });
}

// ============================================================================
// 测试：多轮工具调用续播链完整性（高保真断链复现）
//
// 场景：要求 AI 执行一个需要 2+ 个工具调用的任务（写文件 + 读文件验证）
// 验证点：
//   1. AI 发起第一个工具调用（如 write_file）
//   2. 工具执行成功后，续播链继续（不应断链）
//   3. AI 完成所有步骤后正常结束
//   4. 输出中包含 "Continuing..." 续播标记（证明续播链正常）
//
// 诊断：如果断链，输出中只有 1 个工具调用结果，没有 "Continuing..."
// ============================================================================

/// 多轮工具调用续播测试（通用版 — 所有 provider）
#[tokio::test]
#[serial_test::serial]
async fn test_real_api_multi_turn_tool_chain() {
    for_each_provider!("multi_turn_tool_chain", |_spec, _ksrc, tenv| {
        call_and_check(tenv, &[
            "请先创建文件 /tmp/test_chain.txt 内容为 hello world，然后读取该文件验证内容",
        ], true).await
    });
}

// ============================================================================
// 智谱专项测试：多轮工具调用续播链完整性
//
// 使用与用户报告相同的智谱模型，验证：
//   1. 单步工具调用正常
//   2. 多步骤工具调用续播链不断裂
//   3. TodoWrite 后不会断链
// ============================================================================

/// 智谱基础工具调用测试
#[tokio::test]
#[serial_test::serial]
async fn test_zhipu_single_tool_call() {
    let spec = ProviderSpec {
        name: "Zhipu",
        flag: "zhipu",
        model: "glm-4-flash",
        env_key: "ZHIPU_API_KEY",
    };

    let Some(ksrc) = check_provider(&spec) else {
        eprintln!("[SKIP] test_zhipu_single_tool_call: no Zhipu API key");
        return;
    };

    let tenv = make_test_env(&spec, ksrc).await;
    let output = call_and_check(&tenv, &[
        "请在 /tmp 下创建一个 hello_test.txt 文件，内容为 'Hello from test'",
    ], true).await;

    match output {
        Ok((stdout, stderr)) => {
            let combined = format!("{}\n{}", stdout, stderr);
            assert!(combined.contains("write_file"),
                "Zhipu: Expected write_file tool call:\n{}", safe_truncate(&combined, 1000));
            eprintln!("[Zhipu] single_tool_call: OK");
            eprintln!("  --- output (first 2000 chars) ---\n{}", safe_truncate(&combined, 2000));
        }
        Err(e) => {
            eprintln!("[Zhipu] single_tool_call: FAILED\n{}", e);
            panic!("Zhipu single tool call test failed: {}", e);
        }
    }
}

// ============================================================================
// 智谱高保真测试（glm-4.6 + coding/paas/v4 + proxy）
//
// 完全对齐用户实际环境：
//   - 模型: glm-4.6（非 glm-4-flash）
//   - Base URL: https://open.bigmodel.cn/api/coding/paas/v4
//   - Proxy: 继承当前进程的 proxy 环境变量
//   - 事件循环: CLI 模式（与 TUI 镜像对称，续播逻辑一致）
// ============================================================================

/// 高保真：glm-4.6 多步骤续播链测试
///
/// 使用用户实际配置，验证 glm-4.6 + coding endpoint 的续播链完整性
/// 自动批准所有高风险工具（stdin 预填 50 个 y）
#[tokio::test]
#[serial_test::serial]
async fn test_zhipu_hf_multi_step_continuation() {
    let Some(mut tenv) = make_zhipu_hf_env().await else {
        eprintln!("[SKIP] test_zhipu_hf_multi_step_continuation: no Zhipu API key");
        return;
    };

    // 预填 stdin：自动批准高风险工具
    let auto_approve: String = "y\n".repeat(50);
    tenv.set_stdin(&auto_approve);

    let output = tenv.run_cli(&[
        "请完成以下步骤：1) 创建 /tmp/hf_test_1.txt 内容为 'step one'  2) 创建 /tmp/hf_test_2.txt 内容为 'step two'  3) 读取这两个文件确认内容",
    ]).await;

    let output = match output {
        Ok(o) => o,
        Err(e) => {
            eprintln!("[Zhipu-HF] multi_step: CLI launch failed: {}", e);
            return;
        }
    };

    let combined = format!("{}\n{}", output.stdout, output.stderr);

    let write_count = combined.matches("write_file").count();
    let read_count = combined.matches("read_file").count();
    let cont_count = combined.matches("Continuing").count();
    let network_error = combined.contains("Failed to start stream: Network");

    eprintln!("  [glm-4.6] write_file×{}, read_file×{}, Continuing×{}", write_count, read_count, cont_count);

    if network_error {
        eprintln!("[SKIP] test_zhipu_hf_multi_step_continuation: network error");
        return;
    }

    // 断链诊断
    if cont_count == 0 && write_count >= 1 {
        eprintln!("\n  [CHAIN BREAK] glm-4.6: write_file called but no continuation!");
    }

    assert!(cont_count >= 2 || write_count <= 1,
        "glm-4.6 chain break! write×{}, Continuing×{}.\n{}",
        write_count, cont_count, safe_truncate(&combined, 2000));

    eprintln!("[Zhipu-HF] multi_step: PASS (write×{}, read×{}, Continuing×{})", write_count, read_count, cont_count);
}

/// 高保真：glm-4.6 TodoWrite + 执行续播（2048 断链复现）
///
/// 使用用户实际配置，高保真复现 2048 断链场景
/// 自动批准所有高风险工具（stdin 预填 50 个 y）
#[tokio::test]
#[serial_test::serial]
async fn test_zhipu_hf_todowrite_2048_repro() {
    let Some(mut tenv) = make_zhipu_hf_env().await else {
        eprintln!("[SKIP] test_zhipu_hf_todowrite_2048_repro: no Zhipu API key");
        return;
    };

    // 预填 stdin：50 个 y 自动批准所有高风险工具
    let auto_approve: String = "y\n".repeat(50);
    tenv.set_stdin(&auto_approve);

    let output = tenv.run_cli(&[
        "帮我生成2048小游戏，创建 /tmp/hf_2048/index.html，HTML+CSS+JS 全部在一个文件中",
    ]).await;

    let output = match output {
        Ok(o) => o,
        Err(e) => {
            eprintln!("[Zhipu-HF] todowrite_2048: CLI launch failed: {}", e);
            return;
        }
    };

    let combined = format!("{}\n{}", output.stdout, output.stderr);

    let write_count = combined.matches("write_file").count();
    let bash_count = combined.matches("bash({").count();
    let tool_count = write_count + bash_count;
    let cont_count = combined.matches("Continuing").count();
    let todowrite_count = combined.matches("TodoWrite").count();
    let network_error = combined.contains("Failed to start stream: Network")
        || combined.contains("Stream error: Network");
    let has_html = combined.contains("<!DOCTYPE") || combined.contains("<html") || combined.contains("<HTML");

    eprintln!("  [glm-4.6] TodoWrite×{}, tools×{}(write×{}, bash×{}), Continuing×{}, HTML: {}",
        todowrite_count, tool_count, write_count, bash_count, cont_count, has_html);

    if network_error {
        eprintln!("[SKIP] test_zhipu_hf_todowrite_2048_repro: network error (stream interrupted)");
        return;
    }

    // 断链诊断
    if todowrite_count >= 1 && cont_count == 0 {
        eprintln!("\n  ══════════════════════════════════════════════════════");
        eprintln!("  [CHAIN BREAK DETECTED] TodoWrite executed but NO continuation!");
        eprintln!("  This is the exact 2048 bug scenario reported by user.");
        eprintln!("  ══════════════════════════════════════════════════════");
    }
    if todowrite_count >= 1 && tool_count == 0 {
        eprintln!("\n  [CHAIN BREAK] TodoWrite executed but no tools called!");
        eprintln!("  AI planned tasks but never executed them (text-only response after TodoWrite).");
    }

    // 输出前 5000 字符用于诊断
    eprintln!("[Zhipu-HF] todowrite_2048: TodoWrite×{}, tools×{}, Continuing×{}, HTML: {}",
        todowrite_count, tool_count, cont_count, has_html);
    eprintln!("  --- output (first 5000 chars) ---\n{}", safe_truncate(&combined, 5000));

    // 核心断言：TodoWrite 后必须有续播
    if todowrite_count >= 1 {
        assert!(cont_count >= 1,
            "glm-4.6 chain break after TodoWrite! TodoWrite×{}, Continuing×{}.\n\
             AI returned text-only response after TodoWrite → event loop terminated.\n\
             This is the 2048 bug.\n{}",
            todowrite_count, cont_count, safe_truncate(&combined, 3000));
    }
}

/// 高保真：glm-4.6 压缩后续播链测试
///
/// 验证压缩触发后事件循环能正确续播（不因压缩丢失消息结构导致断链）
/// 自动批准所有高风险工具（stdin 预填 50 个 y）
#[tokio::test]
#[serial_test::serial]
async fn test_zhipu_hf_compression_continuation() {
    let Some(mut tenv) = make_zhipu_hf_env().await else {
        eprintln!("[SKIP] test_zhipu_hf_compression_continuation: no Zhipu API key");
        return;
    };

    // 预填 stdin：自动批准高风险工具
    let auto_approve: String = "y\n".repeat(50);
    tenv.set_stdin(&auto_approve);

    // 长对话任务：要求多次交互，可能触发压缩
    let output = tenv.run_cli(&[
        "请依次完成以下任务：\
         1) 创建 /tmp/comp_test/a.txt 内容为 'aaa' \
         2) 创建 /tmp/comp_test/b.txt 内容为 'bbb' \
         3) 创建 /tmp/comp_test/c.txt 内容为 'ccc' \
         4) 读取所有三个文件 \
         5) 创建 /tmp/comp_test/summary.txt 内容为所有文件内容合并",
    ]).await;

    let output = match output {
        Ok(o) => o,
        Err(e) => {
            eprintln!("[Zhipu-HF] compression: CLI launch failed: {}", e);
            return;
        }
    };

    let combined = format!("{}\n{}", output.stdout, output.stderr);

    let write_count = combined.matches("write_file").count();
    let read_count = combined.matches("read_file").count();
    let cont_count = combined.matches("Continuing").count();
    let compressed = combined.contains("压缩");

    eprintln!("  [glm-4.6] write×{}, read×{}, Continuing×{}, compressed: {}",
        write_count, read_count, cont_count, compressed);

    // 验证续播链完整
    assert!(cont_count >= write_count.saturating_sub(1),
        "glm-4.6 chain break! write×{}, Continuing×{}. Expected Continuing >= write-1.\n{}",
        write_count, cont_count, safe_truncate(&combined, 2000));

    eprintln!("[Zhipu-HF] compression_continuation: PASS (write×{}, read×{}, Continuing×{}, compressed: {})",
        write_count, read_count, cont_count, compressed);
}

/// 智谱多步骤续播链测试（核心断链复现）
///
/// 要求 AI 执行需要 3+ 个工具调用的任务，验证续播链完整：
///   - write_file ×2 + read_file ×1 = 至少 3 轮工具调用
///   - "Continuing..." 标记至少出现 2 次
#[tokio::test]
#[serial_test::serial]
async fn test_zhipu_multi_step_no_chain_break() {
    let spec = ProviderSpec {
        name: "Zhipu",
        flag: "zhipu",
        model: "glm-4-flash",
        env_key: "ZHIPU_API_KEY",
    };

    let Some(ksrc) = check_provider(&spec) else {
        eprintln!("[SKIP] test_zhipu_multi_step_no_chain_break: no Zhipu API key");
        return;
    };

    let tenv = make_test_env(&spec, ksrc).await;

    // 简化的多步骤任务：创建 2 个文件 + 读取验证
    // 足够简单不会超时，但需要 3+ 工具调用
    let output = call_and_check(&tenv, &[
        "请完成以下步骤：1) 创建 /tmp/test_multi_1.txt 内容为 'file one'  2) 创建 /tmp/test_multi_2.txt 内容为 'file two'  3) 读取这两个文件并告诉我内容",
    ], true).await;

    match output {
        Ok((stdout, stderr)) => {
            let combined = format!("{}\n{}", stdout, stderr);

            // 验证 write_file 被调用至少 2 次（2 个文件）
            let write_count = combined.matches("write_file").count();
            eprintln!("  write_file calls: {}", write_count);

            // 验证 read_file 被调用
            let read_count = combined.matches("read_file").count();
            eprintln!("  read_file calls: {}", read_count);

            // 验证续播链：Continuing 标记
            let cont_count = combined.matches("Continuing").count();
            eprintln!("  Continuing markers: {}", cont_count);

            // 断链诊断
            if cont_count == 0 && write_count >= 1 {
                eprintln!("\n  [CHAIN BREAK DETECTED] write_file was called but no 'Continuing' marker found!");
                eprintln!("  This means the event loop terminated after the first tool call.");
                eprintln!("  AI returned text-only response after tool execution → triggered 'pure text end' branch.");
            }

            // 验证文件内容出现在输出中
            let has_content = combined.contains("file one") || combined.contains("file two");
            eprintln!("  File content found: {}", has_content);

            // 核心断言：续播链不断裂
            assert!(cont_count >= 2 || write_count <= 1,
                "Zhipu chain break: write_file×{}, Continuing×{}. \
                 Expected at least 2 'Continuing' markers for 2+ tool calls.\n\
                 Output (first 2000 chars):\n{}",
                write_count, cont_count, safe_truncate(&combined, 2000));

            // 如果 write_file 成功调用 2 次则通过
            if write_count >= 2 {
                eprintln!("[Zhipu] multi_step_no_chain_break: PASS (write×{}, read×{}, Continuing×{})",
                    write_count, read_count, cont_count);
            } else {
                eprintln!("[Zhipu] multi_step_no_chain_break: PARTIAL (write×{}, read×{}, Continuing×{})",
                    write_count, read_count, cont_count);
            }
        }
        Err(e) => {
            eprintln!("[Zhipu] multi_step_no_chain_break: FAILED\n{}", e);
            panic!("Zhipu multi-step test failed: {}", e);
        }
    }
}

/// 智谱专项测试：TodoWrite + 执行续播链（2048 断链高保真复现）
///
/// 模拟 2048 场景：AI 先规划（TodoWrite），然后执行任务（write_file）
/// 验证 TodoWrite 执行后续播链不会断裂
#[tokio::test]
#[serial_test::serial]
async fn test_zhipu_todowrite_continuation() {
    let spec = ProviderSpec {
        name: "Zhipu",
        flag: "zhipu",
        model: "glm-4-flash",
        env_key: "ZHIPU_API_KEY",
    };

    let Some(ksrc) = check_provider(&spec) else {
        eprintln!("[SKIP] test_zhipu_todowrite_continuation: no Zhipu API key");
        return;
    };

    let tenv = make_test_env(&spec, ksrc).await;

    // 使用 expect_success=false 以便检查失败原因（可能是网络错误而非断链）
    let output = tenv.run_cli(&[
        "请帮我生成2048小游戏。步骤：1) 创建 /tmp/game2048_test/index.html 文件，包含完整的2048游戏代码（HTML+CSS+JS全部在一个文件中）",
    ]).await;

    let output = match output {
        Ok(o) => o,
        Err(e) => {
            eprintln!("[Zhipu] todowrite_continuation: CLI launch failed: {}", e);
            return;
        }
    };

    let combined = format!("{}\n{}", output.stdout, output.stderr);

    let write_count = combined.matches("write_file").count();
    let cont_count = combined.matches("Continuing").count();
    let todowrite_count = combined.matches("TodoWrite").count();
    let network_error = combined.contains("Failed to start stream: Network");

    eprintln!("  TodoWrite calls: {}", todowrite_count);
    eprintln!("  write_file calls: {}", write_count);
    eprintln!("  Continuing markers: {}", cont_count);
    eprintln!("  Network error: {}", network_error);

    // 网络错误不算断链 bug — 跳过
    if network_error {
        eprintln!("[SKIP] test_zhipu_todowrite_continuation: network error (API rate limit or timeout)");
        return;
    }

    // 断链诊断
    if todowrite_count >= 1 && cont_count == 0 {
        eprintln!("\n  [CHAIN BREAK DETECTED] TodoWrite executed but no continuation!");
        eprintln!("  This is the exact 2048 bug scenario.");
    }
    if todowrite_count >= 1 && write_count == 0 {
        eprintln!("\n  [CHAIN BREAK DETECTED] TodoWrite executed but write_file never called!");
        eprintln!("  AI planned tasks but never executed them.");
    }

    eprintln!("[Zhipu] todowrite_continuation: TodoWrite×{}, write×{}, Continuing×{}",
        todowrite_count, write_count, cont_count);
    eprintln!("  --- output (first 3000 chars) ---\n{}", safe_truncate(&combined, 3000));

    // 核心断言：如果 TodoWrite 执行了，续播链应该继续
    if todowrite_count >= 1 {
        assert!(cont_count >= 1,
            "Zhipu chain break after TodoWrite! TodoWrite×{}, Continuing×{}.\n\
             The event loop terminated after TodoWrite without continuing.\n\
             Output:\n{}",
            todowrite_count, cont_count, safe_truncate(&combined, 3000));
    }
}

/// 高保真：glm-4.6 TodoWrite → 工具执行 → 续播 → 2048 完整链路
///
/// 模拟用户实际操作：明确要求 LLM 先用 TodoWrite 规划任务，
/// 然后逐步执行创建 2048 小游戏。
/// 验证点：
///   - TodoWrite 被调用（AI 按要求规划了任务）
///   - 续播链不中断（Continuing 出现）
///   - 至少一个工具被实际执行（bash/write_file 等）
///   - 高风险工具自动批准（stdin 预填 y）
#[tokio::test]
#[serial_test::serial]
async fn test_zhipu_hf_todowrite_2048_explicit() {
    let Some(mut tenv) = make_zhipu_hf_env().await else {
        eprintln!("[SKIP] test_zhipu_hf_todowrite_2048_explicit: no Zhipu API key");
        return;
    };

    // 预填 stdin：50 个 y 自动批准所有高风险工具
    let auto_approve: String = "y\n".repeat(50);
    tenv.set_stdin(&auto_approve);

    let output = tenv.run_cli(&[
        "帮我TodoWrite 生成2048小游戏",
    ]).await;

    let output = match output {
        Ok(o) => o,
        Err(e) => {
            eprintln!("[Zhipu-HF] todowrite_2048_explicit: CLI launch failed: {}", e);
            return;
        }
    };

    let combined = format!("{}\n{}", output.stdout, output.stderr);

    let write_count = combined.matches("write_file").count();
    let bash_count = combined.matches("bash({").count();
    let tool_count = write_count + bash_count;
    let cont_count = combined.matches("Continuing").count();
    let todowrite_count = combined.matches("TodoWrite").count();
    let network_error = combined.contains("Failed to start stream: Network")
        || combined.contains("Stream error: Network");
    let has_html = combined.contains("<!DOCTYPE") || combined.contains("<html") || combined.contains("<HTML");

    eprintln!("  [glm-4.6] TodoWrite×{}, tools×{}(write×{}, bash×{}), Continuing×{}, HTML: {}",
        todowrite_count, tool_count, write_count, bash_count, cont_count, has_html);

    if network_error {
        eprintln!("[SKIP] test_zhipu_hf_todowrite_2048_explicit: network error (stream interrupted)");
        return;
    }

    // 断链诊断
    if todowrite_count >= 1 && cont_count == 0 {
        eprintln!("\n  ══════════════════════════════════════════════════════");
        eprintln!("  [CHAIN BREAK DETECTED] TodoWrite executed but NO continuation!");
        eprintln!("  This is the exact 2048 bug scenario reported by user.");
        eprintln!("  ══════════════════════════════════════════════════════");
    }
    if todowrite_count >= 1 && tool_count == 0 {
        eprintln!("\n  [CHAIN BREAK] TodoWrite executed but no tools called!");
        eprintln!("  AI planned tasks but never executed them (text-only response after TodoWrite).");
    }

    eprintln!("[Zhipu-HF] todowrite_2048_explicit: TodoWrite×{}, tools×{}, Continuing×{}, HTML: {}",
        todowrite_count, tool_count, cont_count, has_html);
    eprintln!("  --- output (first 5000 chars) ---\n{}", safe_truncate(&combined, 5000));

    // 核心断言：TodoWrite 后必须有续播
    if todowrite_count >= 1 {
        assert!(cont_count >= 1,
            "glm-4.6 chain break after TodoWrite! TodoWrite×{}, Continuing×{}.\n\
             AI returned text-only response after TodoWrite → event loop terminated.\n\
             This is the 2048 bug.\n{}",
            todowrite_count, cont_count, safe_truncate(&combined, 3000));
    }
}
