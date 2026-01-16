# 真实 AI 工具调用测试指南

## 概述

`composer-real-ai.spec.ts` 测试使用真实的 AI 服务（如 Ollama、OpenAI 等）来验证工具调用功能。

## 与 Mock 测试的区别

| 测试类型 | 文件 | AI 服务 | 用途 |
|---------|------|---------|------|
| Mock 测试 | `composer.spec.ts` | 模拟响应 | 测试 UI 交互 |
| **真实 AI 测试** | `composer-real-ai.spec.ts` | **真实 AI** | **验证完整数据流** |

## 环境变量配置

设置以下环境变量来配置真实 AI 服务：

```bash
# AI 服务基础 URL（必需）
export E2E_REAL_AI_BASE_URL="http://localhost:11434/v1"

# API 密钥（可选，对于某些服务如 OpenAI 是必需的）
export E2E_REAL_AI_API_KEY="your-api-key"

# 模型名称（可选）
export E2E_REAL_AI_MODEL="llama3.2"
```

## 支持的 AI 服务

### Ollama（本地）

```bash
# 安装 Ollama
brew install ollama

# 拉取模型
ollama pull llama3.2
ollama pull qwen2.5-coder

# 运行测试
E2E_REAL_AI_BASE_URL=http://localhost:11434/v1 \
E2E_REAL_AI_MODEL=llama3.2 \
npm run test:e2e -- composer-real-ai.spec.ts
```

### OpenAI / 兼容 API

```bash
E2E_REAL_AI_BASE_URL=https://api.openai.com/v1 \
E2E_REAL_AI_API_KEY=sk-xxx \
E2E_REAL_AI_MODEL=gpt-4 \
npm run test:e2e -- composer-real-ai.spec.ts
```

### 其他兼容 OpenAI API 的服务

```bash
# Moonshot (月之暗面)
E2E_REAL_AI_BASE_URL=https://api.moonshot.cn/v1 \
E2E_REAL_AI_API_KEY=sk-xxx \
E2E_REAL_AI_MODEL=moonshot-v1-8k \
npm run test:e2e -- composer-real-ai.spec.ts

# DeepSeek
E2E_REAL_AI_BASE_URL=https://api.deepseek.com/v1 \
E2E_REAL_AI_API_KEY=sk-xxx \
E2E_REAL_AI_MODEL=deepseek-coder \
npm run test:e2e -- composer-real-ai.spec.ts
```

## 运行测试

### 运行所有真实 AI 测试

```bash
E2E_REAL_AI_BASE_URL=http://localhost:11434/v1 \
E2E_REAL_AI_MODEL=llama3.2 \
npm run test:e2e -- composer-real-ai.spec.ts
```

### 运行单个测试

```bash
E2E_REAL_AI_BASE_URL=http://localhost:11434/v1 \
E2E_REAL_AI_MODEL=llama3.2 \
npm run test:e2e -- composer-real-ai.spec.ts -g "AI响应包含agent_write_file"
```

### 使用 Visual Studio Code

创建 `.env.test.local` 文件：

```env
E2E_REAL_AI_BASE_URL=http://localhost:11434/v1
E2E_REAL_AI_MODEL=llama3.2
E2E_REAL_AI_API_KEY=
```

然后直接运行测试。

## 测试超时配置

真实 AI 响应可能需要较长时间，测试中已配置：

- 单文件测试：45 秒
- 多文件测试：60 秒

如果您的 AI 服务响应较慢，可以在 `composer-real-ai.spec.ts` 中调整超时时间。

## 故障排除

### 测试跳过

如果测试被跳过，检查：

1. 环境变量 `E2E_REAL_AI_BASE_URL` 是否设置
2. AI 服务是否正在运行
3. 模型是否已下载

### AI 不返回 tool_calls

某些 AI 模型可能不支持工具调用：

- ✅ **支持**：GPT-4, Claude, llama3.2, qwen2.5-coder
- ❌ **不支持**：旧版模型，某些专用模型

### 连接错误

如果出现连接错误：

1. 检查 `E2E_REAL_AI_BASE_URL` 是否正确
2. 对于本地 Ollama，确保服务正在运行：`ollama serve`
3. 对于云 API，检查网络连接和 API 密钥

## 代码结构

### setupE2ETestEnvironment 选项

```typescript
interface E2ETestEnvironmentOptions {
  useRealAI?: boolean;        // 是否使用真实 AI
  realAIApiKey?: string;      // API 密钥
  realAIBaseUrl?: string;     // 基础 URL
  realAIModel?: string;       // 模型名称
}
```

### 使用示例

```typescript
import { setupE2ETestEnvironment } from './setup';

// 使用真实 AI
await setupE2ETestEnvironment(page, {
  useRealAI: true,
  realAIBaseUrl: 'http://localhost:11434/v1/chat/completions',
  realAIApiKey: '',
  realAIModel: 'llama3.2'
});

// 使用 Mock AI（默认）
await setupE2ETestEnvironment(page);
```

## 贡献

如果您想添加新的真实 AI 测试：

1. 在 `composer-real-ai.spec.ts` 中添加测试用例
2. 使用 `getRealAIConfig()` 获取配置
3. 检查 `realAIConfig.useRealAI`，如果为 false 则跳过测试
4. 设置合理的超时时间
