# CI 调试指南

## 概述

本文档提供在持续集成（CI）环境中调试测试失败的实用指南。

## CI 环境特点

### 与本地环境的差异

| 特性 | 本地环境 | CI 环境 |
|------|---------|---------|
| **操作系统** | 开发者系统 | Linux/Windows/macOS |
| **资源限制** | 无限制 | CPU/内存/时间限制 |
| **网络访问** | 通常可用 | 可能受限 |
| **环境变量** | 用户配置 | CI 配置 |
| **并发执行** | 通常串行 | 通常并行 |
| **日志输出** | 实时显示 | 延迟显示 |

### 常见 CI 平台

- **GitHub Actions**
- **GitLab CI/CD**
- **CircleCI**
- **Travis CI**
- **Jenkins**

## 调试策略

### 策略 1: 本地复现

在本地模拟 CI 环境：

```bash
# 使用相同的 Rust 版本
rustup default $(cat rust-toolchain)

# 清理缓存
cargo clean

# 运行测试
cargo test --package ifainew --bin ifai
```

### 策略 2: 查看完整日志

在 CI 配置中启用详细日志：

```yaml
# GitHub Actions
- name: Run tests
  run: cargo test --package ifainew --bin ifai -- --nocapture --show-output
  env:
    RUST_LOG: debug
```

### 策略 3: 使用调试容器

在 Docker 容器中运行测试：

```bash
# 使用与 CI 相同的镜像
docker run --rm -v $(pwd):/app -w /app \
  rust:latest \
  cargo test --package ifainew --bin ifai
```

## GitHub Actions 调试

### 基本工作流

```yaml
name: CLI Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Install Rust
        uses: actions-rs/toolchain@v1
        with:
          toolchain: stable

      - name: Run tests
        run: cargo test --package ifainew --bin ifai
```

### 启用详细日志

```yaml
- name: Run tests with logs
  run: cargo test --package ifainew --bin ifai -- --nocapture --show-output
  env:
    RUST_LOG: debug
    RUST_BACKTRACE: 1
```

### 保存测试输出

```yaml
- name: Run tests and save output
  run: |
    cargo test --package ifainew --bin ifai -- --nocapture > test-output.txt 2>&1
    echo "TEST_OUTPUT<<EOF" >> $GITHUB_STEP_SUMMARY
    cat test-output.txt >> $GITHUB_STEP_SUMMARY
    echo "EOF" >> $GITHUB_STEP_SUMMARY
  continue-on-error: true

- name: Upload test output
  uses: actions/upload-artifact@v3
  with:
    name: test-output
    path: test-output.txt
```

### 失败时保留临时文件

```yaml
- name: Run tests
  run: cargo test --package ifainew --bin ifai
  continue-on-error: true

- name: Upload temp directories
  if: failure()
  uses: actions/upload-artifact@v3
  with:
    name: temp-dirs
    path: /tmp/ifai-test-*
```

## 常见 CI 问题

### 问题 1: 测试超时

**症状**: CI 中测试超时，本地正常

**原因**: CI 环境资源受限或网络延迟

**解决方案**:

```yaml
# 增加超时时间
- name: Run tests
  run: cargo test --package ifainew --bin ifai
  timeout-minutes: 30
```

或修改测试：

```rust
#[tokio::test]
#[serial_test::serial]
async fn test_with_timeout() {
    // 使用更短的超时
    let timeout = Duration::from_secs(30); // 而不是 60
}
```

### 问题 2: Mock 服务器端口冲突

**症状**: `Address already in use`

**原因**: 并行测试导致端口冲突

**解决方案**:

确保测试使用串行执行：

```rust
#[tokio::test]
#[serial_test::serial]  // 必须添加
async fn test_example() { ... }
```

### 问题 3: 文件路径差异

**症状**: `No such file or directory`

**原因**: Windows 和 Linux 路径格式不同

**解决方案**:

使用路径库而不是硬编码：

```rust
// ❌ 错误
let path = "/tmp/test/file.txt";

// ✅ 正确
let path = std::path::PathBuf::from("/tmp").join("test").join("file.txt");
```

### 问题 4: 时区差异

**症状**: 时间相关的测试失败

**原因**: CI 环境时区不同

**解决方案**:

在测试中设置时区：

```rust
#[tokio::test]
async fn test_time() {
    std::env::set_var("TZ", "UTC");
    // 测试代码...
}
```

## CI 优化

### 加速测试运行

```yaml
# 使用缓存
- name: Cache Cargo registry
  uses: actions/cache@v3
  with:
    path: ~/.cargo/registry
    key: ${{ runner.os }}-cargo-registry-${{ hashFiles('**/Cargo.lock') }}

- name: Cache Cargo index
  uses: actions/cache@v3
  with:
    path: ~/.cargo/git
    key: ${{ runner.os }}-cargo-index-${{ hashFiles('**/Cargo.lock') }}

- name: Cache Cargo build
  uses: actions/cache@v3
  with:
    path: target
    key: ${{ runner.os }}-cargo-build-target-${{ hashFiles('**/Cargo.lock') }}
```

### 并行运行测试

```yaml
# 使用矩阵策略并行测试
jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
        rust: [stable, beta]
    steps:
      - uses: actions/checkout@v3
      - name: Run tests
        run: cargo test --package ifainew --bin ifai
```

### 快速失败

```yaml
# 遇到失败立即停止
- name: Run tests
  run: cargo test --package ifainew --bin ifai -- --fail-fast
```

## 调试工作流

### 工作流 1: 基本调试

1. **查看 CI 日志**
   - 找到失败的测试
   - 查看错误信息

2. **本地复现**
   ```bash
   # 运行失败的测试
   cargo test --package ifainew --bin ifai test_failing_test -- --nocapture
   ```

3. **修复并验证**
   - 修复代码
   - 本地测试通过
   - 提交并等待 CI

### 工作流 2: 深度调试

1. **启用详细日志**
   ```yaml
   env:
     RUST_LOG: debug
     RUST_BACKTRACE: full
   ```

2. **保存调试信息**
   ```yaml
   - name: Save debug info
     run: |
       rustc --version > ci-info.txt
       cargo --version >> ci-info.txt
       uname -a >> ci-info.txt
   ```

3. **上传工件**
   ```yaml
   - name: Upload artifacts
     uses: actions/upload-artifact@v3
     with:
       name: debug-info
       path: ci-info.txt
   ```

### 工作流 3: 交互式调试

使用 [tmate](https://github.com/mxschmitt/action-tmate) 进行交互式调试：

```yaml
- name: Setup tmate session
  uses: mxschmitt/action-tmate@v3
  if: failure()
```

这将创建一个可交互的 SSH 会话，允许手动调试。

## 特定平台问题

### Linux 问题

**问题**: 缺少系统依赖

**解决方案**:
```yaml
- name: Install dependencies
  run: |
    sudo apt-get update
    sudo apt-get install -y libssl-dev pkg-config
```

### Windows 问题

**问题**: 路径分隔符

**解决方案**:
```rust
// 使用 std::path::Path
let path = Path::new("dir").join("file.txt");
```

**问题**: 换行符

**解决方案**:
```yaml
- name: Configure git
  run: git config --global core.autocrlf input
```

### macOS 问题

**问题**: 代码签名

**解决方案**:
```yaml
- name: Install Rust
  run: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
```

## 性能监控

### 测试执行时间

```yaml
- name: Run tests with timing
  run: |
    time cargo test --package ifainew --bin ifai -- --list
    time cargo test --package ifainew --bin ifai
```

### 内存使用

```yaml
- name: Monitor memory
  run: |
    /usr/bin/time -v cargo test --package ifainew --bin ifai
```

## CI 配置模板

### 完整的 GitHub Actions 配置

```yaml
name: CLI Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  CARGO_TERM_COLOR: always
  RUST_LOG: info

jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        rust: [stable]

    steps:
      - name: Checkout code
        uses: actions/checkout@v3

      - name: Install Rust
        uses: actions-rs/toolchain@v1
        with:
          toolchain: ${{ matrix.rust }}
          profile: minimal
          override: true

      - name: Cache Cargo registry
        uses: actions/cache@v3
        with:
          path: ~/.cargo/registry
          key: ${{ runner.os }}-cargo-registry-${{ hashFiles('**/Cargo.lock') }}

      - name: Cache Cargo build
        uses: actions/cache@v3
        with:
          path: target
          key: ${{ runner.os }}-cargo-build-target-${{ hashFiles('**/Cargo.lock') }}

      - name: Run tests
        run: cargo test --package ifainew --bin ifai -- --nocapture

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: test-results-${{ matrix.os }}-${{ matrix.rust }}
          path: |
            test-output.txt
            /tmp/ifai-test-*
```

## 最佳实践

### 1. 提交前本地测试

```bash
# 运行完整测试套件
cargo test --package ifainew --bin ifai

# 检查代码格式
cargo fmt --check

# 运行 clippy
cargo clippy -- -D warnings
```

### 2. 使用一致的 Rust 版本

```toml
# rust-toolchain.toml
[toolchain]
channel = "stable"
components = ["rustfmt", "clippy"]
```

### 3. 保持测试快速

```bash
# 仅运行快速测试
cargo test --package ifainew --bin ifai -- --skip slow
```

### 4. 监控 CI 性能

```yaml
- name: Monitor CI performance
  run: |
    echo "Test started at $(date)"
    cargo test --package ifainew --bin ifai
    echo "Test finished at $(date)"
```

## 测试报告

### 自动生成报告

测试框架支持自动生成多种格式的测试报告。

#### 本地生成报告

```bash
# 运行测试并生成报告
./scripts/generate-test-report.sh
```

这将生成：
- **HTML 报告**: `target/test-reports/index.html`
- **文本摘要**: `target/test-reports/summary.txt`
- **JSON 输出**: `target/test-reports/test-output.json`
- **JUnit XML**: `target/test-reports/junit.xml`（如果可用）

#### 查看报告

```bash
# 在浏览器中打开 HTML 报告
open target/test-reports/index.html

# 查看文本摘要
cat target/test-reports/summary.txt

# 查看 JSON 输出
cat target/test-reports/test-output.json | jq .
```

### CI 集成

GitHub Actions 工作流会自动生成和发布测试报告：

```yaml
# .github/workflows/test-report.yml
- name: Run tests with JSON output
  run: |
    cargo test --package ifainew --bin ifai -- -Z unstable-options --format json 2>&1 |       tee target/test-reports/test-output.json

- name: Upload test reports
  uses: actions/upload-artifact@v3
  with:
    name: test-reports
    path: target/test-reports/
```

### 报告格式

#### HTML 报告特性

- ✅ 测试统计（总数、通过、失败）
- ✅ 执行时间统计
- ✅ 测试列表和状态
- ✅ 响应式设计
- ✅ 颜色编码（绿色=通过，红色=失败）

#### JUnit XML

用于与 CI/CD 工具集成：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite name="cli_basic" tests="3" failures="0">
    <testcase name="test_help_command" classname="cli_basic"/>
  </testsuite>
</testsuites>
```

#### JSON 输出

机器可读的测试结果：

```json
{
  "type": "test",
  "name": "test_help_command",
  "event": "ok",
  "exec_time": 0.123
}
```

### 自定义报告

#### 修改 HTML 模板

编辑 `scripts/generate-test-report.sh` 中的 HTML 模板：

```bash
# 自定义样式和内容
cat > "$REPORT_DIR/index.html" << 'EOF'
<!DOCTYPE html>
<!-- 自定义 HTML -->
EOF
```

#### 添加自定义指标

```bash
# 在脚本中添加新的统计
echo "自定义指标: $CUSTOM_VALUE" >> "$REPORT_DIR/summary.txt"
```

### 报告分析

#### 查看失败测试

```bash
# 从 JSON 中提取失败测试
grep '"event":"failed"' target/test-reports/test-output.json | jq .
```

#### 统计测试覆盖率

```bash
# 统计执行的测试数量
grep '"type":"test"' target/test-reports/test-output.json | wc -l
```

#### 分析测试时间

```bash
# 找出最慢的测试
cat target/test-reports/test-output.json |   jq -r 'select(.exec_time) | "\(.exec_time)s \(.name)"' |   sort -rn | head -10
```

## 故障排除清单

当 CI 失败时：

- [ ] 查看 CI 日志中的错误信息
- [ ] 本地运行失败的测试
- [ ] 检查 Rust 版本是否一致
- [ ] 验证依赖是否正确安装
- [ ] 检查环境变量配置
- [ ] 确认网络访问权限
- [ ] 验证文件路径正确性
- [ ] 检查时间/时区设置
- [ ] 启用详细日志重新运行
- [ ] 使用交互式调试会话

## 参考资源

- [GitHub Actions 文档](https://docs.github.com/en/actions)
- [GitLab CI/CD 文档](https://docs.gitlab.com/ee/ci/)
- [Rust 测试指南](https://doc.rust-lang.org/book/ch11-00-testing.html)
- [本地测试文档](./LOCAL_TESTING.md)

---

**维护者**: peterfei
**最后更新**: 2026-04-28
