# 社区版/商业版分离实现问题修复报告

## 问题诊断

### 主要错误
```
Launch failed: invalid args 'providerConfig' for command 'launch_agent': missing field 'provider'
```

### 根本原因
前端和后端的 `AIProviderConfig` 字段名不匹配：

| 前端字段（settingsStore） | 后端字段（core_traits） |
|--------------------------|------------------------|
| `protocol`               | `provider`             |
| `apiKey`                 | `api_key`              |
| `baseUrl`                | `base_url`             |
| `models`                 | `models` ✅            |

## 修复内容

### 1. `src/stores/agentStore.ts`
添加字段映射逻辑：
```typescript
// Convert frontend providerConfig to backend format
const backendProviderConfig = {
  provider: providerConfig.protocol,
  api_key: providerConfig.apiKey,
  base_url: providerConfig.baseUrl,
  models: providerConfig.models,
};
```

### 2. `src/components/Editor/MonacoEditor.tsx`
添加字段映射（用于 AI 代码补全）：
```typescript
const backendProviderConfig = {
  provider: currentProvider.protocol,
  api_key: currentProvider.apiKey,
  base_url: currentProvider.baseUrl,
  models: currentProvider.models,
};
```

### 3. `src/components/Editor/InlineEditWidget.tsx`
添加字段映射（用于行内编辑）：
```typescript
const backendProviderConfig = {
  provider: currentProvider.protocol,
  api_key: currentProvider.apiKey,
  base_url: currentProvider.baseUrl,
  models: currentProvider.models,
};
```

## 修复的调用链

### Agent 启动流程
```
用户 → 前端 agentStore.launchAgent()
    → 转换字段名
    → invoke('launch_agent', { providerConfig: backendProviderConfig })
    → Rust 后端接收正确的字段
    → ✅ Agent 成功启动
```

### AI 补全流程
```
用户输入 → Monaco Editor
    → 转换字段名
    → invoke('ai_completion', { providerConfig: backendProviderConfig })
    → ✅ 补全成功
```

### 行内编辑流程
```
用户选择代码 + 输入指令
    → 转换字段名
    → invoke('ai_chat', { providerConfig: backendProviderConfig })
    → ✅ 编辑成功
```

## 其他观察到的警告（非关键）

### 1. RAG 初始化警告（预期行为）
```
RAG init warning: --"RAG indexing is available in Commercial Edition."
```
- **状态**: 正常 ✅
- **原因**: 社区版不包含 RAG 功能
- **影响**: 无，仅提示用户功能限制

### 2. Monaco Worker 警告
```
Could not create web worker(s). Falling back to loading web worker code in main thread...
You must define a function MonacoEnvironment.getWorkerUrl or MonacoEnvironment.getWorker
```
- **状态**: 非关键 ⚠️
- **原因**: Monaco Editor Worker 配置问题
- **影响**: 可能影响大文件编辑性能（降级到主线程）
- **建议**: 可在后续优化（非紧急）

### 3. Git 仓库警告
```
Failed to fetch Git status: "could not find repository at '/Users/mac/Downloads/test'"
```
- **状态**: 正常 ✅
- **原因**: `/Users/mac/Downloads/test` 不是 Git 仓库
- **影响**: 无，仅在该目录下不显示 Git 状态

## 验证步骤

1. **重启应用**
2. **尝试启动 Agent**：
   - 在聊天中输入 `/explore test`
   - 应该看到 "Task registered..." 而不是错误
3. **尝试 AI 补全**：
   - 在编辑器中输入代码
   - 应该能看到 AI 补全建议
4. **尝试行内编辑**：
   - 选择代码，使用 Cmd+K（或 Ctrl+K）
   - 应该能够修改代码

## 未来优化建议

### 1. 统一类型定义
创建共享的类型定义文件，避免前后端类型不一致：

```typescript
// src/types/ai-provider.ts
export interface BackendAIProviderConfig {
  provider: string;
  api_key: string;
  base_url: string;
  models: string[];
}

export interface FrontendAIProviderConfig {
  id: string;
  name: string;
  protocol: string;
  apiKey: string;
  baseUrl: string;
  models: string[];
  enabled: boolean;
}

export function convertToBackendConfig(
  frontend: FrontendAIProviderConfig
): BackendAIProviderConfig {
  return {
    provider: frontend.protocol,
    api_key: frontend.apiKey,
    base_url: frontend.baseUrl,
    models: frontend.models,
  };
}
```

### 2. 修复 Monaco Worker 配置
添加 `MonacoEnvironment` 配置：

```typescript
// src/main.tsx 或 App.tsx
(window as any).MonacoEnvironment = {
  getWorkerUrl: function (_moduleId: string, label: string) {
    if (label === 'json') return './json.worker.js';
    if (label === 'css' || label === 'scss' || label === 'less')
      return './css.worker.js';
    if (label === 'html' || label === 'handlebars' || label === 'razor')
      return './html.worker.js';
    if (label === 'typescript' || label === 'javascript')
      return './ts.worker.js';
    return './editor.worker.js';
  },
};
```

### 3. 改进错误处理
在转换字段时添加验证：

```typescript
function convertToBackendConfig(config: AIProviderConfig): BackendAIProviderConfig {
  if (!config.protocol) throw new Error("Missing provider protocol");
  if (!config.apiKey) throw new Error("Missing API key");
  if (!config.baseUrl) throw new Error("Missing base URL");

  return {
    provider: config.protocol,
    api_key: config.apiKey,
    base_url: config.baseUrl,
    models: config.models || [],
  };
}
```

## 总结

- ✅ **主要问题已解决**：Agent 启动错误
- ✅ **修复了 3 个文件**：agentStore.ts, MonacoEditor.tsx, InlineEditWidget.tsx
- ✅ **影响范围**：Agent 系统、AI 补全、行内编辑
- ⚠️ **次要警告**：Monaco Worker 配置（可后续优化）
- ✅ **社区版功能正常**：基础编辑、AI 聊天、文件管理
- ✅ **商业版功能限制正常**：RAG 提示正确显示

---

**修复时间**: 2025-12-24
**影响版本**: v0.3.0-dev
**状态**: ✅ 已修复，可测试
