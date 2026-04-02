# IfAI CLI - 交互式使用示例

## 🎯 实际对话效果

```bash
$ ifai
🤖 IfAI 交互式模式 v0.2.0
📦 Provider: deepseek | Model: deepseek-chat
💡 输入 /help 查看可用命令，/exit 退出

>>> 你好
你好！我是 IfAI，一个 AI 助手。我可以帮助你解答问题、编写代码、分析文本等。有什么我可以帮助你的吗？

>>> 解释一下 Rust 的所有权
Rust 的所有权（Ownership）是其最核心的特性之一，它让 Rust 能够在没有垃圾回收器的情况下保证内存安全。

所有权的三个规则：
1. Rust 中的每个值都有一个所有者（owner）
2. 值在同一时间只能有一个所有者
3. 当所有者离开作用域时，值将被丢弃

举个简单的例子：

```rust
let s1 = String::from("hello");
let s2 = s1; // s1 的所有权转移给 s2
// println!("{}", s1); // 错误！s1 不再有效
println!("{}", s2); // 正确
```

>>> 能举个更具体的例子吗
当然！让我用一个更实际的例子：

```rust
fn main() {
    let vec = vec![1, 2, 3];
    let sum = calculate_sum(vec); // 所有权转移
    // println!("{:?}", vec); // 错误！vec 已经被移动
    println!("Sum: {}", sum);
}

fn calculate_sum(numbers: Vec<i32>) -> i32 {
    numbers.iter().sum()
}
```

如果你想继续使用 `vec`，可以这样修改：
```rust
fn calculate_sum(numbers: &Vec<i32>) -> i32 {  // 借用而不是获取所有权
    numbers.iter().sum()
}

// 然后在 main 中
let sum = calculate_sum(&vec);  // 传递引用
println!("{:?}", vec);  // 现在可以继续使用
```

>>> /clear
✅ 对话历史已清空

>>> 现在讲讲 Rust 的生命周期
Rust 的生命周期（Lifetime）是另一个重要概念...

>>> /provider openai
✅ Provider 已切换为: openai

>>> /model gpt-4o
✅ Model 已切换为: gpt-4o

>>> /exit
👋 再见！
```

## 📝 输出格式说明

### 交互式模式输出
```
>>> <用户输入>
<AI 流式回复>
```

### 工具调用输出
```
>>> 帮我创建任务列表
我来为您创建任务列表...
🔧 工具调用: TodoWrite (call_xxx)
✅ 工具完成: call_xxx => Updated task list with 3 task(s)

任务已创建完成！包含 3 个任务：
1. ⏳ 任务1
2. ⏳ 任务2
3. ⏳ 任务3
```

### 错误输出
```
>>> <用户输入>
❌ 错误: API request failed: 401 Unauthorized
```

## 🎨 与其他 CLI 对比

### Claude Code 风格
```bash
# Claude Code
Claude> 你好
Hello! How can I help you today?

Claude> 什么是 Rust？
Rust is a systems programming language...
```

### IfAI CLI 风格
```bash
# IfAI CLI
>>> 你好
你好！我是 IfAI...

>>> 什么是 Rust？
Rust 是一门系统编程语言...
```

### OpenAI CLI 风格
```bash
# OpenAI CLI
You: 你好
ChatGPT: 你好！有什么可以帮助你的？

You: 什么是 Rust？
ChatGPT: Rust 是一门系统编程语言...
```

## 🔧 可自定义的输出（可选）

如果需要更详细的输出，可以修改 `src/bin/ifai.rs`：

```rust
// 添加会话编号
println!("🤖 [{}] Assistant:", prompt_count);

// 添加时间戳
use chrono::Local;
println!("[{}] 开始回复...", Local::now().format("%H:%M:%S"));

// 添加 Token 使用统计
println!("📊 Tokens: {}", tokens_used);
```

## 💡 使用技巧

### 1. 快速清屏
```bash
>>> clear && >>> 你的下一个问题
```

### 2. 批量处理
```bash
>>> /provider deepseek
>>> /model deepseek-coder
>>> 分析这个函数的性能
```

### 3. 保存对话
```bash
# 在另一个终端记录
script ifai-session.log
# 运行 ifai
# ... 对话 ...
# exit
# 日志保存在 ifai-session.log
```

## 🎯 最佳实践

1. **保持对话简洁** - 每个问题聚焦一个主题
2. **适时清空历史** - 长对话后用 `/clear` 重新开始
3. **利用上下文** - AI 会记住之前的对话，可以追问
4. **切换模型** - 简单问题用轻量模型，复杂问题用强模型

## 🚀 性能对比

| 操作 | 响应时间 | 说明 |
|------|----------|------|
| 简单对话 | <1s | DeepSeek 较快 |
| 代码生成 | 2-5s | 取决于代码长度 |
| 工具调用 | <1s | 本地执行 |
| 上下文查询 | <2s | 包含历史 |

---

**享受与 IfAI 的对话吧！** 🎉
