# 网络测试宏使用指南

## 概述

网络测试宏提供了在测试环境中检测网络可用性的功能，允许测试在没有网络时自动跳过，避免测试失败。

## 核心功能

### 1. `check_network()` - 网络可用性检测

```rust
use crate::tests::common::network::{check_network, NetworkAvailability};

let avail = check_network();
match avail {
    NetworkAvailability::Available => {
        // 网络可用
    }
    NetworkAvailability::Unavailable => {
        // 网络不可用
    }
    NetworkAvailability::SkipCheck => {
        // 跳过检测（CI 环境或明确启用）
    }
}
```

### 2. `skip_if_no_network!` - 属性宏（不推荐使用）

```rust
#[test]
fn test_api_call() {
    skip_if_no_network!();

    // 需要网络的测试代码
    let response = reqwest::get("https://api.example.com").await.unwrap();
    assert!(response.status().is_success());
}
```

**注意**: 属性宏方式在 Rust 中实现困难，推荐使用 `conditional_network_test!` 宏。

### 3. `conditional_network_test!` - 条件执行宏（推荐）

```rust
#[tokio::test]
async fn test_real_api() {
    conditional_network_test! {
        // 需要网络的测试代码
        let response = reqwest::get("https://api.example.com").await.unwrap();
        assert!(response.status().is_success());
    }
}
```

## 环境变量控制

### `IFAI_TEST_NETWORK=1` - 强制启用网络测试

```bash
# 强制启用网络测试，跳过网络检测
IFAI_TEST_NETWORK=1 cargo test test_network_api
```

### `IFAI_TEST_NO_NETWORK=1` - 强制禁用网络测试

```bash
# 强制禁用网络测试
IFAI_TEST_NO_NETWORK=1 cargo test test_network_api
```

### CI 环境自动启用

在以下 CI 环境中，网络测试会自动启用（跳过网络检测）：
- `CI=1`
- `GITHUB_ACTIONS=1`
- `GITLAB_CI=1`
- `TRAVIS=1`

## 在 YAML 测试中使用的限制

由于元编程测试框架的限制，**不能直接在 YAML 测试中使用宏**。

### 替代方案 1：手动创建测试

```rust
// tests/integration/real_api.rs
use crate::tests::common::*;

#[tokio::test]
#[serial_test::serial]
async fn test_real_openai_api() {
    // 只有在网络可用时才运行
    conditional_network_test! {
        let env = TestEnv::new().await.unwrap();

        // 设置真实 API key（从环境变量读取）
        let api_key = std::env::var("OPENAI_API_KEY")
            .expect("OPENAI_API_KEY must be set for real API tests");

        let output = env.run_cli(&[
            "--provider", "openai",
            "--model", "gpt-3.5-turbo",
            "--api-key", &api_key,
            "hello"
        ]).await.unwrap();

        output.assert_success();
        output.assert_contains("Hello");
    }
}
```

### 替代方案 2：使用测试套件配置

```yaml
# tests/suite/real_api.yaml
test_suite:
  name: "真实 API 测试"
  description: "这些测试需要真实网络连接"

  # 全局配置：只有通过网络检测才运行
  config:
    require_network: true

  tests:
    - name: "OpenAI API 测试"
      description: "测试真实的 OpenAI API 调用"
      given:
        args: ["--provider", "openai"]
        # 从环境变量读取 API key
        env:
          OPENAI_API_KEY: "${OPENAI_API_KEY}"
      when:
        mock_streaming:
          - "Hello from real API"
      then:
        assert_success: true
```

## 网络检测策略

### 检测优先级

1. **环境变量 `IFAI_TEST_NETWORK=1`** → 返回 `SkipCheck`（跳过检测，认为网络可用）
2. **CI 环境检测** → 返回 `SkipCheck`（跳过检测，认为网络可用）
3. **环境变量 `IFAI_TEST_NO_NETWORK=1`** → 返回 `Unavailable`（强制禁用）
4. **实际网络检测** → 连接 `1.1.1.1:53`（Cloudflare DNS）
   - 连接成功 → 返回 `Available`
   - 连接失败 → 返回 `Unavailable`

### 超时设置

- 默认超时：500ms
- 连接目标：`1.1.1.1:53`（Cloudflare DNS）
- 超时设计：快速失败，避免阻塞测试

## 最佳实践

### 1. 明确标记需要网络的测试

```rust
#[tokio::test]
#[serial_test::serial]  // 需要串行执行，避免网络竞争
async fn test_real_api() {
    conditional_network_test! {
        // 测试代码...
    }
}
```

### 2. 使用 Mock 服务器替代（推荐）

优先使用 Mock 服务器（`TestEnv::with_mock()`）而非真实网络：

```rust
#[tokio::test]
#[serial_test::serial]
async fn test_with_mock() {
    // 推荐：使用 Mock 服务器
    let env = TestEnv::with_mock().await.unwrap();

    if let Some(mock) = env.mock_server() {
        mock.setup_streaming_response(vec!["Mock response"]).await.unwrap();
    }

    let output = env.run_cli(&["hello"]).await.unwrap();
    output.assert_success();
}
```

### 3. 真实 API 测试仅在必要时使用

只在以下场景使用真实网络测试：
- **端到端测试** - 验证完整的工作流
- **集成测试** - 验证与真实 API 的兼容性
- **回归测试** - 验证 API 更新后的兼容性

### 4. 在 CI/CD 中强制启用

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Run tests with network
        env:
          IFAI_TEST_NETWORK: 1  # 强制启用网络测试
        run: cargo test --bin ifai
```

## 故障排除

### 测试总是被跳过

1. 检查网络连接：
   ```bash
   ping -c 1 1.1.1.1
   ```

2. 强制启用网络测试：
   ```bash
   IFAI_TEST_NETWORK=1 cargo test
   ```

3. 查看网络状态：
   ```bash
   cargo test test_network_availability_debug -- --nocapture
   ```

### 测试不应该被跳过但被跳过了

检查是否设置了以下环境变量：
- `IFAI_TEST_NO_NETWORK=1` - 移除此环境变量
- CI 检测可能误判 - 使用 `IFAI_TEST_NETWORK=1` 强制启用

### 网络检测太慢

网络检测超时时间为 500ms，如果测试运行缓慢：
1. 检查 DNS 解析速度
2. 使用 `IFAI_TEST_NETWORK=1` 跳过检测
3. 考虑使用 Mock 服务器

## 示例

### 示例 1: 简单的网络测试

```rust
#[tokio::test]
#[serial_test::serial]
async fn test_api_ping() {
    conditional_network_test! {
        let response = reqwest::get("https://api.openai.com/v1/models")
            .timeout(Duration::from_secs(5))
            .await
            .expect("Request failed");

        assert!(response.status().is_success());
    }
}
```

### 示例 2: 带配置的网络测试

```rust
#[tokio::test]
#[serial_test::serial]
async fn test_config_with_network() {
    conditional_network_test! {
        let env = TestEnv::new().await.unwrap();
        let config = r#"
            [providers.openai]
            api_key = "test-key"
        "#;
        env.write_config(config).await.unwrap();

        // 设置真实 API key
        let api_key = std::env::var("OPENAI_API_KEY")
            .expect("OPENAI_API_KEY must be set");

        let output = env.run_cli(&[
            "--provider", "openai",
            "--api-key", &api_key,
            "test prompt"
        ]).await.unwrap();

        output.assert_success();
    }
}
```

## 相关文件

- `tests/common/network.rs` - 网络测试宏实现
- `tests/suite/network_example.yaml` - 网络测试示例（仅供参考）
- `config.rs` - 配置解析（包含环境变量读取）

## 更新日志

- **2024-04-28**: 初始实现
  - 添加 `check_network()` 函数
  - 添加 `conditional_network_test!` 宏
  - 添加环境变量控制
  - 添加单元测试
