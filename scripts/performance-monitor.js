/**
 * 🔍 性能监控脚本
 *
 * 使用方法：
 * 1. 打开 Tauri 应用
 * 2. 打开浏览器开发者工具 (F12)
 * 3. 在 Console 中粘贴此脚本并运行
 * 4. 进行操作（发送消息、流式输出等）
 * 5. 查看性能报告
 */

(function() {
  console.log('🔍 性能监控启动...');

  const metrics = {
    cacheHits: 0,
    cacheMisses: 0,
    renderTimes: [],
    streamingStartTime: 0,
    streamingEndTime: 0,
    chunkCount: 0,
  };

  // 监听缓存日志
  const originalLog = console.log;
  console.log = function(...args) {
    const message = args.join(' ');

    if (message.includes('[useStableMessages] ✅ 缓存命中')) {
      metrics.cacheHits++;
    }

    if (message.includes('[useStableMessages] 🔄 重新计算')) {
      metrics.cacheMisses++;

      // 提取渲染时间
      const match = message.match(/duration:\s*([\d.]+)ms/);
      if (match) {
        metrics.renderTimes.push(parseFloat(match[1]));
      }
    }

    if (message.includes('emitChunk:') || message.includes('chat:stream:chunk')) {
      metrics.chunkCount++;
    }

    originalLog.apply(console, args);
  };

  // 监听流式输出开始
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.addedNodes.length > 0) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) {
            const assistantMessage = node.closest('[data-message-role="assistant"]');
            if (assistantMessage && metrics.streamingStartTime === 0) {
              metrics.streamingStartTime = Date.now();
              console.log('📊 检测到流式输出开始');
            }
          }
        });
      }
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // 提供获取性能报告的函数
  window.getPerformanceReport = function() {
    const totalTime = metrics.streamingEndTime - metrics.streamingStartTime;
    const totalEvents = metrics.cacheHits + metrics.cacheMisses;
    const cacheHitRate = totalEvents > 0 ? (metrics.cacheHits / totalEvents) * 100 : 0;
    const avgRenderTime = metrics.renderTimes.length > 0
      ? metrics.renderTimes.reduce((a, b) => a + b, 0) / metrics.renderTimes.length
      : 0;
    const maxRenderTime = metrics.renderTimes.length > 0
      ? Math.max(...metrics.renderTimes)
      : 0;

    console.log('\n' + '='.repeat(70));
    console.log('📊 性能监控报告');
    console.log('='.repeat(70));
    console.log(`⏱️  流式输出时长: ${totalTime}ms`);
    console.log(`📦 Chunk 数量: ${metrics.chunkCount}`);
    console.log(`✅ 缓存命中次数: ${metrics.cacheHits}`);
    console.log(`🔄 缓存未命中次数: ${metrics.cacheMisses}`);
    console.log(`📈 缓存命中率: ${cacheHitRate.toFixed(1)}%`);
    console.log(`⚡ 平均渲染时间: ${avgRenderTime.toFixed(2)}ms`);
    console.log(`🎯 最大渲染时间: ${maxRenderTime.toFixed(2)}ms`);

    if (metrics.renderTimes.length > 0) {
      console.log(`\n📊 渲染时间分布:`);
      console.log(`   - 最小值: ${Math.min(...metrics.renderTimes).toFixed(2)}ms`);
      console.log(`   - 中位数: ${metrics.renderTimes.sort((a, b) => a - b)[Math.floor(metrics.renderTimes.length / 2)].toFixed(2)}ms`);
      console.log(`   - 最大值: ${maxRenderTime.toFixed(2)}ms`);
    }

    console.log('='.repeat(70) + '\n');

    return {
      cacheHitRate,
      avgRenderTime,
      maxRenderTime,
      totalTime,
      chunkCount: metrics.chunkCount,
    };
  };

  // 监听流式输出结束
  window.addEventListener('chat:stream:finished', () => {
    metrics.streamingEndTime = Date.now();
    console.log('📊 流式输出结束');
    console.log('💡 输入 getPerformanceReport() 查看详细报告');
  });

  console.log('✅ 性能监控已启动');
  console.log('💡 提示：');
  console.log('   - 发送一条消息触发流式输出');
  console.log('   - 完成后输入 getPerformanceReport() 查看报告');
  console.log('');
})();
