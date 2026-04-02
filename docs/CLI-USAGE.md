# IfAI CLI 使用指南

## 🚀 快速开始

### 编译 CLI 工具

```bash
# 进入项目目录
cd /path/to/ifainew

# 编译 CLI 工具（社区版，无需 GUI）
cargo build --bin ifai --release

# 编译后的二进制文件位置
# macOS/Linux: target/release/ifai
# Windows: target/release/ifai.exe
```

### 直接运行（开发模式）

```bash
# 使用 DeepSeek（需要设置 DEEPSEEK_API_KEY 环境变量）
export DEEPSEEK_API_KEY=your-deepseek-api-key
cargo run --bin ifai -- -- "请帮我创建一个任务列表"

# 使用 OpenAI（需要设置 OPENAI_API_KEY 环境变量）
export OPENAI_API_KEY=your-openai-api-key
cargo run --bin ifai -- -p openai -- "写一个快速排序算法"

# 使用 Anthropic Claude（需要设置 ANTHROPIC_API_KEY 环境变量）
export ANTHROPIC_API_KEY=your-anthropic-api-key
cargo run --bin ifai -- -p anthropic -- "分析这段代码的性能问题"
```

## 📖 命令行选项

### 基本语法

```bash
ifai [OPTIONS] -- <PROMPT>
```

### 选项说明

| 选项 | 简写 | 说明 | 默认值 |
|------|------|------|--------|
| `--provider` | `-p` | AI 提供商 (deepseek/openai/anthropic) | deepseek |
| `--model` | `-m` | 模型名称 | deepseek-chat |
| `--api-key` | - | API 密钥 | 从环境变量读取 |
| `--base-url` | - | 自定义 API 端点 | 官方端点 |
| `--help` | `-h` | 显示帮助信息 | - |

### 环境变量

| 变量名 | 说明 |
|--------|------|
| `DEEPSEEK_API_KEY` | DeepSeek API 密钥 |
| `OPENAI_API_KEY` | OpenAI API 密钥 |
| `ANTHROPIC_API_KEY` | Anthropic API 密钥 |

## 💡 使用示例

### 示例 1: 基础对话

```bash
# 设置 API Key
export DEEPSEEK_API_KEY=sk-xxxxx

# 简单提问
cargo run --bin ifai -- -- "什么是 Rust 语言？"
```

### 示例 2: 代码生成

```bash
# 使用 GPT-4 生成代码
export OPENAI_API_KEY=sk-xxxxx
cargo run --bin ifai -- -p openai -m gpt-4 -- "用 Python 写一个二分查找算法"
```

### 示例 3: 代码分析

```bash
# 分析项目文件
cargo run --bin ifai -- -- "分析 src/main.rs 的代码结构"

# 生成测试
cargo run --bin ifai -- -- "为 src/lib.rs 生成单元测试"
```

### 示例 4: 任务管理

```bash
# 使用 TodoWrite 工具
cargo run --bin ifai -- -- "帮我创建一个学习 Rust 的任务列表"
```

### 示例 5: 自定义 API 端点

```bash
# 使用兼容 OpenAI 格式的自定义端点
cargo run --bin ifai -- \
  --base-url https://api.example.com/v1 \
  -- "你好，请介绍一下你自己"
```

## 🛠️ 高级用法

### 管道输入

```bash
# 从文件读取输入
echo "分析这段代码" | cargo run --bin ifai -- -- "$(cat main.rs)"

# 使用管道
cat code.py | cargo run --bin ifai -- -- "优化以下代码: $(cat -)"
```

### 与其他工具组合

```bash
# 保存输出到文件
cargo run --bin ifai -- -- "生成一个 README" > README.md

# 结合 grep
cargo run --bin ifai -- -- "列出所有 Rust 项目常用库" | grep -i async
```

### 批量处理

```bash
# 处理多个文件
for file in src/*.rs; do
  echo "分析 $file"
  cargo run --bin ifai -- -- "分析文件: $file"
done
```

## 🔧 配置文件（可选）

你可以创建一个配置文件来避免重复输入参数：

```bash
# ~/.config/ifai/config.toml
provider = "deepseek"
model = "deepseek-chat"
api_key = "sk-xxxxx"  # 或使用环境变量
```

## 📝 与 GUI 版本的区别

| 功能 | CLI 版 | GUI 版 |
|------|--------|--------|
| AI 对话 | ✅ | ✅ |
| 工具调用 | ✅ | ✅ |
| 流式响应 | ✅ | ✅ |
| 文件编辑 | ❌ | ✅ |
| 代码预览 | ❌ | ✅ |
| 多模态 | ❌ | ✅ |
| 任务管理 | ✅ (TodoWrite) | ✅ |
| 便携性 | ✅ 高 | ❌ 低 |

## 🐛 故障排除

### 问题 1: 编译错误

```bash
# 确保使用正确的 feature
cargo build --bin ifai --release --features community
```

### 问题 2: API Key 未找到

```bash
# 方式 1: 设置环境变量
export DEEPSEEK_API_KEY=your-key

# 方式 2: 使用命令行参数
cargo run --bin ifai -- --api-key your-key -- "prompt"
```

### 问题 3: 模型不存在

检查模型名称是否正确：
- DeepSeek: `deepseek-chat`, `deepseek-coder`
- OpenAI: `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`
- Anthropic: `claude-3-opus-20240229`, `claude-3-sonnet-20240229`

## 🚀 性能优化

### 编译优化

```bash
# 使用 LTO（链接时优化）
cargo build --bin ifai --release --features community \
  --config profile.release.lto=true

# 减小二进制文件大小
cargo build --bin ifai --release --features community \
  --config profile.release.strip=true
```

### 运行时优化

```bash
# 设置线程池大小
export TOKIO_WORKER_THREADS=4

# 启用日志
export RUST_LOG=debug
cargo run --bin ifai -- -- "prompt"
```

## 📦 分发

### 创建独立二进制

```bash
# 编译并压缩
cargo build --bin ifai --release --features community
upx --best --lzma target/release/ifai  # 需要先安装 upx

# 复制到 PATH
sudo cp target/release/ifai /usr/local/bin/
```

### 跨平台编译

```bash
# Linux (在 macOS 上)
cargo build --bin ifai --release --features community \
  --target x86_64-unknown-linux-gnu

# Windows (在 macOS 上)
cargo build --bin ifai --release --features community \
  --target x86_64-pc-windows-msvc
```

## 🔗 相关资源

- [IfAI GitHub](https://github.com/your-org/ifainew)
- [DeepSeek API](https://platform.deepseek.com/)
- [OpenAI API](https://platform.openai.com/)
- [Anthropic API](https://www.anthropic.com/)

## 📄 许可证

MIT License - 详见项目根目录 LICENSE 文件
