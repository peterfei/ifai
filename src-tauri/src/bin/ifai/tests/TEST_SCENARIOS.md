# 常见测试场景示例

## 概述

本文档提供常见测试场景的完整示例，可以直接复制使用或作为参考。

## 场景 1: 命令行帮助

### 验证帮助信息显示

```yaml
test_suite:
  name: "帮助命令测试"
  description: "验证 CLI 帮助功能"

  tests:
    - name: "显示帮助信息"
      description: "验证 help 命令显示完整的帮助信息"
      given:
        args: ["help"]
      then:
        assert_success: true
        assert_contains: "Usage:"
        assert_contains: "Options:"
        assert_contains: "Commands:"

    - name: "显示子命令帮助"
      description: "验证特定子命令的帮助"
      given:
        args: ["help", "config"]
      then:
        assert_success: true
        assert_contains: "config"
        assert_contains: "--init"

    - name: "短选项帮助"
      description: "验证 -h 选项"
      given:
        args: ["-h"]
      then:
        assert_success: true
        assert_match: "Usage|Help"
```

## 场景 2: AI 对话测试

### 简单对话

```yaml
test_suite:
  name: "AI 对话测试"
  description: "测试 AI 基础对话功能"

  tests:
    - name: "简单问候"
      description: "测试简单的问候语"
      given:
        args: ["hello"]
      when:
        mock_response: "hello_response.json"
      then:
        assert_success: true
        assert_contains: "Hello"

    - name: "提问回答"
      description: "测试问题回答"
      given:
        args: ["what", "is", "rust"]
      when:
        mock_response: "answer_response.json"
      then:
        assert_success: true
        assert_match: "Rust.*programming.*language"
```

**Mock 响应文件** (`fixtures/hello_response.json`):

```json
{
  "events": [
    {"type": "text_delta", "text": "Hello! How can I help you today?"},
    {"type": "done"}
  ]
}
```

## 场景 3: 配置管理

### 配置初始化

```yaml
test_suite:
  name: "配置管理测试"
  description: "测试配置文件的创建和管理"

  tests:
    - name: "初始化配置"
      description: "验证 --config init 创建配置文件"
      given:
        args: ["--config", "init"]
      then:
        assert_success: true
        assert_contains: "Config file created"
        assert_match: "provider.*model.*api_key"

    - name: "显示当前配置"
      description: "验证 --config show 显示配置"
      given:
        args: ["--config", "show"]
        config: |
          provider: openai
          model: gpt-4o-mini
      then:
        assert_success: true
        assert_contains: "provider"
        assert_contains: "openai"
```

### 配置优先级

```yaml
test_suite:
  name: "配置优先级测试"
  description: "验证不同配置源的优先级"

  tests:
    - name: "CLI 参数优先级最高"
      description: "验证 CLI 参数覆盖环境变量"
      given:
        args: ["--provider", "deepseek", "hello"]
        env:
          IFAI_PROVIDER: "openai"
          IFAI_MODEL: "gpt-4o-mini"
      when:
        mock_response: "simple_response.json"
      then:
        assert_success: true
        assert_contains: "deepseek"

    - name: "环境变量覆盖配置文件"
      description: "验证环境变量优先于配置文件"
      given:
        args: ["hello"]
        env:
          IFAI_PROVIDER: "openai"
        config: |
          provider: deepseek
          model: deepseek-chat
      when:
        mock_response: "simple_response.json"
      then:
        assert_success: true
        assert_contains: "openai"

    - name: "配置文件使用默认值"
      description: "验证配置文件在没有环境变量时生效"
      given:
        args: ["hello"]
        config: |
          provider: openai
          model: gpt-4o-mini
      when:
        mock_response: "simple_response.json"
      then:
        assert_success: true
        assert_contains: "openai"
```

## 场景 4: 工具调用测试

### Bash 工具

```yaml
test_suite:
  name: "Bash 工具测试"
  description: "测试 Bash 命令执行工具"

  tests:
    - name: "执行 pwd 命令"
      description: "验证可以执行 pwd 命令"
      given:
        args: ["show", "current", "directory"]
      when:
        mock_response: "pwd_response.json"
      then:
        assert_success: true
        assert_tool_called: "bash"
        assert_contains: "/"

    - name: "执行 ls 命令"
      description: "验证可以列出文件"
      given:
        args: ["list", "files"]
      when:
        mock_response: "ls_response.json"
      then:
        assert_success: true
        assert_tool_called: "bash"
        assert_match: "total.*\\d+"

    - name: "执行管道命令"
      description: "验证可以执行包含管道的命令"
      given:
        args: ["count", "files"]
      when:
        mock_response: "pipe_response.json"
      then:
        assert_success: true
        assert_tool_called: "bash"
```

**Mock 响应文件** (`fixtures/pwd_response.json`):

```json
{
  "events": [
    {
      "type": "tool_call",
      "tool": "bash",
      "command": "pwd",
      "output": "/Users/test/project"
    },
    {"type": "text_delta", "text": "Current directory: /Users/test/project"},
    {"type": "done"}
  ]
}
```

### 文件操作工具

```yaml
test_suite:
  name: "文件操作工具测试"
  description: "测试文件读写工具"

  tests:
    - name: "读取文件"
      description: "验证 read_file 工具"
      given:
        args: ["read", "main.rs"]
      when:
        mock_response: "read_response.json"
      then:
        assert_success: true
        assert_tool_called: "read_file"
        assert_contains: "fn main"

    - name: "写入文件"
      description: "验证 write_file 工具（需要审批）"
      given:
        args: ["create", "test.txt"]
        stdin: "y\n"
      when:
        mock_response: "write_response.json"
      then:
        assert_success: true
        assert_tool_called: "write_file"

    - name: "编辑文件"
      description: "验证 edit_file 工具（需要审批）"
      given:
        args: ["change", "hello", "to", "hi"]
        stdin: "y\n"
      when:
        mock_response: "edit_response.json"
      then:
        assert_success: true
        assert_tool_called: "edit_file"
```

## 场景 5: 错误处理测试

### API 错误

```yaml
test_suite:
  name: "API 错误处理测试"
  description: "测试各种 API 错误场景"

  tests:
    - name: "无效 API 密钥"
      description: "验证认证错误处理"
      given:
        args: ["hello"]
        env:
          OPENAI_API_KEY: "invalid-key"
      when:
        mock_response: "auth_error.json"
      then:
        assert_success: false
        assert_contains: "Authentication"
        assert_contains: "API key"

    - name: "网络超时"
      description: "验证网络超时处理"
      given:
        args: ["hello"]
        env:
          IFAI_STREAM_TIMEOUT: "1"
      when:
        mock_response: "timeout_error.json"
      then:
        assert_success: false
        assert_contains: "timeout"

    - name: "速率限制"
      description: "验证 API 速率限制处理"
      given:
        args: ["hello"]
      when:
        mock_response: "rate_limit_error.json"
      then:
        assert_success: false
        assert_contains: "Rate limit"
```

**Mock 响应文件** (`fixtures/auth_error.json`):

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

### 用户输入错误

```yaml
test_suite:
  name: "用户输入错误测试"
  description: "测试用户输入错误场景"

  tests:
    - name: "无效命令"
      description: "验证无效命令的错误提示"
      given:
        args: ["invalid-command-xyz"]
      then:
        assert_success: false
        assert_contains: "Unknown command"
        assert_contains: "invalid-command-xyz"

    - name: "无效参数"
      description: "验证无效参数的错误提示"
      given:
        args: ["--invalid-option", "value"]
      then:
        assert_success: false
        assert_contains: "Unexpected argument"

    - name: "空提示词"
      description: "验证空提示词的处理"
      given:
        args: [""]
      then:
        assert_success: false
        assert_contains: "Empty"
```

## 场景 6: 流式响应测试

### 简单流式响应

```yaml
test_suite:
  name: "流式响应测试"
  description: "测试 SSE 流式响应处理"

  tests:
    - name: "简单流式响应"
      description: "验证基本的流式响应"
      given:
        args: ["hello"]
      when:
        mock_response: "streaming_simple.json"
      then:
        assert_success: true
        assert_contains: "Hello"
        assert_contains: "World"

    - name: "多段流式响应"
      description: "验证多段落流式传输"
      given:
        args: ["tell", "me", "a", "story"]
      when:
        mock_response: "streaming_multi.json"
      then:
        assert_success: true
        assert_match: "Once upon a time.*The end"
```

### 流式错误恢复

```yaml
test_suite:
  name: "流式错误恢复测试"
  description: "测试流式传输中的错误恢复"

  tests:
    - name: "流式传输中断"
      description: "验证网络中断后的恢复"
      given:
        args: ["long", "response"]
      when:
        mock_response: "streaming_interrupt.json"
      then:
        assert_success: true
        assert_contains: "recovered"

    - name: "空流式响应"
      description: "验证空内容的处理"
      given:
        args: ["empty"]
      when:
        mock_response: "streaming_empty.json"
      then:
        assert_success: true
```

## 场景 7: REPL 模式测试

### 基础 REPL

```yaml
test_suite:
  name: "REPL 模式测试"
  description: "测试 REPL 交互模式"

  tests:
    - name: "单轮对话"
      description: "验证单轮 REPL 对话"
      given:
        args: ["repl"]
        stdin: "hello\nexit\n"
      when:
        mock_response: "repl_single.json"
      then:
        assert_success: true
        assert_contains: "Hello"

    - name: "多轮对话"
      description: "验证多轮 REPL 对话"
      given:
        args: ["repl"]
        stdin: |
          hello
          what time is it?
          thanks
          exit
      when:
        mock_response: "repl_multi.json"
      then:
        assert_success: true
        assert_match: "Hello.*time.*You're welcome"

    - name: "REPL 中断"
      description: "验证 Ctrl+C 中断 REPL"
      given:
        args: ["repl"]
        stdin: "\u{3}"  # Ctrl+C
      then:
        assert_success: true
```

## 场景 8: 会话管理测试

### 会话压缩

```yaml
test_suite:
  name: "会话压缩测试"
  description: "测试长对话的会话压缩"

  tests:
    - name: "触发会话压缩"
      description: "验证长对话触发压缩机制"
      given:
        args: ["long", "conversation"]
      when:
        mock_response: "compression_trigger.json"
      then:
        assert_success: true
        assert_compression_triggered: true

    - name: "保留关键上下文"
      description: "验证压缩后保留关键信息"
      given:
        args: ["remember", "context"]
      when:
        mock_response: "compression_keep.json"
      then:
        assert_success: true
        assert_contains: "previous context"
```

## 场景 9: 性能测试

### 响应时间

```yaml
test_suite:
  name: "性能测试"
  description: "测试 CLI 性能指标"

  tests:
    - name: "快速响应"
      description: "验证简单命令快速响应"
      given:
        args: ["hello"]
      when:
        mock_response: "fast_response.json"
      then:
        assert_success: true
        # 响应时间应该 < 1 秒（由测试框架验证）

    - name: "大文件处理"
      description: "验证大文件处理的性能"
      given:
        args: ["process", "large-file.txt"]
      when:
        mock_response: "large_file_response.json"
      then:
        assert_success: true
        # 应该在合理时间内完成
```

## 场景 10: 集成测试

### 完整工作流

```yaml
test_suite:
  name: "完整工作流测试"
  description: "测试端到端的用户工作流"

  tests:
    - name: "首次使用流程"
      description: "测试从初始化到首次对话的完整流程"
      given:
        args: ["--config", "init"]
      then:
        assert_success: true

    - name: "配置并使用"
      description: "测试配置后使用 AI 对话"
      given:
        args: ["hello"]
        config: |
          provider: openai
          model: gpt-4o-mini
          api_key: sk-test
      when:
        mock_response: "hello_response.json"
      then:
        assert_success: true
        assert_contains: "Hello"

    - name: "工具链工作流"
      description: "测试多工具协作场景"
      given:
        args: ["analyze", "project"]
      when:
        mock_response: "tool_chain_response.json"
      then:
        assert_success: true
        assert_tool_called: "bash"
        assert_tool_called: "read_file"
```

## 场景 11: 边界条件测试

### 特殊字符

```yaml
test_suite:
  name: "边界条件测试"
  description: "测试特殊字符和边界值"

  tests:
    - name: "Unicode 字符"
      description: "验证 Unicode 字符处理"
      given:
        args: ["hello", "🌍", "世界"]
      when:
        mock_response: "unicode_response.json"
      then:
        assert_success: true
        assert_match: "🌍|世界"

    - name: "长提示词"
      description: "验证长提示词处理"
      given:
        args: ["--prompt", "a".repeat(10000)]
      when:
        mock_response: "long_prompt_response.json"
      then:
        assert_success: true

    - name: "特殊命令字符"
      description: "验证命令中的特殊字符"
      given:
        args: ["echo", "$HOME", "~", "*.txt"]
      when:
        mock_response: "special_chars_response.json"
      then:
        assert_success: true
```

## 场景 12: 并发测试

### 串行执行验证

```yaml
test_suite:
  name: "并发测试"
  description: "验证测试串行执行"

  tests:
    - name: "测试隔离"
      description: "验证测试之间不影响"
      given:
        args: ["--config", "show"]
      then:
        assert_success: true

    - name: "配置独立性"
      description: "验证每个测试使用独立配置"
      given:
        args: ["hello"]
        config: |
          provider: test
      when:
        mock_response: "simple_response.json"
      then:
        assert_success: true
```

## 完整示例：功能测试套件

```yaml
test_suite:
  name: "新功能完整测试"
  description: "包含成功、失败、边界场景的完整测试"

  tests:
    # 成功场景
    - name: "基础功能正常工作"
      description: "验证核心功能"
      given:
        args: ["new-feature", "test"]
      when:
        mock_response: "success.json"
      then:
        assert_success: true
        assert_contains: "Success"

    # 失败场景
    - name: "处理无效输入"
      description: "验证错误处理"
      given:
        args: ["new-feature", ""]
      then:
        assert_success: false
        assert_contains: "Invalid input"

    # 边界场景
    - name: "处理最大输入"
      description: "验证边界值处理"
      given:
        args: ["new-feature", "x".repeat(1000)]
      when:
        mock_response: "boundary.json"
      then:
        assert_success: true

    # 集成场景
    - name: "与其他功能集成"
      description: "验证功能集成"
      given:
        args: ["new-feature", "with-tools"]
      when:
        mock_response: "integration.json"
      then:
        assert_success: true
        assert_tool_called: "bash"
```

## 快速参考

### 测试模板

```yaml
test_suite:
  name: "测试套件名称"
  description: "测试套件描述"

  tests:
    - name: "测试名称"
      description: "测试描述"
      given:
        args: ["command"]
        # env: {KEY: "value"}
        # config: |
        #   key: value
        # stdin: "input\n"
      when:
        # mock_response: "response.json"
      then:
        assert_success: true
        # assert_contains: "text"
        # assert_match: "pattern"
        # assert_tool_called: "tool"
```

### Mock 响应模板

```json
{
  "events": [
    {"type": "text_delta", "text": "Response text"},
    {"type": "done"}
  ]
}
```

## 参考资源

- [测试编写指南](./TESTING_GUIDE.md)
- [YAML Schema 文档](./YAML_SCHEMA.md)
- [测试框架概述](./README.md)
- [真实测试示例](../suite/)

---

**维护者**: peterfei
**最后更新**: 2026-04-28
