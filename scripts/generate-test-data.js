/**
 * 🧪 性能测试：生成大量测试数据
 *
 * 使用方法：
 * 1. 打开 Tauri 应用
 * 2. 打开浏览器开发者工具 (F12)
 * 3. 在 Console 中粘贴此脚本并运行
 * 4. 等待数据生成完成
 * 5. 进行性能测试
 */

(async function generatePerformanceTestData() {
  console.log('🧪 开始生成性能测试数据...');

  const messageCount = 10000; // 生成 10000 条消息
  const batchSize = 100; // 每批 100 条

  // 获取当前 threadId
  const threadId = window.__chatStore?.getState?.()?.activeThreadId;
  if (!threadId) {
    console.error('❌ 找不到 activeThreadId，请先打开一个对话');
    return;
  }

  console.log(`📋 Thread ID: ${threadId}`);
  console.log(`🎯 目标消息数量: ${messageCount}`);
  console.log(`📦 批处理大小: ${batchSize}`);

  // 生成测试消息
  for (let batch = 0; batch < messageCount / batchSize; batch++) {
    const startIdx = batch * batchSize;
    const endIdx = Math.min(startIdx + batchSize, messageCount);

    const messages = [];
    for (let i = startIdx; i < endIdx; i++) {
      if (i % 2 === 0) {
        // 用户消息
        messages.push({
          id: `test-msg-${i}`,
          role: 'user',
          content: `测试消息 #${i + 1}`,
          timestamp: Date.now() - (messageCount - i) * 1000,
          isStreaming: false,
        });
      } else {
        // 助手消息
        messages.push({
          id: `test-msg-${i}`,
          role: 'assistant',
          content: `这是测试回复 #${i + 1}。`.repeat(5), // 稍微长一点的内容
          timestamp: Date.now() - (messageCount - i) * 1000,
          isStreaming: false,
        });
      }
    }

    // 添加到 store
    try {
      window.__chatStore.getState().messages.push(...messages);
      console.log(`✅ 已生成 ${endIdx}/${messageCount} 条消息 (${((endIdx / messageCount) * 100).toFixed(1)}%)`);
    } catch (error) {
      console.error(`❌ 批次 ${batch} 添加失败:`, error);
    }

    // 短暂延迟，避免阻塞 UI
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  console.log('✅ 测试数据生成完成！');
  console.log(`📊 总共生成 ${messageCount} 条消息`);
  console.log(`💡 现在可以发送一条消息测试流式输出性能`);
  console.log(`💡 输入 getPerformanceReport() 查看性能报告`);
}

// 执行生成
generatePerformanceTestData().catch(console.error);
