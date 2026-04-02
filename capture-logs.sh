#!/bin/bash
# 日志捕获脚本 - 在运行此脚本后再触发崩溃

LOG_DIR=~/Desktop/tauri-crash-logs
mkdir -p "$LOG_DIR"

echo "🔍 开始监控日志..."
echo "📁 日志将保存到: $LOG_DIR"
echo "⚠️  现在请触发崩溃，然后按 Ctrl+C 停止监控"
echo ""

# 监控 Tauri 应用日志
(
    echo "=== Tauri 应用日志 ===" > "$LOG_DIR/app-$(date +%Y%m%d-%H%M%S).log"
    tail -f ~/Library/Logs/com.ifai.editor/app.log 2>/dev/null >> "$LOG_DIR/app-$(date +%Y%m%d-%H%M%S).log"
) &
TAIL_PID=$!

# 监控系统日志
(
    log stream --predicate 'processImagePath contains "ifainew"' --level debug 2>/dev/null >> "$LOG_DIR/system-$(date +%Y%m%d-%H%M%S).log"
) &
LOG_PID=$!

# 清理函数
cleanup() {
    echo ""
    echo "🛑 停止监控..."
    kill $TAIL_PID $LOG_PID 2>/dev/null
    echo "✅ 日志已保存到: $LOG_DIR"
    ls -lh "$LOG_DIR"
}

trap cleanup EXIT INT

echo "✅ 监控已启动 (PID: $$)"
echo "📊 实时日志输出:"
echo "---"

# 显示实时日志
log stream --predicate 'processImagePath contains "ifainew"' --level debug --style compact 2>/dev/null
