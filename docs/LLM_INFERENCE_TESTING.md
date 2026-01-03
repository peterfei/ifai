# LLM 本地推理测试指南

## 测试环境准备

### 1. 编译带 feature 的版本

```bash
cd src-tauri
cargo build --features llm-inference
```

### 2. 准备模型文件

将 `qwen2.5-coder-0.5b-ifai-v3-Q4_K_M.gguf` 放到：
```
~/.ifai/models/
```

### 3. 启动应用并查看日志

```bash
cd src-tauri
cargo run --features llm-inference
```

## 单元测试

### 运行所有单元测试

```bash
cargo test --features llm-inference --package ifainew --lib llm_inference
```

### 运行特定测试

```bash
# 测试模型加载
cargo test --features llm-inference test_default_model_path

# 测试错误处理
cargo test --features llm-inference test_error_display

# 测试配置验证
cargo test --features llm-inference test_config_validation
```

## 功能测试

### 测试 1：模型加载

**目标**：验证模型能正确加载

**步骤**：
1. 确保模型文件存在于 `~/.ifai/models/`
2. 启动应用
3. 查看日志输出

**预期结果**：
```
[LlmInference] Loading model from: /Users/xxx/.ifai/models/qwen2.5-coder-0.5b-ifai-v3-Q4_K_M.gguf
[LlmInference] Model file size: 384 MB
[LlmInference] ✓ Model loaded successfully
[LlmInference] ✓ Context created successfully
```

**失败情况**：
```
[LlmInference] 模型加载失败: 模型文件不存在
```

**解决方案**：检查模型文件路径

---

### 测试 2：基础文本生成

**目标**：验证模型能生成文本

**步骤**：
1. 在编辑器中输入：`fn hello() {`
2. 等待补全建议
3. 按 Tab 接受补全

**预期结果**：
- 1-3 秒内出现灰色补全文本
- 补全内容合理（如：`    println!("Hello, world!");`）
- 日志显示成功

**日志输出**：
```
[LocalCompletion] Request received
[LocalCompletion] Prompt length: 13
[LlmInference] generate_completion called
[LlmInference]   prompt length: 13
[LlmInference]   max_tokens: 50
[LocalCompletion] ✓ Success: 28 chars in 234ms
```

---

### 测试 3：超时机制

**目标**：验证超时保护正常工作

**步骤**：
1. 将配置中的超时设置为 1 秒
2. 发送一个很长的 prompt（> 1000 字符）
3. 观察行为

**预期结果**：
- 1 秒后返回超时错误
- 自动回退到云端 API
- 应用不卡死

**日志输出**：
```
[LocalCompletion] Request received
[LocalCompletion] ✗ Failed after 1.2s: 推理超时
[Fallback] Switching to cloud API
```

---

### 测试 4：错误回退

**目标**：验证错误时正确回退到云端

**测试场景**：

#### 场景 A：模型文件不存在
1. 删除或重命名模型文件
2. 尝试代码补全
3. 验证回退到云端 API

**预期日志**：
```
[LocalCompletion] Request received
[LocalCompletion] ✗ Failed: 本地模型文件不存在
[Fallback] Using cloud API
[CloudAPI] Request sent
```

#### 场景 B：模型文件损坏
1. 用随机字节覆盖模型文件
2. 尝试代码补全
3. 验证回退到云端 API

**预期日志**：
```
[LocalCompletion] Request received
[LlmInference] Model load failed: llama.cpp 加载失败
[LocalCompletion] ✗ Failed: 本地推理失败
[Fallback] Using cloud API
```

---

### 测试 5：内存管理

**目标**：验证内存使用合理

**工具**：Activity Monitor (macOS) 或 htop (Linux)

**步骤**：
1. 启动应用，记录初始内存
2. 触发第一次补全（模型加载）
3. 记录内存增长
4. 触发 10 次补全
5. 记录最终内存

**预期结果**：
- 初始内存：~100MB
- 加载后：~700MB（增长约 600MB）
- 10 次补全后：~700MB（无明显增长）

---

### 测试 6：并发请求

**目标**：验证并发请求不会导致崩溃

**步骤**：
1. 在多个编辑器窗口同时输入
2. 快速触发多次补全
3. 观察应用行为

**预期结果**：
- 请求被排队或优雅地拒绝
- 应用不崩溃
- 日志清晰

---

### 测试 7：长时间运行

**目标**：验证稳定性

**步骤**：
1. 启动应用
2. 连续进行 100 次补全
3. 记录成功率和平均延迟

**预期结果**：
- 成功率 > 95%
- 平均延迟 < 500ms
- 无内存泄漏

---

## 性能基准测试

### 基准测试脚本

```bash
#!/bin/bash
# benchmark.sh

echo "开始性能基准测试..."

total=0
success=0

for i in {1..100}; do
    start=$(date +%s%N)

    # 调用补全 API（需要实现测试接口）
    result=$(curl -s -X POST http://localhost:3000/api/completion \
        -H "Content-Type: application/json" \
        -d '{"prompt":"fn test() {","max_tokens":50}')

    end=$(date +%s%N)
    elapsed=$((($end - $start) / 1000000))

    total=$((total + elapsed))

    if echo "$result" | grep -q "success"; then
        success=$((success + 1))
    fi

    echo "请求 $i: ${elapsed}ms"
done

avg=$((total / 100))
rate=$((success * 100 / 100))

echo ""
echo "=== 测试结果 ==="
echo "总请求数: 100"
echo "成功数: $success"
echo "成功率: ${rate}%"
echo "平均延迟: ${avg}ms"
```

### 性能目标

| 指标 | 目标 | 可接受 | 不可接受 |
|------|------|--------|----------|
| 平均延迟 | < 200ms | 200-500ms | > 500ms |
| 成功率 | > 98% | 95-98% | < 95% |
| P95 延迟 | < 400ms | 400-800ms | > 800ms |
| 内存占用 | < 700MB | 700MB-1GB | > 1GB |

---

## 集成测试

### 与前端集成测试

**测试目标**：验证 Tauri 命令正确工作

**测试步骤**：
1. 启动应用
2. 打开开发者工具
3. 在控制台执行：

```javascript
// 测试本地补全
invoke('local_code_completion', {
    prompt: 'fn hello() {\n',
    maxTokens: 50
}).then(result => {
    console.log('Success:', result);
}).catch(error => {
    console.error('Error:', error);
});
```

**预期结果**：
- 成功：返回生成的文本
- 失败：返回清晰的错误信息

---

## 压力测试

### 高并发测试

```bash
# 使用 Apache Bench 进行并发测试
ab -n 1000 -c 10 -p test_payload.json -T application/json \
   http://localhost:3000/api/completion
```

**test_payload.json**:
```json
{
    "prompt": "fn test() {",
    "max_tokens": 50
}
```

---

## 回归测试清单

每次修改代码后，运行以下测试：

- [ ] 单元测试全部通过
- [ ] 模型能正常加载
- [ ] 基础补全功能正常
- [ ] 超时机制正常工作
- [ ] 错误能正确回退
- [ ] 内存占用在预期范围内
- [ ] 10 次连续补全无崩溃
- [ ] 日志输出清晰完整

---

## 测试报告模板

```markdown
# LLM 本地推理测试报告

**测试日期**：YYYY-MM-DD
**测试版本**：v0.3.0
**测试环境**：macOS 14.0, M1, 16GB RAM

## 功能测试

| 测试项 | 状态 | 备注 |
|--------|------|------|
| 模型加载 | ✅ 通过 | 加载时间 3.2s |
| 文本生成 | ✅ 通过 | 平均延迟 245ms |
| 超时机制 | ✅ 通过 | 1s 超时正常 |
| 错误回退 | ✅ 通过 | 回退到云端成功 |
| 内存管理 | ✅ 通过 | 占用 680MB |

## 性能测试

| 指标 | 测试值 | 目标值 | 状态 |
|------|--------|--------|------|
| 平均延迟 | 245ms | < 300ms | ✅ |
| P95 延迟 | 412ms | < 500ms | ✅ |
| 成功率 | 97% | > 95% | ✅ |
| 内存占用 | 680MB | < 800MB | ✅ |

## 问题和建议

1. 无

## 结论

通过所有测试，可以发布。
```

---

## 调试技巧

### 启用详细日志

在 `src-tauri/src/lib.rs` 中添加：

```rust
fn main() {
    env_logger::init(); // 添加这一行
    // ...
}
```

然后运行：
```bash
RUST_LOG=debug cargo run --features llm-inference
```

### 使用 Rust 调试器

```bash
cargo build --features llm-inference
lldb target/debug/ifainew
```

### 内存分析

```bash
# 使用 Instruments (macOS)
instruments -t "Allocations" target/debug/ifainew

# 使用 valgrind (Linux)
valgrind --leak-check=full target/debug/ifainew
```

---

## 常见问题排查

### Q: 测试时模型加载失败

**检查清单**：
1. 模型文件是否存在
2. 文件权限是否正确
3. 文件格式是否正确（GGUF）
4. 磁盘空间是否充足

### Q: 性能测试结果不理想

**优化建议**：
1. 检查是否启用了硬件加速
2. 减少上下文大小
3. 降低模型精度
4. 关闭其他应用

### Q: 随机性测试失败

**处理方法**：
1. 设置随机种子（开发测试）
2. 增加测试次数
3. 使用统计方法分析结果
