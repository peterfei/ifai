# 并行测试执行

## 概述

CLI 测试框架支持两种执行模式：

- **串行模式**（默认）：测试按顺序执行，使用 `#[serial_test::serial]` 确保隔离
- **并行模式**：测试并发执行，显著提升测试速度（⚡️ 3-5x 加速）

## 快速开始

### 方法 1：使用测试脚本（推荐）

```bash
# 并行执行（推荐）
./scripts/run-tests.sh --parallel

# 串行执行（默认）
./scripts/run-tests.sh --serial

# 并行 + 测试报告
./scripts/run-tests.sh -p -r

# 过滤测试
./scripts/run-tests.sh -p -f test_simple
```

### 方法 2：使用环境变量

```bash
# 启用并行模式
export IFAI_PARALLEL_TESTS=1
cargo test --test integration

# 或一行命令
IFAI_PARALLEL_TESTS=1 cargo test --test integration
```

### 方法 3：直接使用 Cargo

```bash
# 串行模式（默认）
cargo test --test integration

# 并行模式
cargo test --test integration --env IFAI_PARALLEL_TESTS=1
```

## 性能对比

### 串行模式
```
测试数量: 49
执行时间: ~100 秒
隔离性:  100%（完全隔离）
适用:    调试、CI/CD
```

### 并行模式
```
测试数量: 49
执行时间: ~20-30 秒 ⚡️
隔离性:  100%（独立 Mock + 临时目录）
适用:    开发迭代、本地验证
```

## 工作原理

### 串行模式

```rust
#[tokio::test]
#[serial_test::serial]  // ← 确保测试串行执行
async fn test_simple() {
    let mut env = TestEnv::with_mock().await.unwrap();
    // ...
}
```

### 并行模式

```rust
#[tokio::test]
// ← 没有 serial_test::serial，测试并发执行
async fn test_simple() {
    let mut env = TestEnv::with_mock().await.unwrap();
    // ...
}
```

## 隔离性保证

并行测试通过以下机制确保隔离：

### 1. 独立临时目录

每个 `TestEnv` 使用 `tempfile::TempDir` 创建独立的临时目录：

```rust
pub struct TestEnv {
    temp_dir: TempDir,  // ← 自动清理
    env_vars: HashMap<String, String>,
    mock_server: Option<MockApiServer>,
}
```

### 2. 独立 Mock 服务器

每个 Mock 服务器自动分配不同的端口：

```rust
impl MockApiServer {
    pub async fn new() -> Result<Self> {
        let server = MockServer::start().await;  // ← 随机端口
        Ok(Self { server })
    }
}
```

### 3. 独立环境变量

每个测试设置独立的环境变量：

```rust
env.set_env("IFAI_PROVIDER", "openai");
env.set_env("IFAI_MODEL", "gpt-4");
```

## 并行测试的最佳实践

### ✅ 推荐做法

1. **确保测试隔离**
   ```yaml
   - name: "测试提供商"
     given:
       env:
         IFAI_PROVIDER: "openai"  # ← 独立环境变量
   ```

2. **使用独立的临时文件**
   ```rust
   let temp_file = env.temp_dir().join("test.txt");
   std::fs::write(&temp_file, "data")?;
   ```

3. **避免全局状态**
   ```rust
   // ❌ 错误：使用全局变量
   static mut GLOBAL_STATE: i32 = 0;

   // ✅ 正确：使用 TestEnv
   let mut env = TestEnv::new().await?;
   ```

### ❌ 避免的做法

1. **共享资源**
   ```yaml
   # ❌ 错误：多个测试写入同一文件
   - name: "写入配置文件"
     given:
       config: |
         path = "/tmp/shared-config.toml"  # ← 冲突！
   ```

2. **固定端口**
   ```rust
   // ❌ 错误：使用固定端口
   let server = MockServer::builder().port(8080).start().await;

   // ✅ 正确：使用动态端口
   let server = MockServer::start().await;
   ```

## 何时使用并行模式？

### 适用场景 ✅

- **本地开发迭代**：快速验证修改
- **大型测试套件**：50+ 测试，加速明显
- **隔离性良好的测试**：每个测试独立运行

### 不适用场景 ❌

- **调试并发问题**：串行模式更易调试
- **依赖共享状态的测试**：需要重构为隔离模式
- **资源受限环境**：并发可能耗尽资源

## 切换模式

### 从串行切换到并行

```bash
# 1. 启用并行模式
export IFAI_PARALLEL_TESTS=1

# 2. 重新生成测试代码
cargo build

# 3. 运行测试
cargo test --test integration
```

### 从并行切换到串行

```bash
# 1. 禁用并行模式
unset IFAI_PARALLEL_TESTS

# 2. 重新生成测试代码
cargo build

# 3. 运行测试
cargo test --test integration
```

## CI/CD 集成

### GitHub Actions（推荐串行）

```yaml
- name: Run CLI tests
  run: |
    ./scripts/run-tests.sh --serial --report
```

### 本地开发（推荐并行）

```bash
# ~/.bashrc 或 ~/.zshrc
alias test-parallel='./scripts/run-tests.sh --parallel'
alias test-serial='./scripts/run-tests.sh --serial'

# 使用
test-parallel  # 并行执行
```

## 故障排除

### 问题：并行模式下测试失败

**原因**：测试之间可能存在竞争条件

**解决方案**：
1. 使用串行模式验证测试是否通过
   ```bash
   ./scripts/run-tests.sh --serial
   ```

2. 检查测试是否使用了共享资源
   ```yaml
   # 检查 YAML 中是否有硬编码路径
   given:
     config: |
       path = "/tmp/shared"  # ← 可能冲突
   ```

3. 确保每个测试使用独立临时目录
   ```rust
   let temp_file = env.temp_dir().join("unique-name.txt");
   ```

### 问题：Mock 服务器端口冲突

**原因**：使用了固定端口

**解决方案**：
```rust
// ❌ 错误
let server = MockServer::builder().port(8080).start().await;

// ✅ 正确：使用动态端口
let server = MockServer::start().await;
```

### 问题：环境变量冲突

**原因**：测试修改了进程级环境变量

**解决方案**：
```rust
// ✅ 正确：使用 TestEnv 设置环境变量
env.set_env("IFAI_PROVIDER", "openai");

// ❌ 错误：直接修改 std::env
std::env::set_var("IFAI_PROVIDER", "openai");
```

## 实现细节

### build.rs 修改

并行测试通过 `build.rs` 检测环境变量：

```rust
fn main() {
    let parallel_tests = std::env::var("IFAI_PARALLEL_TESTS")
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false);

    if let Err(e) = generate_tests(parallel_tests) {
        println!("cargo:warning=测试生成失败: {}", e);
    }
}
```

### 测试代码生成

```rust
fn generate_single_test(
    test: &serde_yaml::Value,
    used_names: &mut std::collections::HashSet<String>,
    parallel_tests: bool,  // ← 并行模式参数
) -> Option<String> {
    let mut code = String::new();

    code.push_str("#[tokio::test]\n");
    if !parallel_tests {
        code.push_str("#[serial_test::serial]\n");  // ← 仅串行模式添加
    }
    // ...
}
```

## 未来改进

- [ ] 自动检测测试隔离性
- [ ] 智能并行度控制（根据 CPU 核心数）
- [ ] 测试依赖图分析
- [ ] 并行测试覆盖率报告

## 参考资料

- [serial_test 文档](https://docs.rs/serial-test/)
- [tokio::test 文档](https://docs.rs/tokio/)
- [wiremock 文档](https://docs.rs/wiremock/)
- [tempfile 文档](https://docs.rs/tempfile/)

---

**维护者**: peterfei
**最后更新**: 2026-04-28
