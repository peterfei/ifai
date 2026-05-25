/**
 * 对话命名 TDD 测试 — 确认问题 + 验证修复
 *
 * 问题背景：
 * - 对话模式 (ConversationPanel) 通过 ConversationListPanel 创建对话，
 *   传入 title: t('common.untitled') → "未命名"
 * - 旧正则 /^(上午|下午|晚上)(的新对话|的对话 \d+)$/ 不匹配 "未命名"/"新对话"
 * - compact 模式隐藏 ThreadTabs，导致无重命名入口
 *
 * 修复：
 * - Fix-1: ConversationListPanel 不再覆盖默认标题
 * - Fix-2: 正则扩展为 /^(上午|下午|晚上)(的新对话|的对话 \d+)$|^(未命名|新对话)$/
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ===== Mocks =====
const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: any[]) => invokeMock(...args),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

// ===== 测试 =====
describe('对话命名问题确认 (CN)', () => {
  let useThreadStore: any;
  let useChatStore: any;
  let ThreadManager: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    invokeMock.mockResolvedValue({});

    // 清理全局状态
    if (typeof window !== 'undefined') {
      delete (window as any).__STORE_MAPPER_INITIALIZED__;
      delete (window as any).__EXECUTED_TOOLS__;
    }

    const threadModule = await import('../../stores/threadStore');
    useThreadStore = threadModule.useThreadStore;

    const chatModule = await import('../../stores/useChatStore');
    useChatStore = chatModule.useChatStore;

    const tmModule = await import('../../stores/threadManager');
    ThreadManager = tmModule.ThreadManager;

    // 重置 store 状态
    useThreadStore.setState({
      threads: {},
      activeThreadId: null,
      titleCounters: { '上午': 0, '下午': 0, '晚上': 0 },
    });

    useChatStore.setState({
      messages: [],
      currentThreadId: null,
    });
  });

  // ===== CN-1: 旧正则不匹配 "未命名"（问题记录） =====
  describe('CN-1: 旧正则不匹配 "未命名"（已修复）', () => {
    it('旧正则不匹配 "未命名"', () => {
      const OLD_REGEX = /^(上午|下午|晚上)(的新对话|的对话 \d+)$/;
      expect(OLD_REGEX.test('未命名')).toBe(false);
    });

    it('ConversationListPanel 路径: create({ title: "未命名" }) → 标题为 "未命名"', () => {
      const id = ThreadManager.create({ title: '未命名' });
      const thread = useThreadStore.getState().threads[id];
      expect(thread.title).toBe('未命名');
    });

    it('"未命名" 线程发送消息后现在能自动更新标题（修复后）', () => {
      const threadId = ThreadManager.create({ title: '未命名' });
      useChatStore.setState({ currentThreadId: threadId });

      const threadStore = useThreadStore.getState();
      const currentThread = threadStore.getThread(threadId);

      // 修复后：扩展正则匹配 "未命名"
      const EXPANDED_REGEX = /^(上午|下午|晚上)(的新对话|的对话 \d+)$|^(未命名|新对话)$/;
      expect(EXPANDED_REGEX.test(currentThread.title)).toBe(true);

      // updateThreadTitleFromMessage 现在会更新标题
      threadStore.updateThreadTitleFromMessage(threadId, '帮我写一个排序算法');

      const afterUpdate = useThreadStore.getState().threads[threadId];
      expect(afterUpdate.title).toBe('帮我写一个排序算法');
    });
  });

  // ===== CN-2: 默认标题匹配自动命名正则 =====
  describe('CN-2: 默认标题 "上午的新对话" 触发自动命名', () => {
    it('正则匹配 "上午的新对话"', () => {
      const DEFAULT_TITLE_REGEX = /^(上午|下午|晚上)(的新对话|的对话 \d+)$/;
      expect(DEFAULT_TITLE_REGEX.test('上午的新对话')).toBe(true);
    });

    it('正则匹配 "下午的对话 3"', () => {
      const DEFAULT_TITLE_REGEX = /^(上午|下午|晚上)(的新对话|的对话 \d+)$/;
      expect(DEFAULT_TITLE_REGEX.test('下午的对话 3')).toBe(true);
    });

    it('ThreadTabs 路径: create() 无 title → 标题为 "上午/下午/晚上的新对话"', () => {
      const id = ThreadManager.create();
      const thread = useThreadStore.getState().threads[id];
      // 标题应该是 "上午的新对话" / "下午的新对话" / "晚上的新对话" 之一
      const DEFAULT_TITLE_REGEX = /^(上午|下午|晚上)(的新对话|的对话 \d+)$/;
      expect(DEFAULT_TITLE_REGEX.test(thread.title)).toBe(true);
    });

    it('默认标题线程发送消息后自动更新标题', () => {
      // 创建默认标题线程（模拟 ThreadTabs 路径）
      const threadId = ThreadManager.create();
      const thread = useThreadStore.getState().threads[threadId];
      const originalTitle = thread.title;

      // 调用 updateThreadTitleFromMessage
      useThreadStore.getState().updateThreadTitleFromMessage(threadId, '帮我写一个排序算法');

      const afterUpdate = useThreadStore.getState().threads[threadId];
      // 标题应该被更新为消息内容的前 30 字符
      expect(afterUpdate.title).not.toBe(originalTitle);
      expect(afterUpdate.title).toBe('帮我写一个排序算法');
    });
  });

  // ===== CN-3: ConversationListPanel 使用 "未命名" 而非默认标题 =====
  describe('CN-3: 两条创建路径的标题差异', () => {
    it('ConversationListPanel 路径和 ThreadTabs 路径产生不同标题', () => {
      // ThreadTabs 路径（无 options.title）
      const id1 = ThreadManager.create();
      const title1 = useThreadStore.getState().threads[id1].title;

      // ConversationListPanel 路径（传入 title: "未命名"）
      const id2 = ThreadManager.create({ title: '未命名' });
      const title2 = useThreadStore.getState().threads[id2].title;

      // 确认标题不同
      expect(title1).not.toBe(title2);

      // ThreadTabs 标题匹配正则
      const DEFAULT_TITLE_REGEX = /^(上午|下午|晚上)(的新对话|的对话 \d+)$/;
      expect(DEFAULT_TITLE_REGEX.test(title1)).toBe(true);

      // ConversationListPanel 标题不匹配正则
      expect(DEFAULT_TITLE_REGEX.test(title2)).toBe(false);
    });
  });

  // ===== CN-4: 自动命名的消息内容提取 =====
  describe('CN-4: generateTitleFromMessage 内容提取', () => {
    it('短消息完整保留', () => {
      // 通过默认标题线程触发自动命名
      const threadId = ThreadManager.create();
      useThreadStore.getState().updateThreadTitleFromMessage(threadId, '你好');
      const thread = useThreadStore.getState().threads[threadId];
      expect(thread.title).toBe('你好');
    });

    it('长消息截断为 30 字符 + "..."', () => {
      const longMsg = '这是一段非常长的消息内容用于测试标题截断功能是否正常工作需要超过三十个字符';
      const threadId = ThreadManager.create();
      useThreadStore.getState().updateThreadTitleFromMessage(threadId, longMsg);
      const thread = useThreadStore.getState().threads[threadId];
      expect(thread.title).toBe(longMsg.slice(0, 30) + '...');
      expect(thread.title.length).toBe(33); // 30 + "..."
    });

    it('空消息回退为 "新对话"', () => {
      const threadId = ThreadManager.create();
      useThreadStore.getState().updateThreadTitleFromMessage(threadId, '');
      const thread = useThreadStore.getState().threads[threadId];
      expect(thread.title).toBe('新对话');
    });
  });

  // ===== CN-FIX: 修复后验证 =====

  /** 扩展后的默认标题正则（修复后） */
  const EXPANDED_DEFAULT_TITLE_REGEX = /^(上午|下午|晚上)(的新对话|的对话 \d+)$|^(未命名|新对话)$/;

  describe('CN-FIX: 修复后验证', () => {
    it('CN-FIX-1: 扩展正则匹配 "未命名"', () => {
      expect(EXPANDED_DEFAULT_TITLE_REGEX.test('未命名')).toBe(true);
    });

    it('CN-FIX-2: 扩展正则匹配 "新对话"', () => {
      expect(EXPANDED_DEFAULT_TITLE_REGEX.test('新对话')).toBe(true);
    });

    it('CN-FIX-3: 扩展正则仍匹配 "上午的新对话"', () => {
      expect(EXPANDED_DEFAULT_TITLE_REGEX.test('上午的新对话')).toBe(true);
    });

    it('CN-FIX-4: "未命名" 线程现在能自动更新标题', () => {
      // 创建 "未命名" 线程
      const threadId = ThreadManager.create({ title: '未命名' });
      const thread = useThreadStore.getState().threads[threadId];
      expect(thread.title).toBe('未命名');

      // 发送消息 → 应该触发自动命名
      useThreadStore.getState().updateThreadTitleFromMessage(threadId, '帮我写一个排序算法');

      const afterUpdate = useThreadStore.getState().threads[threadId];
      expect(afterUpdate.title).toBe('帮我写一个排序算法');
    });

    it('CN-FIX-5: "新对话" 线程也能自动更新标题', () => {
      const threadId = ThreadManager.create({ title: '新对话' });

      useThreadStore.getState().updateThreadTitleFromMessage(threadId, '你好世界');

      const afterUpdate = useThreadStore.getState().threads[threadId];
      expect(afterUpdate.title).toBe('你好世界');
    });

    it('CN-FIX-6: ConversationListPanel 新路径使用默认标题', () => {
      // 修复后 ConversationListPanel 不再传 title → ThreadManager.create()
      const id = ThreadManager.create();
      const thread = useThreadStore.getState().threads[id];

      // 标题应该是 "上午的新对话" / "下午的新对话" / "晚上的新对话" 之一
      const DEFAULT_TITLE_REGEX = /^(上午|下午|晚上)(的新对话|的对话 \d+)$/;
      expect(DEFAULT_TITLE_REGEX.test(thread.title)).toBe(true);
    });

    it('CN-FIX-7: 自定义标题不受自动命名影响', () => {
      const threadId = ThreadManager.create({ title: '自定义标题' });

      useThreadStore.getState().updateThreadTitleFromMessage(threadId, '新消息');

      const afterUpdate = useThreadStore.getState().threads[threadId];
      // 自定义标题不应被覆盖
      expect(afterUpdate.title).toBe('自定义标题');
    });
  });
});
