import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Settings, X } from 'lucide-react';
import { useChatStore } from '../../stores/useChatStore';
import { useChatUIStore } from '../../stores/chatUIStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { useFileStore } from '../../stores/fileStore';
import { readFileContent } from '../../utils/fileSystem';
import { v4 as uuidv4 } from 'uuid';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { MessageItem } from './MessageItem';
import { SlashCommandList, SlashCommandListHandle } from './SlashCommandList';
import { ThreadTabs, useThreadKeyboardShortcuts } from './ThreadTabs';
import { TokenUsageIndicator } from './TokenUsageIndicator';
import { VirtualMessageList } from './VirtualMessageList';
import ifaiLogo from '../../../imgs/ifai.png'; // Import the IfAI logo
// v0.2.6: 任务拆解 Store（测试中）
import { useTaskBreakdownStore } from '../../stores/taskBreakdownStore';
import { TaskBreakdownViewer } from '../TaskBreakdown/TaskBreakdownViewer';
import { breakdownTask } from '../../services/taskBreakdownService';
// v0.2.6: 提案审核弹窗
import { useProposalStore } from '../../stores/proposalStore';
import { ProposalReviewModal } from '../ProposalWorkflow';
// v0.2.6: Agent Store
import { useAgentStore } from '../../stores/agentStore';

interface AIChatProps {
  width?: number;
  onResizeStart?: (e: React.MouseEvent) => void;
}

export const AIChat = ({ width, onResizeStart }: AIChatProps) => {
  const { t } = useTranslation();

  // Thread keyboard shortcuts
  useThreadKeyboardShortcuts();

  // Use specific selectors to avoid subscribing to the entire store
  const rawMessages = useChatStore(state => state.messages);
  const isLoading = useChatStore(state => state.isLoading);
  const sendMessage = useChatStore(state => state.sendMessage);
  const approveToolCall = useChatStore(state => state.approveToolCall);
  const rejectToolCall = useChatStore(state => state.rejectToolCall);

  // New Chat UI Store for history
  const inputHistory = useChatUIStore(state => state.inputHistory);
  const historyIndex = useChatUIStore(state => state.historyIndex);
  const addToHistory = useChatUIStore(state => state.addToHistory);
  const setHistoryIndex = useChatUIStore(state => state.setHistoryIndex);
  const resetHistoryIndex = useChatUIStore(state => state.resetHistoryIndex);

  const providers = useSettingsStore(state => state.providers);
  const currentProviderId = useSettingsStore(state => state.currentProviderId);
  const currentModel = useSettingsStore(state => state.currentModel);
  const setCurrentProviderAndModel = useSettingsStore(state => state.setCurrentProviderAndModel);

  // Scroll throttling to prevent "flickering" during streaming
  const lastScrollTime = useRef(0);
  const rafScrollId = useRef<number>(0);
  const SCROLL_THROTTLE_MS = 200;  // Scroll throttle: 200ms

  const setSettingsOpen = useLayoutStore(state => state.setSettingsOpen);
  const openFile = useFileStore(state => state.openFile);
  const [input, setInput] = useState('');
  const [showCommands, setShowCommands] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const commandListRef = useRef<SlashCommandListHandle>(null);
  // v0.2.6: 任务拆解 Store
  const { currentBreakdown, isPanelOpen, setPanelOpen } = useTaskBreakdownStore();
  // v0.2.6: 提案审核弹窗状态
  const { isReviewModalOpen, pendingReviewProposalId, closeReviewModal } = useProposalStore();

  // Track user manual scrolling to disable auto-scroll
  const isUserScrolling = useRef(false);
  const scrollTimeoutRef = useRef<number | null>(null);

  const scrollToBottom = (instant = false) => {
    // Skip auto-scroll if user is manually scrolling
    if (isUserScrolling.current) {
      return;
    }
    messagesEndRef.current?.scrollIntoView({ behavior: instant ? 'instant' : 'smooth' });
  };

  // Detect user manual scroll
  const handleScroll = () => {
    if (!scrollContainerRef.current) return;

    const container = scrollContainerRef.current;
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;

    if (!isNearBottom) {
      // User scrolled away from bottom - mark as user scrolling
      isUserScrolling.current = true;

      // Clear existing timeout
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      // Reset user scrolling flag after 2 seconds of no scroll
      scrollTimeoutRef.current = window.setTimeout(() => {
        isUserScrolling.current = false;
      }, 2000);
    } else {
      // User scrolled back to bottom - re-enable auto-scroll
      isUserScrolling.current = false;
    }
  };

  // Auto-scroll to bottom when messages update, with throttling during streaming
  useEffect(() => {
    const isStreaming = isLoading && rawMessages.length > 0 &&
                        rawMessages[rawMessages.length - 1].role === 'assistant';

    if (isStreaming) {
      // Streaming state: throttle + RAF sync
      const now = Date.now();
      const timeSinceLastScroll = now - lastScrollTime.current;

      if (timeSinceLastScroll >= SCROLL_THROTTLE_MS) {
        // Cancel any pending RAF scroll
        if (rafScrollId.current) {
          cancelAnimationFrame(rafScrollId.current);
        }
        // Schedule new scroll in next animation frame
        rafScrollId.current = requestAnimationFrame(() => {
          scrollToBottom(true);
          lastScrollTime.current = Date.now();
        });
      }
    } else {
      // Non-streaming state: immediate scroll
      if (rafScrollId.current) {
        cancelAnimationFrame(rafScrollId.current);
      }
      scrollToBottom(false);
    }

    // Cleanup: cancel pending RAF on unmount or dependency change
    return () => {
      if (rafScrollId.current) {
        cancelAnimationFrame(rafScrollId.current);
      }
    };
  }, [rawMessages, isLoading]);

  const currentProvider = providers.find(p => p.id === currentProviderId);
  // 自定义提供商（本地端点）可能不需要 API Key
  const isProviderConfigured = currentProvider && currentProvider.enabled &&
    (currentProvider.isCustom || currentProvider.apiKey);

  const handleSend = async () => {
    if (!input.trim()) return;
    const msg = input.trim();
    
    addToHistory(msg);

    // Special Command: /help
    if (msg.toLowerCase() === '/help') {
      const { addMessage } = useChatStore.getState() as any;
      const helpId = crypto.randomUUID();
      
      const helpContent = `
### ${t('help_message.title')}

${t('help_message.intro')}

#### ${t('help_message.commands_title')}
${(t('help_message.commands', { returnObjects: true }) as string[]).map(c => `- ${c}`).join('\n')}
- **@codebase** - 在提问中加入此指令可进行全局代码语义搜索
- **/index** - 手动强制为项目代码库建立 RAG 语义索引

#### ${t('help_message.shortcuts_title')}
${(t('help_message.shortcuts', { returnObjects: true }) as string[]).map(s => `- ${s}`).join('\n')}

---
*${t('help_message.footer')}*
      `;

      addMessage({
        id: crypto.randomUUID(),
        role: 'user',
        content: msg
      });

      setTimeout(() => {
        addMessage({
          id: helpId,
          role: 'assistant',
          content: helpContent.trim()
        });
      }, 100);

      setInput('');
      setShowCommands(false);
      resetHistoryIndex();
      return;
    }

    // Special Command: /index
    if (msg.toLowerCase() === '/index') {
      const { addMessage } = useChatStore.getState() as any;
      const rootPath = useFileStore.getState().rootPath;

      addMessage({
        id: crypto.randomUUID(),
        role: 'user',
        content: msg
      });

      if (rootPath) {
        try {
          const { invoke: dynamicInvoke } = await import('@tauri-apps/api/core');
          await dynamicInvoke('init_rag_index', { rootPath });
          setTimeout(() => {
            addMessage({
              id: crypto.randomUUID(),
              role: 'assistant',
              content: "✅ **正在重建项目索引**\n\n系统正在扫描文件并构建语义向量，这可能需要一点时间。您可以在状态栏查看实时进度。"
            });
          }, 100);
        } catch (e) {
          setTimeout(() => {
            addMessage({
              id: crypto.randomUUID(),
              role: 'assistant',
              content: `❌ **索引初始化失败**\n\n错误详情: ${String(e)}`
            });
          }, 100);
        }
      } else {
        setTimeout(() => {
          addMessage({
            id: crypto.randomUUID(),
            role: 'assistant',
            content: "❌ **未打开项目文件夹**\n\n请先打开一个项目文件夹后再使用此命令。"
          });
        }, 100);
      }

      setInput('');
      setShowCommands(false);
      resetHistoryIndex();
      return;
    }

    // v0.2.6 Special Command: /task:demo
    if (msg.toLowerCase() === '/task:demo') {
      const { addMessage } = useChatStore.getState() as any;
      const store = useTaskBreakdownStore.getState();
      const rootPath = useFileStore.getState().rootPath;

      // 设置项目根路径到 taskBreakdownStore
      if (rootPath) {
        store.setProjectRoot(rootPath);
      }

      // 创建示例任务树
      const demoTaskTree = {
        id: `tb-${Date.now()}-demo`,
        title: '示例：实现用户登录功能',
        description: '这是一个示例任务拆解，展示了任务树的结构',
        originalPrompt: '/task:demo',
        taskTree: {
          id: 'root-1',
          title: '实现用户登录功能',
          description: '完整的用户认证系统，包括登录、注册、密码重置',
          status: 'in_progress' as const,
          dependencies: [],
          priority: 'high' as const,
          category: 'development' as const,
          estimatedHours: 16,
          children: [
            {
              id: 'task-1',
              title: '后端 API 开发',
              description: '实现登录、注册、密码重置的后端接口',
              status: 'completed' as const,
              dependencies: [],
              category: 'development' as const,
              estimatedHours: 8,
              priority: 'high' as const,
              acceptanceCriteria: [
                'POST /api/auth/login 返回 JWT token',
                'POST /api/auth/register 创建新用户',
                'POST /api/auth/reset-password 发送重置邮件',
              ],
              children: [
                {
                  id: 'task-1-1',
                  title: '设计数据库 Schema',
                  status: 'completed' as const,
                  dependencies: [],
                  category: 'development' as const,
                  estimatedHours: 2,
                  children: [],
                },
                {
                  id: 'task-1-2',
                  title: '实现 JWT 认证中间件',
                  status: 'completed' as const,
                  dependencies: ['task-1-1'],
                  category: 'development' as const,
                  estimatedHours: 3,
                  children: [],
                },
                {
                  id: 'task-1-3',
                  title: '编写 API 端点',
                  status: 'completed' as const,
                  dependencies: ['task-1-2'],
                  category: 'development' as const,
                  estimatedHours: 3,
                  children: [],
                },
              ],
            },
            {
              id: 'task-2',
              title: '前端登录页面',
              description: '实现用户登录和注册表单',
              status: 'in_progress' as const,
              dependencies: ['task-1'],
              category: 'development' as const,
              estimatedHours: 6,
              priority: 'high' as const,
              acceptanceCriteria: [
                '响应式设计，支持移动端',
                '表单验证（邮箱格式、密码强度）',
                '错误提示友好',
                '记住我功能',
              ],
              children: [
                {
                  id: 'task-2-1',
                  title: '设计 UI 原型',
                  status: 'completed' as const,
                  dependencies: [],
                  category: 'design' as const,
                  estimatedHours: 2,
                  children: [],
                },
                {
                  id: 'task-2-2',
                  title: '实现登录表单组件',
                  status: 'in_progress' as const,
                  dependencies: ['task-2-1'],
                  category: 'development' as const,
                  estimatedHours: 3,
                  children: [],
                },
                {
                  id: 'task-2-3',
                  title: '集成后端 API',
                  status: 'pending' as const,
                  dependencies: ['task-2-2', 'task-1'],
                  category: 'development' as const,
                  estimatedHours: 1,
                  children: [],
                },
              ],
            },
            {
              id: 'task-3',
              title: '编写测试用例',
              description: '为认证系统编写单元测试和集成测试',
              status: 'pending' as const,
              dependencies: ['task-1', 'task-2'],
              category: 'testing' as const,
              estimatedHours: 4,
              priority: 'medium' as const,
              children: [],
            },
            {
              id: 'task-4',
              title: '编写技术文档',
              description: '编写 API 文档和部署指南',
              status: 'pending' as const,
              dependencies: ['task-1'],
              category: 'documentation' as const,
              estimatedHours: 2,
              priority: 'low' as const,
              children: [],
            },
          ],
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
        status: 'in_progress' as const,
      };

      // 设置到 store
      store.setCurrentBreakdown(demoTaskTree);

      // 保存到文件
      if (rootPath) {
        store.saveBreakdown().catch((e) => {
          console.error('[AIChat] Failed to save demo task:', e);
        });
      }

      // 添加用户消息
      addMessage({
        id: crypto.randomUUID(),
        role: 'user',
        content: msg
      });

      // 添加助手响应
      setTimeout(() => {
        const saveHint = rootPath
          ? `\n\n💾 任务已保存到：\`${rootPath}/.ifai/tasks/breakdowns/${demoTaskTree.id}.json\``
          : '\n\n⚠️ 未打开项目，任务仅保存在内存中';

        addMessage({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `### 📋 任务拆解示例

\`\`\`tsx
<SimpleTaskView taskTree={demoTaskTree.taskTree} />
\`\`\`

---

**提示：** 这是任务拆解功能的演示。使用 **/task:breakdown [任务描述]** 来拆解您的实际任务。

任务树包含：
- **层级结构**：主任务 → 子任务 → 子子任务
- **状态跟踪**：待办 ○ / 进行中 ◐ / 完成 ● / 失败 ✕
- **优先级**：紧急 / 高 / 中 / 低
- **类别**：开发 / 测试 / 文档 / 设计 / 研究
- **工时估算**：预估小时数
- **验收标准**：明确的完成条件
- **依赖关系**：任务间的依赖${saveHint}

使用控制台测试：
\`\`\`javascript
window.__taskBreakdownStore.getState()
\`\`\`
`,
        });
      }, 100);

      setInput('');
      setShowCommands(false);
      resetHistoryIndex();
      return;
    }

    // v0.2.6 Special Command: /task:breakdown
    if (msg.toLowerCase().startsWith('/task:breakdown ')) {
      const taskDescription = msg.substring('/task:breakdown '.length).trim();

      if (!taskDescription) {
        const { addMessage } = useChatStore.getState() as any;
        addMessage({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: '❌ 请提供要拆解的任务描述\n\n**用法**：`/task:breakdown [任务描述]`\n\n**示例**：`/task:breakdown 实现用户登录功能`'
        });
        setInput('');
        setShowCommands(false);
        resetHistoryIndex();
        return;
      }

      const { addMessage } = useChatStore.getState() as any;
      const store = useTaskBreakdownStore.getState();
      const rootPath = useFileStore.getState().rootPath;

      // 设置项目根路径
      if (rootPath) {
        store.setProjectRoot(rootPath);
      }

      // 添加用户消息
      addMessage({
        id: crypto.randomUUID(),
        role: 'user',
        content: msg
      });

      // 注意：不需要添加加载消息，breakdownTask 内部会处理

      try {
        // 调用 AI 进行任务拆解（breakdownTask 内部会添加进度消息）
        const breakdown = await breakdownTask(
          taskDescription,
          currentProviderId,
          currentModel
        );

        // 设置到 store
        store.setCurrentBreakdown(breakdown);

        // 保存到文件
        if (rootPath) {
          await store.saveBreakdown();
        }

        // 打开任务拆解面板
        setPanelOpen(true);

        // 更新消息内容为 JSON 格式（用于 TaskBreakdownViewer 检测）
        // breakdownTask 内部会创建一个临时消息，我们需要找到它并更新
        const { messages, updateMessageContent } = useChatStore.getState() as any;
        // 找到最新的 assistant 消息（应该是 breakdownTask 创建的）
        const assistantMessages = messages.filter((m: any) => m.role === 'assistant');
        if (assistantMessages.length > 0) {
          const lastMsg = assistantMessages[assistantMessages.length - 1];
          // 更新为 JSON 格式，这样 detectTaskBreakdown 就能检测到
          updateMessageContent(lastMsg.id, JSON.stringify(breakdown, null, 2));
        }
      } catch (error) {
        const { addMessage: addMsg } = useChatStore.getState() as any;
        addMsg({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `### ❌ 任务拆解失败

${error}

**可能的原因**：
- AI 响应格式不正确
- 网络连接问题
- API 配额不足

**建议**：
1. 尝试简化任务描述
2. 检查 API 密钥配置
3. 稍后重试
`
        });
      }

      setInput('');
      setShowCommands(false);
      resetHistoryIndex();
      return;
    }

    // v0.2.6 Special Command: /proposal [需求描述]
    if (msg.toLowerCase().startsWith('/proposal ')) {
      const requirementDescription = msg.substring('/proposal '.length).trim();

      if (!requirementDescription) {
        const { addMessage } = useChatStore.getState() as any;
        addMessage({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: '❌ 请提供要生成提案的需求描述\n\n**用法**：`/proposal [需求描述]`\n\n**示例**：`/proposal 实现用户登录功能`'
        });
        setInput('');
        setShowCommands(false);
        resetHistoryIndex();
        return;
      }

      // 添加用户消息
      const { addMessage } = useChatStore.getState() as any;
      addMessage({
        id: crypto.randomUUID(),
        role: 'user',
        content: msg
      });

      // 启动 proposal-generator agent
      try {
        const assistantMsgId = crypto.randomUUID();
        addMessage({
          id: assistantMsgId,
          role: 'assistant',
          content: `_[正在生成 OpenSpec 提案...]_\n\n`,
          // @ts-ignore - custom property
          agentId: undefined,
          isAgentLive: true
        });

        const agentId = await useAgentStore.getState().launchAgent(
          'proposal-generator',
          requirementDescription,
          assistantMsgId
        );

        // 更新消息的 agentId
        const messages = useChatStore.getState().messages;
        const msgToUpdate = messages.find((m: any) => m.id === assistantMsgId);
        if (msgToUpdate) {
          // @ts-ignore
          msgToUpdate.agentId = agentId;
        }
      } catch (error) {
        const { addMessage: addMsg } = useChatStore.getState() as any;
        addMsg({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `### ❌ 提案生成失败

${error}

**可能的原因**：
- AI 响应格式不正确
- 网络连接问题
- API 配额不足

**建议**：
1. 尝试简化需求描述
2. 检查 API 密钥配置
3. 稍后重试
`
        });
      }

      setInput('');
      setShowCommands(false);
      resetHistoryIndex();
      return;
    }

    // v0.2.6 Special Command: /task:start <taskId>
    if (msg.toLowerCase().startsWith('/task:start ')) {
      const taskId = msg.substring('/task:start '.length).trim();

      if (!taskId) {
        const { addMessage } = useChatStore.getState() as any;
        addMessage({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: '❌ 请提供任务 ID\n\n**用法**：`/task:start <任务ID>`\n\n**示例**：`/task:start 1` 或 `/task:start 2-1`\n\n**查看可用任务**：使用 `/task:list` 查看所有任务'
        });
        setInput('');
        setShowCommands(false);
        resetHistoryIndex();
        return;
      }

      // 动态导入服务（避免循环依赖）
      import('../../services/taskExecutionService').then(async ({ getTaskExecutionService }) => {
        try {
          const service = getTaskExecutionService();
          const rootPath = useFileStore.getState().rootPath;

          if (!rootPath) {
            throw new Error('未打开项目');
          }

          // 尝试从当前打开的文件中加载任务
          const activeFile = useFileStore.getState().openedFiles.find(f => f.path.includes('tasks.md'));

          if (!activeFile) {
            const { addMessage } = useChatStore.getState() as any;
            addMessage({
              id: crypto.randomUUID(),
              role: 'assistant',
              content: '❌ 未找到 tasks.md 文件\n\n请先打开一个提案中的 tasks.md 文件'
            });
            setInput('');
            return;
          }

          // 加载任务
          await service.loadTasksFromFile(activeFile.path);

          // 查找任务
          const task = service.findTask(taskId);

          if (!task) {
            const { addMessage } = useChatStore.getState() as any;
            const allTasks = service.getTodoTasks();
            const taskList = allTasks.map(t => `- \`/task:start ${t.id}\`: ${t.title}`).join('\n');
            addMessage({
              id: crypto.randomUUID(),
              role: 'assistant',
              content: `❌ 未找到任务: ${taskId}\n\n**可用任务**：\n${taskList || '无'}`
            });
            setInput('');
            return;
          }

          // 标记任务为进行中
          await service.startTask(taskId);

          // 添加用户消息
          const { addMessage } = useChatStore.getState() as any;
          addMessage({
            id: crypto.randomUUID(),
            role: 'user',
            content: msg
          });

          // 构建任务上下文
          const taskPath = service.getTaskPath(taskId);
          const context = taskPath.map(t => `${'  '.repeat(t.level)}- [${t.status === 'done' ? 'x' : ' '}] ${t.id}: ${t.title}`).join('\n');

          // 发送任务到 AI
          // 使用 [CHAT] 前缀来绕过意图识别和斜杠命令处理
          // 使用 [TASK-EXECUTION] 标记来启用工具自动审批
          // 这样可以避免被误识别为 /explore 或其他 agent
          const prompt = `[CHAT] [TASK-EXECUTION] 我需要协助实施以下开发任务：

**任务 ID**: ${task.id}
**任务标题**: ${task.title}
**任务描述**: ${task.content}

**任务路径**:
${context}

请帮助我完成这个任务的实施工作。请：
1. 首先查看项目结构，了解现有代码
2. 然后读取相关文件，分析实现方案
3. 创建或修改所需的文件
4. 最后总结完成的工作

你可以使用 agent_list_dir、agent_read_file、agent_write_file 等工具来完成这些工作。`;

          // 使用 sendMessage 发送给 AI（保留 [CHAT] 标记以绕过意图识别）
          const { sendMessage } = useChatStore.getState();
          const currentProviderId = useSettingsStore.getState().currentProviderId;
          const currentModel = useSettingsStore.getState().currentModel;
          await sendMessage(prompt, currentProviderId, currentModel);

          setInput('');
          setShowCommands(false);
          resetHistoryIndex();

        } catch (e) {
          console.error('[TaskStart] Failed:', e);
          const { addMessage } = useChatStore.getState() as any;
          addMessage({
            id: crypto.randomUUID(),
            role: 'assistant',
            content: `❌ 任务启动失败: ${e}`
          });
          setInput('');
        }
      });

      return;
    }

    // v0.2.6 Special Command: /task:list
    if (msg.toLowerCase() === '/task:list') {
      import('../../services/taskExecutionService').then(async ({ getTaskExecutionService }) => {
        try {
          const service = getTaskExecutionService();
          const rootPath = useFileStore.getState().rootPath;
          const openedFiles = useFileStore.getState().openedFiles;

          if (!rootPath) {
            const { addMessage } = useChatStore.getState() as any;
            addMessage({
              id: crypto.randomUUID(),
              role: 'assistant',
              content: '❌ 未打开项目\n\n请先打开一个项目文件夹'
            });
            setInput('');
            return;
          }

          // 尝试从当前打开的文件中加载任务
          const activeFile = openedFiles.find(f => f.path.includes('tasks.md'));

          // 调试信息
          console.log('[TaskList] Opened files:', openedFiles.map(f => f.path));
          console.log('[TaskList] Looking for tasks.md in:', openedFiles.map(f => f.path));

          if (!activeFile) {
            const { addMessage } = useChatStore.getState() as any;
            const fileList = openedFiles.length > 0
              ? '\n\n**当前打开的文件**：\n' + openedFiles.map(f => `- ${f.path.split('/').pop()}`).join('\n')
              : '';

            addMessage({
              id: crypto.randomUUID(),
              role: 'assistant',
              content: `❌ 未找到 tasks.md 文件${fileList}\n\n**解决方法**：\n1. 在文件树中找到提案目录（.ifai/changes/xxx/）\n2. 打开 tasks.md 文件\n3. 再次运行 /task:list`
            });
            setInput('');
            setShowCommands(false);
            resetHistoryIndex();
            return;
          }

          console.log('[TaskList] Found tasks.md:', activeFile.path);

          // 加载任务
          await service.loadTasksFromFile(activeFile.path);
          const stats = service.getTaskStats();
          const todoTasks = service.getTodoTasks();
          const inProgressTasks = service.getInProgressTasks();
          const doneTasks = service.getCompletedTasks();

          console.log('[TaskList] Stats:', stats);
          console.log('[TaskList] Tasks:', { todo: todoTasks.length, inProgress: inProgressTasks.length, done: doneTasks.length });

          let content = `### 📊 任务统计\n\n`;
          content += `- 总计: ${stats.total}\n`;
          content += `- 待办: ${stats.todo}\n`;
          content += `- 进行中: ${stats.inProgress}\n`;
          content += `- 已完成: ${stats.done}\n\n`;

          if (todoTasks.length > 0) {
            content += `### 📋 待办任务\n\n`;
            todoTasks.forEach(t => {
              content += `- \`/task:start ${t.id}\`: ${t.title}\n`;
            });
            content += '\n';
          }

          if (inProgressTasks.length > 0) {
            content += `### 🔄 进行中\n\n`;
            inProgressTasks.forEach(t => {
              content += `- \`${t.id}\`: ${t.title}\n`;
            });
            content += '\n';
          }

          if (doneTasks.length > 0) {
            content += `### ✅ 已完成\n\n`;
            doneTasks.slice(0, 5).forEach(t => {
              content += `- \`${t.id}\`: ${t.title}\n`;
            });
            if (doneTasks.length > 5) {
              content += `... 还有 ${doneTasks.length - 5} 个已完成任务\n`;
            }
          }

          if (stats.total === 0) {
            content += '\n⚠️ 未解析到任何任务，请检查 tasks.md 文件格式';
          }

          const { addMessage } = useChatStore.getState() as any;
          addMessage({
            id: crypto.randomUUID(),
            role: 'assistant',
            content
          });

          setInput('');
          setShowCommands(false);
          resetHistoryIndex();

        } catch (e) {
          console.error('[TaskList] Failed:', e);
          const { addMessage } = useChatStore.getState() as any;
          addMessage({
            id: crypto.randomUUID(),
            role: 'assistant',
            content: `❌ 获取任务列表失败: ${e}`
          });
          setInput('');
        }
      });

      return;
    }

    if (!isProviderConfigured) {
      const { addMessage } = useChatStore.getState() as any;
      addMessage({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `❌ ${t('chat.errorNoKey')} (${currentProvider?.name || 'Unknown'})`
      });
      return;
    }

    setInput('');
    setShowCommands(false);
    await sendMessage(msg, currentProviderId, currentModel);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInput(val);
    
    // Only reset history if the change came from user typing/pasting, 
    // not from our setInput call during history navigation.
    const isUserTyping = (e.nativeEvent as any).inputType !== undefined;
    if (isUserTyping && historyIndex !== -1) {
      resetHistoryIndex();
    }
    
    // Show commands if input starts with / and doesn't have spaces yet (or is just /)
    setShowCommands(val.startsWith('/') && !val.includes(' '));
  };

  const handleSelectCommand = (cmd: string) => {
      setInput(cmd + ' ');
      setShowCommands(false);
      resetHistoryIndex();
      inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showCommands && commandListRef.current) {
      const handled = commandListRef.current.handleKeyDown(e);
      if (handled) return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    } else if (e.key === 'Escape' && showCommands) {
        setShowCommands(false);
    } else if (e.key === 'ArrowUp' && !showCommands) {
        // Navigation through history
        if (inputHistory.length > 0) {
          const nextIndex = Math.min(historyIndex + 1, inputHistory.length - 1);
          // Always allow Up to update if there's history, even if index doesn't change 
          // (it might have been cleared or we want to re-fill current input)
          e.preventDefault();
          setHistoryIndex(nextIndex);
          setInput(inputHistory[nextIndex]);
        }
    } else if (e.key === 'ArrowDown' && !showCommands && historyIndex !== -1) {
        e.preventDefault();
        const nextIndex = historyIndex - 1;
        setHistoryIndex(nextIndex);
        if (nextIndex === -1) {
          setInput('');
        } else {
          setInput(inputHistory[nextIndex]);
        }
    }
  };

  const handleOpenFile = useCallback(async (path: string) => {
    try {
        const content = await readFileContent(path);
        openFile({
            id: uuidv4(),
            path,
            name: path.split('/').pop() || 'file',
            content,
            isDirty: false,
            language: 'plaintext'
        });
    } catch (e) {
        console.error("Failed to open file:", e);
    }
  }, [openFile]);

  const handleApprove = useCallback((messageId: string, toolCallId: string) => {
    approveToolCall(messageId, toolCallId);
  }, [approveToolCall]);

  const handleReject = useCallback((messageId: string, toolCallId: string) => {
    rejectToolCall(messageId, toolCallId);
  }, [rejectToolCall]);

  // Auto-approve tool calls when enabled
  const agentAutoApprove = useSettingsStore(state => state.agentAutoApprove);

  // v0.2.6: 测试任务拆解 Store
  useEffect(() => {
    // 仅在开发模式下启用测试
    if (process.env.NODE_ENV === 'development' || typeof window !== 'undefined') {
      console.log('[TaskBreakdown] Store 已加载，使用 window.__taskBreakdownStore 访问');
      // 将 store 暴露到全局作用域以便在控制台测试
      (window as any).__taskBreakdownStore = useTaskBreakdownStore;
      (window as any).__testTaskBreakdown = () => {
        const store = useTaskBreakdownStore.getState();
        const testData = {
          id: `tb-${Date.now()}-test`,
          title: '测试任务拆解',
          description: '这是一个测试任务',
          originalPrompt: '测试提示',
          taskTree: {
            id: 'root-1',
            title: '根任务',
            status: 'pending' as const,
            dependencies: [],
            children: [
              {
                id: 'child-1',
                title: '子任务 1',
                status: 'pending' as const,
                dependencies: [],
                children: [],
                estimatedHours: 2,
                category: 'development' as const,
              },
              {
                id: 'child-2',
                title: '子任务 2',
                status: 'in_progress' as const,
                dependencies: [],
                children: [],
                estimatedHours: 3,
                category: 'testing' as const,
              },
            ],
          },
          createdAt: Date.now(),
          updatedAt: Date.now(),
          status: 'draft' as const,
        };
        store.setCurrentBreakdown(testData);
        console.log('[TaskBreakdown] 测试数据已设置', store.currentBreakdown);
      };
      (window as any).__clearTaskBreakdown = () => {
        useTaskBreakdownStore.getState().clearCurrent();
        console.log('[TaskBreakdown] 当前任务已清除');
      };
    }
  }, []);

  useEffect(() => {
    if (!agentAutoApprove) return;

    // Find all pending tool calls that are ready for approval (not partial)
    const pendingToolCalls: Array<{messageId: string; toolCallId: string}> = [];

    for (const message of rawMessages) {
      if (message.toolCalls) {
        for (const toolCall of message.toolCalls) {
          if (toolCall.status === 'pending' && !toolCall.isPartial) {
            pendingToolCalls.push({
              messageId: message.id,
              toolCallId: toolCall.id
            });
          }
        }
      }
    }

    // Auto-approve all pending tool calls
    if (pendingToolCalls.length > 0) {
      console.log('[AIChat] Auto-approving tool calls:', pendingToolCalls);
      pendingToolCalls.forEach(({ messageId, toolCallId }) => {
        approveToolCall(messageId, toolCallId);
      });
    }
  }, [rawMessages, agentAutoApprove, approveToolCall]);

  if (!isProviderConfigured) {
    return (
      <div 
        className="flex flex-col h-full bg-[#1e1e1e] border-l border-gray-700 p-4 items-center justify-center text-center flex-shrink-0 relative"
        style={{ width: width ? `${width}px` : '384px' }}
      >
        {onResizeStart && (
            <div 
                className="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-blue-500 transition-colors z-50"
                onMouseDown={onResizeStart}
            />
        )}
        <img src={ifaiLogo} alt="IfAI Logo" className="w-10 h-10 text-gray-500 mb-4 opacity-70" /> {/* Replaced Bot icon with IfAI logo */}
        <p className="text-gray-400 mb-4">{t('chat.errorNoKey')} {currentProvider ? `(${currentProvider.name})` : ''}</p>
        <button 
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm transition-colors"
            onClick={() => setSettingsOpen(true)}
        >
            {t('chat.settings')}
        </button>
      </div>
    );
  }

  return (
    <div 
        className="flex flex-col h-full bg-[#1e1e1e] border-l border-gray-700 flex-shrink-0 relative"
        style={{ width: width ? `${width}px` : '384px', contain: 'layout' }}
    >
      {onResizeStart && (
        <div 
            className="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-blue-500 transition-colors z-50"
            onMouseDown={onResizeStart}
        />
      )}
      <div className="flex items-center justify-between p-3 border-b border-gray-700 bg-[#252526]">
        <div className="flex items-center">
          <img src={ifaiLogo} alt="IfAI Logo" className="w-4 h-4 mr-2 opacity-70" />
          <span className="text-[10px] font-bold text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded border border-gray-700 tracking-tighter">
            V0.2.4
          </span>
        </div>
        
        <div className="flex items-center space-x-2">
            <select
                className="bg-gray-700 text-gray-300 text-sm px-2 py-1 rounded outline-none"
                value={currentProviderId}
                onChange={(e) => setCurrentProviderAndModel(e.target.value, (providers.find(p => p.id === e.target.value)?.models[0] || ''))}
            >
                {providers.map(p => (
                    <option key={p.id} value={p.id} disabled={!p.enabled}>{p.name}</option>
                ))}
            </select>

            {currentProvider && (
                <select
                    className="bg-gray-700 text-gray-300 text-sm px-2 py-1 rounded outline-none"
                    value={currentModel}
                    onChange={(e) => setCurrentProviderAndModel(currentProviderId, e.target.value)}
                >
                    {currentProvider.models.map(model => (
                        <option key={model} value={model}>{model}</option>
                    ))
}
                </select>
            )}

            <button onClick={() => setSettingsOpen(true)} className="text-gray-400 hover:text-white">
                <Settings size={16} />
            </button>
        </div>
      </div>

      {/* Thread Tabs */}
      <ThreadTabs maxVisibleTabs={5} showMessageCount={true} showCloseButton={true} />

      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="min-h-0 overflow-auto p-4"
        style={{
          // v0.2.6 性能优化：单一滚动容器，虚拟滚动使用此容器
          flex: '1 1 0%', // 明确设置 flex 属性，确保正确计算高度
        }}
      >
        {/* v0.2.6 性能优化：虚拟滚动消息列表（长对话自动启用） */}
        <VirtualMessageList
          messages={rawMessages}
          onApprove={handleApprove}
          onReject={handleReject}
          onOpenFile={handleOpenFile}
          isLoading={isLoading}
          parentRef={scrollContainerRef}
        />
        <div ref={messagesEndRef} />
      </div>

      {/* v0.2.6 新增：Token 使用量指示器 */}
      <TokenUsageIndicator />

      <div className="border-t border-gray-700 p-3 bg-[#252526] flex items-center relative">
        {showCommands && (
            <SlashCommandList 
                ref={commandListRef}
                filter={input} 
                onSelect={handleSelectCommand}
                onClose={() => setShowCommands(false)}
            />
        )}
        <input
          ref={inputRef}
          type="text"
          className="flex-1 bg-transparent outline-none text-white text-sm placeholder-gray-500 mr-2"
          placeholder={t('chat.placeholder')}
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
        />
        <button
          onClick={handleSend}
          className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-full transition-colors disabled:opacity-50"
          disabled={!input.trim() || isLoading}
        >
          <Send size={16} />
        </button>
      </div>

      {/* v0.2.6: 提案审核弹窗 */}
      {isReviewModalOpen && (
        <ProposalReviewModal
          proposalId={pendingReviewProposalId}
          onClose={closeReviewModal}
        />
      )}

      {/* v0.2.6: 任务拆解面板 */}
      {isPanelOpen && currentBreakdown && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-[#252526] w-[90vw] max-w-4xl h-[80vh] rounded-lg shadow-xl border border-gray-700 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
              <h2 className="text-lg font-semibold text-white">任务拆解</h2>
              <button
                onClick={() => setPanelOpen(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-4">
              <TaskBreakdownViewer
                breakdown={currentBreakdown}
                mode="full"
                allowModeSwitch={true}
              />
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-700 bg-[#1e1e1e] rounded-b-lg flex justify-between items-center">
              <div className="text-sm text-gray-400">
                {currentBreakdown.taskTree.title}
              </div>
              <button
                onClick={() => setPanelOpen(false)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};