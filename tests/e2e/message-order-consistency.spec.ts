import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from './setup-utils';

test.describe('Message Segment Ordering Consistency', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    // 等待应用加载和 store 挂载
    await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 10000 });
    await page.waitForTimeout(2000);
  });

  test('should maintain tool-then-text order when switching from streaming to finished', async ({ page }) => {
    // 1. 模拟流式场景：工具调用在前 (Order 0)，总结文字在后 (Order 1)
    await page.evaluate(() => {
        const store = (window as any).__chatStore;
        const msgId = 'order-test-msg';
        const toolCallId = 'call-order-1';
        
        // 初始只有工具调用，且设为流式状态
        store.getState().addMessage({
            id: msgId,
            role: 'assistant',
            content: '',
            toolCalls: [{
                id: toolCallId,
                tool: 'agent_write_file',
                args: { rel_path: 'fix.js', content: 'console.log("fixed");' },
                status: 'pending',
                isPartial: false
            }],
            contentSegments: [
                { type: 'tool', order: 0, toolCallId: toolCallId, timestamp: Date.now() }
            ]
        });
        
        store.setState({ isLoading: true });
    });

    await page.waitForTimeout(500);

    // 2. 流式追加总结文字
    await page.evaluate(async () => {
        const store = (window as any).__chatStore;
        const msgId = 'order-test-msg';
        
        const summaryText = 'I have optimized the performance. All changes are verified.';
        const messages = store.getState().messages;
        const newMessages = messages.map(m => {
            if (m.id === msgId) {
                return {
                    ...m,
                    content: summaryText,
                    contentSegments: [
                        ...m.contentSegments,
                        {
                            type: 'text',
                            order: 1,
                            content: summaryText,
                            timestamp: Date.now(),
                            startPos: 0,
                            endPos: summaryText.length
                        }
                    ]
                };
            }
            return m;
        });
        store.setState({ messages: newMessages });
    });

    await page.waitForTimeout(500);

    // 3. 验证流式中的顺序：工具在上面 (Order 0)，文字在下面 (Order 1)
    // 此时 MessageItem 应该使用 sortedSegments 渲染，顺序为 [Tool, Text]
    const streamingOrder = await page.evaluate(() => {
        // 使用属性选择器来避免特殊字符转义问题
        const container = document.querySelector('[class*="bg-[#252526]"]');
        if (!container) return ['not found'];
        // 找到内容容器
        const contentDiv = container.querySelector('.flex-1.min-w-0.text-inherit');
        if (!contentDiv) return ['content div not found'];
        const elements = Array.from(contentDiv.children);
        return elements
            .map(el => {
                if (el.classList.contains('group/tool')) return 'tool';
                if (el.textContent && el.textContent.includes('optimized')) return 'text';
                return null;
            })
            .filter(t => t !== null);
    });
    
    console.log('[E2E] Streaming Order:', streamingOrder);
    expect(streamingOrder).toEqual(['tool', 'text']);

    // 4. 模拟结束生成，触发 effectivelyStreaming -> false
    await page.evaluate(() => {
        const store = (window as any).__chatStore;
        store.setState({ isLoading: false });
    });

    // 等待 1.5s 确保 MessageItem 内部的 750ms 延时完成并切换渲染模式
    await page.waitForTimeout(1500);

    // 5. 验证结束后的顺序
    const finishedOrder = await page.evaluate(() => {
        // 使用属性选择器来避免特殊字符转义问题
        const container = document.querySelector('[class*="bg-[#252526]"]');
        if (!container) return ['not found'];
        // 找到内容容器
        const contentDiv = container.querySelector('.flex-1.min-w-0.text-inherit');
        if (!contentDiv) return ['content div not found'];
        const elements = Array.from(contentDiv.children);
        return elements
            .map(el => {
                if (el.classList.contains('group/tool')) return 'tool';
                if (el.textContent && el.textContent.includes('optimized')) return 'text';
                return null;
            })
            .filter(t => t !== null);
    });

    console.log('[E2E] Finished Order:', finishedOrder);
    
    // 如果 Bug 存在，finishedOrder 会变成 ['text', 'tool']
    // 因为 fallback 逻辑将文字（来自 displayContent）放在了 native 工具列表的前面
    expect(finishedOrder, 'Order should not flip after streaming finishes').toEqual(['tool', 'text']);
  });
});
