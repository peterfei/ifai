import { describe, it, expect, vi, beforeEach } from 'vitest';
import { estimateTokens } from '../../src/utils/tokenCounter';
import { TestDataGenerator } from '../../src/utils/testDataGenerator';

// Mock Tauri invoke
const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: any[]) => invokeMock(...args)
}));

describe('Token Accuracy & Stress Testing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Accuracy Verification (Mocked)', () => {
    it('should handle various code lengths accurately', async () => {
      // 模拟后端的计数规则：大约 4 字符 1 个 token (针对英文)
      invokeMock.mockImplementation(async (cmd, args) => {
        if (cmd === 'estimate_tokens_cmd') {
          return Math.ceil(args.text.length / 4);
        }
      });

      const samples = [
        { text: 'function hello() { console.log("world"); }', expectedMin: 10 },
        { text: 'a'.repeat(400), expected: 100 },
        { text: '', expected: 0 }
      ];

      for (const sample of samples) {
        const count = await estimateTokens(sample.text);
        if (sample.text === '') {
          expect(count).toBe(0);
        } else {
          expect(count).toBeGreaterThanOrEqual(sample.expectedMin || 0);
          if (sample.expected) expect(count).toBe(sample.expected);
        }
      }
    });
  });

  describe('Stress Testing (Payload handling) with Latency', () => {
    it('should handle extremely large code snippets (1MB+) with backend latency', async () => {
      const largeSnippet = 'x'.repeat(1024 * 1024); // Exactly 1MB
      
      // Simulate 150ms backend processing time
      invokeMock.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 150));
        return 250000;
      });

      const startTime = performance.now();
      const count = await estimateTokens(largeSnippet);
      const endTime = performance.now();

      console.log(`[Latency Test] Time taken for 1MB with 150ms delay: ${(endTime - startTime).toFixed(2)}ms`);
      
      expect(count).toBe(250000);
      expect(endTime - startTime).toBeGreaterThan(150);
    });

    it('should handle race conditions with rapid updates and latency', async () => {
      // 模拟后端延迟 - 使用闭包捕获每个请求的唯一ID
      let requestId = 0;
      const pendingRequests = new Map<number, Promise<number>>();

      invokeMock.mockImplementation(async () => {
        const id = ++requestId;
        // 交替延迟制造竞态条件
        const delay = id % 2 === 0 ? 50 : 200;
        await new Promise(resolve => setTimeout(resolve, delay));
        return id;
      });

      // 发送多个并发请求（注意：由于 JS 事件循环，这里实际是顺序调用）
      // 为了真正测试竞态，需要确保调用快速发生
      const p1 = estimateTokens('first');
      const p2 = estimateTokens('second');
      const p3 = estimateTokens('third');

      const results = await Promise.all([p1, p2, p3]);
      console.log(`[Race Test] Results with variable latency:`, results);

      expect(results).toHaveLength(3);
      // 验证所有请求都正确返回，即使返回顺序可能与发送顺序不同
      expect(results).toContain(1);
      expect(results).toContain(2);
      expect(results).toContain(3);
    });

    it('should correctly prioritize the latest request (Latest Wins Logic)', async () => {
      let latestCount = 0;
      let appliedCount = 0;
      
      const updateState = (val: number) => { appliedCount = val; };

      // 模拟组件内部逻辑
      let lastReqId = 0;
      const mockedUpdateTokenCount = async (text: string) => {
        const currentReqId = ++lastReqId;
        // 模拟后端：字数越多，处理越慢（造成返回顺序颠倒）
        const delay = text.length > 5 ? 200 : 50; 
        await new Promise(resolve => setTimeout(resolve, delay));
        
        if (currentReqId === lastReqId) {
          updateState(text.length);
        }
      };

      // 模拟：先发送一个大的（慢），再发送一个小的（快）
      const p1 = mockedUpdateTokenCount('long_content'); // req 1, 12 chars, 200ms
      const p2 = mockedUpdateTokenCount('short');        // req 2, 5 chars, 50ms

      await Promise.all([p1, p2]);

      // 即使 p2 先完成，它也是最新的，所以最终结果应该是 5
      expect(appliedCount).toBe(5);
      
      // 再次模拟：先快后慢（正常顺序）
      const p3 = mockedUpdateTokenCount('a');      // req 3
      const p4 = mockedUpdateTokenCount('abcde');  // req 4
      await Promise.all([p3, p4]);
      
      expect(appliedCount).toBe(5); // 最新的是 5
    });
  });
});
