# 🎉 IfAI CLI 工具已创建！

## ✅ 编译状态

**编译成功！** CLI 工具已支持**交互式对话**，类似 Claude Code！

## 🚀 快速开始

### 1. 编译 Release 版本（推荐）

```bash
cd src-tauri
cargo build --bin ifai --release --features community

# 二进制文件位置
./target/release/ifai
```

### 2. 开发模式运行

```bash
cd src-tauri
cargo run --bin ifai -- --help
```

### 3. 设置 API Key

```bash
# 方式 1: 环境变量（推荐）
export DEEPSEEK_API_KEY=sk-xxxxx

# 方式 2: 命令行参数
cargo run --bin ifai -- --api-key sk-xxxxx -- "你好"
```

### 4. 基本使用

#### 单次执行模式

```bash
# 简单对话
cargo run --bin ifai -- -- "什么是 Rust 语言？"

# 使用特定模型
cargo run --bin ifai -- -p deepseek -m deepseek-coder -- "写一个二分查找"

# 使用 OpenAI
export OPENAI_API_KEY=sk-xxxxx
cargo run --bin ifai -- -p openai -m gpt-4o -- "分析这段代码"

# 使用 TodoWrite 工具
cargo run --bin ifai -- -- "帮我创建一个学习 Rust 的任务列表"
```

#### 交互式模式（推荐！）

```bash
# 启动交互式对话（类似 Claude Code）
export DEEPSEEK_API_KEY=sk-xxxxx
cargo run --bin ifai

# 交互式对话示例
$ ifai
🤖 IfAI 交互式模式 v0.2.0
📦 Provider: deepseek | Model: deepseek-chat
💡 输入 /help 查看可用命令，/exit 退出

>>> 你好
🤖 [1] Assistant: 你好！我是 IfAI，有什么可以帮助你的吗？

>>> 解释一下 Rust 的所有权
🤖 [2] Assistant: Rust 的所有权是其核心特性...

>>> 能举个具体的例子吗？
🤖 [3] Assistant: 当然！比如这段代码...（记得之前讨论了所有权）

>>> /exit
👋 再见！
```

**交互式模式的优势：**
- ✅ 持续对话，保持上下文
- ✅ 命令历史（上下箭头）
- ✅ 会话管理（/clear 清空历史）
- ✅ 实时切换模型/provider
- ✅ 更接近 Claude Code 的体验

## 📋 命令行选项

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `-p, --provider` | AI 提供商 (deepseek/openai/anthropic) | deepseek |
| `-m, --model` | 模型名称 | deepseek-chat |
| `--api-key` | API 密钥 | 环境变量 |
| `--base-url` | 自定义 API 端点 | 官方端点 |
| `-h, --help` | 显示帮助 | - |

## 📦 支持的模型

### DeepSeek
- `deepseek-chat` - 对话模型
- `deepseek-coder` - 代码模型

### OpenAI
- `gpt-4o` - 最新 GPT-4
- `gpt-4o-mini` - 轻量版
- `gpt-4-turbo` - GPT-4 Turbo

### Anthropic
- `claude-3-opus-20240229` - Claude 3 Opus
- `claude-3-sonnet-20240229` - Claude 3 Sonnet

## 🛠️ 高级用法

### 安装到系统 PATH

```bash
# 编译 release 版本
cargo build --bin ifai --release --features community

# 复制到系统路径
sudo cp target/release/ifai /usr/local/bin/

# 现在可以在任何地方使用
ifai -- "你好，世界"
```

### 优化二进制大小

```bash
# 使用 UPX 压缩（需要先安装 UPX）
brew install upx  # macOS
cargo build --bin ifai --release --features community
upx --best --lzma target/release/ifai

# 压缩后大小通常减少 60-80%
```

### 创建别名

```bash
# 在 ~/.zshrc 或 ~/.bashrc 中添加
alias ai='ifai'
alias ai-deepseek='ifai -p deepseek'
alias ai-gpt='ifai -p openai -m gpt-4o'

# 使用
ai -- "快速排序算法"
ai-gpt -- "Python 装饰器"
```

### 批处理

```bash
# 处理多个文件
for file in src/*.rs; do
  echo "分析 $file"
  ifai -- "分析这个文件的代码结构: $(cat $file | head -100)"
done
```

## 🎯 内置工具

CLI 工具支持所有 IfAI 工具，包括：

- ✅ **TodoWrite** - 任务管理
- ✅ **Read** - 文件读取
- ✅ **Grep** - 代码搜索
- ✅ **Glob** - 文件匹配

## 📊 与 GUI 版本对比

| 特性 | CLI | GUI |
|------|-----|-----|
| **AI 对话** | ✅ | ✅ |
| **工具调用** | ✅ | ✅ |
| **流式响应** | ✅ | ✅ |
| **终端集成** | ✅ | ❌ |
| **脚本自动化** | ✅ | ❌ |
| **SSH 远程** | ✅ | ❌ |
| **文件编辑** | ❌ | ✅ |
| **代码预览** | ❌ | ✅ |
| **多模态** | ❌ | ✅ |

## 🚀 最佳使用场景

1. **SSH 远程服务器** - 在没有 GUI 的服务器上使用
2. **CI/CD 流程** - 自动化代码分析和生成
3. **快速查询** - 不想打开 GUI 时快速提问
4. **脚本集成** - 与其他命令行工具组合使用
5. **开发调试** - 测试 AI 功能和工具

## 📝 示例脚本

```bash
#!/bin/bash
# ai-code-review.sh - 代码审查脚本

for file in "$@"; do
  echo "🔍 审查: $file"
  ifai -- "请审查以下代码的安全性、性能和最佳实践: $(cat $file)"
  echo "---"
done
```

使用方式：
```bash
chmod +x ai-code-review.sh
./ai-code-review.sh src/main.rs src/lib.rs
```

## 🐛 故障排除

### 问题：找不到 API Key

```bash
# 检查环境变量
echo $DEEPSEEK_API_KEY

# 临时设置
export DEEPSEEK_API_KEY=your-key

# 永久设置（添加到 ~/.zshrc）
echo 'export DEEPSEEK_API_KEY=your-key' >> ~/.zshrc
```

### 问题：编译失败

```bash
# 清理并重新编译
cargo clean
cargo build --bin ifai --release --features community
```

### 问题：运行时错误

```bash
# 启用调试日志
export RUST_LOG=debug
cargo run --bin ifai -- -- "test"
```

## 🔗 相关资源

- **完整文档**: [CLI-USAGE.md](./CLI-USAGE.md)
- **DeepSeek API**: https://platform.deepseek.com/
- **OpenAI API**: https://platform.openai.com/

## 📄 许可证

MIT License
