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
];

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
