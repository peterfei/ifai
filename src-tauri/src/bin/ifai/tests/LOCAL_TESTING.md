# 本地运行测试文档

## 概述

本文档提供在本地环境运行 CLI 集成测试的完整指南。

## 前置要求

### 系统要求

- **操作系统**: Linux, macOS, 或 Windows
- **Rust**: 1.70 或更高版本
- **内存**: 至少 4GB RAM
- **磁盘**: 至少 1GB 可用空间

### 安装依赖

```bash
# 检查 Rust 版本
rustc --version

# 安装项目依赖
cargo fetch
```

## 快速开始

### 1. 克隆项目

```bash
git clone <repository-url>
cd ifainew/src-tauri
```

### 2. 运行所有测试

```bash
# 从项目根目录运行
cargo test --package ifainew --bin ifai
```

### 3. 查看测试结果

```
running 113 tests
test test_bang_zhu_ming_ling ... ok
test test_huan_jing_bian_liang ... ok
...

test result: ok. 113 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
```

## 运行测试的不同方式

### 方式 1: 运行所有测试

```bash
# 运行完整的测试套件
cargo test --package ifainew --bin ifai

# 显示测试输出
cargo test --package ifainew --bin ifai -- --nocapture

# 显示详细测试信息
cargo test --package ifainew --bin ifai -- --show-output
```

### 方式 2: 运行特定测试套件

```bash
# 运行基础 CLI 测试
cargo test --package ifainew --bin ifai cli_basic

# 运行配置测试
cargo test --package ifainew --bin ifai config_precedence

# 运行工具执行测试
cargo test --package ifainew --bin ifai tools_execution
```

### 方式 3: 运行单个测试

```bash
# 运行单个测试
cargo test --package ifainew --bin ifai test_help_command

# 运行单个测试并显示输出
cargo test --package ifainew --bin ifai test_help_command -- --nocapture
```

### 方式 4: 按名称模式运行测试

```bash
# 运行所有包含 "help" 的测试
cargo test --package ifainew --bin ifai help

# 运行所有包含 "error" 的测试
cargo test --package ifainew --bin ifai error
```

## 测试输出和调试

### 查看测试输出

```bash
# 显示标准输出和标准错误
cargo test --package ifainew --bin ifai -- --nocapture

# 显示测试的详细输出
cargo test --package ifainew --bin ifai -- --show-output

# 同时显示两者
cargo test --package ifainew --bin ifai -- --nocapture --show-output
```

### 启用调试日志

```bash
# 设置 RUST_LOG 环境变量
RUST_LOG=debug cargo test --package ifainew --bin ifai -- --nocapture

# 只显示测试框架日志
RUST_LOG=ifai_test=debug cargo test --package ifainew --bin ifai

# 显示 wiremock 日志（Mock 服务器）
RUST_LOG=wiremock=debug cargo test --package ifainew --bin ifai
```

### 使用日志级别

```bash
# Error 级别
RUST_LOG=error cargo test --package ifainew --bin ifai

# Warn 级别
RUST_LOG=warn cargo test --package ifainew --bin ifai

# Info 级别
RUST_LOG=info cargo test --package ifainew --bin ifai

# Debug 级别
RUST_LOG=debug cargo test --package ifainew --bin ifai

# Trace 级别（最详细）
RUST_LOG=trace cargo test --package ifainew --bin ifai
```

## 测试生成

### 自动生成（推荐）

```bash
# 修改 YAML 文件后，运行 build 自动生成
vim src/bin/ifai/tests/suite/my_test.yaml
cargo build --package ifainew
```

### 手动生成

```bash
# 使用 generate_tests 二进制文件
cargo run --bin generate_tests

# 查看生成的代码
cat src/bin/ifai/tests/generated/my_test.rs
```

### 验证生成

```bash
# 检查生成的测试数量
cargo test --package ifainew --bin ifai -- --list | wc -l

# 检查特定套件的测试
cargo test --package ifainew --bin ifai -- --list | grep cli_basic
```

## 测试隔离

### 临时目录

每个测试使用独立的临时目录：

```rust
let mut env = TestEnv::new().await.unwrap();
// env.temp_dir() 是测试专用的临时目录
```

临时目录在测试结束后自动清理。

### 环境隔离

每个测试有独立的环境变量和配置：

```rust
env.set_env("IFAI_PROVIDER", "openai");
env.write_config("provider: deepseek").await.unwrap();
// 不影响其他测试
```

### 串行执行

测试使用 `#[serial_test::serial]` 串行执行：

```rust
#[tokio::test]
#[serial_test::serial]  // 确保测试不会并行运行
async fn test_example() { ... }
```

## 性能优化

### 并行编译

```bash
# 使用所有 CPU 核心
cargo test --package ifainew --bin ifai --release -j $(nproc)
```

### 增量编译

Cargo 自动缓存编译结果：

```bash
# 首次编译：~30 秒
cargo test --package ifainew --bin ifai

# 未修改代码：~1 秒
cargo test --package ifainew --bin ifai
```

### 测试超时

设置测试超时：

```bash
# 30 秒超时
cargo test --package ifainew --bin ifai -- --test-threads=1 --timeout 30
```

## 常见问题

### Q: 测试运行缓慢

**A**: 使用 Mock 而不是真实网络：

```yaml
# ✅ 快速
when:
  mock_response: "simple_response.json"

# ❌ 缓慢
when:
  # 不设置 mock，使用真实 API
```

### Q: 测试随机失败

**A**: 确保测试独立和串行执行：

```rust
#[tokio::test]
#[serial_test::serial]  // 必须添加
async fn test_example() { ... }
```

### Q: Mock 服务器不工作

**A**: 检查 Mock 响应文件：

```bash
# 确认文件存在
ls src/bin/ifai/tests/fixtures/

# 验证 JSON 格式
cat src/bin/ifai/tests/fixtures/simple_response.json | jq .
```

### Q: 测试生成失败

**A**: 检查 YAML 语法：

```bash
# 验证 YAML 语法
python3 -c "import yaml; yaml.safe_load(open('src/bin/ifai/tests/suite/test.yaml'))"

# 或使用在线工具
# https://www.yamllint.com/
```

### Q: 找不到生成的测试

**A**: 触发代码生成：

```bash
# 运行 build 触发生成
cargo build --package ifainew

# 或手动生成
cargo run --bin generate_tests

# 验证文件存在
ls src/bin/ifai/tests/generated/
```

## 调试技巧

### 技巧 1: 使用 println! 调试

```rust
#[tokio::test]
async fn test_example() {
    println!("Debug: Starting test");

    let mut env = TestEnv::new().await.unwrap();
    println!("Debug: Created env");

    // ...
}
```

运行时使用 `--nocapture` 查看输出：

```bash
cargo test --package ifainew --bin ifai test_example -- --nocapture
```

### 技巧 2: 使用 dbg! 宏

```rust
#[tokio::test]
async fn test_example() {
    let output = env.run_cli(&["hello"]).await.unwrap();
    dbg!(&output.stdout);
    dbg!(&output.exit_code);
}
```

### 技巧 3: 暂停测试执行

```rust
#[tokio::test]
async fn test_example() {
    // 测试代码...

    // 暂停以检查状态
    std::thread::sleep(std::time::Duration::from_secs(10));
}
```

### 技巧 4: 保留临时目录

```rust
#[tokio::test]
async fn test_example() {
    let mut env = TestEnv::new().await.unwrap();

    // 测试代码...

    // 保留临时目录用于检查
    let temp_dir = env.temp_dir().to_path_buf();
    drop(env);
    println!("Temp dir: {:?}", temp_dir);
    std::thread::sleep(std::time::Duration::from_secs(60));
}
```

## 测试覆盖率

### 安装 tarpaulin

```bash
cargo install cargo-tarpaulin
```

### 生成覆盖率报告

```bash
# 终端输出
cargo tarpaulin --package ifainew --bin ifai

# HTML 报告
cargo tarpaulin --package ifainew --bin ifai --out Html

# LCOV 报告
cargo tarpaulin --package ifainew --bin ifai --out Lcov
```

### 查看覆盖率

```bash
# 生成覆盖率报告
cargo tarpaulin --package ifainew --bin ifai --out Html

# 在浏览器中打开
open tarpaulin-report.html
```

## 持续运行测试

### 使用 cargo-watch

```bash
# 安装 cargo-watch
cargo install cargo-watch

# 监视文件变化并自动运行测试
cargo watch -x 'test --package ifainew --bin ifai'
```

### 使用 cargo-make

```bash
# 创建 Makefile.toml
cat > Makefile.toml << 'EOF'
[tasks.test]
command = "cargo"
args = ["test", "--package", "ifainew", "--bin", "ifai"]

[tasks.watch]
command = "cargo"
args = ["watch", "-x", "test --package ifainew --bin ifai"]
EOF

# 运行测试
cargo make test

# 监视模式
cargo make watch
```

## IDE 集成

### VS Code

创建 `.vscode/tasks.json`:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Run All Tests",
      "type": "shell",
      "command": "cargo test --package ifainew --bin ifai",
      "group": {
        "kind": "test",
        "isDefault": true
      }
    },
    {
      "label": "Run Single Test",
      "type": "shell",
      "command": "cargo test --package ifainew --bin ifai ${selectedText}",
      "group": "test"
    }
  ]
}
```

### IntelliJ IDEA

1. 打开 Run/Debug Configurations
2. 添加新的 Cargo Test Configuration
3. 设置：
   - Command: `test`
   - Package: `ifainew`
   - Binary: `ifai`

## 性能基准

### 典型运行时间

| 测试套件 | 测试数量 | 运行时间 |
|---------|---------|---------|
| cli_basic | 3 | ~2 秒 |
| cli_simple | 10 | ~5 秒 |
| cli_repl | 12 | ~8 秒 |
| config_precedence | 10 | ~6 秒 |
| streaming | 11 | ~7 秒 |
| tools_execution | 12 | ~8 秒 |
| error_handling | 14 | ~10 秒 |
| full_workflow | 13 | ~9 秒 |
| session_compression | 12 | ~8 秒 |
| **总计** | **113** | **~100 秒** |

### 优化建议

1. **使用 Mock**: Mock 响应比真实网络快 10 倍
2. **并行编译**: 使用 `-j $(nproc)` 加速编译
3. **增量运行**: 只运行修改的测试
4. **缓存结果**: Cargo 自动缓存未修改的测试

## 测试清洁度

### 清理临时文件

```bash
# 清理所有临时目录
rm -rf /tmp/ifai-test-*

# 清理 Cargo 缓存
cargo clean
```

### 重置测试状态

```bash
# 删除生成的测试
rm -rf src/bin/ifai/tests/generated/

# 重新生成
cargo build --package ifainew
```

## 最佳实践

### 1. 开发前运行测试

```bash
# 确保所有测试通过
cargo test --package ifainew --bin ifai
```

### 2. 开发中运行相关测试

```bash
# 只运行当前开发的测试
cargo test --package ifainew --bin ifai my_feature
```

### 3. 提交前运行完整测试

```bash
# 运行完整测试套件
cargo test --package ifainew --bin ifai --all-features
```

### 4. 定期检查测试覆盖率

```bash
# 生成覆盖率报告
cargo tarpaulin --package ifainew --bin ifai --out Html
```

## 参考资源

- [测试编写指南](./TESTING_GUIDE.md)
- [YAML Schema 文档](./YAML_SCHEMA.md)
- [代码生成器文档](./CODE_GENERATOR.md)
- [常见测试场景](./TEST_SCENARIOS.md)

---

**维护者**: peterfei
**最后更新**: 2026-04-28
