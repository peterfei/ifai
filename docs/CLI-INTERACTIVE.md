# 🎉 IfAI 交互式 CLI

## ✅ 特性

- **交互式对话** - 持续的多轮对话，保持上下文
- **命令历史** - 使用上下箭头浏览历史记录
- **会话管理** - 清空历史、切换模型/提供商
- **流式响应** - 实时显示 AI 回复
- **工具调用** - 支持 TodoWrite 等工具

## 🚀 快速开始

### 1. 启动交互式模式

```bash
# 默认使用 DeepSeek
export DEEPSEEK_API_KEY=sk-xxxxx
./target/release/ifai

# 或指定 OpenAI
export OPENAI_API_KEY=sk-xxxxx
./target/release/ifai -p openai
```

### 2. 交互式对话示例

```bash
$ ifai
🤖 IfAI 交互式模式 v0.2.0
📦 Provider: deepseek | Model: deepseek-chat
💡 输入 /help 查看可用命令，/exit 退出

>>> 你好
📍 [1] User: 你好
🤖 [1] Assistant: 你好！我是 IfAI，有什么可以帮助你的吗？

>>> 什么是 Rust？
📍 [2] User: 什么是 Rust？
🤖 [2] Assistant: Rust 是一门系统编程语言，专注于安全、并发和性能...

>>> Rust 和 Python 的区别？
📍 [3] User: Rust 和 Python 的区别？
🤖 [3] Assistant: Rust 和 Python 是两种不同类型的编程语言...（记住之前讨论了 Rust）

>>> /exit
👋 再见！
```

### 3. 交互式命令

| 命令 | 说明 |
|------|------|
| `/exit` 或 `/quit` | 退出交互模式 |
| `/clear` 或 `/reset` | 清空对话历史 |
| `/provider <name>` | 切换 AI 提供商 |
| `/model <name>` | 切换模型 |
| `/help` | 显示帮助 |

### 4. 高级用法

#### 切换提供商

```bash
>>> /provider openai
✅ Provider 已切换为: openai

>>> /model gpt-4o
✅ Model 已切换为: gpt-4o
```

#### 清空历史重新开始

```bash
>>> /clear
✅ 对话历史已清空
>>> （现在是一个全新的会话）
```

#### 使用工具

```bash
>>> 帮我创建一个任务列表
🤖 Assistant: 我来为您创建一个结构化的任务列表。
🔧 工具调用: TodoWrite (call_xxx)
✅ 工具完成: call_xxx => Updated task list with 3 task(s)

>>> 查看当前任务
（TodoWrite 会记住之前的任务）
```

## 🎯 与 Claude Code 对比

| 特性 | IfAI CLI | Claude Code |
|------|----------|-------------|
| 交互式对话 | ✅ | ✅ |
| 命令历史 | ✅ rustyline | ✅ readline |
| 上下文保持 | ✅ | ✅ |
| 工具调用 | ✅ | ✅ |
| 流式响应 | ✅ | ✅ |
| 文件编辑 | ❌ | ✅ |
| 多模态 | ❌ | ✅ |
| SSH 友好 | ✅ | ✅ |

## 📝 使用场景

### 1. SSH 远程开发

```bash
# 在远程服务器上
ssh user@server
# 上传 ifai 二进制
scp target/release/ifai user@server:~/
# 登录后使用
ssh user@server
./ifai
```

### 2. 代码审查

```bash
$ ifai
>>> 分析这个 Rust 文件的代码结构
>>> （粘贴 src/main.rs 的内容）
>>> 找出潜在的性能问题
>>> 推荐优化方案
```

### 3. 学习辅助

```bash
$ ifai
>>> 解释一下 Rust 的所有权系统
>>> 能举个简单的例子吗？
>>> 和 C++ 的智能指针有什么区别？
>>> /clear
>>> 现在讲讲 Rust 的生命周期
```

### 4. 调试帮助

```bash
$ ifai
>>> 我的代码编译错误了
>>> （粘贴错误信息）
>>> 帮我分析问题
>>> 给出修复建议
```

## 🎨 提示符优化（可选）

你可以自定义提示符颜色，在 `~/.zshrc` 或 `~/.bashrc` 中添加：

```bash
# 彩色提示符函数
ifai_prompt() {
    echo -ne "\033[1;36m>>> \033[0m"
}

# 使用（需要修改 CLI 代码支持）
```

## 🔧 高级配置

### 自动补全（未来功能）

```bash
# 可以添加文件名、命令的自动补全
>>> 你好，我现在要分析文件 src/<TAB>
>>> src/main.rs  src/lib.rs  src/utils.rs
```

### 多行输入（未来功能）

```bash
>>> 开始多行输入（以 END 结束）
>>> fn main() {
>>>     println!("Hello");
>>> }
>>> END
```

### 会话保存/恢复（未来功能）

```bash
# 保存会话
>>> /save my-session

# 恢复会话
$ ifai --load my-session
```

## 🐛 故障排除

### 问题：上下文丢失

如果 AI 似乎忘记了之前的对话：
```bash
>>> /clear   # 清空历史重新开始
```

### 问题：历史记录不保存

检查当前目录是否有写入权限：
```bash
ls -la .ifai-history
```

### 问题：输入卡死

按 `Ctrl+C` 发送中断信号，然后重新输入。

## 📦 性能优化

### 编译优化版本

```bash
# 使用 LTO 和 strip
cargo build --bin ifai --release --features community \
  --config profile.release.lto=true \
  --config profile.release.strip=true

# 使用 UPX 压缩
upx --best --lzma target/release/ifai
```

## 🎯 最佳实践

1. **设置合理的上下文窗口**：长对话后使用 `/clear` 清空历史
2. **使用合适的模型**：简单查询用 `deepseek-chat`，复杂任务用 `gpt-4o`
3. **保存重要对话**：复制输出到文件保存
4. **利用工具**：使用 TodoWrite、Read 等工具提高效率

## 📚 更多资源

- [CLI-USAGE.md](./CLI-USAGE.md) - 完整使用指南
- [CLI-QUICK-START.md](./CLI-QUICK-START.md) - 快速开始

---

**现在就开始体验吧！**

```bash
export DEEPSEEK_API_KEY=your-key
./target/release/ifai
```
