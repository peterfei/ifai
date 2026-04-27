# IfAI CLI 测试框架改进方案

## 现状分析

当前 ifai CLI 测试存在的问题：
- 测试生成器设计用于单次命令模式
- REPL 测试需要真正的 TTY，自动化困难
- 压缩测试无法真正验证 100+ 消息触发

## Codex 的测试方法（参考）

### 核心思想
**不模拟 stdin，而是通过编程方式调用 API，验证会话状态**

### 关键模式

```typescript
// 1. Mock HTTP 服务器捕获请求
const { url, close, requests } = await startResponsesTestProxy({...});

// 2. Thread API 管理会话
const thread = client.startThread();
await thread.run("first");   // 第 1 轮
await thread.run("second");  // 第 2 轮

// 3. 验证第二次请求包含第一次的响应
assert(requests[1].json.input[1].content === "First response");
```

## 推荐方案：库 + CLI 分离架构

### 架构设计

```
ifai/
├── src/
│   └── lib.rs           # 库 API（可以被测试直接调用）
│   └── session.rs       # 会话管理（移动到库中）
├── src/
│   └── bin/
│       └── ifai/
│           └── main.rs   # CLI 二进制（薄包装）
└── tests/
    └── lib_test.rs      # 真正的多轮对话测试
```

### 库 API 设计

```rust
// src/lib.rs
pub struct IfaiClient {
    session: Arc<RwLock<Session>>,
    provider: String,
    model: String,
}

impl IfaiClient {
    /// 创建新客户端（使用默认配置）
    pub fn new() -> Result<Self>;

    /// 使用自定义配置创建客户端
    pub fn with_config(config: IfaiConfig) -> Result<Self>;

    /// 使用自定义 API endpoint（用于测试）
    pub fn with_mock_url(base_url: String) -> Result<Self>;

    /// 发送消息（返回流式响应）
    pub async fn send_message(&self, text: &str) -> Result<ResponseStream>;

    /// 发送消息（阻塞等待完成）
    pub async fn send_message_blocking(&self, text: &str) -> Result<Response>;

    /// 获取当前会话状态
    pub fn session_state(&self) -> SessionState;

    /// 手动触发压缩
    pub async fn compress(&self) -> Result<CompressionStats>;
}

// 测试辅助
impl IfaiClient {
    /// 创建测试客户端（自动设置 Mock）
    pub fn for_test() -> (Self, MockServer);
}
```

### 测试示例

```rust
// tests/lib_test.rs
use ifai::{IfaiClient, MockServer};

#[tokio::test]
async fn test_multi_turn_conversation() {
    // 1. 创建 Mock 服务器
    let (client, mock) = IfaiClient::for_test().await;

    // 2. 设置 Mock 响应序列
    mock.setup_sequence(vec![
        MockResponse::text("Hello!"),           // 第 1 轮响应
        MockResponse::text("I remember!"),     // 第 2 轮响应
        MockResponse::compression_triggered(), // 第 3 轮触发压缩
        MockResponse::text("After compression"), // 第 4 轮响应
    ]).await;

    // 3. 执行多轮对话
    client.send_message_blocking("Hi").await.unwrap();
    client.send_message_blocking("What did I say?").await.unwrap();

    // 4. 验证第 2 轮请求包含了第 1 轮的响应
    let requests = mock.captured_requests().await;
    assert_eq!(requests.len(), 2);
    assert_eq!(requests[1].messages.len(), 3); // user + assistant + user
    assert!(requests[1].messages[1].content.contains("Hello!"));
}

#[tokio::test]
async fn test_compression_triggered_by_message_count() {
    let (client, mock) = IfaiClient::for_test().await;

    // 发送 101 条消息
    for i in 1..=105 {
        client.send_message_blocking(&format!("message {}", i)).await.unwrap();
    }

    // 验证压缩被触发
    let events = mock.captured_events().await;
    assert!(events.iter().any(|e| e.contains("正在自动压缩")));

    // 验证压缩后会话状态
    let state = client.session_state();
    assert!(state.message_count <= 50); // 保留最近 50 条
}

#[tokio::test]
async fn test_manual_compact_command() {
    let (client, _mock) = IfaiClient::for_test().await;

    // 发送少量消息
    client.send_message_blocking("msg 1").await.unwrap();
    client.send_message_blocking("msg 2").await.unwrap();

    // 手动触发压缩
    let stats = client.compress().await.unwrap();

    // 验证压缩统计
    assert!(stats.before_tokens > stats.after_tokens);
    assert!(stats.compression_ratio > 0.5); // 至少减少 50%
}
```

### CLI 保持不变

```rust
// src/bin/ifai/main.rs
fn main() -> Result<()> {
    let action = parse_args()?;

    match action {
        CliAction::Repl => run_repl(),  // REPL 模式使用 rustyline
        CliAction::Prompt { text, .. } => {
            // 单次模式：使用库 API
            let client = IfaiClient::new()?;
            let response = client.send_message_blocking(&text)?;
            println!("{}", response.text);
        }
        CliAction::Version => show_version(),
        // ...
    }
}
```

## 实施步骤

### Phase 1: 提取库 API（1-2 天）
- [ ] 创建 `src/lib.rs`
- [ ] 移动 `Session` 到库中
- [ ] 实现 `IfaiClient`
- [ ] 添加测试辅助方法

### Phase 2: 重写测试（1-2 天）
- [ ] 创建 `tests/lib_test.rs`
- [ ] 实现多轮对话测试
- [ ] 实现压缩测试
- [ ] 实现 Mock 服务器

### Phase 3: 验证（1 天）
- [ ] 运行所有测试
- [ ] 手动测试 CLI
- [ ] 性能基准测试

## 兼容性

保持向后兼容：
- ✅ CLI 命令行参数不变
- ✅ REPL 体验不变
- ✅ 配置文件格式不变
- ✅ 环境变量不变

## 测试覆盖率提升

| 功能 | 当前 | 改进后 |
|------|------|--------|
| 多轮对话 | ❌ 无法测试 | ✅ 完整覆盖 |
| 会话压缩 | ⚠️ 仅 YAML | ✅ 真实验证 |
| 工具调用 | ⚠️ 简单测试 | ✅ 完整流程 |
| Token 统计 | ❌ 无法测试 | ✅ 精确验证 |

## 参考

- Codex SDK: `/Users/mac/project/aieditor/codex/sdk/typescript/tests/`
- Mock 服务器模式: `responsesProxy.ts`
- Thread API: `run.test.ts`
