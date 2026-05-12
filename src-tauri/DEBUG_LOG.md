# IfAI 调试日志使用说明

## 功能

IfAI 现在支持异步调试日志，可以实时监控压缩和 token 使用情况，帮助诊断 HTTP 400 错误等问题。

## 日志位置

默认日志文件路径：`.ifai/debug.log`（项目根目录下）

自定义路径：设置环境变量 `IFAI_DEBUG_LOG`
```bash
export IFAI_DEBUG_LOG=/path/to/custom/debug.log
```

## 使用方法

### 方法 1：实时监控（推荐）

在一个终端窗口运行 ifai：
```bash
./ifai
```

在另一个终端窗口实时查看日志：
```bash
tail -f .ifai/debug.log
```

### 方法 2：后查看

如果错过实时输出，可以随时查看日志文件：
```bash
cat .ifai/debug.log
# 或
less .ifai/debug.log
```

### 方法 3：过滤特定事件

只查看压缩相关事件：
```bash
grep "COMPRESS\|CHECK" .ifai/debug.log
```

只查看错误：
```bash
grep "ERROR\|超过" .ifai/debug.log
```

## 日志格式

每条日志包含时间戳和事件类型：

```
[2025-01-12 15:30:45.123] [PRE-TURN CHECK] Tokens: 85,432 / 76,800 (111%), Messages: 45
[2025-01-12 15:30:45.456] [PRE-TURN] ⚠️ 对话过长 (85,432 tokens / 76,800 阈值，111%)，正在自动压缩...
[2025-01-12 15:30:46.789] [PRE-TURN] ✓ 压缩完成：85,432 → 42,156 tokens, 45 → 20 messages (减少 50.7%)
[2025-01-12 15:30:47.012] [LOOP #00] FINAL CHECK - Tokens: 42,156 / 76,800 (55%), Messages: 20
```

## 事件类型说明

| 事件 | 说明 |
|------|------|
| `[PRE-TURN CHECK]` | 每次用户输入开始前的检查 |
| `[PRE-TURN]` | Pre-turn 压缩执行 |
| `[LOOP #XX] FINAL CHECK` | 每次循环开始前的检查 |
| `[FINAL CHECK]` | Final check 压缩执行 |
| `[MID-TURN CHECK]` | 工具循环中的检查 |
| `[MID-TURN]` | Mid-turn 压缩执行 |

## 诊断 HTTP 400 错误

如果遇到 `HTTP error 400 Bad Request`：

1. **查看日志中的最后一次检查**：
   ```bash
   grep "FINAL CHECK" .ifai/debug.log | tail -5
   ```

2. **检查是否超过阈值**：
   ```bash
   grep "超过 token 限制" .ifai/debug.log
   ```

3. **验证压缩是否生效**：
   ```bash
   grep "压缩完成" .ifai/debug.log | tail -10
   ```

4. **查看 token 增长趋势**：
   ```bash
   grep "Tokens:" .ifai/debug.log | tail -20
   ```

## 日志级别

当前记录的所有事件：
- ✅ Token 检查（每次循环）
- ✅ 压缩触发
- ✅ 压缩完成
- ✅ Token 数量和百分比
- ✅ 消息数量

## 清理日志

日志文件会持续增长，定期清理：
```bash
# 清空日志
> .ifai/debug.log

# 或删除日志
rm .ifai/debug.log
```

## 示例输出

正常运行的日志示例：
```
[2025-01-12 15:30:45.123] [PRE-TURN CHECK] Tokens: 45,678 / 76,800 (59%), Messages: 22
[2025-01-12 15:30:47.234] [LOOP #00] FINAL CHECK - Tokens: 45,678 / 76,800 (59%), Messages: 22
[2025-01-12 15:30:50.345] [LOOP #01] FINAL CHECK - Tokens: 52,345 / 76,800 (68%), Messages: 25
[2025-01-12 15:30:53.456] [MID-TURN CHECK] Tokens: 68,912 / 38,400 (179%), Messages: 32
[2025-01-12 15:30:53.567] [MID-TURN] ⚠️ Mid-turn 压缩触发：68,912 tokens / 38,400 阈值 (179%)，正在压缩...
[2025-01-12 15:30:53.890] [MID-TURN] ✓ Mid-turn 压缩完成：68,912 → 28,456 tokens, 32 → 15 messages (减少 40,456)
```

## 故障排查

### 问题：日志文件不存在

**原因**：ifai 还没有运行，或者日志路径不正确。

**解决**：
- 确保 ifai 至少运行过一次
- 检查当前目录下是否有 `.ifai` 文件夹

### 问题：日志没有更新

**原因**：ifai 进程可能崩溃或被终止。

**解决**：
- 检查 ifai 进程是否在运行：`ps aux | grep ifai`
- 重启 ifai 并查看错误信息

### 问题：日志中出现大量"超过 token 限制"

**原因**：压缩阈值设置可能不合适。

**解决**：
- 降低压缩阈值（已设置为 60%）
- 检查 token 估算是否准确
- 考虑使用更小的模型或减少上下文长度
