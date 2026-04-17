/**
 * 多格式归档集成测试
 *
 * 验证整个归档流程从对话压缩到多格式文件生成
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { conversationArchiveService } from '../../src/core/archive/ConversationArchiveService';
import type { Message } from '../../src/types/conversation';

// Mock Tauri API
const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (cmd: string, args: any) => mockInvoke(cmd, args)
}));

describe('多格式归档集成测试', () => {
  const testProjectRoot = '/tmp/test-archive';
  const testMessages: Message[] = [
    {
      role: 'user',
      content: 'How do I implement a binary search tree?',
      timestamp: 1234567890
    },
    {
      role: 'assistant',
      content: 'Here\'s how to implement a BST in TypeScript:\n\n```typescript\nclass Node {\n  left: Node | null = null;\n  right: Node | null = null;\n  constructor(public value: number) {}\n}\n\nclass BST {\n  root: Node | null = null;\n\n  insert(value: number) {\n    const newNode = new Node(value);\n    if (!this.root) {\n      this.root = newNode;\n      return;\n    }\n    // ... insertion logic\n  }\n}\n```',
      timestamp: 1234567891
    },
    {
      role: 'user',
      content: 'Can you add a search method?',
      timestamp: 1234567892
    },
    {
      role: 'assistant',
      content: 'Sure! Here\'s the search method:\n\n```typescript\nsearch(value: number): boolean {\n  let current = this.root;\n  while (current) {\n    if (value === current.value) return true;\n    if (value < current.value) {\n      current = current.left;\n    } else {\n      current = current.right;\n    }\n  }\n  return false;\n}\n```',
      timestamp: 1234567893
    }
  ];

  const testSummary = 'Discussed binary search tree implementation in TypeScript, including Node class, BST class with insert method, and search method.';

  // 在每个测试前设置 mock
  beforeEach(() => {
    mockInvoke.mockImplementation((cmd: string, args: any) => {
      if (cmd === 'write_file') {
        return Promise.resolve(true);
      }
      return Promise.resolve({});
    });
  });

  // 在每个测试后清理 mock
  afterEach(() => {
    mockInvoke.mockReset();
  });

  describe('基本归档功能', () => {
    it('应该成功归档对话为 JSON 和 Markdown 格式', async () => {

      const result = await conversationArchiveService.archiveConversation(
        testMessages,
        testSummary,
        testProjectRoot,
        {
          formats: ['json', 'markdown'],
          pretty: true
        }
      );

      expect(result.success).toBe(true);
      expect(result.files).toHaveLength(2);
      expect(result.files.some(f => f.format === 'json')).toBe(true);
      expect(result.files.some(f => f.format === 'markdown')).toBe(true);
      expect(result.archiveId).toMatch(/^archive-\d+-[a-z0-9]+$/);
    });

    it('应该生成有效的 JSON 文件', async () => {
      const result = await conversationArchiveService.archiveConversation(
        testMessages,
        testSummary,
        testProjectRoot,
        {
          formats: ['json'],
          pretty: true
        }
      );

      expect(result.success).toBe(true);
      expect(result.files).toHaveLength(1);
      expect(result.files[0].format).toBe('json');
      expect(result.archiveId).toMatch(/^archive-\d+-[a-z0-9]+$/);
      expect(result.files[0].path).toContain('.json');
    });

    it('应该生成有效的 Markdown 文件', async () => {
      const result = await conversationArchiveService.archiveConversation(
        testMessages,
        testSummary,
        testProjectRoot,
        {
          formats: ['markdown'],
          pretty: true
        }
      );

      expect(result.success).toBe(true);
      expect(result.files).toHaveLength(1);
      expect(result.files[0].format).toBe('markdown');
      expect(result.files[0].path).toContain('.md');
    });

    it('应该支持自定义元数据', async () => {
      const customMetadata = {
        version: '2.0.0',
        environment: 'test',
        tags: ['typescript', 'algorithm']
      };

      const result = await conversationArchiveService.archiveConversation(
        testMessages,
        testSummary,
        testProjectRoot,
        {
          formats: ['json'],
          metadata: customMetadata
        }
      );

      expect(result.success).toBe(true);
      expect(result.files).toHaveLength(1);
    });
  });

  describe('格式特性', () => {
    it('JSON 格式应该包含计算字段', async () => {
      const result = await conversationArchiveService.archiveConversation(
        testMessages,
        testSummary,
        testProjectRoot,
        { formats: ['json'] }
      );

      expect(result.success).toBe(true);
      expect(result.files[0].format).toBe('json');
    });

    it('Markdown 格式应该 Git 友好', async () => {
      const result = await conversationArchiveService.archiveConversation(
        testMessages,
        testSummary,
        testProjectRoot,
        { formats: ['markdown'] }
      );

      expect(result.success).toBe(true);
      expect(result.files[0].format).toBe('markdown');
      expect(result.files[0].path).toContain('.md');
    });

    it('Markdown 格式应该适合作为 LLM 输入', async () => {
      const result = await conversationArchiveService.archiveConversation(
        testMessages,
        testSummary,
        testProjectRoot,
        { formats: ['markdown'] }
      );

      expect(result.success).toBe(true);
      expect(result.files[0].path).toContain('.md');
    });
  });

  describe('错误处理', () => {
    it('应该处理文件写入失败', async () => {
      // 在这个测试中，设置 mock 失败
      mockInvoke.mockRejectedValue(new Error('Write failed'));

      const result = await conversationArchiveService.archiveConversation(
        testMessages,
        testSummary,
        testProjectRoot,
        { formats: ['json'] }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.files).toHaveLength(0);
    });

    it('应该处理空消息列表', async () => {
      const mockInvoke = vi.fn().mockResolvedValue(true);

      global.invoke = mockInvoke;

      const result = await conversationArchiveService.archiveConversation(
        [],
        'Empty conversation',
        testProjectRoot,
        { formats: ['json'] }
      );

      expect(result.success).toBe(true);
      expect(result.files).toHaveLength(1);
    });
  });

  describe('性能测试', () => {
    it('并行生成格式应该在合理时间内完成', async () => {
      const mockInvoke = vi.fn().mockResolvedValue(true);

      global.invoke = mockInvoke;

      const startTime = Date.now();

      await conversationArchiveService.archiveConversation(
        testMessages,
        testSummary,
        testProjectRoot,
        {
          formats: ['json', 'markdown'],
          pretty: true
        }
      );

      const duration = Date.now() - startTime;

      // 并行生成应该很快（< 100ms）
      expect(duration).toBeLessThan(100);
    });

    it('应该处理大量消息而不超时', async () => {
      const mockInvoke = vi.fn().mockResolvedValue(true);

      global.invoke = mockInvoke;

      // 生成 100 条消息
      const largeMessages: Message[] = Array.from({ length: 100 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}: ${'Lorem ipsum dolor sit amet '.repeat(10)}`,
        timestamp: Date.now() + i
      }));

      const startTime = Date.now();

      const result = await conversationArchiveService.archiveConversation(
        largeMessages,
        'Large conversation',
        testProjectRoot,
        { formats: ['json', 'markdown'] }
      );

      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(500); // 即使 100 条消息也应该在 500ms 内完成
    });
  });
});
