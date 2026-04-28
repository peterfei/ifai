# CLI 测试编写指南

## 概述

本指南提供编写 CLI 集成测试的最佳实践和实用技巧。阅读本文档后，您将能够：

- ✅ 编写高质量的 YAML 测试用例
- ✅ 使用 Mock 服务器模拟 API 响应
- ✅ 调试测试失败
- ✅ 遵循测试最佳实践

## 快速开始

### 第一步：创建测试套件

在 `tests/suite/` 目录创建新的 YAML 文件：

```bash
touch src/bin/ifai/tests/suite/my_feature.yaml
```

### 第二步：编写测试用例

```yaml
test_suite:
  name: "我的功能测试"
  description: "测试新功能的各个方面"

  tests:
    - name: "基础功能"
      description: "验证基础功能正常工作"
      given:
        args: ["my-command"]
      when:
        mock_response: "simple_response.json"
      then:
        assert_success: true
        assert_contains: "Success"
```

### 第三步：触发代码生成

```bash
cargo build --package ifainew
```

### 第四步：运行测试

```bash
# 串行执行（默认，推荐用于调试）
cargo test --package ifainew --bin ifai my_feature

# 并行执行（⚡️ 快 3-5 倍）
./scripts/run-tests.sh --parallel

# 或使用环境变量
IFAI_PARALLEL_TESTS=1 cargo test --package ifainew --bin ifai my_feature
```

**提示**: 详细说明请参阅 [并行测试执行](PARALLEL_TESTING.md)。

## 测试模式

### 模式 1: 基础命令测试

测试 CLI 命令的基本功能。

```yaml
- name: "帮助命令"
  description: "验证 help 命令显示帮助信息"
  given:
    args: ["help"]
  then:
    assert_success: true
    assert_contains: "Usage"
    assert_contains: "Options"
```

**何时使用**:
- 验证命令行参数解析
- 测试帮助信息显示
- 检查版本信息

### 模式 2: Mock API 测试

使用 Mock 服务器模拟 AI API 响应。

```yaml
- name: "简单提示词"
  description: "测试简单的 AI 提示词响应"
  given:
    args: ["hello"]
  when:
    mock_response: "simple_response.json"
  then:
    assert_success: true
    assert_contains: "Hello"
```

**Mock 响应文件** (`fixtures/simple_response.json`):

```json
{
  "events": [
    {"type": "text_delta", "text": "Hello!"},
    {"type": "text_delta", "text": " How can I help you?"},
    {"type": "done"}
  ]
}
```

**何时使用**:
- 测试 AI 对话功能
- 验证流式响应处理
- 模拟各种 API 场景

### 模式 3: 配置测试

测试配置优先级和环境变量。

```yaml
- name: "环境变量覆盖"
  description: "验证环境变量优先级高于配置文件"
  given:
    args: ["hello"]
    env:
      IFAI_PROVIDER: "deepseek"
      IFAI_MODEL: "deepseek-chat"
    config: |
      provider: openai
      model: gpt-4o-mini
  when:
    mock_response: "simple_response.json"
  then:
    assert_success: true
    assert_contains: "deepseek"
```

**何时使用**:
- 验证配置优先级
- 测试环境变量处理
- 检查配置文件解析

### 模式 4: 工具调用测试

测试 AI 工具调用功能。

```yaml
- name: "执行 bash 命令"
  description: "验证 AI 可以执行 bash 工具"
  given:
    args: ["list files"]
  when:
    mock_response: "tool_call_response.json"
  then:
    assert_success: true
    assert_tool_called: "bash"
```

**何时使用**:
- 测试工具调用功能
- 验证工具审批流程
- 检查工具执行结果

### 模式 5: 错误处理测试

测试错误场景和异常处理。

```yaml
- name: "无效 API 密钥"
  description: "验证无效密钥错误处理"
  given:
    args: ["hello"]
    env:
      OPENAI_API_KEY: "invalid-key"
  when:
    mock_response: "error_response.json"
  then:
    assert_success: false
    assert_contains: "Authentication"
```

**何时使用**:
- 验证错误处理
- 测试用户友好提示
- 检查错误恢复机制

### 模式 6: REPL 交互测试

测试 REPL 模式的交互。

```yaml
- name: "多轮对话"
  description: "验证 REPL 模式下的多轮对话"
  given:
    args: ["repl"]
    stdin: |
      hello
      what time is it?
      exit
  when:
    mock_response: "repl_response.json"
  then:
    assert_success: true
```

**何时使用**:
- 测试 REPL 模式
- 验证多轮对话
- 检查 REPL 命令处理

## 高级技巧

### 技巧 1: 参数化测试

使用相似结构的多个测试用例：

```yaml
tests:
  - name: "测试 deepseek 提供商"
    given:
      env: {IFAI_PROVIDER: "deepseek"}

  - name: "测试 openai 提供商"
    given:
      env: {IFAI_PROVIDER: "openai"}

  - name: "测试 anthropic 提供商"
    given:
      env: {IFAI_PROVIDER: "anthropic"}
```

### 技巧 2: 正则表达式断言

使用 `assert_match` 进行复杂验证：

```yaml
then:
  assert_match: "Error:.*file.*not found"
  assert_match: "Token count: \\d+"
  assert_match: "Usage: .* --help"
```

### 技巧 3: 多重断言

组合多个断言验证：

```yaml
then:
  assert_success: true
  assert_contains: "Hello"
  assert_match: "Hello.*World"
  assert_tool_called: "bash"
```

### 技巧 4: 环境变量组合

测试多个环境变量的交互：

```yaml
given:
  env:
    IFAI_PROVIDER: "deepseek"
    IFAI_MODEL: "deepseek-chat"
    IFAI_API_BASE: "https://api.deepseek.com/v1"
    DEEPSEEK_API_KEY: "sk-test"
```

### 技巧 5: 配置文件测试

测试复杂的配置场景：

```yaml
given:
  config: |
    provider: openai
    model: gpt-4o-mini
    api_key: sk-xxx

    # 高级配置
    stream_timeout: 30
    tool_timeout: 60
    max_retries: 3
```

## Mock 响应设计

### 简单文本响应

```json
{
  "events": [
    {"type": "text_delta", "text": "Hello!"},
    {"type": "done"}
  ]
}
```

### 工具调用响应

```json
{
  "events": [
    {
      "type": "tool_call",
      "tool": "bash",
      "args": "pwd",
      "output": "/Users/test"
    },
    {"type": "done"}
  ]
}
```

### 错误响应

```json
{
  "events": [
    {
      "type": "error",
      "message": "Authentication failed: Invalid API key"
    },
    {"type": "done"}
  ]
}
```

### 多段响应

```json
{
  "events": [
    {"type": "text_delta", "text": "First paragraph.\n\n"},
    {"type": "text_delta", "text": "Second paragraph."},
    {"type": "done"}
  ]
}
```

## 调试技巧

### 查看生成的代码

```bash
# 查看自动生成的测试代码
cat src/bin/ifai/tests/generated/my_feature.rs
```

### 运行单个测试

```bash
# 运行单个测试并显示输出
cargo test --package ifainew --bin ifai test_my_feature -- --nocapture
```

### 启用调试日志

```bash
# 设置 RUST_LOG 环境变量
RUST_LOG=debug cargo test --package ifainew --bin ifai -- --nocapture
```

### 手动触发生成

```bash
# 使用 generate_tests 二进制文件
cargo run --bin generate_tests
```

### 检查 Mock 服务器

```bash
# 查看 Mock 服务器日志
RUST_LOG=wiremock=debug cargo test --package ifainew --bin ifai
```

## 常见陷阱

### 陷阱 1: 测试依赖

**问题**: 测试依赖于其他测试的状态。

```yaml
# ❌ 错误：依赖前一个测试
- name: "步骤2"
  # 假设步骤1已经创建文件

# ✅ 正确：每个测试独立
- name: "步骤2"
  given:
    # 自己创建必要的文件
```

### 陷阱 2: 缺少断言

**问题**: 只检查成功状态，不验证输出。

```yaml
# ❌ 错误：只检查成功
then:
  assert_success: true

# ✅ 正确：验证输出内容
then:
  assert_success: true
  assert_contains: "Expected output"
```

### 陷阱 3: 过于复杂的测试

**问题**: 单个测试做太多事情。

```yaml
# ❌ 错误：测试太多功能
- name: "测试所有功能"
  # 包含10个不同的验证...

# ✅ 正确：拆分为多个测试
- name: "测试功能1"
- name: "测试功能2"
- name: "测试功能3"
```

### 陷阱 4: 硬编码路径

**问题**: 使用特定于开发环境的路径。

```yaml
# ❌ 错误：硬编码路径
given:
  args: ["/Users/developer/project/file.txt"]

# ✅ 正确：使用相对路径或临时目录
given:
  args: ["file.txt"]
```

### 陷阱 5: 忽略错误处理

**问题**: 不测试错误场景。

```yaml
# ❌ 错误：只测试成功路径
- name: "成功场景"

# ✅ 正确：测试成功和失败
- name: "成功场景"
- name: "无效输入"
- name: "网络错误"
```

## 测试组织

### 按功能分组

```yaml
# cli_basic.yaml - 基础功能
tests:
  - name: "帮助命令"
  - name: "版本信息"

# config_precedence.yaml - 配置测试
tests:
  - name: "环境变量优先"
  - name: "配置文件优先"

# tools_execution.yaml - 工具测试
tests:
  - name: "bash 工具"
  - name: "文件工具"
```

### 按场景分组

```yaml
# simple_workflow.yaml - 简单工作流
tests:
  - name: "单个命令"
  - name: "简单对话"

# complex_workflow.yaml - 复杂工作流
tests:
  - name: "多轮对话"
  - name: "工具链"
```

## 性能考虑

### 使用 Mock 优先

```yaml
# ✅ 快速：使用 Mock
when:
  mock_response: "simple_response.json"

# ❌ 慢：真实网络
when:
  # 不设置 mock，使用真实 API
```

### 避免长时间操作

```yaml
# ❌ 避免：长时间操作
- name: "大文件处理"
  given:
    args: ["process", "10GB-file.txt"]

# ✅ 更好：使用小文件
- name: "文件处理"
  given:
    args: ["process", "test-file.txt"]
```

### 并行执行

测试框架会自动串行化测试（使用 `#[serial_test::serial]`），但保持测试简短仍有帮助。

## 文档和注释

### 测试套件描述

```yaml
test_suite:
  name: "配置优先级测试"
  description: >
    验证不同配置源的优先级：
    1. CLI 参数 > 环境变量
    2. 环境变量 > 配置文件
    3. 配置文件 > 默认值
```

### 测试用例描述

```yaml
- name: "环境变量覆盖配置文件"
  description: >
    设置环境变量 IFAI_PROVIDER=deepseek，
    验证它覆盖配置文件中的 provider=openai
```

### Mock 响应注释

```json
{
  "comment": "模拟简单的 AI 响应，包含问候语",
  "events": [
    {"type": "text_delta", "text": "Hello!"},
    {"type": "done"}
  ]
}
```

## 代码审查清单

在提交测试前，检查：

- [ ] 每个测试都有清晰的名称和描述
- [ ] 使用 Mock 而不是真实网络
- [ ] 包含成功和失败场景
- [ ] 测试独立（不依赖其他测试）
- [ ] 断言具体且有意义
- [ ] 测试运行快速（< 5 秒）
- [ ] 遵循 YAML Schema 规范
- [ ] Mock 响应文件存在且有效

## 示例项目

### 完整测试套件示例

```yaml
test_suite:
  name: "文件操作测试"
  description: "测试文件读写工具"

  tests:
    # 成功场景
    - name: "读取存在的文件"
      description: "验证可以读取存在的文件"
      given:
        args: ["read", "test.txt"]
      when:
        mock_response: "read_success.json"
      then:
        assert_success: true
        assert_tool_called: "read_file"

    - name: "写入新文件"
      description: "验证可以创建新文件"
      given:
        args: ["write", "new.txt"]
        stdin: "y\n"  # 批准写入
      when:
        mock_response: "write_success.json"
      then:
        assert_success: true
        assert_tool_called: "write_file"

    # 错误场景
    - name: "读取不存在的文件"
      description: "验证错误处理"
      given:
        args: ["read", "nonexistent.txt"]
      when:
        mock_response: "read_error.json"
      then:
        assert_success: false
        assert_contains: "file not found"

    # 边界场景
    - name: "读取空文件"
      description: "验证空文件处理"
      given:
        args: ["read", "empty.txt"]
      when:
        mock_response: "read_empty.json"
      then:
        assert_success: true
```

## 参考资源

- [YAML Schema 文档](./YAML_SCHEMA.md)
- [测试框架概述](./README.md)
- [常见测试场景](./TEST_SCENARIOS.md)
- [OpenSpec 提案](../../../../openspec/changes/cli-integration-tests/)

---

**维护者**: peterfei
**最后更新**: 2026-04-28
