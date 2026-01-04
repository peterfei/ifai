# LLM 本地推理使用文档

## 概述

本文档介绍如何在若爱编辑器中使用本地 LLM 推理功能进行代码补全。

## 功能特性

- **本地推理**：使用 llama.cpp 在本地运行 Qwen2.5-Coder 模型
- **零 API 成本**：无需调用云端 API
- **低延迟**：本地推理延迟 < 300ms
- **完全离线**：无需网络连接
- **自动回退**：本地推理失败时自动回退到云端 API

## 系统要求

### 硬件要求
- **内存**：至少 2GB 可用内存
- **存储**：约 600MB 用于模型文件
- **CPU**：支持 SSE4.2 的 x64_64 或 ARM64 处理器

### 支持的平台
- macOS (Apple Silicon + Intel)
- Linux (x64 + ARM64)
- Windows (x64)

## 安装配置

### 1. 编译带 llm-inference feature 的版本

```bash
cd src-tauri
cargo build --features llm-inference
```

### 2. 下载模型文件

将模型文件放置到以下位置：

**macOS / Linux**:
```
~/.ifai/models/qwen2.5-coder-0.5b-ifai-v3-Q4_K_M.gguf
```

**Windows**:
```
C:\Users\<用户名>\.ifai\models\qwen2.5-coder-0.5b-ifai-v3-Q4_K_M.gguf
```

### 3. 创建模型目录（如果不存在）

```bash
# macOS / Linux
mkdir -p ~/.ifai/models

# Windows
mkdir %USERPROFILE%\.ifai\models
```

### 4. 下载模型

从以下位置下载模型：
- Hugging Face: `https://huggingface.co/peterfei/ifai`
- 或使用应用内的模型下载功能

## 配置选项

### 默认配置

```json
{
  "model_path": "~/.ifai/models/qwen2.5-coder-0.5b-ifai-v3-Q4_K_M.gguf",
  "max_tokens": 50,
  "temperature": 0.7,
  "top_p": 0.9,
  "timeout_secs": 5,
  "context_size": 2048,
  "enabled": true
}
```

### 配置说明

| 参数 | 说明 | 默认值 | 范围 |
|------|------|--------|------|
| `model_path` | 模型文件路径 | `~/.ifai/models/...` | - |
| `max_tokens` | 最大生成 token 数 | 50 | 1 - 1000 |
| `temperature` | 采样温度 | 0.7 | 0.0 - 2.0 |
| `top_p` | Top-p 采样参数 | 0.9 | 0.0 - 1.0 |
| `timeout_secs` | 推理超时时间（秒） | 5 | 1 - 60 |
| `context_size` | 上下文大小 | 2048 | 512 - 8192 |
| `enabled` | 是否启用本地推理 | true | - |

### 调整建议

**更快的补全**（降低延迟）:
- 减少超时时间：`timeout_secs: 3`
- 减少最大 token 数：`max_tokens: 30`
- 降低温度：`temperature: 0.3`

**更好的质量**（提高准确率）:
- 增加 token 数：`max_tokens: 100`
- 提高温度：`temperature: 0.9`
- 增加上下文：`context_size: 4096`

## 使用方法

### 在编辑器中使用

1. **启用本地补全**：
   - 打开设置 → AI 设置
   - 启用"优先使用本地模型"

2. **开始编码**：
   - 在编辑器中输入代码
   - 本地模型会自动提供补全建议
   - 补全建议以灰色文本显示

3. **接受补全**：
   - 按 `Tab` 键接受补全
   - 或继续输入忽略补全

### 故障排查

#### 问题：模型未加载

**错误信息**：
```
本地模型文件不存在
```

**解决方法**：
1. 检查模型文件路径是否正确
2. 确认模型文件已下载
3. 检查文件权限

#### 问题：推理超时

**错误信息**：
```
本地推理失败: 推理超时
```

**解决方法**：
1. 增加超时时间配置
2. 关闭其他占用内存的程序
3. 使用更小的模型

#### 问题：内存不足

**错误信息**：
```
本地推理失败: 内存不足
```

**解决方法**：
1. 关闭其他应用程序
2. 减少上下文大小
3. 使用量化程度更高的模型

#### 问题：回退到云端

**日志信息**：
```
[LocalCompletion] ✗ Failed: ...
```

**说明**：这是正常行为，本地推理失败时自动回退到云端 API。

## 日志分析

### 查看日志

在终端中运行应用可以查看详细日志：

```bash
cd src-tauri
cargo run --features llm-inference
```

### 日志解读

**成功日志**：
```
[LocalCompletion] Request received
[LlmInference] generate_completion called
[LlmInference]   prompt length: 42
[LlmInference]   max_tokens: 50
[LocalCompletion] ✓ Success: 18 chars in 234ms
```

**失败日志**：
```
[LocalCompletion] Request received
[LlmInference] Model load failed: 模型文件不存在
[LocalCompletion] ✗ Failed: 本地推理失败
```

## 性能参考

### 首次加载
- 时间：2-5 秒
- 原因：需要加载模型到内存

### 后续推理
- 平均延迟：100-300ms
- 最大延迟：< 500ms (p95)
- 内存占用：~600MB

### 性能优化建议

1. **保持模型在内存中**：避免频繁卸载
2. **使用合理的上下文大小**：2048 通常足够
3. **调整超时设置**：根据硬件性能调整

## 高级用法

### 自定义模型路径

如果模型文件位于其他位置，可以创建配置文件：

**配置文件位置**：
```
~/.ifai/llm-config.json
```

**配置文件内容**：
```json
{
  "model_path": "/path/to/your/model.gguf",
  "max_tokens": 100,
  "temperature": 0.8
}
```

### 编程接口

开发者可以在 Rust 代码中直接调用：

```rust
use llm_inference::generate_completion;

match generate_completion("fn hello() {", 50) {
    Ok(text) => println!("Generated: {}", text),
    Err(e) => eprintln!("Error: {}", e),
}
```

## 常见问题

### Q: 为什么有时候还是使用云端 API？

A: 以下情况会自动回退到云端 API：
- 模型文件不存在
- 本地推理超时
- 本地推理失败
- 内存不足

这是正常行为，确保功能始终可用。

### Q: 本地模型的质量如何？

A: Qwen2.5-Coder 0.5B 是一个小型模型，适合：
- 简单的代码补全
- 常见模式识别
- 语法提示

对于复杂任务，建议使用云端的大模型。

### Q: 能否使用其他模型？

A: 当前版本仅支持 GGUF 格式的 Qwen2.5-Coder 模型。未来版本可能支持更多模型。

### Q: 如何禁用本地推理？

A: 在设置中关闭"优先使用本地模型"选项，或删除模型文件。

## 技术支持

遇到问题？

1. 查看 [故障排查](#故障排查) 部分
2. 检查应用日志
3. 在 GitHub 提交 Issue: https://github.com/ifai/editor/issues

## 更新日志

### v0.5.0 (当前版本)
- ✅ 使用 llama_cpp v0.3.2 库实现
- ✅ 完整的模型加载和推理功能
- ✅ 配置管理模块
- ✅ 完善的错误处理

### v0.4.0
- ✅ 切换到 llama_cpp 库
- ✅ 模块结构优化

### v0.3.0
- ✅ 添加配置管理
- ✅ 实现超时机制
- ✅ 完善错误处理

### v0.2.0
- ✅ 基础推理功能
- ✅ 代码补全集成
- ✅ 自动回退机制

### v0.1.0
- ✅ 模块结构创建
- ✅ 依赖验证
