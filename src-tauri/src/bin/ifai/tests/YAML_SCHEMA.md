# YAML 测试 Schema 文档

## 概述

本文档详细描述了 CLI 集成测试的 YAML Schema 定义。测试用例以 YAML 格式定义在 `tests/suite/` 目录中，由 build.rs 自动编译成 Rust 测试代码。

### 执行模式

测试支持两种执行模式：

- **串行模式**（默认）：使用 `#[serial_test::serial]`，测试按顺序执行
- **并行模式**：设置 `IFAI_PARALLEL_TESTS=1`，测试并发执行（⚡️ 3-5x 加速）

**并行测试要求**:
- 每个测试必须完全隔离（独立临时目录、环境变量、Mock 服务器）
- 避免使用固定端口号或硬编码文件路径
- 不依赖全局状态或共享资源

详细说明请参阅 [并行测试执行](PARALLEL_TESTING.md)。

## Schema 结构

### 顶层结构

```yaml
test_suite:
  name: string          # 必需，测试套件名称
  description: string   # 可选，测试套件描述
  tests: array          # 必需，测试用例列表
```

### 测试用例结构

```yaml
tests:
  - name: string              # 必需，测试名称
    description: string       # 可选，测试描述
    tags: array|string        # 可选，测试标签
    given: object             # 可选，前置条件
    when: object              # 可选，执行操作
    then: object              # 可选，断言验证
```

### tags - 测试标签

**类型**: 字符串数组或单个字符串
**必需**: 否

用于分类和过滤测试的标签。支持标准标签和自定义标签。

```yaml
# 单个标签
tags: unit

# 多个标签
tags: [unit, fast, smoke]

# 参数化测试的标签
tags: [integration, parametrized]
```

**标准标签**:

| 标签 | 说明 |
|------|------|
| `unit` | 单元测试（快速、隔离） |
| `integration` | 集成测试（依赖外部） |
| `fast` | 快速测试（< 1 秒） |
| `slow` | 慢速测试（> 1 秒） |
| `smoke` | 冒烟测试（核心功能） |
| `mock` | 使用 Mock 服务器 |

**标签过滤**:

```bash
# 运行特定标签
./scripts/run-tests.sh --tags unit

# 排除标签
./scripts/run-tests.sh --exclude-tags slow

# 组合标签（AND 逻辑）
./scripts/run-tests.sh --tags "unit && fast"
```

详细说明请参阅 [测试标签系统](TEST_TAGS.md)。

## Given 阶段（前置条件）

Given 阶段设置测试的前置条件，包括 CLI 参数、环境变量、配置文件等。

### 1. args - CLI 参数

**类型**: 字符串数组
**必需**: 否（默认为 `["hello"]`）

指定要传递给 CLI 的参数。

```yaml
given:
  args: ["--provider", "deepseek", "hello", "world"]
```

**示例**:

| 用途 | args 值 |
|------|---------|
| 简单命令 | `["help"]` |
| 带参数 | `["--provider", "openai", "hello"]` |
| 空参数 | `[]` |

### 2. env - 环境变量

**类型**: 对象（键值对）
**必需**: 否

设置测试进程的环境变量。

```yaml
given:
  env:
    IFAI_PROVIDER: "openai"
    IFAI_MODEL: "gpt-4o-mini"
    IFAI_API_BASE: "https://custom.api.com/v1"
    OPENAI_API_KEY: "sk-test-key"
```

**常用环境变量**:

| 变量名 | 说明 | 示例值 |
|--------|------|--------|
| `IFAI_PROVIDER` | AI 提供商 | `openai`, `deepseek` |
| `IFAI_MODEL` | 模型名称 | `gpt-4o-mini` |
| `IFAI_API_BASE` | API 基础 URL | `https://api.openai.com/v1` |
| `OPENAI_API_KEY` | OpenAI API 密钥 | `sk-...` |
| `IFAI_STREAM_TIMEOUT` | 流式超时（秒） | `30` |
| `IFAI_TOOL_TIMEOUT` | 工具执行超时（秒） | `60` |

### 3. config - 配置文件

**类型**: 字符串（多行）
**必需**: 否

写入配置文件 `~/.ifai/config.yaml` 的内容。

```yaml
given:
  config: |
    provider: openai
    model: gpt-4o-mini
    api_key: sk-test-key
```

**配置文件格式**:

```yaml
# 基础配置
provider: openai
model: gpt-4o-mini
api_key: sk-xxx

# 高级配置
api_base: https://api.openai.com/v1
stream_timeout: 30
tool_timeout: 60
```

### 4. stdin - 标准输入

**类型**: 字符串
**必需**: 否

提供标准输入内容（用于 REPL 模式或确认提示）。

```yaml
given:
  stdin: "yes\n"
```

**特殊字符**:

| 字符 | 说明 | 示例 |
|------|------|------|
| `\n` | 换行 | `"yes\n"` |
| `\t` | 制表符 | `"input\t"` |
| `\u{3}` | Ctrl+C（中断） | `"\u{3}"` |

### Given 示例组合

```yaml
given:
  args: ["--provider", "deepseek", "hello"]
  env:
    IFAI_MODEL: "deepseek-chat"
    DEEPSEEK_API_KEY: "sk-test"
  config: |
    provider: deepseek
    model: deepseek-chat
  stdin: "y\n"
```

## When 阶段（执行操作）

When 阶段定义测试的执行操作，主要是 Mock API 响应。

### 1. mock_response - Mock 响应文件

**类型**: 字符串（文件名）
**必需**: 否（如果不使用 Mock）

指定 Mock 响应文件的路径（相对于 `tests/fixtures/`）。

```yaml
when:
  mock_response: "simple_response.json"
```

**Mock 响应文件示例**:

```json
{
  "events": [
    {"type": "text_delta", "text": "Hello!"},
    {"type": "text_delta", "text": " How can I help?"},
    {"type": "done"}
  ]
}
```

### 2. mock_streaming - 流式响应

**类型**: 数组（字符串列表）
**必需**: 否

直接在 YAML 中定义流式响应事件（无需额外文件）。

```yaml
when:
  mock_streaming:
    - "Hello"
    - "World"
    - "[DONE]"
```

### When 示例

```yaml
# 使用文件
when:
  mock_response: "simple_response.json"

# 直接定义
when:
  mock_streaming: ["Response", "[DONE]"]

# 无 Mock（真实网络）
when:
  # 不设置 mock 字段
```

## Then 阶段（断言验证）

Then 阶段定义对测试结果的断言验证。

### 1. assert_success - 断言成功

**类型**: 布尔
**必需**: 否

断言命令成功执行（退出码为 0）。

```yaml
then:
  assert_success: true
```

### 2. assert_contains - 断言包含文本

**类型**: 字符串
**必需**: 否

断言输出包含指定文本。

```yaml
then:
  assert_contains: "Hello"
```

### 3. assert_match - 断言匹配正则

**类型**: 字符串（正则表达式）
**必需**: 否

断言输出匹配正则表达式。

```yaml
then:
  assert_match: "Hello.*World"
```

**正则语法**: 使用 Rust 正则表达式语法。

### 4. assert_tool_called - 断言工具调用

**类型**: 字符串（工具名称）
**必需**: 否

断言指定工具被调用过。

```yaml
then:
  assert_tool_called: "bash"
```

**支持的工具名称**:
- `bash` - Bash 命令执行
- `read_file` - 文件读取
- `write_file` - 文件写入
- `edit_file` - 文件编辑

### 5. assert_token_count - 断言 token 计数

**类型**: 数字
**必需**: 否

断言流式响应中的 token 计数。

```yaml
then:
  assert_token_count: 42
```

### 6. assert_compression_triggered - 断言压缩触发

**类型**: 布尔
**必需**: 否

断言会话压缩机制被触发。

```yaml
then:
  assert_compression_triggered: true
```

### Then 示例组合

```yaml
then:
  assert_success: true
  assert_contains: "Hello"
  assert_match: "Hello.*World"
  assert_tool_called: "bash"
```

## 完整测试示例

### 示例 1: 简单命令测试

```yaml
test_suite:
  name: "基础 CLI 测试"
  description: "测试 CLI 基础功能"

  tests:
    - name: "帮助命令"
      description: "验证 help 命令显示帮助信息"
      given:
        args: ["help"]
      then:
        assert_success: true
        assert_contains: "Usage"
```

### 示例 2: Mock API 测试

```yaml
test_suite:
  name: "API 测试"
  description: "测试 AI API 调用"

  tests:
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

### 示例 3: 环境变量测试

```yaml
test_suite:
  name: "配置测试"
  description: "测试配置优先级"

  tests:
    - name: "环境变量优先"
      description: "验证环境变量覆盖配置文件"
      given:
        args: ["hello"]
        env:
          IFAI_PROVIDER: "deepseek"
          IFAI_MODEL: "deepseek-chat"
      when:
        mock_response: "simple_response.json"
      then:
        assert_success: true
        assert_contains: "deepseek"
```

### 示例 4: 工具调用测试

```yaml
test_suite:
  name: "工具执行测试"
  description: "测试 AI 工具调用"

  tests:
    - name: "列出文件"
      description: "验证 bash 工具调用"
      given:
        args: ["list files"]
      when:
        mock_response: "tool_call_response.json"
      then:
        assert_success: true
        assert_tool_called: "bash"
```

### 示例 5: REPL 交互测试

```yaml
test_suite:
  name: "REPL 测试"
  description: "测试 REPL 交互模式"

  tests:
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

## 命名规范

### 测试名称

- 使用中文描述测试目的
- 代码生成器会自动转换为有效的 Rust 标识符（拼音映射）
- 避免使用特殊字符

**好的示例**:
- `name: "帮助命令显示"`
- `name: "环境变量优先级"`

**避免的示例**:
- `name: "test@#$"`  # 包含特殊字符
- `name: ""`         # 空名称

### 测试套件文件名

- 使用小写字母和下划线
- 以 `.yaml` 结尾
- 描述性命名

**好的示例**:
- `cli_basic.yaml`
- `config_precedence.yaml`
- `tools_execution.yaml`

## 生成的 Rust 代码

YAML 测试会被转换为如下 Rust 代码：

```rust
#[tokio::test]
#[serial_test::serial]
async fn test_bang_zhu_ming_ling_xian_shi() {
    // 帮助命令显示
    let mut env = TestEnv::new().await.unwrap();
    let output = env.run_cli(&["help"]).await.unwrap();
    output.assert_success();
    output.assert_contains("Usage");
}
```

## 高级特性

### 1. 测试函数名去重

代码生成器会自动处理重复的函数名：

```yaml
tests:
  - name: "测试输出"
  - name: "测试输出"  # 重复
  - name: "测试输出"  # 重复
```

生成:
```rust
async fn test_ce_shu_shu_chu() { ... }
async fn test_ce_shu_shu_chu_2() { ... }
async fn test_ce_shu_shu_chu_3() { ... }
```

### 2. 拼音映射

常见中文会自动映射到拼音：

| 中文 | 拼音 |
|------|------|
| 帮助 | bang_zhu |
| 命令 | ming_ling |
| 显示 | xian_shi |
| 环境 | huan_jing |
| 变量 | bian_liang |

### 3. 条件编译

生成的测试仅在测试模式下编译：

```rust
#[cfg(test)]
mod tests {
    use crate::tests::common::*;

    // 生成的测试函数...
}
```

## 最佳实践

### 1. 测试独立性

每个测试应该独立运行，不依赖其他测试的状态。

```yaml
# ✅ 好的测试
- name: "创建配置"
  given:
    config: "provider: openai"

# ❌ 避免依赖前一个测试
- name: "使用前一个测试的配置"
  # 不要假设配置已经存在
```

### 2. 明确的断言

使用具体的断言而不是泛泛的检查。

```yaml
# ✅ 好的断言
then:
  assert_contains: "Hello, World!"
  assert_match: "Error:.*not found"

# ❌ 模糊的断言
then:
  assert_success: true  # 没有验证输出内容
```

### 3. 使用 Mock

优先使用 Mock 而不是真实网络调用。

```yaml
# ✅ 使用 Mock
when:
  mock_response: "simple_response.json"

# ❌ 真实网络（慢且不稳定）
when:
  # 不设置 mock，使用真实 API
```

### 4. 清晰的命名

使用描述性的测试名称。

```yaml
# ✅ 清晰的名称
name: "环境变量覆盖配置文件设置"

# ❌ 模糊的名称
name: "测试1"
```

## 故障排除

### YAML 解析错误

**问题**: `Error: Parse error: ...`

**解决方案**:
1. 检查 YAML 语法（使用在线验证器）
2. 确保缩进使用空格而不是制表符
3. 检查引号匹配

### 测试生成失败

**问题**: 测试代码没有生成

**解决方案**:
1. 检查 `tests/suite/` 目录是否存在
2. 运行 `cargo run --bin generate_tests` 查看错误
3. 确保文件以 `.yaml` 结尾

### Mock 不工作

**问题**: Mock 服务器没有响应

**解决方案**:
1. 确保使用 `TestEnv::with_mock()`
2. 检查 Mock 响应文件路径
3. 查看测试日志了解连接错误

## 参考资源

- [测试框架概述](./README.md)
- [测试编写指南](./TESTING_GUIDE.md)
- [示例测试套件](../suite/)
- [OpenSpec 提案](../../../../openspec/changes/cli-integration-tests/)

---

**维护者**: peterfei
**最后更新**: 2026-04-28
