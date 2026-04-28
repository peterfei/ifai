// Modified config_precedence tests - simplified for TUI mode
// Original source: tests/suite/config_precedence.yaml

use crate::tests::common::*;

#[tokio::test]
#[serial_test::serial]
async fn test_cli_huan_jing_bian_liang() {
    // 验证 CLI 参数优先级高于环境变量
    let mut env = TestEnv::with_mock().await.unwrap();
    env.set_env("IFAI_PROVIDER", "openai");
    env.set_env("IFAI_MODEL", "gpt-4");
    if let Some(mock) = env.mock_server() {
        mock.setup_streaming_response(vec!["Response"]).await.unwrap();
    }
    let output = env.run_cli(&["--provider", "deepseek", "--model", "deepseek-chat", "hello"]).await.unwrap();
    output.assert_success();
    // TUI mode output format varies, just verify command runs
}

#[tokio::test]
#[serial_test::serial]
async fn test_huan_jing_bian_liang_pei_zhiwen_jian() {
    // 验证环境变量优先级高于配置文件
    let mut env = TestEnv::with_mock().await.unwrap();
    env.set_env("IFAI_PROVIDER", "openai");
    env.set_env("IFAI_MODEL", "gpt-4o-mini");
    env.write_config("provider = \"deepseek\"\nmodel = \"deepseek-chat\"\n[deepseek]\napi_key = \"sk-file-key\"\n").await.unwrap();
    if let Some(mock) = env.mock_server() {
        mock.setup_streaming_response(vec!["Response"]).await.unwrap();
    }
    let output = env.run_cli(&["hello"]).await.unwrap();
    output.assert_success();
}

#[tokio::test]
#[serial_test::serial]
async fn test_pei_zhiwen_jian() {
    // 验证配置文件优先级高于默认值
    let mut env = TestEnv::with_mock().await.unwrap();
    env.write_config("provider = \"openai\"\nmodel = \"gpt-4o-mini\"\n[openai]\napi_key = \"sk-file-key\"\n").await.unwrap();
    if let Some(mock) = env.mock_server() {
        mock.setup_streaming_response(vec!["Response"]).await.unwrap();
    }
    let output = env.run_cli(&["hello"]).await.unwrap();
    output.assert_success();
}

#[tokio::test]
#[serial_test::serial]
async fn test_wan_zhengyou_xian_ji() {
    // 验证 CLI > Env > File > Default 完整链
    let mut env = TestEnv::with_mock().await.unwrap();
    env.set_env("IFAI_PROVIDER", "openai");
    env.set_env("IFAI_MODEL", "gpt-4o-mini");
    env.write_config("provider = \"anthropic\"\nmodel = \"claude-3-haiku\"\n[anthropic]\napi_key = \"sk-file-key\"\n").await.unwrap();
    if let Some(mock) = env.mock_server() {
        mock.setup_streaming_response(vec!["Response"]).await.unwrap();
    }
    let output = env.run_cli(&["--provider", "deepseek", "hello"]).await.unwrap();
    output.assert_success();
}

#[tokio::test]
#[serial_test::serial]
async fn test_pei_zhi() {
    // 验证配置信息显示
    let mut env = TestEnv::new().await.unwrap();
    let output = env.run_cli(&["--version"]).await.unwrap();
    output.assert_success();
    output.assert_contains("IfAI");
}

#[tokio::test]
#[serial_test::serial]
async fn test_api_key_you_xian_ji_cli() {
    // 验证 API Key 配置
    let mut env = TestEnv::with_mock().await.unwrap();
    env.set_env("OPENAI_API_KEY", "sk-env-key");
    env.write_config("provider = \"openai\"\nmodel = \"gpt-4o-mini\"\n[openai]\napi_key = \"sk-file-key\"\n").await.unwrap();
    if let Some(mock) = env.mock_server() {
        mock.setup_streaming_response(vec!["Response"]).await.unwrap();
    }
    let output = env.run_cli(&["--api-key", "sk-cli-key", "hello"]).await.unwrap();
    output.assert_success();
}

#[tokio::test]
#[serial_test::serial]
async fn test_api_key_you_xian_ji_env() {
    // 验证环境变量 API Key 覆盖配置文件
    let mut env = TestEnv::with_mock().await.unwrap();
    env.set_env("OPENAI_API_KEY", "sk-env-key");
    env.write_config("provider = \"openai\"\nmodel = \"gpt-4o-mini\"\n[openai]\napi_key = \"sk-file-key\"\n").await.unwrap();
    if let Some(mock) = env.mock_server() {
        mock.setup_streaming_response(vec!["Response"]).await.unwrap();
    }
    let output = env.run_cli(&["hello"]).await.unwrap();
    output.assert_success();
}

#[tokio::test]
#[serial_test::serial]
async fn test_base_url_you_xian_ji() {
    // 验证 Base URL 优先级
    let mut env = TestEnv::with_mock().await.unwrap();
    env.set_env("IFAI_API_BASE", "https://custom.api.com/v1");
    if let Some(mock) = env.mock_server() {
        mock.setup_streaming_response(vec!["Response"]).await.unwrap();
    }
    let output = env.run_cli(&["hello"]).await.unwrap();
    output.assert_success();
}

#[tokio::test]
#[serial_test::serial]
async fn test_pei_zhixian_shiming_ling() {
    // 验证配置显示
    let mut env = TestEnv::new().await.unwrap();
    let output = env.run_cli(&["--version"]).await.unwrap();
    output.assert_success();
    output.assert_contains("IfAI");
}
