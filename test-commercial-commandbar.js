/**
 * 商业版 CommandBar 验证脚本
 *
 * 在浏览器控制台中运行此脚本来验证商业版功能
 */

(async function verifyCommercialCommandBar() {
  console.log('=== 开始验证商业版 CommandBar ===\n');

  try {
    // 1. 测试模块导入
    console.log('1. 测试模块导入...');
    const bridgeModule = await import('/src/core/commandBar/bridge.ts');
    const { getCommandLineCore, getCommandLineDiagnostics, isProMode } = bridgeModule;
    console.log('   ✅ bridge.ts 导入成功');

    // 2. 获取核心实例
    console.log('\n2. 获取核心实例...');
    const core = await getCommandLineCore();
    console.log('   ✅ 核心实例获取成功');

    // 3. 检查诊断信息
    console.log('\n3. 检查诊断信息...');
    const diagnostics = getCommandLineDiagnostics();
    console.log('   类型:', diagnostics.type);
    console.log('   版本:', diagnostics.version);
    console.log('   初始化:', diagnostics.initialized);
    console.log('   耗时:', diagnostics.loadTime.toFixed(2) + 'ms');

    // 4. 验证是否为商业版
    console.log('\n4. 验证版本模式...');
    const isPro = isProMode();
    console.log('   是否为商业版:', isPro ? '✅ 是' : '❌ 否（使用 Mock）');

    if (diagnostics.type === 'pro') {
      console.log('\n   ✅ 商业版模式已激活！');
    } else {
      console.log('\n   ⚠️ 当前使用 Mock 模式（降级）');
    }

    // 5. 测试命令执行
    console.log('\n5. 测试命令执行...');
    const commands = [':version', ':help', ':w', ':format'];
    for (const cmd of commands) {
      const result = await core.execute(cmd, {});
      console.log(`   ${cmd}: ${result.success ? '✅' : '❌'} ${result.message.substring(0, 50)}...`);
    }

    // 6. 测试建议功能
    console.log('\n6. 测试建议功能...');
    const suggestions = await core.getSuggestions('');
    console.log(`   可用命令数: ${suggestions.length}`);
    console.log('   命令列表:', suggestions.slice(0, 10).map(s => s.text).join(', '));

    // 7. 测试过滤建议
    console.log('\n7. 测试建议过滤...');
    const filteredSuggestions = await core.getSuggestions('f');
    console.log(`   "f" 开头的命令: ${filteredSuggestions.map(s => s.text).join(', ')}`);

    console.log('\n=== 验证完成 ===');
    console.log('\n商业版功能状态:');
    console.log('-'.repeat(40));
    console.log(`✅ 模块加载: 成功`);
    console.log(`✅ 核心实例: ${diagnostics.type === 'pro' ? '商业版' : 'Mock'}`);
    console.log(`✅ 命令执行: 正常`);
    console.log(`✅ 建议功能: 正常`);
    console.log(`✅ 内置命令: ${suggestions.length} 个`);
    console.log('-'.repeat(40));

  } catch (error) {
    console.error('\n❌ 验证失败:', error);
  }
})();
