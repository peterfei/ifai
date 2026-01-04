# IfAI Editor v0.2.5 发布说明

> **混合智能架构正式发布** | 本地 0.5B 模型 + 智能路由器 | Token 节省 70%+

---

## 📋 版本概述

**发布日期**：2026-01-03

**v0.2.5** 是 IfAI Editor 迄今最具革命性的版本更新，标志着产品从"纯云端 AI 编辑器"正式进化为"**混合智能编辑器**"。

本次更新的核心突破：

| 特性 | 说明 |
|:-----|:-----|
| 🧠 **混合智能架构** | 业界首创端云协同的智能路由系统 |
| 📦 **本地 0.5B 模型** | 自主微调的代码专用模型，仅 600MB |
| 💰 **Token 节省 70%+** | 智能调度算法，大幅降低 API 成本 |
| ⚡ **性能提升 3 倍** | Agent 工具调用完全本地化 |
| 🔒 **隐私优先设计** | 敏感操作 100% 本地处理 |

---

## 🏗️ 架构演进

### 从纯云端到混合智能

```
┌─────────────────────────────────────────────────────────┐
│               IfAI 架构演进历程                          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  v0.1.x ~ v0.2.4                                       │
│  ┌─────────────┐                                       │
│  │  纯云端架构  │  所有 AI 调用 → 云端 API                │
│  └─────────────┘                                       │
│                                                         │
│  v0.2.5+ ⭐                                             │
│  ┌─────────────────────────────────────────────────┐   │
│  │          混合智能架构 (Hybrid AI)                │   │
│  │  ┌──────────┐      ┌──────────┐                 │   │
│  │  │ 本地模型  │  +   │ 云端模型  │                 │   │
│  │  │ 0.5B     │      │ GPT-4    │                 │   │
│  │  └──────────┘      └──────────┘                 │   │
│  │         ↕                                            │
│  │    IntelligenceRouter (智能路由器)                  │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 🚀 核心功能详解

### 1. IntelligenceRouter 智能路由器

新增 `src-tauri/src/intelligence_router.rs` 模块，实现三层智能决策：

#### 决策逻辑

```rust
// 任务复杂度评估
pub enum TaskComplexity {
    Simple,   // 本地 0.5B 模型
    Medium,   // 混合模式
    Complex,  // 云端 GPT-4/Claude
}

// 路由决策结果
pub enum RouteDecision {
    Local { reason: String },      // 🟢 本地处理（免费）
    Cloud { reason: String },      // 🔵 云端处理（消耗 Token）
    Hybrid { reason: String },     // 🔄 混合模式
}
```

#### 判断因子

| 因子 | 规则 | 处理方式 |
|:-----|:-----|:---------|
| **任务类型** | 工具调用（`read_file`、`grep` 等） | 🟢 本地优先 |
| **上下文长度** | < 2000 tokens | 🟢 本地模型 |
| | 2000-4000 tokens | 🔄 混合模式 |
| | \> 4000 tokens | 🔵 云端模型 |
| **查询复杂度** | 单轮简单查询 | 🟢 本地 |
| | 多轮复杂对话 | 🔵 云端 |

---

### 2. 本地 0.5B 代码专用模型

#### 模型规格

| 参数 | 数值 |
|:-----|:----:|
| 模型名称 | Qwen2.5-Coder-0.5B-IfAI-v3 |
| 文件大小 | ~600MB |
| 量化格式 | Q4_K_M (GGUF) |
| 推理引擎 | llama.cpp Rust 绑定 |
| 上下文长度 | 2048 tokens |
| 平均延迟 | <300ms |

#### 专精领域

不同于通用大模型，IfAI 的本地模型专注于：

- ✅ **代码补全** (Code Completion)
  - 语法补全
  - 函数名补全
  - 常见模式识别

- ✅ **工具指令生成** (Tool Command Generation)
  - Agent 工具调用
  - 文件操作指令
  - 搜索查询生成

#### 使用场景

| 场景 | 本地模型 | 云端模型 |
|:-----|:--------:|:--------:|
| 简单代码补全 | ✅ 推荐 | ❌ 过度 |
| 语法提示 | ✅ 推荐 | ❌ 过度 |
| 文件内容搜索 | ✅ 推荐 | ❌ 过度 |
| Agent 工具调用 | ✅ 推荐 | ❌ 浪费 |
| 长篇代码生成 | ❌ 能力不足 | ✅ 推荐 |
| 深度逻辑解释 | ❌ 能力不足 | ✅ 推荐 |

---

### 3. Agent 工具调用本地化

#### 技术实现

新增 `src-tauri/src/llm_inference/mod.rs` 模块：

```rust
pub struct LocalLLMExecutor {
    model: LlamaModel,
    config: LocalLLMConfig,
}

impl LocalLLMExecutor {
    // Agent 工具调用推理
    pub async fn infer_tool_call(&self, context: &str) -> Result<ToolCall> {
        // 完全本地推理，零云端费用
        // 推理延迟 <300ms
    }
}
```

#### 性能对比

| 指标 | 纯云端 (v0.2.4) | 混合架构 (v0.2.5) | 提升 |
|:-----|:--------------:|:----------------:|:----:|
| Agent 工具调用延迟 | 500ms/次 | 150ms/次 | **3.3x** |
| 连续工具执行速度 | 基准 | 3 倍以上 | **3x+** |
| Token 消耗 | 100% | 0% | **-100%** |
| 离线支持 | ❌ | ✅ | **新增** |

---

### 4. UI 透明化设计

#### 本地/云端标识

聊天界面每条消息都会显示处理来源：

```typescript
// 消息来源标识
type MessageSource = 'local' | 'cloud' | 'hybrid';

interface MessageMetadata {
  source: MessageSource;
  tokensUsed?: number;      // 云端调用显示 Token 消耗
  localModel?: string;      // 本地调用显示模型名称
  reasoningTime?: number;   // 推理耗时
}
```

**显示效果：**

```
🟢 本地处理 (qwen2.5-coder-0.5b) | 耗时 150ms
🔵 云端处理 (gpt-4o-mini) | 消耗 1,234 tokens | 耗时 1.2s
```

---

## 📊 性能基准测试

### Token 节省效果

基于真实使用场景的测试数据：

| 用户类型 | 月度 Token 消耗 | v0.2.5 节省 | 月省费用 |
|:---------|:---------------:|:----------:|:-------:|
| 轻度用户 | 50 万 tokens | 60% | ~¥15 |
| 中度用户 | 200 万 tokens | 70% | ~¥60 |
| 重度用户 | 500 万 tokens | 75% | ~¥180 |

*按主流 API ¥0.12/1K tokens 计算*

### 响应延迟对比

| 操作类型 | v0.2.4 (纯云端) | v0.2.5 (混合) | 提升 |
|:---------|:--------------:|:------------:|:----:|
| 简单补全 | 800ms | 150ms | **5.3x** |
| 文件搜索 | 1200ms | 200ms | **6.0x** |
| Agent 工具调用 | 500ms/次 | 150ms/次 | **3.3x** |
| 复杂推理 | 2000ms | 2000ms | 持平 |

---

## 📦 安装与配置

### 系统要求

| 平台 | 支持状态 |
|:-----|:--------:|
| macOS (Apple Silicon) | ✅ 完全支持 |
| macOS (Intel) | ✅ 完全支持 |
| Linux (x64/ARM64) | ✅ 完全支持 |
| Windows (x64) | ✅ 完全支持 |

**硬件要求：**
- CPU：支持 SSE4.2 的 x64_64 或 ARM64
- 内存：至少 2GB 可用内存
- 存储：约 600MB 用于模型文件

### 模型下载

#### 自动下载（推荐）

首次启动 IfAI 时，应用会自动下载模型：

```
[IfAI] 正在下载本地模型...
[IfAI] 下载进度: [████████████████████] 100% (600MB)
[IfAI] 模型加载完成！
```

#### 手动下载

如需手动下载模型：

```bash
# 模型文件位置
~/.ifai/models/qwen2.5-coder-0.5b-ifai-v3-Q4_K_M.gguf

# HuggingFace 下载地址
https://huggingface.co/peterfei/ifai
```

### 配置选项

编辑 `~/.ifai/config.toml`：

```toml
[local_llm]
# 本地模型开关
enabled = true

# 模型路径
model_path = "~/.ifai/models/qwen2.5-coder-0.5b-ifai-v3-Q4_K_M.gguf"

# 推理参数
max_tokens = 50
temperature = 0.7
top_p = 0.9
context_size = 2048
timeout_secs = 5

# 智能路由器配置
[intelligence_router]
# 自动降级开关（本地失败自动切换云端）
auto_fallback = true

# 本地优先阈值（tokens）
local_threshold = 2000

# 强制云端阈值（tokens）
cloud_threshold = 4000
```

---

## 🔄 升级指南

### 从 v0.2.4 升级

1. **下载新版本**
   ```bash
   # macOS
   curl -LO https://github.com/peterfei/ifai/releases/download/v0.2.5/IfAI_v0.2.5_aarch64.dmg

   # Windows
   curl -LO https://github.com/peterfei/ifai/releases/download/v0.2.5/IfAI_0.2.5_x64-setup.exe

   # Linux
   curl -LO https://github.com/peterfei/ifai/releases/download/v0.2.5/ifai_0.2.5_amd64.AppImage
   ```

2. **安装并启动**

3. **首次启动会自动下载 600MB 模型文件**

4. **配置云端 API**（如需云端功能）
   - 打开设置 → API Keys
   - 配置 OpenAI/Anthropic API Key

### 配置验证

启动后检查本地模型状态：

```bash
# 查看 IfAI 日志
tail -f ~/Library/Logs/ifai/ifai.log  # macOS
tail -f ~/.local/state/ifai/ifai.log   # Linux
tail -f %APPDATA%\ifai\logs\ifai.log   # Windows
```

**正常启动日志：**

```
[INFO] IntelligenceRouter initialized
[INFO] Local LLM model loaded: qwen2.5-coder-0.5b-ifai-v3
[INFO] Model memory usage: 600MB
[INFO] Local inference ready
```

---

## 🐛 已知问题

### 限制

1. **本地模型能力限制**
   - 不支持长篇代码生成（>100 行）
   - 不支持深度逻辑解释
   - 上下文长度限制为 2048 tokens

2. **硬件要求**
   - 需要至少 2GB 可用内存
   - 低端 CPU 可能有推理延迟

### 自动降级保护

系统会在以下情况自动切换到云端：

- ❌ 模型文件不存在
- ⏱️ 本地推理超时（>5 秒）
- 💾 内存不足
- 📉 推理结果置信度低

---

## 📚 技术文档

### 架构文档

- [混合智能架构设计](./docs/HYBRID_AI_ARCHITECTURE.md)
- [智能路由器实现](./docs/INTELLIGENCE_ROUTER.md)
- [本地 LLM 推理](./docs/LLM_INFERENCE_USAGE.md)

### API 文档

- [IntelligenceRouter API](./docs/api/intelligence_router.md)
- [LocalLLMExecutor API](./docs/api/local_llm.md)

---

## 🔗 相关链接

- [GitHub Releases](https://github.com/peterfei/ifai/releases/v0.2.5)
- [项目主页](https://github.com/peterfei/ifai)
- [问题反馈](https://github.com/peterfei/ifai/issues)
- [功能讨论](https://github.com/peterfei/ifai/discussions)

---

## 🙏 致谢

- **Qwen2.5-Coder** 阿里云通义千问团队
- **llama.cpp** Georgi Gerganov 及贡献者
- **IfAI 社区** 所有测试和反馈的用户

---

## 📝 下一步计划

### v0.2.6 规划

- [ ] 支持更多本地模型（Llama-3.1-8B、DeepSeek-Coder）
- [ ] 本地模型多线程推理优化
- [ ] 智能路由器策略可视化
- [ ] Token 使用统计和预测

### 长期规划

- [ ] 本地模型微调工具
- [ ] 自定义路由策略配置
- [ ] 分布式推理支持
- [ ] 企业私有部署方案

---

**若爱 (IfAI) - 不只是编辑器，更是你的混合智能编程伙伴**

*"端云协同，智能调度，让每一次 AI 调用都物尽其用"*
