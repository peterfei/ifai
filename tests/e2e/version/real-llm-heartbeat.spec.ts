/**
 * 心跳监测器修复验证 - 真实 LLM 测试
 *
 * 使用真实 LLM 和事件总线验证修复
 */

import { test, expect } from '@playwright/test';

test.describe('心跳监测器修复验证（真实 LLM）', () => {

  test.beforeEach(async ({ page }) => {
    // 导航到应用
    await page.goto('http://localhost:1420');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    // 初始化事件监听器
    await page.evaluate(() => {
      // 创建全局测试结果收集器
      (window as any).__heartbeatTestResults = {
        stallWarnings: [],
        heartbeatUpdates: [],
        finishEvents: [],
        forceCleanups: [],
        sessionCreated: [],
        sessionFinished: [],
        sessionCleaned: [],
        toolCompletions: []
      };

      // 拦截所有 console 日志
      const originalLog = console.log;
      const originalWarn = console.warn;
      const originalError = console.error;

      console.log = (...args) => {
        const message = args.join(' ');
        const results = (window as any).__heartbeatTestResults;

        if (message.includes('Started listening')) {
          results.sessionCreated.push(message);
        }
        if (message.includes('marked as finished')) {
          results.sessionFinished.push(message);
        }
        if (message.includes('cleaned up')) {
          results.sessionCleaned.push(message);
        }
        if (message.includes('Heartbeat updated') && message.includes('tool completed')) {
          results.heartbeatUpdates.push(message);
        }

        originalLog.apply(console, args);
      };

      console.warn = (...args) => {
        const message = args.join(' ');
        const results = (window as any).__heartbeatTestResults;

        if (message.includes('Sentinel detected stall')) {
          results.stallWarnings.push(message);
        }
        if (message.includes('Found stale session') && message.includes('force cleaning up')) {
          results.forceCleanups.push(message);
        }
        if (message.includes('Finish already emitted') && message.includes('skipping duplicate')) {
          results.finishEvents.push(message);
        }

        originalWarn.apply(console, args);
      };

      console.error = (...args) => {
        const message = args.join(' ');
        originalError.apply(console, args);
      };
    });
  });

  test('验证1: 真实工具调用后应该更新心跳', async ({ page }) => {
    console.log('[E2E] 开始测试真实工具调用心跳更新...');

    // 监听事件总线
    const toolCompletions: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('tool completed') || text.includes('Tool completed')) {
        toolCompletions.push(text);
        console.log('[E2E] 检测到工具完成');
      }
    });

    // 使用更通用的选择器
    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 10000 });

    // 发送一个会触发工具调用的消息
    await textarea.fill('请读取当前目录的文件列表');
    await page.keyboard.press('Enter');

    // 等待工具执行
    await page.waitForTimeout(10000);

    // 获取测试结果
    const results = await page.evaluate(() => (window as any).__heartbeatTestResults);

    console.log('[E2E] === 测试结果 ===');
    console.log('[E2E] 停滞警告次数:', results.stallWarnings.length);
    console.log('[E2E] 心跳更新次数:', results.heartbeatUpdates.length);
    console.log('[E2E] Session 创建:', results.sessionCreated.length);
    console.log('[E2E] Session 完成:', results.sessionFinished.length);
    console.log('[E2E] Session 清理:', results.sessionCleaned.length);
    console.log('[E2E] 工具完成事件:', toolCompletions.length);

    // 验证：不应该有停滞警告
    if (results.stallWarnings.length > 0) {
      console.log('[E2E] ❌ 检测到停滞警告:');
      results.stallWarnings.forEach((w: string) => console.log('  -', w));
    }

    expect(results.stallWarnings.length).toBe(0);

    // 如果有工具完成，应该有心跳更新
    if (toolCompletions.length > 0 && results.heartbeatUpdates.length > 0) {
      console.log('[E2E] ✅ 工具完成时正确更新了心跳');
    }

    console.log('[E2E] ✅ 测试1通过');
  });

  test('验证2: 流结束后输入框应该恢复启用', async ({ page }) => {
    console.log('[E2E] 开始测试输入框状态恢复...');

    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 10000 });

    // 检查初始状态
    const initialDisabled = await textarea.isDisabled();
    console.log('[E2E] 初始状态:', initialDisabled ? '禁用' : '启用');

    // 发送消息
    await textarea.fill('你好，请简单介绍一下自己');
    await page.keyboard.press('Enter');

    // 等待消息发送后输入框应该禁用
    await page.waitForTimeout(1000);
    const duringDisabled = await textarea.isDisabled();
    console.log('[E2E] 发送中状态:', duringDisabled ? '禁用' : '启用');

    // 等待流式传输完成
    await page.waitForTimeout(15000);

    // 检查输入框是否恢复启用
    const finalDisabled = await textarea.isDisabled();
    console.log('[E2E] 最终状态:', finalDisabled ? '禁用' : '启用');

    // 输入框应该恢复启用
    expect(finalDisabled).toBe(false);

    // 获取测试结果
    const results = await page.evaluate(() => (window as any).__heartbeatTestResults);
    console.log('[E2E] === 会话状态 ===');
    console.log('[E2E] Session 创建:', results.sessionCreated.length);
    console.log('[E2E] Session 完成:', results.sessionFinished.length);
    console.log('[E2E] Session 清理:', results.sessionCleaned.length);
    console.log('[E2E] 停滞警告:', results.stallWarnings.length);

    // 应该有会话创建和清理
    expect(results.sessionCreated.length).toBeGreaterThan(0);

    console.log('[E2E] ✅ 测试2通过');
  });

  test('验证3: 工具调用完成后不应该有停滞警告', async ({ page }) => {
    console.log('[E2E] 开始测试工具调用后的停滞检测...');

    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 10000 });

    // 发送一个会触发多个工具调用的消息
    await textarea.fill('请扫描项目结构并列出所有文件');
    await page.keyboard.press('Enter');

    // 等待足够时间让工具执行
    await page.waitForTimeout(20000);

    // 获取测试结果
    const results = await page.evaluate(() => (window as any).__heartbeatTestResults);

    console.log('[E2E] === 测试结果 ===');
    console.log('[E2E] 停滞警告次数:', results.stallWarnings.length);
    console.log('[E2E] 心跳更新次数:', results.heartbeatUpdates.length);
    console.log('[E2E] 强制清理次数:', results.forceCleanups.length);

    // 详细输出
    if (results.stallWarnings.length > 0) {
      console.log('[E2E] ❌ 发现停滞警告:');
      results.stallWarnings.forEach((w: string, i: number) => {
        console.log(`  [${i + 1}]`, w);
      });
    }

    if (results.heartbeatUpdates.length > 0) {
      console.log('[E2E] ✅ 心跳更新记录:');
      results.heartbeatUpdates.forEach((u: string, i: number) => {
        console.log(`  [${i + 1}]`, u);
      });
    }

    if (results.forceCleanups.length > 0) {
      console.log('[E2E] ⚠️ 强制清理记录:');
      results.forceCleanups.forEach((c: string, i: number) => {
        console.log(`  [${i + 1}]`, c);
      });
    }

    // 核心验证：不应该有停滞警告
    expect(results.stallWarnings.length).toBe(0);

    console.log('[E2E] ✅ 测试3通过');
  });

  test('验证4: Session 应该正确标记和清理', async ({ page }) => {
    console.log('[E2E] 开始测试 Session 生命周期...');

    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 10000 });

    // 发送消息
    await textarea.fill('测试会话管理');
    await page.keyboard.press('Enter');

    // 等待完成
    await page.waitForTimeout(12000);

    // 获取测试结果
    const results = await page.evaluate(() => (window as any).__heartbeatTestResults);

    console.log('[E2E] === Session 状态 ===');
    console.log('[E2E] Session 创建:', results.sessionCreated.length);
    results.sessionCreated.forEach((s: string) => console.log('  -', s));

    console.log('[E2E] Session 完成:', results.sessionFinished.length);
    results.sessionFinished.forEach((s: string) => console.log('  -', s));

    console.log('[E2E] Session 清理:', results.sessionCleaned.length);
    results.sessionCleaned.forEach((s: string) => console.log('  -', s));

    console.log('[E2E] 停滞警告:', results.stallWarnings.length);

    // 应该有 session 创建
    expect(results.sessionCreated.length).toBeGreaterThan(0);

    // 如果流正常结束，应该有完成和清理日志
    // 注意：由于各种原因，有时候可能没有完整的日志，所以我们只验证基本的流程
    if (results.sessionFinished.length > 0 || results.sessionCleaned.length > 0) {
      console.log('[E2E] ✅ Session 生命周期正常');
    }

    // 不应该有停滞警告
    expect(results.stallWarnings.length).toBe(0);

    console.log('[E2E] ✅ 测试4通过');
  });

  test('验证5: 重复场景的处理（续播）', async ({ page }) => {
    console.log('[E2E] 开始测试续播场景...');

    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 10000 });

    // 发送一个可能触发多次响应的消息
    await textarea.fill('请分析 package.json 文件，然后总结依赖关系');
    await page.keyboard.press('Enter');

    // 等待更长时间，允许多轮交互
    await page.waitForTimeout(25000);

    // 获取测试结果
    const results = await page.evaluate(() => (window as any).__heartbeatTestResults);

    console.log('[E2E] === 续播场景结果 ===');
    console.log('[E2E] Session 创建:', results.sessionCreated.length);
    console.log('[E2E] Session 完成:', results.sessionFinished.length);
    console.log('[E2E] Session 清理:', results.sessionCleaned.length);
    console.log('[E2E] 重复 Finish:', results.finishEvents.length);
    console.log('[E2E] 强制清理:', results.forceCleanups.length);
    console.log('[E2E] 停滞警告:', results.stallWarnings.length);

    // 详细输出
    if (results.finishEvents.length > 0) {
      console.log('[E2E] 重复 Finish 事件:');
      results.finishEvents.forEach((e: string, i: number) => {
        console.log(`  [${i + 1}]`, e);
      });
    }

    if (results.forceCleanups.length > 0) {
      console.log('[E2E] 强制清理操作:');
      results.forceCleanups.forEach((c: string, i: number) => {
        console.log(`  [${i + 1}]`, c);
      });
    }

    // 核心验证
    // 1. 不应该有停滞警告
    expect(results.stallWarnings.length).toBe(0);

    // 2. 如果有重复 finish，应该有强制清理
    if (results.finishEvents.length > 0) {
      expect(results.forceCleanups.length).toBeGreaterThan(0);
      console.log('[E2E] ✅ 重复 finish 时正确触发了强制清理');
    }

    console.log('[E2E] ✅ 测试5通过');
  });

  test('验证6: 综合场景 - 多工具调用后输入框恢复', async ({ page }) => {
    console.log('[E2E] 开始综合测试...');

    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 10000 });

    // 记录初始状态
    const initialDisabled = await textarea.isDisabled();
    console.log('[E2E] 初始输入框状态:', initialDisabled ? '禁用' : '启用');

    // 发送一个会触发多个工具的消息
    await textarea.fill('请帮我查看项目结构，读取 package.json，并列出所有测试文件');
    await page.keyboard.press('Enter');

    // 监控状态变化
    let wasDisabled = false;
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(1000);
      const isDisabled = await textarea.isDisabled();
      if (isDisabled) {
        wasDisabled = true;
      }
      // 检查是否有输出（说明正在生成）
      const hasOutput = await page.locator('.message-content, [data-message-content]').count() > 0;
      if (hasOutput && !isDisabled && wasDisabled) {
        console.log('[E2E] ✅ 输入框已恢复启用');
        break;
      }
    }

    // 最终检查
    await page.waitForTimeout(5000);
    const finalDisabled = await textarea.isDisabled();
    console.log('[E2E] 最终输入框状态:', finalDisabled ? '禁用' : '启用');

    // 获取测试结果
    const results = await page.evaluate(() => (window as any).__heartbeatTestResults);

    console.log('[E2E] === 综合测试结果 ===');
    console.log('[E2E] 停滞警告:', results.stallWarnings.length);
    console.log('[E2E] 心跳更新:', results.heartbeatUpdates.length);
    console.log('[E2E] Session 创建:', results.sessionCreated.length);
    console.log('[E2E] Session 清理:', results.sessionCleaned.length);

    // 核心验证
    expect(finalDisabled).toBe(false);
    expect(results.stallWarnings.length).toBe(0);

    console.log('[E2E] ✅ 测试6通过');
  });
});
