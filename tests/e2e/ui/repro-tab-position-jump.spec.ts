import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

/**
 * E2E 测试：还原点击 thread tab 后位置跳动的问题
 *
 * 问题描述：
 * 用户点击某个 thread tab 后，该 tab 会跳到第一个位置（因为 lastActiveAt 更新导致重新排序）
 * 用户期望：点击后 tab 位置应该保持不变
 *
 * 测试场景：
 * 1. 创建多个 thread
 * 2. 记录某个 thread tab 的初始位置（比如第 3 个）
 * 3. 点击该 thread tab
 * 4. 验证该 tab 的位置没有改变
 */
test.describe('Reproduction: Tab Position Jump on Click', () => {

  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForSelector('text=IfAI', { timeout: 10000 });
  });

  test('should not move tab when clicking it', async ({ page }) => {
    console.log('[E2E] ========== Tab Position Jump Test ==========');

    // 1. 检查 threadStore 可用性
    const threadStoreAvailable = await page.evaluate(() => {
      return typeof (window as any).__threadStore !== 'undefined';
    });

    if (!threadStoreAvailable) {
      test.skip(true, 'threadStore not available');
      return;
    }

    console.log('[E2E] 步骤1: 创建 5 个 thread');

    // 2. 创建 5 个 thread，确保有不同的时间戳
    const threadInfo = await page.evaluate(async () => {
      const threadStore = (window as any).__threadStore.getState();

      // 创建 threads 并添加小延迟确保不同的时间戳
      const createWithDelay = async (title: string) => {
        const id = threadStore.createThread({ title });
        await new Promise(resolve => setTimeout(resolve, 10));
        return id;
      };

      const id1 = await createWithDelay('Thread 1');
      const id2 = await createWithDelay('Thread 2');
      const id3 = await createWithDelay('Thread 3');
      const id4 = await createWithDelay('Thread 4');
      const id5 = await createWithDelay('Thread 5');

      // 重新获取最新状态
      const updatedStore = (window as any).__threadStore.getState();
      const threads = updatedStore.getAllThreads();

      console.log('[E2E] Created threads:', threads.map(t => ({ id: t.id, title: t.title })));

      return {
        threadIds: [id1, id2, id3, id4, id5],
        totalThreads: threads.length,
        threads: threads.map(t => ({ id: t.id, title: t.title }))
      };
    });

    expect(threadInfo.totalThreads).toBeGreaterThanOrEqual(5);

    await page.waitForTimeout(500);

    console.log('[E2E] 步骤2: 获取初始 tab 顺序');

    // 3. 获取初始的 tab 顺序
    const initialOrder = await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('[data-thread-id]'));
      return tabs.map(tab => ({
        id: tab.getAttribute('data-thread-id'),
        title: tab.textContent?.trim() || ''
      }));
    });

    console.log('[E2E] 初始 tab 顺序:');
    initialOrder.forEach((tab, i) => {
      console.log(`  ${i}: ${tab.title} (${tab.id})`);
    });

    // 4. 选择一个中间位置的 thread（比如 Thread 3，索引 2）
    const targetThreadTitle = 'Thread 3';
    const targetThreadInitialIndex = initialOrder.findIndex(t => t.title === targetThreadTitle);

    if (targetThreadInitialIndex === -1) {
      test.skip(true, `Target thread "${targetThreadTitle}" not found`);
      return;
    }

    console.log(`[E2E] 步骤3: 点击 "${targetThreadTitle}" (初始位置: ${targetThreadInitialIndex})`);

    // 5. 点击目标 thread
    const clicked = await page.evaluate((targetTitle) => {
      const tabs = document.querySelectorAll('[data-thread-id]');
      for (let i = 0; i < tabs.length; i++) {
        const tab = tabs[i] as HTMLElement;
        if (tab.textContent?.trim() === targetTitle) {
          console.log(`[E2E] Clicking tab at index ${i}: ${targetTitle}`);
          tab.click();
          return { success: true, clickedIndex: i };
        }
      }
      return { success: false, error: 'Tab not found' };
    }, targetThreadTitle);

    expect(clicked.success).toBe(true);

    // 等待 UI 更新
    await page.waitForTimeout(300);

    console.log('[E2E] 步骤4: 验证 tab 位置是否改变');

    // 6. 获取点击后的 tab 顺序
    const afterClickOrder = await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('[data-thread-id]'));
      return tabs.map(tab => ({
        id: tab.getAttribute('data-thread-id'),
        title: tab.textContent?.trim() || ''
      }));
    });

    console.log('[E2E] 点击后 tab 顺序:');
    afterClickOrder.forEach((tab, i) => {
      console.log(`  ${i}: ${tab.title} (${tab.id})`);
    });

    // 7. 验证目标 thread 的位置
    const targetThreadAfterIndex = afterClickOrder.findIndex(t => t.title === targetThreadTitle);

    console.log(`[E2E] "${targetThreadTitle}" 位置变化:`);
    console.log(`  初始位置: ${targetThreadInitialIndex}`);
    console.log(`  点击后位置: ${targetThreadAfterIndex}`);

    // 8. 检查是否有其他 thread 移动了位置
    let positionsChanged = false;
    const changes: Array<{title: string, before: number, after: number}> = [];

    initialOrder.forEach((tab, i) => {
      const afterIndex = afterClickOrder.findIndex(t => t.id === tab.id);
      if (afterIndex !== i) {
        positionsChanged = true;
        changes.push({ title: tab.title, before: i, after: afterIndex });
      }
    });

    if (positionsChanged) {
      console.log('[E2E] ⚠️ 检测到 tab 位置变化:');
      changes.forEach(change => {
        console.log(`  "${change.title}": ${change.before} → ${change.after}`);
      });
    }

    // 9. 判断是否存在 bug
    if (targetThreadAfterIndex !== targetThreadInitialIndex) {
      console.log(`[E2E] ❌ Bug 确认: 点击后 "${targetThreadTitle}" 从位置 ${targetThreadInitialIndex} 移动到了 ${targetThreadAfterIndex}`);

      if (targetThreadAfterIndex === 0) {
        console.log('[E2E] ⚠️ Tab 移动到了第一个位置（因为 lastActiveAt 更新导致重新排序）');
        console.log('[E2E] ✅ Bug 还原成功: 点击 thread 后位置跳动');
      }
    } else if (positionsChanged) {
      console.log('[E2E] ⚠️ 虽然目标 thread 位置未变，但其他 thread 位置发生了变化');
    } else {
      console.log('[E2E] ✅ 所有 tab 位置保持正确，没有跳动');
    }

    // 期望：点击后位置应该保持不变
    expect(targetThreadAfterIndex).toBe(targetThreadInitialIndex);
  });

  test('should preserve tab order after multiple clicks', async ({ page }) => {
    console.log('[E2E] ========== Multiple Clicks Position Test ==========');

    const threadStoreAvailable = await page.evaluate(() => {
      return typeof (window as any).__threadStore !== 'undefined';
    });

    if (!threadStoreAvailable) {
      test.skip(true, 'threadStore not available');
      return;
    }

    // 创建 4 个 threads
    await page.evaluate(async () => {
      const threadStore = (window as any).__threadStore.getState();
      for (let i = 1; i <= 4; i++) {
        threadStore.createThread({ title: `Tab ${i}` });
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    });

    await page.waitForTimeout(500);

    // 记录初始顺序
    const getTabOrder = async () => {
      return await page.evaluate(() => {
        const tabs = Array.from(document.querySelectorAll('[data-thread-id]'));
        return tabs.map(tab => ({
          id: tab.getAttribute('data-thread-id'),
          title: tab.textContent?.trim() || ''
        }));
      });
    };

    const initialOrder = await getTabOrder();
    console.log('[E2E] 初始顺序:', initialOrder.map((t, i) => `${i}:${t.title}`).join(', '));

    // 依次点击不同的 tabs
    const clickSequence = ['Tab 3', 'Tab 2', 'Tab 4', 'Tab 1'];

    for (const target of clickSequence) {
      console.log(`[E2E] 点击 "${target}"`);

      await page.evaluate((tabTitle) => {
        const tabs = document.querySelectorAll('[data-thread-id]');
        for (const tab of tabs) {
          if (tab.textContent?.trim() === tabTitle) {
            (tab as HTMLElement).click();
            break;
          }
        }
      }, target);

      await page.waitForTimeout(200);

      const currentOrder = await getTabOrder();
      console.log('[E2E] 当前顺序:', currentOrder.map((t, i) => `${i}:${t.title}`).join(', '));
    }

    // 最终验证：顺序应该与初始顺序一致
    const finalOrder = await getTabOrder();
    console.log('[E2E] 最终顺序:', finalOrder.map((t, i) => `${i}:${t.title}`).join(', '));

    // 检查是否所有 tab 都在原来的位置
    let orderPreserved = true;
    finalOrder.forEach((tab, i) => {
      const initialIndex = initialOrder.findIndex(t => t.id === tab.id);
      if (initialIndex !== i) {
        console.log(`[E2E] ⚠️ "${tab.title}" 位置变化: ${initialIndex} → ${i}`);
        orderPreserved = false;
      }
    });

    if (orderPreserved) {
      console.log('[E2E] ✅ 所有 tabs 顺序保持一致');
    } else {
      console.log('[E2E] ❌ Tabs 顺序发生了变化');
    }

    expect(orderPreserved).toBe(true);
  });
});
