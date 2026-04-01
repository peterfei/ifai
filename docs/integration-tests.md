# 集成测试文档

**日期**: 2025-04-02
**分支**: feature/p0-harness-api-sse
**阶段**: P0+P1 集成测试

---

## 测试环境设置

### 1. 配置 API Keys

创建 `.env` 文件（参考 `.env.example`）：

```bash
cp .env.example .env
```

编辑 `.env` 文件，填入真实的 API Keys：

```env
ANTHROPIC_API_KEY=your_anthropic_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
DEEPSEEK_API_KEY=your_deepseek_api_key_here
```

### 2. 运行测试

#### 运行所有集成测试

```bash
# 方式 1: 使用测试脚本
./run-integration-tests.sh

# 方式 2: 直接使用 cargo
cargo test harness:: --lib -- --ignored
```

#### 运行特定测试

```bash
# 工具系统测试
cargo test harness::tool::integration_tests --lib

# API 集成测试
cargo test harness::api::integration_tests --lib -- --ignored
```

---

## 测试覆盖

### P0 - API 客户端与 SSE (集成测试)

| 测试 | 描述 | 状态 | 需要 API Key |
|------|------|------|--------------|
| `test_anthropic_stream` | Anthropic 流式响应 | ✅ | Anthropic |
| `test_openai_stream` | OpenAI 流式响应 | ✅ | OpenAI |
| `test_deepseek_stream` | DeepSeek 流式响应 | ✅ | DeepSeek |
| `test_provider_factory` | 多提供商工厂 | ✅ | 所有 |
| `test_token_estimation_accuracy` | Token 估算准确性 | ✅ | Anthropic |

### P1 - 工具系统 (集成测试)

| 测试 | 描述 | 状态 | 需要 API Key |
|------|------|------|--------------|
| `test_tool_lifecycle` | 工具生命周期 | ✅ | ❌ |
| `test_permission_with_executor` | 权限与执行器集成 | ✅ | ❌ |
| `test_permission_elevation_scenarios` | 权限提升场景 | ✅ | ❌ |
| `test_permission_hierarchy` | 权限层次结构 | ✅ | ❌ |
| `test_whitelist_generation` | 白名单生成 | ✅ | ❌ |
| `test_tool_input_validation` | 工具输入验证 | ✅ | ❌ |
| `test_executor_tool_count` | 执行器工具统计 | ✅ | ❌ |

---

## 测试结果

### 工具系统集成测试

```bash
running 7 tests
test harness::tool::integration_tests::integration_tests::test_permission_hierarchy ... ok
test harness::tool::integration_tests::integration_tests::test_permission_elevation_scenarios ... ok
test harness::tool::integration_tests::integration_tests::test_whitelist_generation ... ok
test harness::tool::integration_tests::integration_tests::test_executor_tool_count ... ok
test harness::tool::integration_tests::integration_tests::test_tool_input_validation ... ok
test harness::tool::integration_tests::integration_tests::test_tool_lifecycle ... ok
test harness::tool::integration_tests::integration_tests::test_permission_with_executor ... ok

test result: ok. 7 passed; 0 failed; 0 ignored
```

**状态**: ✅ **7/7 工具系统集成测试通过**

### API 集成测试

需要配置 API Keys 后运行。

---

## 测试文件结构

```
src-tauri/src/harness/
├── api/
│   ├── tests.rs                 # API 集成测试
│   ├── client.rs                # ApiClient trait
│   ├── providers/               # 提供商实现
│   │   ├── anthropic.rs
│   │   ├── deepseek.rs
│   │   ├── openai.rs
│   │   └── custom.rs
│   └── sse.rs                   # SSE 解析器
│
└── tool/
    ├── integration_tests.rs     # 工具系统集成测试
    ├── registry.rs              # 工具注册表
    ├── executor.rs              # 工具执行器
    └── spec.rs                  # 工具规范
```

---

## 测试脚本

### `run-integration-tests.sh`

自动检测可用 API Keys 并运行相应的集成测试。

**功能**:
- 检查 `.env` 文件是否存在
- 加载环境变量
- 检测哪些 API Keys 可用
- 运行工具系统测试（无需 API Keys）
- 根据可用 Keys 运行 API 集成测试

**使用**:
```bash
./run-integration-tests.sh
```

---

## 环境变量说明

### API Keys

| 变量 | 描述 | 获取地址 |
|------|------|----------|
| `ANTHROPIC_API_KEY` | Anthropic Claude API Key | https://console.anthropic.com/ |
| `OPENAI_API_KEY` | OpenAI API Key | https://platform.openai.com/api-keys |
| `DEEPSEEK_API_KEY` | DeepSeek API Key | https://platform.deepseek.com/ |

### 可选配置

| 变量 | 描述 |
|------|------|
| `OLLAMA_BASE_URL` | Ollama 本地端点 (默认: http://localhost:11434/v1) |
| `LOCALAI_BASE_URL` | LocalAI 本地端点 (默认: http://localhost:8080/v1) |

---

## 故障排除

### 问题: `.env file not found!`

**解决方案**:
```bash
cp .env.example .env
# 编辑 .env 填入 API Keys
```

### 问题: `API Key not found`

**解决方案**: 确保在 `.env` 文件中设置了对应的 API Key，并且不是占位符值。

### 问题: 网络超时

**解决方案**: 检查网络连接，确保可以访问对应提供商的 API 端点。

---

## 下一步

1. **配置 API Keys**: 获取并配置至少一个提供商的 API Key
2. **运行 API 集成测试**: 验证与真实 API 的集成
3. **性能测试**: 测试流式响应性能和稳定性
4. **端到端测试**: 在完整的应用环境中测试

---

## 附录：快速测试命令

```bash
# 仅工具系统测试（无需 API Keys）
cargo test harness::tool::integration_tests --lib

# 完整集成测试（需要 API Keys）
cargo test harness:: --lib -- --ignored

# 单个提供商测试
cargo test harness::api::integration_tests::test_anthropic_stream --lib -- --ignored

# 测试脚本（自动检测）
./run-integration-tests.sh
```
