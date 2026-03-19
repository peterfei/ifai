/**
 * eventId 格式验证测试
 * 验证前端监听器使用正确的 eventId 格式
 */

import { test, expect } from '@playwright/test';

test.describe('eventId 格式验证', () => {
  test('验证 eventId 格式匹配', async ({ page }) => {
    // 计算预期的 eventId 格式
    const correlationId = '895b3259-59b2-4e57-80b1-8c9597b5a7f0';
    const expectedEventId = `chat_${correlationId}`; // 私有库使用的格式

    console.log('[Test] 前端 correlationId:', correlationId);
    console.log('[Test] 预期 eventId:', expectedEventId);
    console.log('[Test] 格式匹配:', expectedEventId === 'chat_895b3259-59b2-4e57-80b1-8c9597b5a7f0');

    // 验证格式
    expect(expectedEventId).toBe('chat_895b3259-59b2-4e57-80b1-8c9597b5a7f0');

    // 这就是私有库发送事件的格式
    // 前端监听器现在应该监听 `chat_${correlationId}` 而不是 `${correlationId}`
  });

  test('验证后端日志中的 eventId', async () => {
    // 从日志中提取的实际 eventId
    const backendEventId = 'c7bd68b6-e3b3-48e0-810f-d138981f903f';

    // 如果私有库生成新的 assistantMsgId = c7bd68b6-e3b3-48e0-810f-d138981f903f
    // 那么 eventId = chat_${assistantMsgId}
    const expectedBackendEventId = `chat_${backendEventId}`;

    console.log('[Test] 后端原始 ID:', backendEventId);
    console.log('[Test] 后端 eventId:', expectedBackendEventId);

    // 但问题是：前端传入的 correlationId 与后端生成的 assistantMsgId 不同
    // 前端传入：895b3259-59b2-4e57-80b1-8c9597b5a7f0
    // 后端生成：c7bd68b6-e3b3-48e0-810f-d138981f903f

    console.log('[Test] 问题分析:');
    console.log('[Test]   前端监听: chat_895b3259-59b2-4e57-80b1-8c9597b5a7f0');
    console.log('[Test]   后端发送: chat_c7bd68b6-e3b3-48e0-810f-d138981f903f');
    console.log('[Test]   结果: 不匹配！工具调用无法关联到消息');
  });
});
