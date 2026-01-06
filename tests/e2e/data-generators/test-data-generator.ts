/**
 * 大量测试数据生成器
 * 用于全覆盖测试消息持久化和恢复功能
 */

import { v4 as uuidv4 } from 'uuid';
import type { Message } from 'ifainew-core';

export interface ContentSegment {
  type: 'text' | 'tool';
  order: number;
  timestamp: number;
  content?: string;
  toolCallId?: string;
  startPos?: number;
  endPos?: number;
}

export interface TestDataMessage extends Message {
  contentSegments?: ContentSegment[];
  multiModalContent?: any[];
  references?: string[];
  agentId?: string;
  isAgentLive?: boolean;
}

/**
 * 生成测试消息
 */
export function generateTestMessage(options: {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  withContentSegments?: boolean;
  withToolCalls?: boolean;
  withMultiModal?: boolean;
  withReferences?: boolean;
  withAgentInfo?: boolean;
}): TestDataMessage {
  const {
    role,
    content,
    withContentSegments = false,
    withToolCalls = false,
    withMultiModal = false,
    withReferences = false,
    withAgentInfo = false,
  } = options;

  const message: TestDataMessage = {
    id: uuidv4(),
    role,
    content,
    timestamp: Date.now(),
  };

  // 添加 contentSegments（用于测试流式消息顺序恢复）
  if (withContentSegments && role === 'assistant') {
    const segments: ContentSegment[] = [];
    const chunkSize = 50; // 每 50 个字符为一个 segment

    for (let i = 0; i < content.length; i += chunkSize) {
      const chunk = content.slice(i, i + chunkSize);
      segments.push({
        type: 'text',
        order: segments.length,
        timestamp: Date.now() + segments.length * 10,
        content: chunk,
        startPos: i,
        endPos: i + chunk.length,
      });
    }

    message.contentSegments = segments;
  }

  // 添加 toolCalls
  if (withToolCalls && role === 'assistant') {
    message.toolCalls = [
      {
        id: uuidv4(),
        type: 'function',
        function: {
          name: 'agent_write_file',
          arguments: JSON.stringify({
            path: '/tmp/test.js',
            content: 'console.log("Hello, World!");',
          }),
        },
      },
    ];
    message.tool_call_id = uuidv4();
  }

  // 添加多模态内容
  if (withMultiModal) {
    message.multiModalContent = [
      { type: 'text', text: content },
      {
        type: 'image_url',
        image_url: {
          url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        },
      },
    ];
  }

  // 添加引用
  if (withReferences) {
    message.references = ['file:///tmp/test.js', 'file:///tmp/test2.js'];
  }

  // 添加 Agent 信息
  if (withAgentInfo) {
    message.agentId = 'test-agent-1';
    message.isAgentLive = true;
  }

  return message;
}

/**
 * 生成测试对话数据集
 */
export function generateTestDataSet(options: {
  messageCount?: number;
  includeComplexMessages?: boolean;
}): { messages: TestDataMessage[] } {
  const { messageCount = 50, includeComplexMessages = true } = options;

  const messages: TestDataMessage[] = [];

  // 1. 系统消息
  messages.push(
    generateTestMessage({
      role: 'system',
      content: 'You are a helpful AI assistant specialized in code generation.',
    })
  );

  // 2. 用户和助手对话
  for (let i = 0; i < Math.floor(messageCount / 2); i++) {
    // 用户消息
    messages.push(
      generateTestMessage({
        role: 'user',
        content: `User request #${i + 1}: Please help me with task ${i + 1}`,
        withMultiModal: includeComplexMessages && i % 5 === 0,
        withReferences: includeComplexMessages && i % 7 === 0,
      })
    );

    // 助手消息（带 contentSegments，模拟流式响应）
    messages.push(
      generateTestMessage({
        role: 'assistant',
        content: `Assistant response #${i + 1}: Here's the solution for task ${i + 1}. ` +
          'This is a longer response to test contentSegments tracking. '.repeat(5),
        withContentSegments: true,
        withToolCalls: includeComplexMessages && i % 3 === 0,
        withAgentInfo: includeComplexMessages && i % 4 === 0,
      })
    );
  }

  // 3. 工具响应消息
  if (includeComplexMessages) {
    for (let i = 0; i < 5; i++) {
      messages.push(
        generateTestMessage({
          role: 'tool',
          content: JSON.stringify({
            success: true,
            path: `/tmp/file${i}.js`,
            size: 1024 * (i + 1),
          }),
        })
      );
    }
  }

  return { messages };
}

/**
 * 生成边界测试数据
 */
export function generateEdgeCaseDataSets(): Array<{ name: string; messages: TestDataMessage[] }> {
  return [
    {
      name: 'Empty content',
      messages: [
        generateTestMessage({ role: 'user', content: '' }),
        generateTestMessage({
          role: 'assistant',
          content: '',
          withContentSegments: true,
        }),
      ],
    },
    {
      name: 'Very long content',
      messages: [
        generateTestMessage({
          role: 'user',
          content: 'Generate a very long response',
        }),
        generateTestMessage({
          role: 'assistant',
          content: 'A'.repeat(10000), // 10K 字符
          withContentSegments: true,
        }),
      ],
    },
    {
      name: 'Special characters',
      messages: [
        generateTestMessage({
          role: 'user',
          content: '测试特殊字符：🎉 ™️ ©️ ÷ø ≤ ≥',
        }),
        generateTestMessage({
          role: 'assistant',
          content: 'Response with 特殊字符：🚀 ✨ 💻 📱',
          withContentSegments: true,
        }),
      ],
    },
    {
      name: 'Multiple tool calls',
      messages: [
        generateTestMessage({ role: 'user', content: 'Create multiple files' }),
        generateTestMessage({
          role: 'assistant',
          content: 'I will create 5 files for you.',
          withContentSegments: true,
          withToolCalls: true,
        }),
      ],
    },
    {
      name: 'Mixed content types',
      messages: [
        generateTestMessage({
          role: 'user',
          content: 'Complex request with image',
          withMultiModal: true,
        }),
        generateTestMessage({
          role: 'assistant',
          content: 'Response with tools and references',
          withContentSegments: true,
          withToolCalls: true,
          withReferences: true,
          withAgentInfo: true,
        }),
      ],
    },
    {
      name: 'Consecutive streaming',
      messages: [
        generateTestMessage({ role: 'user', content: 'First request' }),
        generateTestMessage({
          role: 'assistant',
          content: 'First response with streaming',
          withContentSegments: true,
        }),
        generateTestMessage({ role: 'user', content: 'Second request' }),
        generateTestMessage({
          role: 'assistant',
          content: 'Second response with streaming',
          withContentSegments: true,
        }),
      ],
    },
  ];
}

/**
 * 生成压力测试数据（大量消息）
 */
export function generateStressTestData(options: {
  messageCount?: number;
}): { messages: TestDataMessage[] } {
  const { messageCount = 500 } = options;

  const messages: TestDataMessage[] = [];

  for (let i = 0; i < messageCount; i++) {
    if (i % 2 === 0) {
      messages.push(
        generateTestMessage({
          role: 'user',
          content: `User message ${i}`,
        })
      );
    } else {
      messages.push(
        generateTestMessage({
          role: 'assistant',
          content: `Assistant response ${i}`.repeat(10),
          withContentSegments: true,
        })
      );
    }
  }

  return { messages };
}

/**
 * 验证消息完整性
 */
export function validateMessageIntegrity(
  original: TestDataMessage,
  restored: any
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // 基本字段验证
  if (original.id !== restored.id) {
    errors.push(`ID mismatch: ${original.id} !== ${restored.id}`);
  }

  if (original.role !== restored.role) {
    errors.push(`Role mismatch: ${original.role} !== ${restored.role}`);
  }

  if (original.content !== restored.content) {
    errors.push(`Content mismatch: length ${original.content.length} !== ${restored.content?.length || 0}`);
  }

  // contentSegments 验证
  if (original.contentSegments) {
    if (!restored.contentSegments) {
      errors.push('contentSegments missing in restored message');
    } else if (original.contentSegments.length !== restored.contentSegments.length) {
      errors.push(
        `contentSegments count mismatch: ${original.contentSegments.length} !== ${restored.contentSegments.length}`
      );
    } else {
      // 验证每个 segment
      for (let i = 0; i < original.contentSegments.length; i++) {
        const origSeg = original.contentSegments[i];
        const restSeg = restored.contentSegments[i];

        if (origSeg.type !== restSeg.type) {
          errors.push(`Segment ${i} type mismatch: ${origSeg.type} !== ${restSeg.type}`);
        }

        if (origSeg.order !== restSeg.order) {
          errors.push(`Segment ${i} order mismatch: ${origSeg.order} !== ${restSeg.order}`);
        }
      }
    }
  }

  // toolCalls 验证
  if (original.toolCalls) {
    if (!restored.toolCalls) {
      errors.push('toolCalls missing in restored message');
    } else if (original.toolCalls.length !== restored.toolCalls.length) {
      errors.push(`toolCalls count mismatch: ${original.toolCalls.length} !== ${restored.toolCalls.length}`);
    }
  }

  // multiModalContent 验证
  if (original.multiModalContent) {
    if (!restored.multiModalContent) {
      errors.push('multiModalContent missing in restored message');
    }
  }

  // references 验证
  if (original.references) {
    if (!restored.references) {
      errors.push('references missing in restored message');
    } else if (original.references.length !== restored.references.length) {
      errors.push(`references count mismatch: ${original.references.length} !== ${restored.references.length}`);
    }
  }

  // agent info 验证
  if (original.agentId && original.agentId !== restored.agentId) {
    errors.push(`agentId mismatch: ${original.agentId} !== ${restored.agentId}`);
  }

  if (original.isAgentLive !== restored.isAgentLive) {
    errors.push(`isAgentLive mismatch: ${original.isAgentLive} !== ${restored.isAgentLive}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
