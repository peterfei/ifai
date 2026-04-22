# 本地模型路由验证指南

## 📋 路由逻辑

### 决策条件

本地模型路由由 `IntelligenceRouter` 决策，基于以下条件：

1. **模型文件存在**: `~/.ifai/models/qwen2.5-coder-0.5b-ifai-v3-Q4_K_M.gguf`
2. **模型已启用**: `LocalModelConfig.enabled = true`
3. **任务复杂度**: 通过 `assess_complexity()` 判断
4. **工具请求检测**: 通过 `is_tool_request()` 判断

### 路由决策树

```
┌─────────────────────────────────────────┐
│         用户输入: "执行 git status"      │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│      IntelligenceRouter 评估            │
├─────────────────────────────────────────┤
│ 1. is_tool_request()?  ✓ YES           │
│    - 检测到关键词: "执行", "git"        │
│                                         │
│ 2. 估算 tokens: ~20 < 2000              │
│                                         │
│ 3. 复杂度: TaskComplexity::Simple       │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│     RouteDecision::Local                │
├─────────────────────────────────────────┤
│ reason: "本地模型可处理的简单工具请求"   │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│      local_model_preprocess()           │
├─────────────────────────────────────────┤
│ 1. 检查模型文件存在 ✓                    │
│ 2. 解析工具调用                          │
│ 3. 返回 PreprocessResult:               │
│    {                                     │
│      should_use_local: true,            │
│      has_tool_calls: true,              │
│      tool_calls: [                      │
│        {                                 │
│          name: "bash",                  │
│          arguments: {                   │
│            "command": "git status"       │
│          }                               │
│        }                                 │
│      ]                                   │
│    }                                     │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│        本地执行工具调用                   │
├─────────────────────────────────────────┤
│ execute_local_tool("bash", { ... })     │
│ → 输出 git status 结果                   │
└─────────────────────────────────────────┘
```

### 支持的命令关键词

以下是会被路由到本地模型的关键词：

| 类别 | 关键词 |
|------|--------|
| **命令执行** | 执行, 运行, 命令, command, bash, shell, execute, run, terminal |
| **版本控制** | git, svn, hg |
| **包管理器** | npm, yarn, pnpm, pip, cargo |
| **文件操作** | 读取, 写入, 创建, 删除, 搜索, 查找, read, write, create, delete, search |
| **目录操作** | 打开, 关闭, 列出, 显示, open, close, list, show, explore, scan, dir, ls |
| **命令格式** | `/explore`, `/read`, `/scan` 等 |

### 不会路由到本地模型的情况

1. **需要 AI 工具调用** (TodoWrite 等)
2. **长上下文** (tokens > 4000 或消息数 > 20)
3. **复杂任务** (如代码重构、架构设计)
4. **图片内容** (路由到云端 Vision LLM)
5. **模型文件不存在**
6. **模型未启用**

## 🧪 验证测试

### 测试场景

#### 场景 1: 简单 git 命令
**输入**: "执行 git status"
**预期**: ✅ 路由到本地模型
**原因**: 检测到 "执行" 和 "git" 关键词，简单任务

#### 场景 2: Bash 命令
**输入**: "运行 npm test"
**预期**: ✅ 路由到本地模型
**原因**: 检测到 "运行" 和 "npm" 关键词，简单任务

#### 场景 3: 复杂重构任务
**输入**: "帮我重构整个认证模块，包括前后端"
**预期**: ❌ 路由到云端 API
**原因**: 复杂任务，需要 AI 推理

#### 场景 4: 任务列表创建
**输入**: "创建一个任务列表"
**预期**: ❌ 路由到云端 API
**原因**: 需要 TodoWrite 工具调用

## 🔍 日志验证

在运行应用时，查看以下日志确认路由决策：

```bash
# 本地模型路由成功
[LocalModel] ===== Preprocess Start =====
[LocalModel] Model exists: true, enabled: true
[Router] is_tool_request=true, requires_ai_tool=false, is_long_context=false
[LocalModel] ✅ Route: Local - 本地模型可处理的简单工具请求
[AI Chat] should_use_local is TRUE, checking conditions...

# 云端 API 路由
[LocalModel] ===== Preprocess Start =====
[Router] is_tool_request=false, requires_ai_tool=false, is_long_context=true
[LocalModel] ☁️ Route: Cloud - 上下文过长，路由到云端 API
[AI Chat] should_use_local is FALSE, falling back to cloud API
```

## 📊 相关文件

| 文件 | 功能 |
|------|------|
| `src-tauri/src/intelligence_router.rs` | 智能路由决策逻辑 |
| `src-tauri/src/local_model.rs` | 本地模型预处理和工具执行 |
| `src-tauri/src/lib.rs:706-757` | AI Chat 路由入口 |

## 🚀 手动测试步骤

1. **确保本地模型已下载**:
   ```bash
   ls -lh ~/.ifai/models/qwen2.5-coder-0.5b-ifai-v3-Q4_K_M.gguf
   ```

2. **确保模型已启用**:
   - 在设置中启用本地模型
   - 或修改 `~/.ifai/config.json` 设置 `enabled: true`

3. **打开应用并发送简单命令**:
   - 输入: "执行 git status"
   - 输入: "运行 ls -la"
   - 输入: "执行 npm list"

4. **观察控制台日志**:
   - 查看 `[Router]` 和 `[LocalModel]` 日志
   - 确认 `should_use_local is TRUE`

5. **验证结果**:
   - 命令应该快速返回结果
   - 不消耗云端 API token

## ⚠️ 注意事项

1. **Windows 平台默认禁用本地模型** - 需要手动启用
2. **本地模型仅支持简单工具调用** - 不支持 TodoWrite 等复杂工具
3. **质量熔断** - 如果本地模型输出过短 (< 5 字符)，会自动回退云端
