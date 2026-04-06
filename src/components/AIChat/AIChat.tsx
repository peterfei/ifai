import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Send, Settings, X, ChevronDown, Search } from 'lucide-react';
import { useChatStore } from '../../stores/useChatStore';
import { useChatUIStore } from '../../stores/chatUIStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useTransparencyStore } from '../../stores/transparencyStore';
import { invoke } from '@tauri-apps/api/core';
import { useThreadStore } from '../../stores/threadStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { useFileStore } from '../../stores/fileStore';
import { readFileContent } from '../../utils/fileSystem';
import { v4 as uuidv4 } from 'uuid';
import { useTranslation } from 'react-i18next';
import ToolService from '../../services/toolService';
// 🔥 FIX: 移除静态导入，改为动态导入以避免 Tauri bridge 未初始化问题
// import { invoke } from '@tauri-apps/api/core';
import { motion, AnimatePresence } from 'framer-motion';
import { ensureTauriInitialized } from '../../utils/tauriInitializer';

// v0.3.0: 根据文件扩展名获取 MIME 类型
function getMimeType(filePath: string): string {
  const ext = filePath.toLowerCase().split('.').pop();
  const mimeTypes: Record<string, string> = {
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'bmp': 'image/bmp',
    'svg': 'image/svg+xml'
  };
  return mimeTypes[ext || ''] || 'image/png';
}
// 🔥 FIX: 移除静态导入，改为动态导入以避免 Tauri bridge 未初始化问题
// import { listen } from '@tauri-apps/api/event';
import { toast } from 'sonner';
import { MessageItem } from './MessageItem';
import { SlashCommandList, SlashCommandListHandle } from './SlashCommandList';
import { ThreadTabs, useThreadKeyboardShortcuts } from './ThreadTabs';
import { ThreadSearchBar } from './ThreadSearchBar';
import { ModelCapsulePanel } from './ModelCapsulePanel';
import { TokenUsageIndicator } from './TokenUsageIndicator';
import { SystemPromptCard } from './SystemPromptCard';
import { VirtualMessageList } from './VirtualMessageList';
import { ChatInputArea } from './ChatInputArea';
// v0.3.1: 时间线视图
import { MessageTimeline } from './MessageTimeline';
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
// 🔥 修复版本显示:导入版本配置
import { IS_COMMERCIAL } from '../../config/edition';
// v0.2.8: Composer 2.0 多文件 Diff 预览
import { ComposerDiffView } from '../Composer';
import type { FileChange } from '../Composer';
import { atomicWriteService, fileChangeToOperation } from '../../services/atomicWriteService';
// v0.2.8: 错误修复服务
import { errorFixService, type ParsedError, type AIFixSuggestion, isFixableError } from '../../services/errorFixService';
// v0.3.0: 多模态图片输入
import { ImageInput } from '../Multimodal';
import type { ImageAttachment } from '../../types/multimodal';
import { ToolClassificationIndicator } from '../ToolClassification';
import { MessageSkeleton } from '../UI/Skeleton';
import clsx from 'clsx';

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
  const transparencyLevel = useSettingsStore(state => state.transparencyLevel);
  const currentPromptMeta = useTransparencyStore(state => state.currentPromptMeta);
  const setCurrentProviderAndModel = useSettingsStore(state => state.setCurrentProviderAndModel);

  // Scroll throttling to prevent "flickering" during streaming
  const lastScrollTime = useRef(0);
  const rafScrollId = useRef<number>(0);
  const SCROLL_THROTTLE_MS = 200;  // Scroll throttle: 200ms

  const setSettingsOpen = useLayoutStore(state => state.setSettingsOpen);
  const openFile = useFileStore(state => state.openFile);
  const [input, setInput] = useState('');
  const [showCommands, setShowCommands] = useState(false);
  // v0.3.1: 视图模式状态（普通视图 vs 时间线视图）
  const [viewMode, setViewMode] = useState<'normal' | 'timeline'>('normal');
  // 🔥 动态版本号：优先使用 Tauri API，回退到构建时注入的版本号
  const [appVersion, setAppVersion] = useState<string>(import.meta.env.VITE_APP_VERSION || '0.0.0');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const commandListRef = useRef<SlashCommandListHandle>(null);
  // v0.3.0: 聊天输入区域 ref（用于判断拖拽位置）
  const chatInputAreaRef = useRef<HTMLDivElement>(null);
  // v0.2.6: 任务拆解 Store
  const { currentBreakdown, isPanelOpen, setPanelOpen } = useTaskBreakdownStore();
  // v0.2.6: 提案审核弹窗状态
  const { isReviewModalOpen, pendingReviewProposalId, closeReviewModal } = useProposalStore();

  // v0.2.8: Composer 2.0 状态
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerChanges, setComposerChanges] = useState<FileChange[]>([]);
  const [composerMessageId, setComposerMessageId] = useState<string | null>(null);

  // v0.3.0: 多模态图片附件状态
  const [imageAttachments, setImageAttachments] = useState<ImageAttachment[]>([]);
  // v0.3.0: 拖拽高亮状态（用于视觉反馈）- 只在文件管理器拖拽时显示
  const [isDragHighlight, setIsDragHighlight] = useState(false);

  // 🔥 使用 refs 存储 E2E 测试需要的最新值（解决闭包问题）
  const composerOpenRef = useRef(composerOpen);
  const composerChangesRef = useRef(composerChanges);
  const composerMessageIdRef = useRef(composerMessageId);

  // 同步 ref 值
  useEffect(() => {
    composerOpenRef.current = composerOpen;
    composerChangesRef.current = composerChanges;
    composerMessageIdRef.current = composerMessageId;
  }, [composerOpen, composerChanges, composerMessageId]);

  // v0.2.8: 错误修复状态
  const [errorFixOpen, setErrorFixOpen] = useState(false);
  const [errorFixSuggestions, setErrorFixSuggestions] = useState<AIFixSuggestion[]>([]);
  const [selectedError, setSelectedError] = useState<ParsedError | null>(null);

  // v0.3.6: UI Optimization state
  const { isSearchVisible, toggleSearch } = useChatUIStore();
  const [isModelPanelOpen, setIsModelPanelOpen] = useState(false);
  const modelPanelRef = useRef<HTMLDivElement>(null);

  // Close panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modelPanelRef.current && !modelPanelRef.current.contains(event.target as Node)) {
        setIsModelPanelOpen(false);
      }
    };
    if (isModelPanelOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isModelPanelOpen]);

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
    const THRESHOLD = 50; // 更加严格的底部判定阈值
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < THRESHOLD;

    if (!isNearBottom) {
      // 用户离开底部：标记为正在手动滚动
      // 🔥 FIX v0.4.0: 如果当前正在加载且之前不在滚动状态，则记录起始锁定位置
      if (!isUserScrolling.current) {
        console.log('[AIChat] 🔒 Scroll Locked: User moved away from bottom during streaming');
      }
      isUserScrolling.current = true;

      if (scrollTimeoutRef.current) {
        window.clearTimeout(scrollTimeoutRef.current);
      }

      // 延长锁定期限到 3 秒，确保用户有足够时间阅读
      scrollTimeoutRef.current = window.setTimeout(() => {
        // 只有当用户真的停留在底部附近时才解除锁定
        if (container.scrollHeight - container.scrollTop - container.clientHeight < THRESHOLD) {
          isUserScrolling.current = false;
          console.log('[AIChat] 🔓 Scroll Unlocked: User returned to bottom');
        }
      }, 3000);
    } else {
      // 用户主动滑到底部：立即解除锁定
      if (isUserScrolling.current) {
        console.log('[AIChat] 🔓 Scroll Unlocked: User manually returned to bottom');
      }
      isUserScrolling.current = false;
      if (scrollTimeoutRef.current) {
        window.clearTimeout(scrollTimeoutRef.current);
      }
    }
  };

  // 🔥 修复版本显示硬编码:在组件挂载时获取版本号
  useEffect(() => {
    const fetchVersion = async () => {
      try {
        // 🔥 FIX: 确保 Tauri bridge 已初始化
        await ensureTauriInitialized();

        const { getVersion } = await import('@tauri-apps/api/app');
        const version = await getVersion();
        setAppVersion(version);
      } catch (error) {
        console.warn('[AIChat] Failed to get version from Tauri:', error);
        // 保留默认版本号
      }
    };

    fetchVersion();
  }, []);

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
  const isProviderConfigured = !!(currentProvider && currentProvider.enabled &&
    (currentProvider.isCustom || currentProvider.apiKey));

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
          // 🔥 FIX: 确保 Tauri bridge 已初始化
          await ensureTauriInitialized();

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
        store.saveBreakdown(demoTaskTree).catch((e) => {
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
          await store.saveBreakdown(breakdown);
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

    // v0.2.6 Special Command: /task:complete <taskId>
    if (msg.toLowerCase().startsWith('/task:complete ')) {
      const taskId = msg.substring('/task:complete '.length).trim();

      if (!taskId) {
        const { addMessage } = useChatStore.getState() as any;
        addMessage({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: '❌ 请提供任务 ID\n\n**用法**：`/task:complete <任务ID>`'
        });
        setInput('');
        return;
      }

      import('../../services/taskExecutionService').then(async ({ getTaskExecutionService }) => {
        try {
          const service = getTaskExecutionService();
          await service.completeTask(taskId);

          const { addMessage } = useChatStore.getState() as any;
          addMessage({
            id: crypto.randomUUID(),
            role: 'user',
            content: msg
          });

          addMessage({
            id: crypto.randomUUID(),
            role: 'assistant',
            content: `✅ 任务 **${taskId}** 已标记为完成。`
          });

          setInput('');
          setShowCommands(false);
          resetHistoryIndex();
        } catch (e) {
          const { addMessage } = useChatStore.getState() as any;
          addMessage({
            id: crypto.randomUUID(),
            role: 'assistant',
            content: `❌ 操作失败: ${e}`
          });
          setInput('');
        }
      });
      return;
    }

    // v0.2.6 Special Command: /task:test:all
    if (msg.toLowerCase() === '/task:test:all') {
      const { addMessage } = useChatStore.getState() as any;
      const agentStore = useAgentStore.getState();

      addMessage({
        id: crypto.randomUUID(),
        role: 'user',
        content: msg
      });

      try {
        const assistantMsgId = crypto.randomUUID();
        addMessage({
          id: assistantMsgId,
          role: 'assistant',
          content: `_[正在启动自动化测试集成流...]_`,
          isAgentLive: true
        });

        // 启动专属的测试 Agent
        await agentStore.launchAgent(
          'test-suite-executor',
          '运行全量单元测试与 E2E 测试，并汇总报告至 Mission Control',
          assistantMsgId
        );

      } catch (e) {
        addMessage({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `❌ 无法启动测试 Agent: ${e}`
        });
      }

      setInput('');
      setShowCommands(false);
      resetHistoryIndex();
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

    // 🔥 v0.3.0 多模态修复：如果有图片附件，转换为 ContentPart[] 格式
    // 这样后端可以检测到图片并跳过本地模型，直接路由到云端 Vision LLM
    if (imageAttachments.length > 0) {
      // 构建 ContentPart[]：包含文本 + 图片 URL
      const contentParts: any[] = [
        { type: 'text', text: msg }
      ];

      // 添加每个图片附件
      imageAttachments.forEach(attachment => {
        if (attachment.status === 'ready' && attachment.content.data) {
          // 图片 URL 格式：data:mime_type;base64,base64_data
          const imageUrl = `data:${attachment.content.mime_type};base64,${attachment.content.data}`;
          contentParts.push({
            type: 'image_url',
            image_url: { url: imageUrl }
          });
        }
      });

      console.log('[AIChat] 🖼️ Sending multimodal message:', {
        textLength: msg.length,
        imageCount: imageAttachments.length,
        contentParts: contentParts.map(p => ({
          type: p.type,
          hasText: !!p.text,
          hasImageUrl: !!p.image_url
        }))
      });

      // 发送多模态消息
      await sendMessage(contentParts, currentProviderId, currentModel);
    } else {
      // 纯文本消息
      await sendMessage(msg, currentProviderId, currentModel);
    }

    // v0.3.0: 发送消息后清空图片附件
    setImageAttachments([]);
  };

  // v0.3.0: 图片附件处理函数
  const handleAddImageAttachment = useCallback(async (fileOrAttachment: File | ImageAttachment) => {
    // 🔥 v0.3.0: 如果是 File 对象，先转换为 ImageAttachment
    if (fileOrAttachment instanceof File) {
      const file = fileOrAttachment;

      // 验证文件类型
      if (!file.type.startsWith('image/')) {
        console.warn('[AIChat] 跳过非图片文件:', file.name);
        return;
      }

      // 验证文件大小 (5MB)
      const maxSize = 5 * 1024 * 1024;
      if (file.size > maxSize) {
        const attachment: ImageAttachment = {
          id: crypto.randomUUID(),
          content: {
            data: '',
            mime_type: file.type,
            name: file.name,
            size: file.size,
          },
          previewUrl: '',
          status: 'error',
          error: '文件过大 (5MB 限制)',
        };
        setImageAttachments(prev => [...prev, attachment]);
        return;
      }

      // 读取文件为 Base64
      try {
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve, reject) => {
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1]); // 移除 data:image/xxx;base64, 前缀
          };
          reader.onerror = reject;
        });
        reader.readAsDataURL(file);

        const base64Data = await base64Promise;

        // 创建预览 URL
        const previewUrl = `data:${file.type};base64,${base64Data}`;

        // 创建 ImageAttachment
        const attachment: ImageAttachment = {
          id: crypto.randomUUID(),
          content: {
            data: base64Data,
            mime_type: file.type,
            name: file.name,
            size: file.size,
          },
          previewUrl,
          status: 'ready',
        };

        setImageAttachments(prev => [...prev, attachment]);
      } catch (error) {
        console.error('[AIChat] 处理图片失败:', error);
        const attachment: ImageAttachment = {
          id: crypto.randomUUID(),
          content: {
            data: '',
            mime_type: file.type,
            name: file.name,
            size: file.size,
          },
          previewUrl: '',
          status: 'error',
          error: '处理失败',
        };
        setImageAttachments(prev => [...prev, attachment]);
      }
    } else {
      // 直接是 ImageAttachment 对象
      setImageAttachments(prev => [...prev, fileOrAttachment]);
    }
  }, []);

  const handleRemoveImageAttachment = useCallback((id: string) => {
    setImageAttachments(prev => prev.filter(a => a.id !== id));
  }, []);

  // v0.3.0: Tauri file-drop 事件拦截（用于聊天输入区域的图片拖拽）
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let unlistenHover: (() => void) | null = null;
    let unlistenLeave: (() => void) | null = null;
    let fileDragActive = false; // 标记是否有文件拖拽正在进行

    const setupFileDropListener = async () => {
      try {
        // 🔥 FIX: 确保 Tauri bridge 已初始化并动态导入 listen
        await ensureTauriInitialized();
        const { listen } = await import('@tauri-apps/api/event');

        // v0.3.0: 监听 Tauri 的 file-drop-hover 事件（文件管理器拖拽进入窗口）
        try {
          unlistenHover = await listen<any>('tauri://file-drop-hover', (event) => {
            console.log('[AIChat] Tauri file-drop-hover 事件 - 文件拖拽进入窗口');
            // 文件拖拽进入窗口时显示蓝色边框
            fileDragActive = true;
            setIsDragHighlight(true);
          });
        } catch (err) {
          console.log('[AIChat] Tauri file-drop-hover not available:', err);
        }

        // v0.3.0: 监听 Tauri 的 file-drop-leave 事件（文件拖拽离开窗口）
        try {
          unlistenLeave = await listen<any>('tauri://file-drop-leave', (event) => {
            console.log('[AIChat] Tauri file-drop-leave 事件 - 文件拖拽离开窗口');
            // 文件拖拽离开窗口时清除蓝色边框
            fileDragActive = false;
            setIsDragHighlight(false);
          });
        } catch (err) {
          console.log('[AIChat] Tauri file-drop-leave not available:', err);
        }

        unlisten = await listen<string[]>('tauri://file-drop', async (event) => {
          const filePaths = event.payload;

          console.log('[AIChat] Tauri file-drop received:', filePaths);

          // 拖拽结束，清除蓝色边框状态
          fileDragActive = false;
          setIsDragHighlight(false);

          // 检查是否在加载中
          if (isLoading) {
            console.log('[AIChat] 正在加载中，忽略图片拖拽');
            return;
          }

          // 过滤出图片文件
          const imageFiles = filePaths.filter(path => {
            const ext = path.toLowerCase().split('.').pop();
            return ext && ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext);
          });

          // 如果有图片文件，处理它们
          if (imageFiles.length > 0) {
            console.log('[AIChat] 处理图片拖拽:', imageFiles);

            // 读取图片文件并添加附件
            for (const filePath of imageFiles) {
              try {
                // 使用 Tauri invoke 读取文件并转换为 base64
                const base64Data = await invoke<string>('read_file_as_base64', { path: filePath });

                // 创建 File 对象
                const byteCharacters = atob(base64Data);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                  byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: getMimeType(filePath) });
                const file = new File([blob], filePath.split('/').pop() || 'image.png', { type: blob.type });

                // 添加图片附件
                await handleAddImageAttachment(file);
              } catch (error) {
                console.error('[AIChat] 读取图片失败:', filePath, error);
              }
            }
          } else {
            console.log('[AIChat] 拖拽的文件中没有图片');
          }
        });

        console.log('[AIChat] Tauri file-drop 监听器已设置');
      } catch (error) {
        console.warn('[AIChat] 设置 file-drop 监听器失败:', error);
      }
    };

    setupFileDropListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
      if (unlistenHover) {
        unlistenHover();
      }
      if (unlistenLeave) {
        unlistenLeave();
      }
    };
  }, [isLoading, handleAddImageAttachment]);

  // 🔄 监听后端文件操作完成事件，刷新文件树
  useEffect(() => {
    let unlistenFileRefresh: (() => void) | null = null;

    const setupFileRefreshListener = async () => {
      try {
        // 🔥 FIX: 确保 Tauri bridge 已初始化并动态导入 listen
        await ensureTauriInitialized();
        const { listen } = await import('@tauri-apps/api/event');

        unlistenFileRefresh = await listen<any>('file-tree-refresh', (event) => {
          console.log('[AIChat] 🔄 File tree refresh event received:', event.payload);

          // 刷新文件树
          try {
            const { refreshFileTreeDebounced } = useFileStore.getState();
            refreshFileTreeDebounced();
            console.log('[AIChat] ✅ File tree refreshed after file operation');
          } catch (e) {
            console.warn('[AIChat] ⚠️ Failed to refresh file tree:', e);
          }
        });

        console.log('[AIChat] Tauri file-tree-refresh listener setup complete');
      } catch (error) {
        console.warn('[AIChat] Failed to setup file-tree-refresh listener:', error);
      }
    };

    setupFileRefreshListener();

    return () => {
      if (unlistenFileRefresh) {
        unlistenFileRefresh();
      }
    };
  }, []);

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
    // 🔥 FIX v0.3.8.2: 检查消息是否仍然存在于当前 thread 中
    const message = rawMessages.find(m => m.id === messageId);
    if (!message) {
      console.warn(`[AIChat] ⚠️ Cannot approve tool call: message ${messageId} not found in current thread`);
      return;
    }
    const toolCall = message.toolCalls?.find(tc => tc.id === toolCallId);
    if (!toolCall) {
      console.warn(`[AIChat] ⚠️ Cannot approve tool call: toolCall ${toolCallId} not found in message ${messageId}`);
      return;
    }

    // 🔥 v0.3.4: 记录会话信任（手动批准时）
    const settings = useSettingsStore.getState();
    const approvalMode = settings.agentApprovalMode || 'session-once'; // 🔥 默认值处理

    console.log(`[AIChat] 🔥 v0.3.4 Manual approval check:`, {
      approvalMode,
      originalMode: settings.agentApprovalMode
    });

    if (approvalMode === 'session-once') {
      const threadId = useThreadStore.getState().activeThreadId || 'default';
      const sessionTrust = settings.trustedSessions[threadId];

      console.log(`[AIChat] 🔥 v0.3.4 Manual approval check:`, {
        threadId,
        sessionTrust,
        approvalMode
      });

      // 只在首次批准时记录
      if (!sessionTrust || Date.now() >= sessionTrust.expiresAt) {
        const now = Date.now();
        const updatedSessions = {
          ...settings.trustedSessions,
          [threadId]: {
            approvedAt: now,
            expiresAt: now + 60 * 60 * 1000 // 1小时
          }
        };
        settings.updateSettings({
          trustedSessions: updatedSessions
        });

        console.log(`[AIChat] 🔥 v0.3.4 Session trusted via manual approval:`, {
          threadId,
          newSession: updatedSessions[threadId],
          allSessions: Object.keys(updatedSessions)
        });
      }
    }

    approveToolCall(messageId, toolCallId);
  }, [approveToolCall, rawMessages]);

  const handleReject = useCallback((messageId: string, toolCallId: string) => {
    // 🔥 FIX v0.3.8.2: 检查消息是否仍然存在于当前 thread 中
    const message = rawMessages.find(m => m.id === messageId);
    if (!message) {
      console.warn(`[AIChat] ⚠️ Cannot reject tool call: message ${messageId} not found in current thread`);
      return;
    }
    const toolCall = message.toolCalls?.find(tc => tc.id === toolCallId);
    if (!toolCall) {
      console.warn(`[AIChat] ⚠️ Cannot reject tool call: toolCall ${toolCallId} not found in message ${messageId}`);
      return;
    }
    rejectToolCall(messageId, toolCallId);
  }, [rejectToolCall, rawMessages]);

  // v0.2.8: Composer 2.0 辅助函数
  /**
   * 从消息中提取文件变更信息
   */
  /**
   * 解析 toolCall result（处理字符串或对象格式）
   */
  const parseToolResult = useCallback((result: any): any => {
    if (!result) return null;
    if (typeof result === 'string') {
      try {
        return JSON.parse(result);
      } catch {
        return null;
      }
    }
    return result;
  }, []);

  /**
   * 解析 toolCall args（处理字符串或对象格式）
   */
  const parseToolArgs = useCallback((args: any): any => {
    if (!args) return {};
    if (typeof args === 'string') {
      try {
        return JSON.parse(args);
      } catch {
        return {};
      }
    }
    return args;
  }, []);

  const extractFileChanges = useCallback((message: any): FileChange[] => {
    const changes: FileChange[] = [];

    console.log('[extractFileChanges] Extracting from message:', message.id);
    console.log('[extractFileChanges] toolCalls count:', message.toolCalls?.length);

    // 遍历消息中的 contentSegments（如果存在）
    if (message.contentSegments && Array.isArray(message.contentSegments)) {
      for (const segment of message.contentSegments) {
        if (segment.type === 'tool' && segment.toolCallId) {
          // 查找对应的 toolCall
          const toolCall = message.toolCalls?.find((tc: any) => tc.id === segment.toolCallId);
          if (!toolCall) continue;

          const toolName = toolCall.function?.name || toolCall.tool;
          const args = parseToolArgs(toolCall.function?.arguments || toolCall.arguments);

          console.log('[extractFileChanges] Tool call:', toolName, 'args keys:', Object.keys(args || {}));

          // 只处理 agent_write_file 工具
          if (toolName === 'agent_write_file') {
            // 🔥 支持 rel_path 和 relPath 两种参数名
            const relPath = args.rel_path || args.relPath;
            if (relPath && args.content) {
              const result = parseToolResult(toolCall.result);
              console.log('[extractFileChanges] Tool result:', result);

              if (result && result.success) {
                // 🔥 兼容 camelCase 和 snake_case
                const originalContent = result.originalContent || result.original_content;
                changes.push({
                  path: relPath,
                  content: args.content,
                  originalContent: originalContent,
                  changeType: originalContent ? 'modified' : 'added',
                  applied: false,
                });
                console.log('[extractFileChanges] ✓ Change extracted:', relPath);
              }
            }
          }
        }
      }
    }

    // 兜底：直接从 toolCalls 提取
    if (changes.length === 0 && message.toolCalls) {
      console.log('[extractFileChanges] Fallback: direct extraction from toolCalls');
      for (const toolCall of message.toolCalls) {
        const toolName = toolCall.function?.name || toolCall.tool;

        // 🔥 详细日志：查看 toolCall 的原始结构
        console.log('[extractFileChanges] Tool call structure:', {
          id: toolCall.id,
          tool: toolCall.tool,
          functionName: toolCall.function?.name,
          functionArguments: toolCall.function?.arguments,
          functionArgumentsType: typeof toolCall.function?.arguments,
          arguments: toolCall.arguments,
          argumentsType: typeof toolCall.arguments,
          // 🔥 添加更多可能的参数位置
          args: (toolCall as any).args,
          argsType: typeof (toolCall as any).args,
          parameters: (toolCall as any).parameters,
          parametersType: typeof (toolCall as any).parameters,
          result: toolCall.result,
        });

        // 🔥 尝试从多个可能的字段提取参数
        const args = parseToolArgs(
          toolCall.function?.arguments ||
          toolCall.arguments ||
          (toolCall as any).args ||
          (toolCall as any).parameters ||
          '{}'
        );

        console.log('[extractFileChanges] Tool call (fallback):', toolName, 'args keys:', Object.keys(args || {}), 'args:', args);

        if (toolName === 'agent_write_file') {
          // 🔥 支持 rel_path 和 relPath 两种参数名
          const relPath = args.rel_path || args.relPath;
          if (relPath && args.content) {
            const result = parseToolResult(toolCall.result);
            console.log('[extractFileChanges] Tool result (fallback):', result);

            if (result && result.success) {
              // 🔥 兼容 camelCase 和 snake_case
              const originalContent = result.originalContent || result.original_content;
              changes.push({
                path: relPath,
                content: args.content,
                originalContent: originalContent,
                changeType: originalContent ? 'modified' : 'added',
                applied: false,
              });
              console.log('[extractFileChanges] ✓ Change extracted (fallback):', relPath);
            }
          }
        }
      }
    }

    console.log('[extractFileChanges] Total changes extracted:', changes.length);
    return changes;
  }, [parseToolResult, parseToolArgs]);

  /**
   * 打开 Composer 面板
   */
  const openComposer = useCallback((messageId: string) => {
    console.log('[openComposer] Opening Composer for message:', messageId);
    const message = rawMessages.find(m => m.id === messageId);
    if (!message) {
      console.warn('[openComposer] Message not found:', messageId);
      return;
    }

    const changes = extractFileChanges(message);
    console.log('[openComposer] Changes found:', changes.length);

    if (changes.length > 0) {
      setComposerChanges(changes);
      setComposerMessageId(messageId);
      setComposerOpen(true);
      console.log('[openComposer] ✓ Composer opened with', changes.length, 'changes');
    } else {
      console.warn('[openComposer] No file changes found, cannot open Composer');
    }
  }, [rawMessages, extractFileChanges]);

  // 🔥 E2E 测试辅助函数 - 暴露到 window 对象（必须在 openComposer 之后）
  useEffect(() => {
    (window as any).__E2E_COMPOSER__ = {
      openComposer: (messageId: string) => {
        openComposer(messageId);
      },
      setComposerState: (changes: any[], msgId: string) => {
        setComposerChanges(changes);
        setComposerMessageId(msgId);
        setComposerOpen(true);
      },
      getComposerState: () => ({
        isOpen: composerOpenRef.current,
        changesCount: composerChangesRef.current.length,
        messageId: composerMessageIdRef.current
      })
    };
  }, [openComposer]);

  /**
   * Composer: 刷新已打开的文件内容
   *
   * 在 accept/reject 操作后，需要刷新编辑器中打开的文件内容
   * 这样用户才能看到最新的文件状态
   */
  const refreshOpenedFiles = useCallback(async (filePaths: string[]) => {
    const fileStore = useFileStore.getState();
    const rootPath = fileStore.rootPath;

    if (!rootPath) {
      console.log('[Composer] No root path, skipping file refresh');
      return;
    }

    // 找出需要刷新的文件（已打开且在 filePaths 列表中）
    const filesToRefresh = fileStore.openedFiles.filter(file => {
      if (!file.path) return false;
      // 将相对路径转换为绝对路径进行比较
      const fullPath = file.path.startsWith(rootPath)
        ? file.path
        : `${rootPath}/${file.path}`;
      return filePaths.some(path => {
        const targetPath = path.startsWith(rootPath)
          ? path
          : `${rootPath}/${path}`;
        return fullPath === targetPath || file.path.endsWith(path);
      });
    });

    console.log('[Composer] Refreshing opened files:', filesToRefresh.map(f => f.path));

    // 刷新每个文件的内容
    let refreshedCount = 0;
    for (const file of filesToRefresh) {
      try {
        // 确保使用绝对路径进行加载
        const absolutePath = file.path.startsWith(rootPath) 
          ? file.path 
          : `${rootPath}/${file.path}`;

        // 只刷新没有未保存更改的文件
        if (!file.isDirty) {
          // 🔥 修复：如果 file.path 是相对路径，reloadFileContent 可能会失败
          // 我们直接调用 readFileContent 并更新 store
          const content = await readFileContent(absolutePath);
          fileStore.updateFileContent(file.id, content);
          fileStore.setFileDirty(file.id, false);
          
          refreshedCount++;
          console.log(`[Composer] ✓ Refreshed file: ${absolutePath}`);
        } else {
          console.log(`[Composer] ⊘ Skipped dirty file: ${absolutePath}`);
        }
      } catch (e) {
        console.warn(`[Composer] Failed to refresh file ${file.path}:`, e);
      }
    }

    // 刷新文件树（显示最新的 git 状态）
    try {
      await fileStore.refreshFileTree();
      console.log('[Composer] ✓ Refreshed file tree');
    } catch (e) {
      console.warn('[Composer] Failed to refresh file tree (non-critical):', e);
    }

    console.log(`[Composer] File refresh complete: ${refreshedCount}/${filesToRefresh.length} files refreshed`);
  }, []);

  /**
   * Composer: 接受所有文件变更
   */
  const handleComposerAcceptAll = useCallback(async () => {
    console.log('[Composer] Accept All clicked, changes:', composerChanges.length);
    const operations = composerChanges.map(fileChangeToOperation);
    console.log('[Composer] Operations to execute:', operations.map(op => ({ path: op.path, op: op.op_type })));

    try {
      // 🔥 Composer 上下文中跳过冲突检测
      // 用户已经在预览界面中看到了变更，直接应用
      const result = await atomicWriteService.executeAtomicWrite(operations, {
        skipConflictCheck: true
      });

      console.log('[Composer] Accept All result:', result);

      if (result.success) {
        // 刷新已打开的文件内容
        const changedPaths = composerChanges.map(c => c.path);
        await refreshOpenedFiles(changedPaths);

        setComposerOpen(false);
        setComposerChanges([]);
        setComposerMessageId(null);
        toast.success(`已应用 ${result.applied_files?.length || operations.length} 个文件变更`);
      } else {
        console.error('[Composer] Accept All failed:', result);
        toast.error(`应用失败: ${result.errors?.join(', ') || '未知错误'}`);
      }
    } catch (error) {
      console.error('[Composer] Failed to apply changes:', error);
      toast.error(`应用失败: ${error}`);
    }
  }, [composerChanges, refreshOpenedFiles]);

  /**
   * Composer: 拒绝所有文件变更（回滚文件内容）
   */
  const handleComposerRejectAll = useCallback(async () => {
    // 🔥 FIX: 确保 Tauri bridge 已初始化并动态导入 invoke
    await ensureTauriInitialized();
    const { invoke } = await import('@tauri-apps/api/core');

    console.log('[Composer] Reject All clicked, changes:', composerChanges.length);

    try {
      let rolledBack = 0;
      let deleted = 0;

      // 对每个变更执行回滚操作
      for (const change of composerChanges) {
        if (change.changeType === 'modified' && change.originalContent) {
          // 修改的文件：恢复原始内容
          const rootPath = useFileStore.getState().rootPath;
          if (rootPath) {
            // 🔄 P4: 使用 ToolService 统一调用
            await ToolService.rollbackFile(rootPath, change.path, change.originalContent);
            console.log('[Composer] Rolled back modified file:', change.path);
            rolledBack++;
          }
        } else if (change.changeType === 'added') {
          // 新增的文件：删除
          const rootPath = useFileStore.getState().rootPath;
          if (rootPath) {
            try {
              // 🔄 P4: 使用 ToolService 统一调用
              await ToolService.rollbackDelete(rootPath, change.path);
              console.log('[Composer] Deleted new file:', change.path);
              deleted++;
            } catch (e) {
              // 文件可能不存在，忽略错误
              console.warn('[Composer] Failed to delete file (may not exist):', change.path);
            }
          }
        }
      }

      // 刷新已打开的文件内容
      const changedPaths = composerChanges.map(c => c.path);
      await refreshOpenedFiles(changedPaths);

      setComposerOpen(false);
      setComposerChanges([]);
      setComposerMessageId(null);

      const message = `已拒绝所有文件变更`;
      if (rolledBack > 0 || deleted > 0) {
        toast.success(`${message}（回滚 ${rolledBack} 个，删除 ${deleted} 个）`);
      } else {
        toast.info(message);
      }

      console.log('[Composer] Reject All completed:', { rolledBack, deleted });
    } catch (error) {
      console.error('[Composer] Failed to rollback changes:', error);
      toast.error(`回滚失败: ${error}`);
    }
  }, [composerChanges, refreshOpenedFiles]);

  /**
   * Composer: 接受单个文件变更
   */
  const handleComposerAcceptFile = useCallback(async (path: string) => {
    const change = composerChanges.find(c => c.path === path);
    if (!change) return;

    try {
      // 创建单文件操作的原子写入
      const operation = fileChangeToOperation(change);

      // 🔥 Composer 上下文中跳过冲突检测
      // 因为用户在 Composer 中可以反复"接受→拒绝"，每次都是有意操作
      const result = await atomicWriteService.executeAtomicWrite([operation], {
        skipConflictCheck: true
      });

      if (result.success) {
        // 刷新已打开的文件内容
        await refreshOpenedFiles([path]);

        setComposerChanges(prev =>
          prev.map(c =>
            c.path === path ? { ...c, applied: true } : c
          )
        );
        toast.success(`已应用: ${path}`);
      }
    } catch (error) {
      console.error(`[Composer] Failed to apply ${path}:`, error);
    }
  }, [composerChanges, refreshOpenedFiles]);

  /**
   * Composer: 拒绝单个文件变更（回滚文件内容，但保留在列表中以便重新接受）
   */
  const handleComposerRejectFile = useCallback(async (path: string) => {
    // 🔥 FIX: 确保 Tauri bridge 已初始化并动态导入 invoke
    await ensureTauriInitialized();
    const { invoke } = await import('@tauri-apps/api/core');

    try {
      // 查找要拒绝的变更
      const change = composerChanges.find(c => c.path === path);
      if (!change) {
        toast.error(`未找到文件变更: ${path}`);
        return;
      }

      const rootPath = useFileStore.getState().rootPath;
      if (!rootPath) {
        toast.error('未打开项目文件夹');
        return;
      }

      // 执行回滚操作
      if (change.changeType === 'modified' && change.originalContent) {
        // 修改的文件：恢复原始内容
        // 🔄 P4: 使用 ToolService 统一调用
        await ToolService.rollbackFile(rootPath, path, change.originalContent);
        console.log('[Composer] Rolled back single file:', path);
      } else if (change.changeType === 'added') {
        // 新增的文件：删除
        try {
          // 🔄 P4: 使用 ToolService 统一调用
          await ToolService.rollbackDelete(rootPath, path);
          console.log('[Composer] Deleted new file:', path);
        } catch (e) {
          console.warn('[Composer] Failed to delete file (may not exist):', path);
        }
      }

      // 刷新已打开的文件内容
      await refreshOpenedFiles([path]);

      // 重置 applied 状态为 false，保留文件在列表中以便重新接受
      setComposerChanges(prev =>
        prev.map(c =>
          c.path === path ? { ...c, applied: false } : c
        )
      );
      toast.success(`已拒绝并回滚: ${path}`);
    } catch (error) {
      console.error('[Composer] Failed to rollback file:', error);
      toast.error(`回滚失败: ${error}`);
    }
  }, [composerChanges, refreshOpenedFiles]);

  /**
   * Composer: 关闭面板
   */
  const handleComposerClose = useCallback(() => {
    setComposerOpen(false);
    setComposerChanges([]);
    setComposerMessageId(null);
  }, []);

  // v0.2.8: 错误修复处理函数
  /**
   * 从终端输出中检测错误并打开修复面板
   */
  const handleDetectErrors = useCallback(async (terminalOutput: string) => {
    try {
      const errors = await errorFixService.parseTerminalErrors(terminalOutput);

      // 过滤可修复的错误
      const fixableErrors = errors.filter(isFixableError);

      if (fixableErrors.length === 0) {
        toast.info('未发现可修复的错误');
        return;
      }

      // 生成修复建议
      const suggestions: AIFixSuggestion[] = [];

      for (const error of fixableErrors) {
        const fixContext = await errorFixService.generateFixContext(error);
        if (fixContext) {
          // 构造 AI 提示并生成建议
          const prompt = `
请分析以下错误并提供修复建议：

**错误信息：**
- 代码：${error.code}
- 消息：${error.message}
- 文件：${fixContext.file_path}:${fixContext.line_number}
- 语言：${fixContext.language}

**代码上下文：**
\`\`\`${fixContext.language.toLowerCase()}
${fixContext.code_context}
\`\`\`

请提供：
1. 错误原因分析
2. 具体的修复方案
3. 修复后的代码示例（如果适用）
`;

          suggestions.push({
            error,
            fixContext,
            suggestion: prompt, // 将被 AI 处理
            confidence: 'medium'
          });
        }
      }

      setErrorFixSuggestions(suggestions);
      setSelectedError(fixableErrors[0]);
      setErrorFixOpen(true);

      toast.success(`检测到 ${fixableErrors.length} 个可修复错误`);
    } catch (error) {
      console.error('[ErrorFix] 检测错误失败:', error);
      toast.error('错误检测失败');
    }
  }, []);

  /**
   * 应用 AI 修复建议（发送到聊天）
   */
  const handleApplyErrorFix = useCallback((suggestion: AIFixSuggestion) => {
    const fixPrompt = `
请帮我修复以下错误：

**错误代码：** ${suggestion.error.code}
**错误消息：** ${suggestion.error.message}
**文件位置：** ${suggestion.fixContext.file_path}:${suggestion.fixContext.line_number}

**代码上下文：**
\`\`\`${suggestion.fixContext.language.toLowerCase()}
${suggestion.fixContext.code_context}
\`\`\`

请提供修复方案并直接修改文件。`;

    // 发送到 AI 聊天
    setInput(fixPrompt);
    setErrorFixOpen(false);

    toast.info('已将错误发送到 AI 助手');
  }, [setInput]);

  /**
   * 跳转到错误位置
   */
  const handleGoToError = useCallback(async (error: ParsedError) => {
    try {
      const content = await readFileContent(error.file);
      const fileName = error.file.split('/').pop() || error.file;

      openFile({
        id: error.file,
        path: error.file,
        name: fileName,
        content,
        isDirty: false,
        language: error.language.toLowerCase(),
        initialLine: error.line
      });

      toast.info(`已跳转到 ${error.file}:${error.line}`);
    } catch (error) {
      console.error('[ErrorFix] 跳转失败:', error);
      toast.error('无法打开文件');
    }
  }, [openFile]);

  /**
   * 关闭错误修复面板
   */
  const handleErrorFixClose = useCallback(() => {
    setErrorFixOpen(false);
    setErrorFixSuggestions([]);
    setSelectedError(null);
  }, []);

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
    if (!agentAutoApprove || isLoading) return; // Skip if loading/streaming (handled in useChatStore finish listener)

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

  const isSidekickMode = width ? width < 100 : false;

  // Header Component for reuse - Secondary Thinning (Phase 6)
  const renderHeader = () => (
    <div className="flex flex-col bg-[#1e1e1e]/60 backdrop-blur-md sticky top-0 z-[60] relative" data-testid="ai-chat-header">
      {/* Precision Border Overlay */}
      <div className="absolute inset-x-0 bottom-0 h-px bg-white/5 z-10" />

      {/* Line 1: Brand & App Info - Thin Mode: 36px */}
      <div 
        data-testid="ai-brand-line"
        className={clsx(
          "flex items-center justify-between px-4", 
          isSidekickMode ? "flex-col gap-2 py-3 px-0" : "h-9"
        )}
      >
        <div className="flex items-center gap-2.5 group">
          <div className="relative">
            <img src={ifaiLogo} alt="IfAI Logo" className={clsx("opacity-90 transition-transform duration-300 group-hover:scale-110", isSidekickMode ? "w-6 h-6" : "w-4 h-4")} />
            <div className="absolute inset-0 bg-blue-500/20 blur-lg rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          {!isSidekickMode && (
            <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex flex-row items-baseline gap-2">
              <span className="text-[11px] font-black text-gray-100 tracking-tight leading-none">IfAI Editor</span>
              <span className="text-[9px] font-bold text-blue-500/80 tracking-widest uppercase">
                V{appVersion}{IS_COMMERCIAL ? ' PRO' : ''}
              </span>
            </motion.div>
          )}
        </div>
        
        <div className={clsx("flex items-center gap-1 relative z-[70]", isSidekickMode && "flex-col")}>
          <button
            onClick={() => toggleSearch()}
            data-testid="ai-search-toggle"
            className={`p-1 rounded-lg transition-all active:scale-95 ${isSearchVisible ? 'text-blue-400 bg-blue-500/10' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
            title="搜索对话 (Cmd+F)"
          >
            <Search size={isSidekickMode ? 18 : 14} />
          </button>
        </div>
      </div>
    </div>
  );

  if (!isProviderConfigured) {
    return (
      <div 
        data-testid="chat-panel"
        className="flex flex-col h-full bg-[#1e1e1e] border-l border-gray-700 flex-shrink-0 relative transition-colors"
        style={{ width: width ? `${width}px` : '384px' }}
      >
        {onResizeStart && (
          <div 
              className="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-blue-500 transition-colors z-50"
              onMouseDown={onResizeStart}
          />
        )}
        {renderHeader()}
        <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
          <img src={ifaiLogo} alt="IfAI Logo" className="w-10 h-10 text-gray-500 mb-4 opacity-70" />
          <p className="text-gray-400 mb-4">{t('chat.errorNoKey')} {currentProvider ? `(${currentProvider.name})` : ''}</p>
          <button 
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm transition-colors"
              onClick={() => setSettingsOpen(true)}
          >
              {t('chat.settings')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
        data-testid="chat-panel"
        className={`flex flex-col h-full bg-[#1e1e1e] border-l border-gray-700 flex-shrink-0 relative transition-colors ${isDragHighlight ? 'border-blue-500 bg-blue-900/20' : ''}`}
        style={{ width: width ? `${width}px` : '384px', contain: 'layout' }}
    >
      {onResizeStart && (
        <div 
            className="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-blue-500 transition-colors z-50"
            onMouseDown={onResizeStart}
        />
      )}
      
      {renderHeader()}

      {/* Thread Search Bar (Conditional) */}
      <AnimatePresence>
        {isSearchVisible && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
            className="overflow-hidden border-b border-white/5 bg-[#1e1e1e]"
            data-testid="ai-search-panel"
          >
            <ThreadSearchBar />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Thread Tabs */}
      <ThreadTabs width={width} maxVisibleTabs={5} showMessageCount={true} showCloseButton={true} />

      {/* 🚀 Phase 1: Segmented Control for View Switching */}
      <div className="px-4 py-2 border-b border-white/5 bg-[#1e1e1e]/40 backdrop-blur-md" data-testid="ai-view-selector">
        <div className="flex p-0.5 bg-gray-900/50 rounded-lg relative border border-white/5">
          <button
            onClick={() => setViewMode('normal')}
            data-testid="view-mode-chat"
            className={`flex-1 flex items-center justify-center gap-2 py-1 text-[11px] font-bold transition-colors relative z-10 ${viewMode === 'normal' ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}
          >
            <span>对话</span>
            {viewMode === 'normal' && (
              <motion.div
                layoutId="view-mode-active"
                data-testid="tab-active-pill"
                className="absolute inset-0 bg-gray-800 rounded-md -z-10 shadow-sm border border-white/5"
                transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
              />
            )}
          </button>
          <button
            onClick={() => setViewMode('timeline')}
            data-testid="view-mode-timeline"
            className={`flex-1 flex items-center justify-center gap-2 py-1 text-[11px] font-bold transition-colors relative z-10 ${viewMode === 'timeline' ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}
          >
            <span>时间线</span>
            {viewMode === 'timeline' && (
              <motion.div
                layoutId="view-mode-active"
                data-testid="tab-active-pill"
                className="absolute inset-0 bg-gray-800 rounded-md -z-10 shadow-sm border border-white/5"
                transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
              />
            )}
          </button>
        </div>
      </div>

      {/* v0.3.1: 根据视图模式显示不同的内容 */}
      {viewMode === 'timeline' ? (
        <MessageTimeline
          onBubbleClick={(messageId) => {
            // 点击气泡切换回普通视图并滚动到对应消息
            setViewMode('normal');
            // 等待视图切换完成
            setTimeout(() => {
              const messageElement = document.querySelector(`[data-testid="message-${messageId}"]`);
              if (messageElement) {
                messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // 高亮消息
                messageElement.classList.add('ring-2', 'ring-blue-500');
                setTimeout(() => {
                  messageElement.classList.remove('ring-2', 'ring-blue-500');
                }, 2000);
              }
            }, 100);
          }}
          batchSize={10}
          timeoutMs={5000}
        />
      ) : (
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="min-h-0 overflow-auto p-4"
          data-testid="chat-scroll-container"
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
            onOpenComposer={openComposer}
            isLoading={isLoading}
            parentRef={scrollContainerRef}
          />
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* v0.2.6 新增：Token 使用量指示器 */}

      {/* AI Transparency: 系统提示词卡片 */}
      {transparencyLevel !== 'minimal' && currentPromptMeta && (
        <SystemPromptCard meta={currentPromptMeta} />
      )}

      <TokenUsageIndicator />

      <div className="p-4 bg-[#1e1e1e]/30">
        <ChatInputArea isLoading={isLoading} />
      </div>

      {/* v0.2.8: Composer 2.0 多文件 Diff 预览 Portal */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {composerOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed inset-0 z-[210] flex items-center justify-center p-4 md:p-8 bg-black/60 backdrop-blur-sm"
            >
              <div className="w-full h-full max-w-[1400px] max-h-[900px] shadow-2xl shadow-black/50 border border-white/10 rounded-xl overflow-hidden bg-[#1e1e1e]">
                <ComposerDiffView
                  changes={composerChanges}
                  onAcceptAll={handleComposerAcceptAll}
                  onRejectAll={handleComposerRejectAll}
                  onAcceptFile={handleComposerAcceptFile}
                  onRejectFile={handleComposerRejectFile}
                  onClose={handleComposerClose}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
      </div>
      );
      };