# 参数化测试功能

## 概述

参数化测试允许你用不同的参数值运行同一个测试逻辑，而不需要复制粘贴测试代码。

### 基本语法

```yaml
test_suite:
  name: "参数化测试示例"

  tests:
    - name: "测试名称"
      parameters:
        参数名:
          - 值1
          - 值2
          - 值3
      given:
        # 使用 ${{参数名}} 引用参数
      when:
        mock_response: "simple_response.json"
      then:
        assert_success: true
```

### 变量引用

在 YAML 中使用 `${{参数名}}` 格式引用参数：

```yaml
given:
  args: ["--model", "${{model}}"]
  env:
    IFAI_PROVIDER: "${{provider}}"
```

## 示例 1: 单参数测试

测试多个提供商：

```yaml
- name: "提供商连接测试"
  description: "验证不同 AI 提供商的连接"
  parameters:
    provider:
      - openai
      - deepseek
      - anthropic
  given:
    env:
      IFAI_PROVIDER: "${{provider}}"
  when:
    mock_response: "simple_response.json"
  then:
    assert_success: true
```

**生成的测试**:
- `test_test_2f554_provider_openai`
- `test_test_2f554_provider_deepseek`
- `test_test_2f554_provider_anthropic`

## 示例 2: 多参数组合

测试提供商 × 模型组合：

```yaml
- name: "模型兼容性测试"
  description: "验证提供商和模型的组合"
  parameters:
    provider:
      - openai
      - deepseek
    model:
      - small
      - large
  given:
    env:
      IFAI_PROVIDER: "${{provider}}"
      IFAI_MODEL: "${{model}}"
  when:
    mock_response: "simple_response.json"
  then:
    assert_success: true
```

**生成的测试** (4 个组合):
- `test_test_ce_shi_mo_xing_rong_xing_provider_openai_model_small`
- `test_test_ce_shi_mo_xing_rong_xing_provider_openai_model_large`
- `test_test_ce_shi_mo_xing_rong_xing_provider_deepseek_model_small`
- `test_test_ce_shi_mo_xing_rong_xing_provider_deepseek_model_large`

## 示例 3: 参数化配置优先级

```yaml
- name: "配置源测试"
  description: "验证不同配置源"
  parameters:
    config_source:
      - "CLI 参数"
      - "环境变量"
      - "配置文件"
  given:
    args: ["hello"]
    notes: "使用 ${{config_source}}"
```

## 变量替换位置

变量可以在以下位置使用：

### 1. 环境变量

```yaml
given:
  env:
    KEY: "${{parameter}}"
```

### 2. 命令行参数

```yaml
given:
  args: ["--option", "${{value}}"]
```

### 3. 配置文件内容

```yaml
given:
  config: |
    provider: ${{provider}}
    model: ${{model}}
```

### 4. 标准输入

```yaml
given:
  stdin: "${{user_input}}"
```

### 5. 断言

```yaml
then:
  assert_contains: "${{expected_value}}"
  assert_match: "${{regex_pattern}}"
```

## 命名规则

生成的测试函数名包含：
1. 原始测试名称（转换为拼音）
2. 所有参数名和值（转换为拼音）

**示例**:
```yaml
- name: "测试提供商"
  parameters:
    provider: [openai, deepseek]
```

生成函数名: `test_test_2f554_provider_openai`

## 最佳实践

### 1. 使用有意义的参数值

```yaml
# ✅ 好的参数值
parameters:
  provider: [openai, deepseek, anthropic]

# ❌ 避免使用无意义的值
parameters:
  test: [test1, test2, test3]
```

### 2. 保持参数数量合理

```yaml
# ✅ 合理：2 个参数，4 个组合
parameters:
  provider: [openai, deepseek]
  model: [small, large]

# ⚠️  谨慎：3 个参数，8 个组合
parameters:
  provider: [openai, deepseek]
  model: [small, large]
  region: [us, eu]

# ❌ 避免：太多参数会产生大量测试
parameters:
  a: [1, 2, 3, 4]
  b: [1, 2, 3, 4]
  c: [1, 2, 3, 4]
```

### 3. 使用描述性的测试名称

```yaml
# ✅ 清晰的名称
- name: "提供商连接测试"

# ❌ 模糊的名称
- name: "测试"
```

## 完整示例

```yaml
test_suite:
  name: "AI 提供商兼容性测试"
  description: "测试不同提供商的兼容性"

  tests:
    # 单参数：3 个提供商
    - name: "基础连接测试"
      description: "验证每个提供商的基础连接"
      parameters:
        provider:
          - openai
          - deepseek
          - anthropic
      given:
        env:
          IFAI_PROVIDER: "${{provider}}"
      when:
        mock_response: "simple_response.json"
      then:
        assert_success: true

    # 双参数：提供商 × 模型
    - name: "模型支持测试"
      description: "验证提供商支持的模型"
      parameters:
        provider:
          - openai
          - deepseek
        model:
          - small
          - large
      given:
        env:
          IFAI_PROVIDER: "${{provider}}"
          IFAI_MODEL: "${{provider}}-${{model}}"
      when:
        mock_response: "simple_response.json"
      then:
        assert_success: true
```

**生成的测试数量**: 3 + (2×2) = 7 个测试

## 限制和注意事项

1. **参数类型**: 只支持字符串值
2. **占位符格式**: 必须使用 `${{name}}` 格式
3. **测试名称**: 自动生成，可能较长
4. **性能**: 参数越多，生成的测试越多

## 故障排除

### 问题：变量没有替换

**检查占位符格式**:
```yaml
# ✅ 正确：2 个花括号
IFAI_PROVIDER: "${{provider}}"

# ❌ 错误：4 个花括号
IFAI_PROVIDER: "${{{provider}}}"
```

### 问题：生成的测试名称太长

**解决方案**: 使用简短的参数值
```yaml
# ❌ 参数值太长
parameters:
  configuration:
    - "very_long_configuration_name"

# ✅ 使用简短值
parameters:
  config:
    - basic
    - advanced
```

### 问题：测试数量过多

**解决方案**: 减少参数或参数值
```yaml
# ❌ 64 个组合 (4×4×4)
parameters:
  a: [1, 2, 3, 4]
  b: [1, 2, 3, 4]
  c: [1, 2, 3, 4]

# ✅ 4 个组合 (2×2)
parameters:
  a: [1, 2]
  b: [1, 2]
```

---

**维护者**: peterfei
**最后更新**: 2026-04-28
