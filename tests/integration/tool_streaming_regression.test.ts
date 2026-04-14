
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useChatStore } from '../../src/stores/useChatStore';
import { useSettingsStore } from '../../src/stores/settingsStore';
import { useThreadStore } from '../../src/stores/threadStore';

// Mock Tauri APIs
const invokeMock = vi.fn();
const listenMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: any[]) => invokeMock(...args)
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: (...args: any[]) => listenMock(...args)
}));

describe.skip('Tool Call Streaming Regression (v0.4.0)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useChatStore.setState({ messages: [], isLoading: false });
    useThreadStore.getState().activeThreadId = 'test-thread';
    
    useSettingsStore.setState({
      providers: [{
        id: 'test-provider',
        name: 'Test Provider',
        enabled: true,
        apiKey: 'test-key',
        baseUrl: 'https://api.test.com',
        models: ['test-model'],
        protocol: 'openai'
      }],
      currentProviderId: 'test-provider',
      currentModel: 'test-model',
      enableNaturalLanguageAgentTrigger: false
    });

    listenMock.mockResolvedValue(() => {});
  });

  it('SHOULD update tool call arguments incrementally during streaming', async () => {
    const messageContent = '重构 README.md';
    const providerId = 'test-provider';
    const modelId = 'test-model';

    invokeMock.mockResolvedValue({ should_use_local: false });

    const eventListeners: Record<string, (event: any) => void> = {};
    listenMock.mockImplementation((event, callback) => {
      eventListeners[event] = callback;
      return Promise.resolve(() => {});
    });

    // 1. 发送消息
    await useChatStore.getState().sendMessage(messageContent, providerId, modelId);

    const messages = useChatStore.getState().messages;
    const assistantMsgId = messages[1].id;
    const streamCallback = eventListeners[assistantMsgId];

    // 模拟 DeepSeek 的流式 tool_calls (分段发送 arguments)
    // Chunk 1: 开始 tool_call
    streamCallback({ 
      payload: JSON.stringify({ 
        type: 'tool_call', 
        toolCall: { 
          index: 0, 
          id: 'call_123', 
          function: { name: 'agent_write_file', arguments: '{"rel_path":' } 
        } 
      }) 
    });

    // 触发 RAF
    await new Promise(resolve => requestAnimationFrame(resolve));

    let currentMsg = useChatStore.getState().messages[1];
    expect(currentMsg.toolCalls).toBeDefined();
    expect(currentMsg.toolCalls![0].function?.arguments).toBe('{"rel_path":');

    // Chunk 2: 更多参数内容 (模拟 DeepSeek: 缺失 id)
    streamCallback({ 
      payload: JSON.stringify({ 
        type: 'tool_call', 
        toolCall: { 
          index: 0, 
          function: { arguments: '"README.md"' } 
        } 
      }) 
    });

    await new Promise(resolve => requestAnimationFrame(resolve));

    currentMsg = useChatStore.getState().messages[1];
    expect(currentMsg.toolCalls![0].function?.arguments).toBe('{"rel_path":"README.md"');

    // Chunk 3: 结束参数 (模拟 DeepSeek: 缺失 id)
    streamCallback({ 
      payload: JSON.stringify({ 
        type: 'tool_call', 
        toolCall: { 
          index: 0, 
          function: { arguments: '}' } 
        } 
      }) 
    });

    await new Promise(resolve => requestAnimationFrame(resolve));

    currentMsg = useChatStore.getState().messages[1];
    expect(currentMsg.toolCalls![0].function?.arguments).toBe('{"rel_path":"README.md"}');
    expect(currentMsg.toolCalls![0].args.rel_path).toBe('README.md');
  });

  it('SHOULD extract partial content using regex when JSON is incomplete', async () => {
    const messageContent = '测试正则提取';
    const providerId = 'test-provider';
    const modelId = 'test-model';

    invokeMock.mockResolvedValue({ should_use_local: false });

    const eventListeners: Record<string, (event: any) => void> = {};
    listenMock.mockImplementation((event, callback) => {
      eventListeners[event] = callback;
      return Promise.resolve(() => {});
    });

    await useChatStore.getState().sendMessage(messageContent, providerId, modelId);
    const assistantMsgId = useChatStore.getState().messages[1].id;
    const streamCallback = eventListeners[assistantMsgId];

    // 模拟 RAF
    const originalRaf = window.requestAnimationFrame;
    window.requestAnimationFrame = (cb) => { cb(0); return 0; };

    try {
      // Chunk 1: 部分 content 参数，且没有闭合引号
      streamCallback({ 
        payload: JSON.stringify({ 
          type: 'tool_call', 
          toolCall: { 
            index: 0, 
            id: 'call_regex', 
            function: { name: 'agent_write_file', arguments: '{"content": "Hello' } 
          } 
        }) 
      });

      let msg = useChatStore.getState().messages[1];
      // 应该通过正则提取出 "Hello"
      expect(msg.toolCalls![0].args.content).toBe('Hello');

      // Chunk 2: 更多内容，包含转义换行，仍未闭合
      streamCallback({ 
        payload: JSON.stringify({ 
          type: 'tool_call', 
          toolCall: { 
            index: 0, 
            function: { arguments: '\\nWorld' } 
          } 
        }) 
      });

      msg = useChatStore.getState().messages[1];
      expect(msg.toolCalls![0].args.content).toBe('Hello\nWorld');

      // Chunk 3: 闭合引号和括号，JSON.parse 现在应该成功
      streamCallback({ 
        payload: JSON.stringify({ 
          type: 'tool_call', 
          toolCall: { 
            index: 0, 
            function: { arguments: '"}' } 
          } 
        }) 
      });

      msg = useChatStore.getState().messages[1];
      expect(msg.toolCalls![0].args.content).toBe('Hello\nWorld');
      expect(msg.toolCalls![0].function?.arguments).toBe('{"content": "Hello\\nWorld"}');
    } finally {
      window.requestAnimationFrame = originalRaf;
    }
  });

  it('SHOULD extract MULTILINE content using regex during streaming', async () => {
    const messageContent = '重构 README 多行';
    const providerId = 'test-provider';
    const modelId = 'test-model';

    invokeMock.mockResolvedValue({ should_use_local: false });

    const eventListeners: Record<string, (event: any) => void> = {};
    listenMock.mockImplementation((event, callback) => {
      eventListeners[event] = callback;
      return Promise.resolve(() => {});
    });

    await useChatStore.getState().sendMessage(messageContent, providerId, modelId);
    const assistantMsgId = useChatStore.getState().messages[1].id;
    const streamCallback = eventListeners[assistantMsgId];

    // 模拟 RAF
    const originalRaf = window.requestAnimationFrame;
    window.requestAnimationFrame = (cb) => { cb(0); return 0; };

    try {
      // Chunk 1: 开始 content，包含真实换行符（LLM 有时会直接发换行而非 \n）
      streamCallback({ 
        payload: JSON.stringify({ 
          type: 'tool_call', 
          toolCall: { 
            index: 0, 
            id: 'call_multiline', 
            function: { name: 'agent_write_file', arguments: '{"content": "Line 1\nLine 2' } 
          } 
        }) 
      });

      let msg = useChatStore.getState().messages[1];
      expect(msg.toolCalls![0].args.content).toBe('Line 1\nLine 2');

      // Chunk 2: 更多内容
      streamCallback({ 
        payload: JSON.stringify({ 
          type: 'tool_call', 
          toolCall: { 
            index: 0, 
            function: { arguments: '\nLine 3' } 
          } 
        }) 
      });

      msg = useChatStore.getState().messages[1];
      expect(msg.toolCalls![0].args.content).toBe('Line 1\nLine 2\nLine 3');
    } finally {
      window.requestAnimationFrame = originalRaf;
    }
  });

  it('SHOULD handle HIGHLY FRAGMENTED chunks (DeepSeek style)', async () => {
    const messageContent = '碎片化测试';
    const providerId = 'test-provider';
    const modelId = 'test-model';

    invokeMock.mockResolvedValue({ should_use_local: false });

    const eventListeners: Record<string, (event: any) => void> = {};
    listenMock.mockImplementation((event, callback) => {
      eventListeners[event] = callback;
      return Promise.resolve(() => {});
    });

    await useChatStore.getState().sendMessage(messageContent, providerId, modelId);
    const assistantMsgId = useChatStore.getState().messages[1].id;
    const streamCallback = eventListeners[assistantMsgId];

    const originalRaf = window.requestAnimationFrame;
    window.requestAnimationFrame = (cb) => { cb(0); return 0; };

    try {
      // Chunk 1: 只有 index 和 id，没名字
      streamCallback({ 
        payload: JSON.stringify({ 
          type: 'tool_call', 
          toolCall: { index: 0, id: 'call_fragmented' } 
        }) 
      });

      // Chunk 2: 只有名字的一半
      streamCallback({ 
        payload: JSON.stringify({ 
          type: 'tool_call', 
          toolCall: { index: 0, function: { name: 'agent_write' } } 
        }) 
      });

      // Chunk 3: 名字的另一半
      streamCallback({ 
        payload: JSON.stringify({ 
          type: 'tool_call', 
          toolCall: { index: 0, function: { name: '_file' } } 
        }) 
      });

      // Chunk 4: 参数的开始
      streamCallback({ 
        payload: JSON.stringify({ 
          type: 'tool_call', 
          toolCall: { index: 0, function: { arguments: '{"rel_path": "' } } 
        }) 
      });

      let msg = useChatStore.getState().messages[1];
      expect(msg.toolCalls).toBeDefined();
      expect(msg.toolCalls![0].tool).toBe('agent_write_file');
      
      // Chunk 5: 参数内容
      streamCallback({ 
        payload: JSON.stringify({ 
          type: 'tool_call', 
          toolCall: { index: 0, function: { arguments: 'test.txt"' } } 
        }) 
      });

      msg = useChatStore.getState().messages[1];
      expect(msg.toolCalls![0].args.rel_path).toBe('test.txt');
    } finally {
      window.requestAnimationFrame = originalRaf;
    }
  });

  it('SHOULD extract content GREEDILY even when JSON is unclosed', async () => {
    const messageContent = '贪婪匹配测试';
    const providerId = 'test-provider';
    const modelId = 'test-model';

    invokeMock.mockResolvedValue({ should_use_local: false });

    const eventListeners: Record<string, (event: any) => void> = {};
    listenMock.mockImplementation((event, callback) => {
      eventListeners[event] = callback;
      return Promise.resolve(() => {});
    });

    await useChatStore.getState().sendMessage(messageContent, providerId, modelId);
    const assistantMsgId = useChatStore.getState().messages[1].id;
    const streamCallback = eventListeners[assistantMsgId];

    const originalRaf = window.requestAnimationFrame;
    window.requestAnimationFrame = (cb) => { cb(0); return 0; };

    try {
      // Chunk: 一个典型的流式内容，包含了实际数据但 JSON 未闭合
      streamCallback({ 
        payload: JSON.stringify({ 
          type: 'tool_call', 
          toolCall: { 
            index: 0, 
            id: 'call_greedy', 
            function: { name: 'agent_write_file', arguments: '{"content": "This should be extracted' } 
          } 
        }) 
      });

      let msg = useChatStore.getState().messages[1];
      // 如果是非贪婪匹配，这里可能会得到 "" 而不是 "This should be extracted"
      expect(msg.toolCalls![0].args.content).toBe('This should be extracted');
    } finally {
      window.requestAnimationFrame = originalRaf;
    }
  });
});
