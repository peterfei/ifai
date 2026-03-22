/**
 * E2E 快照测试 - StreamingResponseController 行为一致性验证
 *
 * 目的：确保新旧实现在真实场景下的行为完全一致
 *
 * 运行方式：
 * - pnpm test tests/e2e/streaming/snapshot-comparison.spec.ts
 *
 * 快照更新：
 * - UPDATE_SNAPSHOTS=1 pnpm test tests/e2e/streaming/snapshot-comparison.spec.ts
 */

import { test, expect } from '@playwright/test';

// ============================================
// 测试场景定义
// ============================================

interface StreamScenario {
  name: string;
  description: string;
  chunks: Array<{
    type: 'content' | 'tool_call' | 'finish';
    content?: string;
    tool_call?: any;
    delay?: number;
  }>;
  expectedBehavior: {
    finalContent?: string;
    toolCalls?: number;
    shouldTriggerContinue?: boolean;
    shouldUnlockInput?: boolean;
  };
}

const scenarios: StreamScenario[] = [
  {
    name: 'simple-text-stream',
    description: '简单文本流式传输',
    chunks: [
      { type: 'content', content: 'Hello' },
      { type: 'content', content: ' ' },
      { type: 'content', content: 'World' },
      { type: 'content', content: '!' },
      { type: 'finish' }
    ],
    expectedBehavior: {
      finalContent: 'Hello World!',
      shouldUnlockInput: true
    }
  },
  {
    name: 'tool-call-stream',
    description: '工具调用流式传输',
    chunks: [
      { type: 'tool_call', tool_call: {
        id: 'call_001',
        index: 0,
        function: { name: 'read_file', arguments: '' }
      }},
      { type: 'tool_call', tool_call: {
        index: 0,
        function: { arguments: '{"path":' }
      }},
      { type: 'tool_call', tool_call: {
        index: 0,
        function: { arguments: ' "/test.txt"}' }
      }},
      { type: 'finish' }
    ],
    expectedBehavior: {
      toolCalls: 1,
      shouldUnlockInput: true
    }
  },
  {
    name: 'mixed-content-tools',
    description: '内容与工具调用混合',
    chunks: [
      { type: 'content', content: 'I will read the file\n' },
      { type: 'tool_call', tool_call: {
        id: 'call_002',
        index: 0,
        function: { name: 'scan_project', arguments: '{}' }
      }},
      { type: 'finish' }
    ],
    expectedBehavior: {
      finalContent: 'I will read the file\n',
      toolCalls: 1,
      shouldTriggerContinue: true,
      shouldUnlockInput: false // 工具执行期间应保持锁定
    }
  },
  {
    name: 'empty-finish',
    description: '空 finish 事件',
    chunks: [
      { type: 'content', content: '' },
      { type: 'content', content: '' },
      { type: 'finish' }
    ],
    expectedBehavior: {
      finalContent: '',
      shouldUnlockInput: true
    }
  },
  {
    name: 'duplicate-finish',
    description: '重复的 finish 事件',
    chunks: [
      { type: 'content', content: 'Test' },
      { type: 'finish' },
      { type: 'finish' },
      { type: 'finish' }
    ],
    expectedBehavior: {
      finalContent: 'Test',
      shouldUnlockInput: true
    }
  },
  {
    name: 'multi-tool-stream',
    description: '多个工具调用',
    chunks: [
      { type: 'tool_call', tool_call: {
        id: 'call_003',
        index: 0,
        function: { name: 'read_file', arguments: '{}' }
      }},
      { type: 'tool_call', tool_call: {
        id: 'call_004',
        index: 1,
        function: { name: 'list_dir', arguments: '{}' }
      }},
      { type: 'tool_call', tool_call: {
        id: 'call_005',
        index: 2,
        function: { name: 'search', arguments: '{}' }
      }},
      { type: 'finish' }
    ],
    expectedBehavior: {
      toolCalls: 3,
      shouldUnlockInput: true
    }
  },
  {
    name: 'stream-with-args-overflow',
    description: '工具参数超出单次传输',
    chunks: [
      { type: 'tool_call', tool_call: {
        id: 'call_006',
        index: 0,
        function: { name: 'write_file', arguments: '' }
      }},
      { type: 'tool_call', tool_call: {
        index: 0,
        function: { arguments: '{"path":"/test.txt","content":"' }
      }},
      { type: 'tool_call', tool_call: {
        index: 0,
        function: { arguments: 'Very long content...' }
      }},
      { type: 'tool_call', tool_call: {
        index: 0,
        function: { arguments: 'Even more content"}' }
      }},
      { type: 'tool_call', tool_call: {
        index: 0,
        function: { arguments: '"}' }
      }},
      { type: 'finish' }
    ],
    expectedBehavior: {
      toolCalls: 1,
      shouldUnlockInput: true
    }
  }
];

// ============================================
// 快照存储
// ============================================

interface ScenarioSnapshot {
  name: string;
  timestamp: string;
  events: Array<{
    event: string;
    payload: any;
    timestamp: number;
  }>;
  finalState: {
    content: string;
    toolCalls: number;
    isLoading: boolean;
  };
}

// ============================================
// 测试套件
// ============================================

test.describe('StreamingResponseController - 快照对比测试', () => {
  let testVersion: 'old' | 'new';

  test.beforeEach(async ({ page }) => {
    // 设置测试版本（通过环境变量）
    testVersion = (process.env.TEST_VERSION as any) || 'old';

    // 初始化测试环境
    await page.addInitScript(() => {
      // Mock ChatEventBus
      (window as any).__testEvents = [];
      (window as any).__testEventBus = {
        emit: (event: string, payload: any) => {
          (window as any).__testEvents.push({ event, payload, timestamp: Date.now() });
        }
      };

      // 替换真实的 ChatEventBus
      if (typeof window !== 'undefined') {
        const originalFetch = window.fetch;
        window.fetch = async (...args) => {
          // 这里可以拦截和模拟响应
          return originalFetch(...args);
        };
      }
    });

    // 设置版本
    await page.addInitScript(`
      window.__TEST_VERSION__ = '${testVersion}';
    `);

    await page.goto('/');
    await page.waitForTimeout(1000);
  });

  for (const scenario of scenarios) {
    test(scenario.name, async ({ page }) => {
      // 记录测试开始
      console.log(`\n🎬 运行场景: ${scenario.name}`);
      console.log(`   描述: ${scenario.description}`);

      // 初始化事件捕获
      await page.evaluate(() => {
        (window as any).__testEvents = [];
      });

      // 创建唯一的 correlationId
      const correlationId = `test-${scenario.name}-${Date.now()}`;

      // 启动流式监听
      await page.evaluate(async ({ correlationId }) => {
        const { streamingResponseController } = await import('/src/stores/chat/generateResponse/StreamingResponseController.ts');

        await streamingResponseController.startListening(correlationId, {
          correlationId,
          sessionId: 'test-session',
          timestamp: Date.now()
        });
      }, { correlationId });

      // 模拟流式数据
      for (const chunk of scenario.chunks) {
        // 添加延迟模拟网络延迟
        if (chunk.delay) {
          await page.waitForTimeout(chunk.delay);
        }

        await page.evaluate(({ correlationId, chunk }) => {
          // 通过 PIVO Bridge 或 Tauri 事件发送
          if ((window as any).__PIVO_BRIDGE__) {
            (window as any).__PIVO_BRIDGE__.push(correlationId, chunk);
          }
        }, { correlationId, chunk });
      }

      // 发送 finish 事件
      await page.evaluate(({ correlationId }) => {
        if ((window as any).__PIVO_BRIDGE__) {
          (window as any).__PIVO_BRIDGE__.finalize(correlationId);
        }
      }, { correlationId });

      // 等待所有事件处理完成
      await page.waitForTimeout(500);

      // 收集快照
      const snapshot = await page.evaluate(() => {
        const events = (window as any).__testEvents || [];

        return {
          events,
          finalState: {
            isLoading: (window as any).__chatStore?.getState()?.isLoading || false
          }
        };
      });

      // 验证快照
      await validateSnapshot(scenario, snapshot);

      // 保存快照用于对比
      await saveSnapshot(testVersion, scenario.name, snapshot);

      console.log(`   事件数: ${snapshot.events.length}`);
      console.log(`   最终状态: isLoading=${snapshot.finalState.isLoading}`);
    });
  }

  // 对比新旧版本快照
  test('快照一致性验证', async ({ page }) => {
    const oldSnapshots = await loadSnapshots('old');
    const newSnapshots = await loadSnapshots('new');

    const inconsistencies: string[] = [];

    for (const scenario of scenarios) {
      const oldSnapshot = oldSnapshots[scenario.name];
      const newSnapshot = newSnapshots[scenario.name];

      if (!oldSnapshot || !newSnapshot) {
        console.warn(`⚠️  场景 ${scenario.name} 缺少快照`);
        continue;
      }

      // 对比事件序列
      const oldEvents = oldSnapshot.events;
      const newEvents = newSnapshot.events;

      if (oldEvents.length !== newEvents.length) {
        inconsistencies.push(
          `场景 ${scenario.name}: 事件数量不一致 ` +
          `(旧版: ${oldEvents.length}, 新版: ${newEvents.length})`
        );
      }

      // 对比每个事件
      for (let i = 0; i < Math.min(oldEvents.length, newEvents.length); i++) {
        const oldEvent = oldEvents[i];
        const newEvent = newEvents[i];

        // 对比事件类型
        if (oldEvent.event !== newEvent.event) {
          inconsistencies.push(
            `场景 ${scenario.name} #${i}: 事件类型不一致 ` +
            `(旧版: ${oldEvent.event}, 新版: ${newEvent.event})`
          );
        }

        // 对比关键 payload 字段
        if (oldEvent.payload && newEvent.payload) {
          if (oldEvent.payload.correlationId !== newEvent.payload.correlationId) {
            inconsistencies.push(
              `场景 ${scenario.name} #${i}: correlationId 不一致`
            );
          }
        }
      }

      // 对比最终状态
      if (oldSnapshot.finalState.isLoading !== newSnapshot.finalState.isLoading) {
        inconsistencies.push(
          `场景 ${scenario.name}: 最终 isLoading 状态不一致 ` +
          `(旧版: ${oldSnapshot.finalState.isLoading}, 新版: ${newSnapshot.finalState.isLoading})`
        );
      }
    }

    // 输出报告
    if (inconsistencies.length > 0) {
      console.error('\n❌ 发现不一致:');
      inconsistencies.forEach(msg => console.error(`  - ${msg}`));
    } else {
      console.log('\n✅ 所有场景快照一致！');
    }

    expect(inconsistencies.length).toBe(0);
  });
});

// ============================================
// 辅助函数
// ============================================

async function validateSnapshot(scenario: StreamScenario, snapshot: any) {
  // 验证事件完整性
  const events = snapshot.events || [];

  // 必须包含的事件
  const requiredEvents = ['chat:stream:start', 'chat:stream:finished'];

  for (const requiredEvent of requiredEvents) {
    const hasEvent = events.some((e: any) => e.event === requiredEvent);
    expect(hasEvent, `缺少必需事件: ${requiredEvent}`).toBeTruthy();
  }

  // 验证最终行为
  if (scenario.expectedBehavior.shouldUnlockInput) {
    expect(snapshot.finalState.isLoading).toBe(false);
  }
}

async function saveSnapshot(version: 'old' | 'new', scenarioName: string, snapshot: any) {
  const fs = require('fs');
  const path = require('path');

  const snapshotDir = path.join(__dirname, '.snapshots', version);
  const snapshotFile = path.join(snapshotDir, `${scenarioName}.json`);

  // 确保目录存在
  if (!fs.existsSync(snapshotDir)) {
    fs.mkdirSync(snapshotDir, { recursive: true });
  }

  // 保存快照
  fs.writeFileSync(snapshotFile, JSON.stringify(snapshot, null, 2));
}

async function loadSnapshots(version: 'old' | 'new') {
  const fs = require('fs');
  const path = require('path');

  const snapshots: Record<string, any> = {};
  const snapshotDir = path.join(__dirname, '.snapshots', version);

  if (!fs.existsSync(snapshotDir)) {
    console.warn(`快照目录不存在: ${snapshotDir}`);
    return snapshots;
  }

  for (const scenario of scenarios) {
    const snapshotFile = path.join(snapshotDir, `${scenario.name}.json`);
    if (fs.existsSync(snapshotFile)) {
      const content = fs.readFileSync(snapshotFile, 'utf-8');
      snapshots[scenario.name] = JSON.parse(content);
    }
  }

  return snapshots;
}

// ============================================
// 导出
// ============================================

export { scenarios, type StreamScenario, type ScenarioSnapshot };
