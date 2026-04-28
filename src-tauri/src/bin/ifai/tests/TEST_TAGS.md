# 测试标签系统

## 概述

测试标签系统允许你为测试添加分类标签，然后按标签运行特定的测试子集。这对于以下场景非常有用：

- **CI/CD 分阶段测试**：先运行快速测试，再运行完整测试
- **开发迭代**：只运行相关的单元测试
- **调试**：只运行失败的测试类型
- **冒烟测试**：快速验证核心功能

## 快速开始

### 第一步：为测试添加标签

在 YAML 测试定义中添加 `tags` 字段：

```yaml
tests:
  - name: "基础命令"
    tags: [smoke, fast, unit]  # ← 添加标签
    given:
      args: ["--help"]
    then:
      assert_success: true
```

### 第二步：重新生成测试代码

```bash
cargo build --package ifainew
```

### 第三步：按标签运行测试

```bash
# 运行特定标签的测试
./scripts/run-tests.sh --tags unit

# 并行运行单元测试
./scripts/run-tests.sh --parallel --tags unit

# 排除慢速测试
./scripts/run-tests.sh --exclude-tags slow

# 组合标签（AND 逻辑）
./scripts/run-tests.sh --tags "unit && fast"
```

## 标准标签

以下是我们推荐使用的标准标签：

### 按测试类型分类

| 标签 | 说明 | 示例 |
|------|------|------|
| **unit** | 单元测试（快速、隔离） | 命令行参数解析、版本信息 |
| **integration** | 集成测试（依赖外部） | Mock API 测试、工具执行 |
| **e2e** | 端到端测试（完整流程） | 完整对话流程 |

### 按执行速度分类

| 标签 | 说明 | 预期时间 |
|------|------|---------|
| **fast** | 快速测试 | < 1 秒 |
| **slow** | 慢速测试 | > 1 秒 |

### 按测试目的分类

| 标签 | 说明 | 示例 |
|------|------|------|
| **smoke** | 冒烟测试（核心功能） | 基础命令、帮助信息 |
| **regression** | 回归测试（已知问题） | 修复过的 bug |
| **security** | 安全测试 | 权限验证、输入过滤 |

### 按技术特性分类

| 标签 | 说明 | 示例 |
|------|------|------|
| **mock** | 使用 Mock 服务器 | 所有有 `mock_response` 的测试 |
| **streaming** | 流式响应测试 | SSE 流式测试 |
| **tools** | 工具执行测试 | Bash、文件操作工具 |
| **parametrized** | 参数化测试 | 使用 `parameters` 的测试 |

## 标签语法

### 单个标签

```yaml
tags: unit
```

或

```yaml
tags: [unit]
```

### 多个标签

```yaml
tags: [unit, fast, smoke]
```

### 标签运行

```bash
# 单个标签
./scripts/run-tests.sh --tags unit

# 多个标签（OR 逻辑：匹配任一）
./scripts/run-tests.sh --tags "unit,fast"

# AND 逻辑（同时匹配）
./scripts/run-tests.sh --tags "unit && fast"

# 排除标签
./scripts/run-tests.sh --exclude-tags slow

# 组合使用
./scripts/run-tests.sh --tags "unit" --exclude-tags "slow"
```

## 实际应用场景

### 场景 1：CI/CD 分阶段测试

```yaml
# .github/workflows/test.yml
- name: 快速冒烟测试
  run: ./scripts/run-tests.sh -p -t "smoke && fast"

- name: 单元测试
  run: ./scripts/run-tests.sh -p -t unit

- name: 完整测试套件
  run: ./scripts/run-tests.sh -p
```

### 场景 2：本地开发

```bash
# 快速反馈：只运行单元测试
alias test-unit='./scripts/run-tests.sh -p -t unit'

# 调试：排除慢速测试
alias test-fast='./scripts/run-tests.sh -p -e slow'

# 冒烟测试：验证核心功能
alias test-smoke='./scripts/run-tests.sh -p -t smoke'
```

### 场景 3：PR 验证

```bash
# 运行所有快速测试（排除慢速和网络测试）
./scripts/run-tests.sh -p -e "slow,network"
```

## 标签最佳实践

### ✅ 推荐做法

1. **为每个测试添加至少一个标签**
   ```yaml
   - name: "测试名称"
     tags: [unit]  # ← 总是添加标签
   ```

2. **使用标准标签**
   ```yaml
   # ✅ 使用标准标签
   tags: [unit, fast]

   # ❌ 避免自定义标签
   tags: [my_custom_tag]
   ```

3. **组合标签以细化分类**
   ```yaml
   # ✅ 清晰的组合
   tags: [integration, mock, streaming]

   # ❌ 太少信息
   tags: [test]
   ```

4. **为参数化测试添加特殊标签**
   ```yaml
   - name: "提供商测试"
     tags: [integration, parametrized]
     parameters:
       provider: [openai, deepseek]
   ```

### ❌ 避免的做法

1. **不要过度细分**
   ```yaml
   # ❌ 标签太多
   tags: [unit, fast, smoke, regression, v1, cli, args, parse]

   # ✅ 合理数量
   tags: [unit, fast, smoke]
   ```

2. **不要创建无意义的标签**
   ```yaml
   # ❌ 无意义的标签
   tags: [test1, test_a, my_test]

   # ✅ 有意义的标签
   tags: [unit, integration, smoke]
   ```

3. **不要混淆标签和描述**
   ```yaml
   # ❌ 标签不是描述
   tags: ["tests the help command"]

   # ✅ 使用 description 字段
   description: "测试帮助命令"
   tags: [unit, fast]
   ```

## 生成的测试代码

标签会被转换为测试函数中的注释：

```rust
#[tokio::test]
#[serial_test::serial]
async fn test_ji_chu_ming_ling() {
    // tags: smoke, fast, unit  ← 标签在这里
    // 验证基础命令可用
    let mut env = TestEnv::new().await.unwrap();
    // ...
}
```

测试脚本会解析这些注释来过滤测试。

## 高级用法

### 标签表达式

```bash
# OR：匹配任一标签
./scripts/run-tests.sh --tags "unit,integration"

# AND：同时匹配多个标签
./scripts/run-tests.sh --tags "unit && fast"

# NOT：排除标签
./scripts/run-tests.sh --exclude-tags slow

# 复杂表达式
./scripts/run-tests.sh --tags "unit && fast" --exclude-tags "network"
```

### 与其他选项组合

```bash
# 并行 + 标签过滤
./scripts/run-tests.sh --parallel --tags unit

# 标签 + 测试报告
./scripts/run-tests.sh -t smoke -r

# 标签 + 详细输出
./scripts/run-tests.sh -t integration -v

# 标签 + 自定义过滤器
./scripts/run-tests.sh -t unit -f "test_help"
```

## CI/CD 集成

### GitHub Actions

```yaml
name: Tests

on: [push, pull_request]

jobs:
  smoke-test:
    name: 冒烟测试
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: 运行冒烟测试
        run: ./scripts/run-tests.sh -p -t "smoke && fast"

  unit-test:
    name: 单元测试
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: 运行单元测试
        run: ./scripts/run-tests.sh -p -t unit

  integration-test:
    name: 集成测试
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: 运行集成测试
        run: ./scripts/run-tests.sh -p -t integration

  full-test:
    name: 完整测试
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: 运行所有测试
        run: ./scripts/run-tests.sh -p -r
```

### GitLab CI

```yaml
stages:
  - smoke
  - unit
  - integration
  - report

smoke:test:
  stage: smoke
  script:
    - ./scripts/run-tests.sh -p -t "smoke && fast"

unit:test:
  stage: unit
  script:
    - ./scripts/run-tests.sh -p -t unit

integration:test:
  stage: integration
  script:
    - ./scripts/run-tests.sh -p -t integration

report:
  stage: report
  script:
    - ./scripts/run-tests.sh -p -r
  artifacts:
    paths:
      - target/test-reports/
```

## 故障排除

### 问题：标签没有生效

**检查标签格式**：

```yaml
# ✅ 正确格式
tags: [unit, fast]
tags: unit

# ❌ 错误格式
tags: "unit, fast"  # 字符串会被当作单个标签
```

### 问题：找不到匹配的测试

**检查标签名称**：

```bash
# 查看可用的标签
grep -r "tags:" src-tauri/src/bin/ifai/tests/suite/

# 或运行测试脚本查看匹配情况
./scripts/run-tests.sh --tags your_tag --verbose
```

### 问题：参数化测试的标签

参数化测试的标签会应用到所有生成的测试：

```yaml
- name: "提供商测试"
  tags: [integration, parametrized]
  parameters:
    provider: [openai, deepseek]
# 生成的 2 个测试都会有 [integration, parametrized] 标签
```

## 示例项目

完整的标签示例请参考：

- `src-tauri/src/bin/ifai/tests/suite/tag_example.yaml` - 标签示例
- `src-tauri/src/bin/ifai/tests/generated/tag_example.rs` - 生成的测试代码

## 参考资料

- [测试编写指南](TESTING_GUIDE.md)
- [并行测试执行](PARALLEL_TESTING.md)
- [参数化测试](PARAMETRIZED_TESTS.md)

---

**维护者**: peterfei
**最后更新**: 2026-04-28
