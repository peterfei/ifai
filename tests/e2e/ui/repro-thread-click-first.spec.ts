import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

/**
 * E2E 测试：还原 thread 点击后默认跳转到第一个的问题
 *
 * 问题描述：
 * 用户报告点击 thread tab 后，总是会跳转到第一个 thread，而不是点击的那个 thread
 *
 * 测试场景：
 * 1. 创建多个 thread
 * 2. 点击中间或末尾的 thread
 * 3. 验证 activeThreadId 是否正确更新为点击的 thread
 */
test.describe('Reproduction: Thread Click Goes To First Bug', () => {

  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForSelector('text=IfAI', { timeout: 10000 });
  });

  test('should switch to correct thread when clicking thread tab', async ({ page }) => {
    console.log('[E2E] ========== Thread Click Bug Reproduction Test ==========');

    // 1. 检查 threadStore 可用性
    const threadStoreAvailable = await page.evaluate(() => {
      return typeof (window as any).__threadStore !== 'undefined';
    });

    if (!threadStoreAvailable) {
      console.log('[E2E] ⏸️ threadStore 不可用');
      test.skip(true, 'threadStore not available in test environment');
      return;
    }

    console.log('[E2E] 步骤1: 创建 4 个 thread');

    // 2. 创建 4 个 thread
    const threadInfo = await page.evaluate(() => {
      const threadStore = (window as any).__threadStore.getState();
      const thread1Id = threadStore.createThread({ title: 'First Thread' });
      // 添加延迟确保不同的 lastActiveAt 时间戳
      const thread2Id = threadStore.createThread({ title: 'Second Thread' });
      const thread3Id = threadStore.createThread({ title: 'Third Thread' });
      const thread4Id = threadStore.createThread({ title: 'Fourth Thread' });

      // 🔥 FIX: 重新获取最新的 store 状态
      // threadStore 变量是一个快照，不会自动更新
      const updatedThreadStore = (window as any).__threadStore.getState();

      // 获取所有线程信息
      const threads = updatedThreadStore.getAllThreads();
      const activeThreadId = updatedThreadStore.activeThreadId;

      console.log('[E2E] 创建的线程:', threads.map(t => ({ id: t.id, title: t.title })));
      console.log('[E2E] 当前 activeThreadId:', activeThreadId);

      return {
        threadIds: [thread1Id, thread2Id, thread3Id, thread4Id],
        activeThreadId,
        totalThreads: threads.length,
        threads: threads.map(t => ({ id: t.id, title: t.title, lastActiveAt: t.lastActiveAt }))
      };
    });

    console.log('[E2E] 创建结果:', threadInfo);

    expect(threadInfo.totalThreads).toBeGreaterThanOrEqual(4);
    expect(threadInfo.activeThreadId).toBe(threadInfo.threadIds[3]); // 最后创建的应该是活跃的

    console.log('[E2E] 步骤2: 等待 UI 渲染 thread tabs');

    // 3. 等待 UI 渲染 thread tabs
    await page.waitForTimeout(1000);

    // 检查 thread tabs 是否可见
    const tabElements = await page.locator('[data-thread-id]').all();
    console.log('[E2E] 找到的 thread tab 数量:', tabElements.length);

    if (tabElements.length < 4) {
      console.log('[E2E] ⚠️ UI 上显示的 thread tabs 数量不足');
    }

    console.log('[E2E] 步骤3: 点击第二个 thread (Second Thread)');

    // 4. 点击第二个 thread（索引 1，即 "Second Thread"）
    const secondThreadId = threadInfo.threadIds[1];

    // 找到对应的 tab 并点击
    const clicked = await page.evaluate((targetId) => {
      const tabs = document.querySelectorAll('[data-thread-id]');
      console.log('[E2E] 查找 thread tab, targetId:', targetId);

      for (let i = 0; i < tabs.length; i++) {
        const tab = tabs[i] as HTMLElement;
        const tabId = tab.getAttribute('data-thread-id');
        console.log(`[E2E] Tab ${i}: data-thread-id="${tabId}"`);

        if (tabId === targetId) {
          console.log('[E2E] 找到目标 tab, 准备点击');
          tab.click();
          return { success: true, clickedIndex: i };
        }
      }

      return { success: false, error: 'Tab not found' };
    }, secondThreadId);

    console.log('[E2E] 点击结果:', clicked);

    // 5. 等待状态更新
    await page.waitForTimeout(500);

    console.log('[E2E] 步骤4: 验证 activeThreadId 是否正确更新');

    // 6. 验证 activeThreadId 是否正确更新
    const verification = await page.evaluate((expectedId) => {
      const threadStore = (window as any).__threadStore.getState();
      const actualActiveId = threadStore.activeThreadId;
      const threads = threadStore.getAllThreads();

      console.log('[E2E] 验证结果:');
      console.log('[E2E] 期望的 activeThreadId:', expectedId);
      console.log('[E2E] 实际的 activeThreadId:', actualActiveId);

      // 检查所有 thread 的顺序
      console.log('[E2E] 当前 thread 顺序:');
      threads.forEach((t: any, i: number) => {
        console.log(`  ${i}: ${t.title} (${t.id}) - lastActiveAt: ${t.lastActiveAt}`);
      });

      return {
        expectedId,
        actualId: actualActiveId,
        match: actualActiveId === expectedId,
        allThreads: threads.map((t: any) => ({ id: t.id, title: t.title }))
      };
    }, secondThreadId);

    console.log('[E2E] 验证结果:', verification);

    // 7. 判断是否存在 bug
    if (!verification.match) {
      console.log('[E2E] ❌ BUG 确认: 点击 thread 后，activeThreadId 没有正确更新！');
      console.log('[E2E] 期望切换到:', verification.expectedId);
      console.log('[E2E] 实际切换到:', verification.actualId);

      // 检查是否跳到了第一个 thread
      const firstThreadId = threadInfo.threadIds[0];
      if (verification.actualId === firstThreadId) {
        console.log('[E2E] ⚠️ 确认问题: activeThreadId 被设置为第一个 thread！');
        console.log('[E2E] ✅ Bug 还原成功: 点击 thread 后总是跳到第一个');
      }

      // 这是一个还原测试，发现 bug 是预期行为
      expect(verification.actualId).toBe(verification.expectedId);
    } else {
      console.log('[E2E] ✅ Thread 切换正常工作');
      expect(verification.match).toBe(true);
    }
  });

  test('should handle consecutive thread clicks correctly', async ({ page }) => {
    console.log('[E2E] ========== Consecutive Thread Clicks Test ==========');

    // 检查 threadStore 可用性
    const threadStoreAvailable = await page.evaluate(() => {
      return typeof (window as any).__threadStore !== 'undefined';
    });

    if (!threadStoreAvailable) {
      test.skip(true, 'threadStore not available');
      return;
    }

    // 创建 3 个 thread
    const threadIds = await page.evaluate(() => {
      const threadStore = (window as any).__threadStore.getState();
      const id1 = threadStore.createThread({ title: 'Thread A' });
      const id2 = threadStore.createThread({ title: 'Thread B' });
      const id3 = threadStore.createThread({ title: 'Thread C' });
      return [id1, id2, id3];
    });

    await page.waitForTimeout(500);

    // 依次点击不同的 thread
    const clickSequence = [
      { index: 0, expectedId: threadIds[0], name: 'Thread A' },
      { index: 2, expectedId: threadIds[2], name: 'Thread C' },
      { index: 1, expectedId: threadIds[1], name: 'Thread B' },
      { index: 0, expectedId: threadIds[0], name: 'Thread A' },
    ];

    for (const click of clickSequence) {
      console.log(`[E2E] 点击 ${click.name} (索引 ${click.index})`);

      // 点击对应的 tab
      await page.evaluate((targetId) => {
        const tabs = document.querySelectorAll('[data-thread-id]');
        for (const tab of tabs) {
          if (tab.getAttribute('data-thread-id') === targetId) {
            (tab as HTMLElement).click();
            break;
          }
        }
      }, click.expectedId);

      await page.waitForTimeout(300);

      // 验证 activeThreadId
      const actualId = await page.evaluate(() => {
        return (window as any).__threadStore.getState().activeThreadId;
      });

      if (actualId !== click.expectedId) {
        console.log(`[E2E] ❌ Bug: 点击 ${click.name} 后，实际切换到了 ${actualId}`);
        console.log(`[E2E] 期望: ${click.expectedId}, 实际: ${actualId}`);

        // 检查是否跳到了第一个
        if (actualId === threadIds[0]) {
          console.log('[E2E] ⚠️ 确认问题: 总是跳到第一个 thread！');
        }
      } else {
        console.log(`[E2E] ✅ 正确切换到 ${click.name}`);
      }

      expect(actualId).toBe(click.expectedId);
    }

    console.log('[E2E] ✅ 所有连续点击测试通过');
  });

  test('should preserve correct thread after re-rendering', async ({ page }) => {
    console.log('[E2E] ========== Thread State After Re-render Test ==========');

    const threadStoreAvailable = await page.evaluate(() => {
      return typeof (window as any).__threadStore !== 'undefined';
    });

    if (!threadStoreAvailable) {
      test.skip(true, 'threadStore not available');
      return;
    }

    // 创建 thread 并切换
    const threadIds = await page.evaluate(() => {
      const threadStore = (window as any).__threadStore.getState();
      const id1 = threadStore.createThread({ title: 'Thread 1' });
      const id2 = threadStore.createThread({ title: 'Thread 2' });
      const id3 = threadStore.createThread({ title: 'Thread 3' });
      // 切换到第二个 thread
      threadStore.switchThread(id2);
      return { ids: [id1, id2, id3], active: id2 };
    });

    await page.waitForTimeout(500);

    // 强制触发 re-render（通过修改搜索查询）
    await page.evaluate(() => {
      const threadStore = (window as any).__threadStore.getState();
      threadStore.setSearchQuery('test');
    });

    await page.waitForTimeout(300);

    // 清除搜索
    await page.evaluate(() => {
      const threadStore = (window as any).__threadStore.getState();
      threadStore.setSearchQuery('');
    });

    await page.waitForTimeout(300);

    // 验证 activeThreadId 没有改变
    const currentActiveId = await page.evaluate(() => {
      return (window as any).__threadStore.getState().activeThreadId;
    });

    console.log('[E2E] Re-render 前的 activeThreadId:', threadIds.active);
    console.log('[E2E] Re-render 后的 activeThreadId:', currentActiveId);

    if (currentActiveId !== threadIds.active) {
      console.log('[E2E] ❌ Bug: Re-render 后 activeThreadId 发生了变化！');
      if (currentActiveId === threadIds.ids[0]) {
        console.log('[E2E] ⚠️ 确认问题: Re-render 后跳到了第一个 thread！');
      }
    }

    expect(currentActiveId).toBe(threadIds.active);
    console.log('[E2E] ✅ Re-render 后 thread 状态保持正确');
  });
});
