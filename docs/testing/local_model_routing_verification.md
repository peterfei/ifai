# 本地模型路由修复 - 生产环境验证指南

## 📋 文档说明

本文档面向客户和测试人员，提供本地模型路由修复的详细说明和生产环境测试方法。

**修复版本**: v0.3.0-intelligence-upgrade
**修复日期**: 2026-01-14
**适用模型**: qwen2.5-coder-0.5b-ifai-v3-Q4_K_M.gguf 及后续版本

## ⚠️ 重要：Feature Flag 要求

**本地模型推理功能需要启用 `llm-inference` feature！**

### 启动应用时必须使用以下命令之一：

**方法 1：使用 npm script（推荐）**
```bash
npm run tauri:dev:local-llm
```

**方法 2：手动指定 feature**
```bash
export APP_EDITION=community && tauri dev --features community,llm-inference
```

**方法 3：构建 Release 版本**
```bash
cargo build --features community,llm-inference --release
```

### 如何验证 feature 是否启用

查看开发者控制台日志：
- ✅ **已启用**: `[AgentStream] Calling local model inference...`
- ❌ **未启用**: `[AgentStream] llm-inference feature not enabled, falling back to cloud API`

---

## 🎯 问题描述

### 症状
用户输入自然语言命令（如"执行git status"）时，系统错误地路由到云端 API，而不是使用本地模型。

### 影响
- 产生不必要的网络请求
- 增加延迟和响应时间
- 浪费云端 API 配额
- 违背本地优先的设计原则

---

## 🔍 根本原因分析

### 修复前的逻辑流程

```
用户输入 "执行git status"
    ↓
预处理阶段检测工具调用
    ↓
正则表达式 test_tool_parse 尝试匹配
    ↓
匹配失败（输入不是 agent_xxx(...) 格式）
    ↓
返回 should_use_local: FALSE ❌
    ↓
路由到云端 API
```

### 问题代码（已修复）

**文件**: `src-tauri/src/local_model.rs`

```rust
// 旧代码 (有问题的逻辑)
async fn process_with_local_model(
    messages: Vec<crate::core_traits::ai::Message>,
    reason: String,
) -> Result<PreprocessResult, String> {
    // 直接调用工具解析（无本地推理）
    try_parse_tool_calls(messages, reason).await  // ❌ 如果解析失败，返回 false
}
```

### 修复后的逻辑流程

```
用户输入 "执行git status"
    ↓
预处理阶段检测工具调用
    ↓
正则表达式 test_tool_parse 尝试匹配
    ↓
匹配失败（输入不是显式工具调用格式）
    ↓
但判断为"简单任务"（短文本、明确意图）
    ↓
返回 should_use_local: TRUE ✅
    ↓
本地模型进行推理
    ↓
从模型输出中解析工具调用
    ↓
执行相应操作（bash git status）
```

### 修复后的代码

```rust
// 新代码 (修复后的逻辑)
async fn process_with_local_model(
    messages: Vec<crate::core_traits::ai::Message>,
    reason: String,
) -> Result<PreprocessResult, String> {
    // 策略变更：对于简单任务，先尝试解析显式工具调用
    // 如果解析不到，则返回 should_use_local: true 让本地模型进行推理
    let tool_calls = try_parse_tool_calls_from_messages(&messages).await;

    if !tool_calls.is_empty() {
        // 解析到显式工具调用，直接返回（本地执行）
        return Ok(PreprocessResult {
            should_use_local: true,
            has_tool_calls: true,
            tool_calls: tool_calls.clone(),
            route_reason: format!("{} - 解析到 {} 个工具调用", reason, tool_calls.len()),
        });
    }

    // 没有解析到显式工具调用，但这是简单任务
    // 让本地模型进行推理，根据模型输出决定后续操作
    println!("[LocalModel] No explicit tool calls, will use local model for inference");
    Ok(PreprocessResult {
        should_use_local: true,  // ✅ 关键修复：从 false 改为 true
        has_tool_calls: false,
        tool_calls: vec![],
        local_response: None,
        route_reason: format!("{} - 需要本地模型推理来判断", reason),
    })
}
```

---

## ✅ 验证方法

### 方法 1：使用开发者工具验证（推荐 - 最简单）

#### 步骤 1：打开开发者控制台

1. 启动 IfAI Editor 应用
2. 使用快捷键打开开发者工具：
   - **macOS**: `Cmd + Option + I`
   - **Windows/Linux**: `Ctrl + Shift + I`
3. 切换到 **Console** 标签

#### 步骤 2：执行测试命令

在聊天面板中输入以下测试命令：

```
执行git status
```

#### 步骤 3：观察日志输出

**✅ 正确的日志（修复后）**：
```
[LocalModel] ===== Preprocess Start =====
[LocalModel] Route decision: Local { reason: "简单任务，本地模型处理" }
[LocalModel] No explicit tool calls, will use local model for inference
[AI Chat] Local Model Preprocess:
  - should_use_local: true        ← 关键！应该是 true
  - has_tool_calls: false
  - route_reason: 简单任务，本地模型处理 - 需要本地模型推理来判断
```

**❌ 错误的日志（修复前）**：
```
[LocalModel] No tool calls, routing to cloud API  ← 不应该出现这行
[AI Chat] should_use_local is FALSE, falling back to cloud API  ← 不应该出现这行
```

#### 步骤 4：验证更多测试命令

依次测试以下命令，确认都使用本地模型：

| 测试命令 | 预期工具 | 验证要点 |
|---------|---------|---------|
| `执行git status` | bash | should_use_local: true |
| `读取文件 src/App.tsx` | agent_read_file | should_use_local: true |
| `列出目录 src` | agent_list_dir | should_use_local: true |
| `创建文件 test.txt` | agent_write_file | should_use_local: true |

---

### 方法 2：命令行日志捕获（技术用户）

#### 启动应用并捕获日志

```bash
# macOS/Linux
cd /path/to/ifainew
cargo run 2>&1 | tee local_model_test.log

# 然后在应用中执行命令，查看日志
```

#### 搜索关键日志

```bash
# 搜索错误日志（不应该出现）
grep "No tool calls, routing to cloud" local_model_test.log
# 如果有输出，说明修复未生效

# 搜索正确日志（应该出现）
grep "will use local model for inference" local_model_test.log
# 应该有输出
```

---

### 方法 3：自动化验证脚本

使用项目提供的验证脚本：

```bash
# 运行验证脚本
bash scripts/verify_local_model_routing.sh
```

脚本会显示：
- 测试步骤说明
- 预期日志输出
- 成功/失败判断标准

---

### 方法 4：Playwright E2E 测试

```bash
# 运行 E2E 测试
npm run test:e2e -- local_model_routing

# 查看测试报告
npm run test:e2e:report
```

---

## 📊 验证检查清单

使用此检查清单确认修复是否生效：

### 基础验证

- [ ] 打开开发者控制台 (Cmd+Option+I)
- [ ] 输入测试命令 "执行git status"
- [ ] 确认日志中出现 `should_use_local: true`
- [ ] 确认没有出现 "routing to cloud API"

### 功能验证

- [ ] Git 命令正常执行（如 git status）
- [ ] 文件读取正常工作
- [ ] 目录列出正常显示
- [ ] 没有出现 "API Error" 或网络错误

### 性能验证

- [ ] 响应时间 < 3 秒（本地推理）
- [ ] 没有产生网络请求到云端
- [ ] CPU 使用正常（本地模型在运行）

---

## 🐛 故障排除

### 问题 1：仍然看到 "routing to cloud API"

**可能原因**：
- 应用未重新编译
- 使用了旧版本的本地模型

**解决方案**：
```bash
# 重新编译应用
cargo build --release

# 确认使用正确的模型版本
ls ~/.local/share/ifai/models/
# 应该看到 qwen2.5-coder-0.5b-ifai-v3-Q4_K_M.gguf
```

### 问题 2：日志中没有 should_use_local 信息

**可能原因**：
- 日志级别设置过高
- 使用了 Release 模式（日志被优化掉）

**解决方案**：
```bash
# 使用 Debug 模式运行以查看完整日志
cargo run
```

### 问题 3：本地模型推理失败

**可能原因**：
- 模型文件损坏
- 内存不足
- 模型路径配置错误

**解决方案**：
```bash
# 检查模型文件
ls -lh ~/.local/share/ifai/models/qwen2.5-coder-0.5b-ifai-v3-Q4_K_M.gguf

# 检查应用日志中的模型加载信息
grep "Loading model" local_model_test.log
```

---

## 📝 测试记录模板

测试人员可以使用以下模板记录测试结果：

```markdown
## 本地模型路由修复测试记录

**测试日期**: 2026-01-14
**测试人员**: [姓名]
**应用版本**: v0.3.0-intelligence-upgrade
**模型版本**: qwen2.5-coder-0.5b-ifai-v3-Q4_K_M.gguf

### 测试结果

| 测试命令 | should_use_local | 是否使用本地模型 | 备注 |
|---------|-----------------|----------------|-----|
| 执行git status | ✅ true | ✅ 是 | 正常 |
| 读取文件 src/App.tsx | ✅ true | ✅ 是 | 正常 |
| 列出目录 src | ✅ true | ✅ 是 | 正常 |
| 创建文件 test.txt | ✅ true | ✅ 是 | 正常 |

### 日志输出
[粘贴关键日志输出]

### 问题记录
[记录任何发现的问题]

### 总体结论
✅ 测试通过 / ❌ 测试失败
```

---

## 🔗 相关资源

- **修复 PR**: #[PR-number]
- **相关 Issue**: #[Issue-number]
- **E2E 测试**: `tests/e2e/v0.3.0/local_model_routing.spec.ts`
- **单元测试**: `tests/unit/v0_3_0/local_model_routing.test.ts`
- **核心代码**: `src-tauri/src/local_model.rs:777-808`

---

## 📞 技术支持

如果验证过程中遇到问题，请：

1. 收集完整的日志输出
2. 记录复现步骤
3. 提供系统信息（OS、架构、内存）
4. 通过以下方式联系：
   - GitHub Issues: https://github.com/your-org/ifainew/issues
   - 邮件: support@ifai-editor.com

---

**最后更新**: 2026-01-14
**维护者**: IfAI Editor 开发团队
