# Tauri E2E 测试架构说明

## 🔍 架构限制

### Tauri v2 IPC Bridge 注入机制

在 Tauri v2 开发模式下，应用由两个独立进程组成：

1. **原生 Tauri Window**：
   - 运行 Rust 后端
   - Tauri IPC bridge 被注入到这个 window 的 `__TAURI_INTERNALS__` 中
   - 这是唯一可以调用真实后端的浏览器上下文

2. **Vite 开发服务器**：
   - 在 `http://localhost:1420` 上运行
   - 这是一个普通的 Web 服务器
   - 没有注入 Tauri IPC bridge

### E2E 测试环境

Playwright 测试的架构：

```
Playwright 浏览器
    ↓
访问 http://localhost:1420
    ↓
Vite 开发服务器 (普通浏览器上下文)
    ↓
❌ 没有 Tauri IPC bridge
    ↓
只能使用 Mock invoke
```

**关键问题**：
- Playwright 的浏览器是普通的 Chromium 实例
- 它访问的是 Vite 开发服务器的 URL
- 因此它**永远不会**有真实的 Tauri IPC bridge
- 即使 `TAURI_DEV=true` 启动了真实的 Tauri 后端，Playwright 也无法访问它

### 为什么 Mock 仍然需要

由于上述架构限制，在 E2E 测试中：

1. **必须使用 Mock invoke** 来避免前端崩溃
2. **Mock 必须返回正确类型的数据**（例如数组而不是对象）
3. **无法直接测试真实的后端逻辑**

## ✅ 推荐的测试策略

### 策略 1: 分层测试（推荐）

```
┌─────────────────────────────────────────┐
│  E2E 测试 (Playwright)                  │
│  - 测试前端 UI 交互                      │
│  - 使用 Mock 数据                        │
│  - 验证用户体验流程                      │
└─────────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────┐
│  Rust 单元测试                           │
│  - 测试后端逻辑                          │
│  - 直接调用 Rust 函数                    │
│  - 验证业务逻辑正确性                    │
└─────────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────┐
│  集成测试（可选）                         │
│  - 使用真实的 Tauri window              │
│  - 需要特殊的测试工具（如 Tauri CLI）    │
│  - 完整的端到端测试                      │
└─────────────────────────────────────────┘
```

**实现**：

1. **E2E 测试**（tests/e2e/）
   - 专注于前端 UI 和用户交互
   - 使用 Mock 数据测试各种场景
   - 不依赖真实的后端

2. **Rust 单元测试**（src-tauri/tests/）
   - 测试每个 Tauri command 的逻辑
   - 验证数据结构和业务逻辑
   - 快速、可靠、不依赖浏览器

3. **集成测试**（可选）
   - 使用 Tauri 的测试工具
   - 在真实的 Tauri window 中运行
   - 完整的端到端验证

### 策略 2: HTTP API 代理

如果需要真实的后端测试，可以考虑：

1. **为关键功能添加 HTTP API**
   - 在 Tauri 后端暴露 HTTP 接口
   - 使用 `tokio` 和 `axum/warp` 等 HTTP 框架
   - 前端可以选择使用 IPC 或 HTTP

2. **在 Mock 中调用 HTTP API**
   - 修改 `main.tsx` 中的 Mock invoke
   - 使用 `fetch()` 调用后端 HTTP API
   - 实现真实后端集成

**示例**：
```typescript
// 在 main.tsx Mock 中
const invoke = async (cmd: string, args?: any) => {
  // 尝试调用真实的后端 HTTP API
  try {
    const response = await fetch(`http://localhost:3000/api/${cmd}`, {
      method: 'POST',
      body: JSON.stringify(args),
      headers: { 'Content-Type': 'application/json' }
    });
    return await response.json();
  } catch (error) {
    // Fallback 到 mock 数据
    console.warn('[Mock] HTTP API unavailable, using mock data');
    return getMockData(cmd, args);
  }
};
```

## 🎯 当前实施建议

### 对于 Section 2 (提示词管理系统)

建议采用**策略 1：分层测试**：

1. **E2E 测试**：
   - ✅ 测试 PromptEditor UI 交互
   - ✅ 测试版本历史按钮和对话框
   - ✅ 测试专家模式切换
   - ✅ 使用 Mock 数据验证 UI 状态

2. **Rust 单元测试**：
   - ✅ 测试 `get_prompt_versions` 的 Git 集成
   - ✅ 测试 `compare_prompt_versions` 的 diff 逻辑
   - ✅ 测试 `rollback_prompt` 的回滚操作
   - ✅ 验证权限检查逻辑

### 文件结构

```
tests/
├── e2e/
│   └── section2/
│       ├── prompt-version-ui.spec.ts      # UI 交互测试
│       └── prompt-permissions.spec.ts     # 权限 UI 测试
└── rust-unit/
    └── prompt_version_tests.rs            # Rust 逻辑测试
```

## 📝 已知限制

1. **Playwright 无法访问真实的 Tauri IPC bridge**
   - 这是架构限制，不是 bug
   - 使用 Mock 数据是正确的做法

2. **真实的后端日志不会出现在 E2E 测试中**
   - 因为后端没有被调用
   - 使用 Rust 单元测试来验证后端逻辑

3. **跨进程通信测试需要特殊工具**
   - 使用 Tauri CLI 的测试功能
   - 或者实现 HTTP API 代理

## 🔗 相关资源

- [Tauri v2 文档](https://v2.tauri.app/)
- [Tauri 测试指南](https://v2.tauri.app/start/testing)
- [Playwright 文档](https://playwright.dev/)
- [Zustand 测试最佳实践](https://docs.pmnd.rs/zustand/guides/testing)
