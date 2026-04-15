/**
 * 🔬 审批按钮诊断脚本 — 在 Tauri 应用 DevTools Console 中运行
 *
 * 使用方法：
 * 1. 启动 Tauri 开发模式: npm run tauri:dev
 * 2. 打开 DevTools (F12 或 Cmd+Option+I)
 * 3. 将此脚本粘贴到 Console 中运行
 * 4. 在聊天中发送 "请创建一个 README.md 文件" 触发 write_file 工具调用
 * 5. 观察控制台输出，找到断点位置
 */

(function() {
  console.log('========================================');
  console.log('🔬 审批按钮诊断脚本已启动');
  console.log('========================================');

  const chatStore = window.__chatStore;
  if (!chatStore) {
    console.error('❌ chatStore 未找到！请确保在 Tauri 应用中运行此脚本。');
    return;
  }

  // 1. 监控所有 ChatEventBus 事件
  const origEmit = chatStore.__eventBus?.emit?.bind(chatStore.__eventBus);
  if (origEmit) {
    // Hook 已在 StoreMapper 中，直接监听
  }

  // 2. 轮询检测 toolCalls 变化
  let lastToolCallCount = 0;
  let lastToolCallStates: Record<string, any> = {};

  const pollInterval = setInterval(() => {
    const state = chatStore.getState();
    const messages = state.messages || [];

    // 找到所有包含 toolCalls 的消息
    messages.forEach((msg) => {
      const toolCalls = msg.toolCalls || [];
      if (toolCalls.length > 0) {
        toolCalls.forEach(tc => {
          const prevState = lastToolCallStates[tc.id];
          const currentState = {
            tool: tc.tool,
            status: tc.status,
            isPartial: tc.isPartial,
            argsPreview: typeof tc.args === 'string' ? tc.args.substring(0, 60) : JSON.stringify(tc.args || {}).substring(0, 60)
          };

          // 检测状态变化
          if (!prevState) {
            console.log(`[DIAG] 🆕 New toolCall: id=${tc.id.substring(0, 12)}..., tool=${tc.tool}, status=${tc.status}, isPartial=${tc.isPartial}`);
          } else if (prevState.status !== currentState.status) {
            console.log(`[DIAG] 🔄 Status change: id=${tc.id.substring(0, 12)}..., ${prevState.status} → ${currentState.status}`);
          }

          lastToolCallStates[tc.id] = currentState;
        });
      }

      // 检查 segments
      const segments = msg.segments || [];
      const textSegCount = segments.filter(s => s.type === 'text').length;
      const toolSegCount = segments.filter(s => s.type === 'tool').length;
      if (toolCalls.length > 0) {
        const key = `${msg.id.substring(0, 8)}...`;
        const cacheKey = `seg_${key}`;
        const prev = lastToolCallStates[cacheKey];
        if (!prev || prev.text !== textSegCount || prev.tool !== toolSegCount) {
          console.log(`[DIAG] 📊 Segments: msg=${key}, text=${textSegCount}, tool=${toolSegCount}, toolCalls=${toolCalls.length}`);
          lastToolCallStates[cacheKey] = { text: textSegCount, tool: toolSegCount };
        }
      }
    });
  }, 500);

  // 3. 5秒后输出总结
  setTimeout(() => {
    console.log('\n========================================');
    console.log('📊 诊断总结（5秒快照）');
    console.log('========================================');

    const state = chatStore.getState();
    const messages = state.messages || [];

    messages.forEach((msg, i) => {
      const toolCalls = msg.toolCalls || [];
      const segments = msg.segments || [];

      if (toolCalls.length > 0 || segments.length > 0) {
        console.log(`\n消息 #${i}: id=${msg.id.substring(0, 12)}..., role=${msg.role}, isStreaming=${msg.isStreaming}`);
        console.log(`  toolCalls: ${toolCalls.length}, segments: ${segments.length}`);

        toolCalls.forEach((tc, j) => {
          console.log(`  [${j}] tool=${tc.tool}, status=${tc.status}, isPartial=${tc.isPartial}, id=${tc.id.substring(0, 16)}...`);
        });

        segments.forEach((s, j) => {
          console.log(`  [${j}] segment: type=${s.type}, toolCallId=${s.toolCallId?.substring(0, 16) || 'N/A'}, toolName=${s.toolName || 'N/A'}, phase=${s.phase || 'N/A'}`);
        });

        // 关键诊断：检查 orphaned toolCalls
        const segToolIds = new Set(segments.filter(s => s.type === 'tool').map(s => s.toolCallId));
        const pendingTc = toolCalls.filter(tc => tc.status === 'pending' && !segToolIds.has(tc.id));
        if (pendingTc.length > 0) {
          console.log(`  🔴 ORPHANED: ${pendingTc.length} pending toolCall(s) NOT in segments!`);
          pendingTc.forEach(tc => {
            console.log(`     → id=${tc.id.substring(0, 16)}..., tool=${tc.tool}, status=${tc.status}, isPartial=${tc.isPartial}`);
          });
        } else if (toolCalls.some(tc => tc.status === 'pending')) {
          console.log(`  ✅ All pending toolCalls have matching segments`);
        }
      }
    });

    console.log('\n========================================');
    console.log('💡 如需继续监控，日志每500ms更新');
    console.log('   运行 clearInterval(' + pollInterval + ') 停止');
    console.log('========================================');
  }, 5000);

  // 暴露清理函数
  window.__stopDiag = () => clearInterval(pollInterval);
  console.log('✅ 诊断已启动，5秒后输出总结');
  console.log('   停止监控: window.__stopDiag()');
})();
