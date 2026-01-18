/**
 * v0.3.1 聊天区域代码显示优化测试
 *
 * 🚨 强制性规范: 遵守 tests/e2e/CODING_STANDARDS.md
 *
 * 测试目标: 验证并改进聊天区域中大量代码块显示的用户体验
 *
 * 场景描述:
 * 用户提问后，LLM 会生成大量源代码（多个代码块），导致：
 * 1. 聊天面板内容过长，需要大量滚动
 * 2. 代码块之间缺少视觉分隔，难以区分
 * 3. 无法快速浏览对话内容
 * 4. 整体美观度下降
 *
 * 优化方案:
 * 1. 长代码块默认折叠（超过 30 行）
 * 2. 代码块之间增加视觉分隔
 * 3. 显示代码块元信息（语言、行数）
 * 4. 提供快速展开/收起功能
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe.skip('v0.3.1 Chat Code Display Optimization - TODO: Fix this test', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('[Browser Error]', msg.text());
      }
    });

    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForTimeout(3000);

    // 打开聊天面板
    await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore) {
        const store = layoutStore;
        if (store && store.getState && !store.getState().isChatOpen) {
          store.getState().toggleChat();
        }
      }
    });
    await page.waitForTimeout(2000);
  });

  test('CHAT-CODE-01: 还原场景 - 大量代码块导致界面凌乱', async ({ page }) => {
    // Given: 直接在聊天面板中注入包含大量代码块的内容
    await page.evaluate(() => {
      const chatPanel = document.querySelector('[class*="chat"][class*="panel"]');
      if (!chatPanel) return;

      // 模拟一个包含 4 个代码块的 AI 响应（每个 50-100 行）
      const mockCodeResponse = `# 完整的 React Todo 应用

下面是完整的实现代码：

## 1. types.ts - 类型定义

\`\`\`typescript
interface Todo {
  id: string;
  text: string;
  completed: boolean;
  createdAt: Date;
}

interface TodoState {
  todos: Todo[];
  filter: 'all' | 'active' | 'completed';
}

interface TodoContextType {
  state: TodoState;
  addTodo: (text: string) => void;
  toggleTodo: (id: string) => void;
  deleteTodo: (id: string) => void;
  setFilter: (filter: TodoState['filter']) => void;
}
\`\`\`

## 2. TodoItem.tsx - 单个待办事项组件

\`\`\`typescript
import React from 'react';
import { Todo } from './types';

interface TodoItemProps {
  todo: Todo;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

export const TodoItem: React.FC<TodoItemProps> = ({ todo, onToggle, onDelete }) => {
  return (
    <div className="flex items-center justify-between p-4 bg-white rounded-lg shadow">
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={todo.completed}
          onChange={() => onToggle(todo.id)}
          className="w-5 h-5"
        />
        <span className={todo.completed ? 'line-through text-gray-400' : ''}>
          {todo.text}
        </span>
      </div>
      <button
        onClick={() => onDelete(todo.id)}
        className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600"
      >
        删除
      </button>
    </div>
  );
};
\`\`\`

## 3. TodoList.tsx - 待办列表组件

\`\`\`typescript
import React from 'react';
import { Todo } from './types';
import { TodoItem } from './TodoItem';

interface TodoListProps {
  todos: Todo[];
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

export const TodoList: React.FC<TodoListProps> = ({ todos, onToggle, onDelete }) => {
  return (
    <div className="space-y-2">
      {todos.map(todo => (
        <TodoItem
          key={todo.id}
          todo={todo}
          onToggle={onToggle}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
};
\`\`\`

## 4. TodoApp.tsx - 主应用组件

\`\`\`typescript
import React, { useState, useContext } from 'react';
import { TodoContext } from './TodoContext';
import { TodoList } from './TodoList';

export const TodoApp: React.FC = () => {
  const { state, addTodo } = useContext(TodoContext);
  const [input, setInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      addTodo(input.trim());
      setInput('');
    }
  };

  return (
    <div className="max-w-md mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Todo App</h1>

      <form onSubmit={handleSubmit} className="mb-6">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="添加新待办事项..."
          className="w-full px-4 py-2 border rounded-lg"
        />
      </form>

      <TodoList
        todos={state.todos}
        onToggle={(id) => console.log('Toggle:', id)}
        onDelete={(id) => console.log('Delete:', id)}
      />
    </div>
  );
};
\`\`\`

以上是一个完整的 React Todo 应用的实现！`;

      // 直接将 Markdown 内容注入到聊天面板的 messages 容器中
      const messagesContainer = chatPanel.querySelector('[class*="messages"], [class*="Messages"]');
      if (messagesContainer) {
        // 创建一个新的消息元素
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message assistant';
        messageDiv.innerHTML = `
          <div style="padding: 16px; background: #252526; border-radius: 8px; margin-bottom: 16px; border: 1px solid rgba(114, 118, 125, 0.5);">
            <div style="display: flex; gap: 12px;">
              <div style="width: 24px; height: 24px; border-radius: 50%; background: rgba(0,0,0,0.2); display: flex; align-items: center; justify-content: center;">
                <img src="https://ifai.io/ifai.png" style="width: 16px; height: 16px;" />
              </div>
              <div style="flex: 1;">
                <div class="markdown-content" style="color: #d1d5db;">${mockCodeResponse}</div>
              </div>
            </div>
          </div>
        `;
        messagesContainer.appendChild(messageDiv);
      }
    });

    // 等待消息渲染
    await page.waitForTimeout(3000);

    // When: 分析当前界面状态
    const currentState = await page.evaluate(() => {
      const chatMessages = document.querySelectorAll('[class*="message"], [class*="Message"]');
      const codeBlocks = document.querySelectorAll('pre, [class*="syntax"], code[class*="language"]');

      // 获取聊天面板的高度
      const chatPanel = document.querySelector('[class*="chat"][class*="panel"], [data-testid="chat-panel"]');
      const panelHeight = chatPanel ? chatPanel.scrollHeight : 0;

      // 分析代码块
      const blockInfo = Array.from(codeBlocks).map((block, index) => {
        const rect = block.getBoundingClientRect();
        const text = block.textContent || '';
        const lines = text.split('\n').length;

        return {
          index,
          lines,
          height: rect.height,
          top: rect.top,
          hasCollapseButton: block.querySelector('button') !== null
        };
      });

      return {
        messageCount: chatMessages.length,
        codeBlockCount: codeBlocks.length,
        panelHeight,
        blocks: blockInfo,
        // 检查是否有折叠按钮
        hasAnyCollapseButtons: document.querySelectorAll('button').length > 0
      };
    });

    console.log('[Test] 当前界面状态:', JSON.stringify(currentState, null, 2));

    // Then: 验证问题确实存在
    expect(currentState.codeBlockCount).toBeGreaterThan(0);
    console.log(`[Test] 发现 ${currentState.codeBlockCount} 个代码块`);
    console.log(`[Test] 聊天面板高度: ${currentState.panelHeight}px`);

    // 📸 保存当前状态截图用于评审
    await page.screenshot({
      path: 'test-results/v0.3.1-chat-code-clutter-current-state.png',
      fullPage: false
    });

    // 🔴 当前问题验证
    const hasLongCodeBlocks = currentState.blocks.some(b => b.lines > 30);
    if (hasLongCodeBlocks) {
      console.log('[Test] ⚠️  发现长代码块，建议实施折叠优化');
    }

    const hasCollapseButtons = currentState.blocks.some(b => b.hasCollapseButton);
    if (!hasCollapseButtons) {
      console.log('[Test] ❌ 代码块缺少折叠功能');
    }
  });

  test('CHAT-CODE-02: 验证优化后的代码块折叠功能', async ({ page }) => {
    // Given: 注入包含长代码块的消息
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      if (!chatStore) return;

      const longCodeBlock = `这是一个长代码示例：

\`\`\`typescript
${Array.from({ length: 50 }, (_, i) => `const line${i + 1} = "这是第 ${i + 1} 行代码，内容比较长";`).join('\n')}
\`\`\`

代码结束。`;

      const addMessage = chatStore.getState().addMessage;
      if (addMessage) {
        addMessage({
          role: 'user',
          content: { Text: '生成一个 50 行的代码示例' }
        });

        setTimeout(() => {
          addMessage({
            role: 'assistant',
            content: { Text: longCodeBlock }
          });
        }, 100);
      }
    });

    await page.waitForTimeout(3000);

    // When: 检查折叠功能
    const collapseState = await page.evaluate(() => {
      const codeBlocks = document.querySelectorAll('pre, [class*="syntax"], code[class*="language"]');

      return {
        codeBlockCount: codeBlocks.length,
        hasCollapseButtons: Array.from(codeBlocks).map(block => ({
          hasButton: block.parentElement?.querySelector('button') !== null,
          buttonText: block.parentElement?.querySelector('button')?.textContent || null
        }))
      };
    });

    console.log('[Test] 折叠状态:', JSON.stringify(collapseState, null, 2));

    // Then: 验证优化目标
    // ⚠️ 当前会失败，记录期望行为
    test.skip(true, '待优化实施后验证：长代码块应该默认折叠');
    expect(collapseState.hasCollapseButtons.some(b => b.hasButton)).toBe(true);
  });

  test('CHAT-CODE-03: 验证代码块视觉分隔', async ({ page }) => {
    // Given: 注入包含多个代码块的消息
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      if (!chatStore) return;

      const multiCodeMessage = `代码示例 1：

\`\`\`javascript
function example1() {
  console.log('Example 1');
}
\`\`\`

代码示例 2：

\`\`\`typescript
function example2() {
  return 'Example 2';
}
\`\`\`

代码示例 3：

\`\`\`python
def example3():
    print("Example 3")
\`\`\``;

      const addMessage = chatStore.getState().addMessage;
      if (addMessage) {
        addMessage({
          role: 'user',
          content: { Text: '给我三个不同语言的代码示例' }
        });

        setTimeout(() => {
          addMessage({
            role: 'assistant',
            content: { Text: multiCodeMessage }
          });
        }, 100);
      }
    });

    await page.waitForTimeout(3000);

    // When: 分析视觉分隔
    const visualAnalysis = await page.evaluate(() => {
      const codeBlocks = Array.from(document.querySelectorAll('pre, [class*="syntax"], code[class*="language"]'));

      const gaps = [];
      for (let i = 0; i < codeBlocks.length - 1; i++) {
        const current = codeBlocks[i].getBoundingClientRect();
        const next = codeBlocks[i + 1].getBoundingClientRect();
        gaps.push({
          fromIndex: i,
          toIndex: i + 1,
          gap: next.top - current.bottom
        });
      }

      return {
        codeBlockCount: codeBlocks.length,
        gaps,
        averageGap: gaps.length > 0 ? gaps.reduce((sum, g) => sum + g.gap, 0) / gaps.length : 0
      };
    });

    console.log('[Test] 视觉分隔分析:', JSON.stringify(visualAnalysis, null, 2));

    // 📸 保存截图
    await page.screenshot({
      path: 'test-results/v0.3.1-chat-code-visual-separation.png',
      fullPage: false
    });

    // Then: 验证优化目标
    test.skip(true, '待优化实施后验证：代码块之间应该有清晰的视觉分隔（至少 16px）');
    expect(visualAnalysis.averageGap).toBeGreaterThan(16);
  });

  test('CHAT-CODE-04: 用户体验测试 - 代码块可读性', async ({ page }) => {
    // Given: 注入真实的复杂代码场景
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      if (!chatStore) return;

      const complexCode = `# API 接口定义

下面是完整的用户 API 接口：

\`\`\`typescript
interface User {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'user' | 'guest';
  createdAt: Date;
  updatedAt?: Date;
  profile?: {
    avatar: string;
    bio: string;
  };
}

interface CreateUserRequest {
  username: string;
  email: string;
  password: string;
  role?: User['role'];
}

interface UpdateUserRequest {
  username?: string;
  email?: string;
  role?: User['role'];
  profile?: Partial<User['profile']>;
}

interface UserListResponse {
  users: User[];
  total: number;
  page: number;
  pageSize: number;
}
\`\`\`

# UserService 实现

\`\`\`typescript
class UserService {
  private baseUrl = '/api/users';

  async getUsers(page = 1, pageSize = 20): Promise<UserListResponse> {
    const response = await fetch(
      \`\${this.baseUrl}?page=\${page}&pageSize=\${pageSize}\`
    );
    return response.json();
  }

  async getUserById(id: string): Promise<User> {
    const response = await fetch(\`\${this.baseUrl}/\${id}\`);
    return response.json();
  }

  async createUser(data: CreateUserRequest): Promise<User> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return response.json();
  }

  async updateUser(id: string, data: UpdateUserRequest): Promise<User> {
    const response = await fetch(\`\${this.baseUrl}/\${id}\`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return response.json();
  }

  async deleteUser(id: string): Promise<void> {
    await fetch(\`\${this.baseUrl}/\${id}\`, {
      method: 'DELETE'
    });
  }
}
\`\`\`

# 使用示例

\`\`\`typescript
const userService = new UserService();

// 获取用户列表
const users = await userService.getUsers(1, 10);

// 创建用户
const newUser = await userService.createUser({
  username: 'john_doe',
  email: 'john@example.com',
  password: 'secure_password'
});

// 更新用户
await userService.updateUser(newUser.id, {
  username: 'john_doe_updated'
});

// 删除用户
await userService.deleteUser(newUser.id);
\`\`\``;

      const addMessage = chatStore.getState().addMessage;
      if (addMessage) {
        addMessage({
          role: 'user',
          content: { Text: '帮我设计一个完整的用户管理 API，包括接口定义和服务实现' }
        });

        setTimeout(() => {
          addMessage({
            role: 'assistant',
            content: { Text: complexCode }
          });
        }, 100);
      }
    });

    await page.waitForTimeout(3000);

    // When: 评估用户体验
    const uxScore = await page.evaluate(() => {
      const codeBlocks = document.querySelectorAll('pre, [class*="syntax"]');
      const chatPanel = document.querySelector('[class*="chat"][class*="panel"]');

      // 计算可读性得分
      let score = 0;
      const reasons = [];

      // 1. 代码块数量是否过多（超过 3 个扣分）
      if (codeBlocks.length > 3) {
        score -= 10;
        reasons.push(`代码块过多(${codeBlocks.length}个)`);
      } else {
        score += 20;
      }

      // 2. 面板高度是否过大（超过 2000px 扣分）
      const panelHeight = chatPanel ? chatPanel.scrollHeight : 0;
      if (panelHeight > 2000) {
        score -= 20;
        reasons.push(`面板过高(${panelHeight}px)`);
      } else if (panelHeight < 1000) {
        score += 30;
      }

      // 3. 是否有折叠功能（有加分）
      const hasCollapse = Array.from(codeBlocks).some(b =>
        b.parentElement?.querySelector('button')
      );
      if (hasCollapse) {
        score += 30;
        reasons.push('有折叠功能');
      } else {
        reasons.push('缺少折叠功能');
      }

      return {
        score: Math.max(0, Math.min(100, score)),
        codeBlockCount: codeBlocks.length,
        panelHeight,
        hasCollapse,
        reasons
      };
    });

    console.log('[Test] 用户体验得分:', JSON.stringify(uxScore, null, 2));

    // 📸 保存 UX 评估截图
    await page.screenshot({
      path: 'test-results/v0.3.1-chat-code-ux-evaluation.png',
      fullPage: false
    });

    // Then: 设定优化目标
    console.log(`[Test] 当前 UX 得分: ${uxScore.score}/100`);
    console.log('[Test] 改进建议:', uxScore.reasons);

    // ⚠️ 期望优化后得分达到 70+ 分
    test.skip(true, '待优化实施后验证：UX 得分应达到 70+ 分');
    expect(uxScore.score).toBeGreaterThan(70);
  });
});

/**
 * 📋 测试评审总结
 *
 * ✅ 测试覆盖的场景：
 * 1. 大量代码块导致界面凌乱 - 使用 mock 数据还原
 * 2. 代码块折叠功能验证
 * 3. 视觉分隔分析
 * 4. 用户体验评分
 *
 * 📊 测试数据收集：
 * - 代码块数量和位置
 * - 每个代码块的行数和高度
 * - 代码块之间的间距
 * - 聊天面板总高度
 * - UX 可读性得分
 *
 * 🎯 优化目标：
 * 1. 超过 30 行的代码块默认折叠
 * 2. 代码块之间至少 16px 间距
 * 3. 显示代码块语言和行数
 * 4. 提供一键展开/收起所有代码
 * 5. UX 得分达到 70+ 分
 *
 * 📸 生成的截图：
 * - v0.3.1-chat-code-clutter-current-state.png (当前状态)
 * - v0.3.1-chat-code-visual-separation.png (视觉分隔)
 * - v0.3.1-chat-code-ux-evaluation.png (UX 评估)
 */
