import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Send, Hash, Image, AtSign, X, Cpu } from 'lucide-react';
// 🔥 FIX: 使用 CoreStoreProxy 的代理版本，确保工作流意图识别生效
import { useChatStore } from '../../stores/chat/CoreStoreProxy';
// 🏆 Phase 3: 直接读取 currentThreadId（只读），用于 per-thread inputContent 的保存/恢复
import { useChatStore as useRealChatStore } from '../../stores/useChatStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { useFileStore } from '../../stores/fileStore';
import { ImageInput } from '../Multimodal/ImageInput';
import { FuzzyFileSearch } from './FuzzyFileSearch';
import { SymbolSearch } from './SymbolSearch';
import { SlashCommandList } from './SlashCommandList';
import { AgentSelector } from '../../gui/conversation/AgentSelector';
import { getAllAgents } from '../../gui/conversation/AGENT_DSL';
import { ContextHUD } from './ContextHUD';
import { ToolClassificationIndicator } from '../ToolClassification';
import { ModelCapsulePanel } from './ModelCapsulePanel';
import { MultimodalWarning } from './MultimodalWarning';
import { checkMultimodalSupport, getMultimodalWarning } from '../../utils/multimodalSupport';
import type { ImageAttachment } from '../../types/multimodal';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';

interface ChatInputAreaProps {
  isLoading: boolean;
}

/**
 * v0.3.6: 顶级重构 - 沉浸式多模态输入框 (仪表盘布局版)
 * 优化重点：释放输入宽度，引入底部集成状态栏
 */
export const ChatInputArea: React.FC<ChatInputAreaProps> = ({ isLoading: _isLoading }) => {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const [showMention, setShowMention] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [showAgentSelector, setShowAgentSelector] = useState(false);
  const [agentFilter, setAgentFilter] = useState('');
  const [showSymbol, setShowSymbol] = useState(false);
  const [symbolFilter, setSymbolFilter] = useState('');
  const [showCommands, setShowCommands] = useState(false);
  const [imageAttachments, setImageAttachments] = useState<ImageAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isModelPanelOpen, setIsModelPanelOpen] = useState(false);
  const [dismissedWarning, setDismissedWarning] = useState(false);
  const modelPanelRef = useRef<HTMLDivElement>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const commandListRef = useRef<any>(null);
  const fileSearchRef = useRef<any>(null);
  const symbolSearchRef = useRef<any>(null);

  // 🔥 FIX: 添加 null 检查，防止在 E2E 测试环境中 store 未初始化
  const chatStoreState = useChatStore();
  const { currentProviderId, currentModel } = useSettingsStore();
  const { allFilePaths, refreshFileTree } = useFileStore();
  const setSettingsOpen = useLayoutStore(state => state.setSettingsOpen);

  // 🔥 FIX: 使用默认值而不是早期返回，避免违反 React Hooks 规则
  const messages = chatStoreState?.messages || [];

  // 🔥 UX 改进：多模态支持检测和警告
  const multimodalWarning = useMemo(() => {
    // 当用户关闭警告或没有图片时，不显示警告
    if (dismissedWarning || imageAttachments.length === 0) {
      return null;
    }

    // 检查当前模型是否支持多模态
    return getMultimodalWarning(currentProviderId, currentModel);
  }, [dismissedWarning, imageAttachments.length, currentProviderId, currentModel]);

  // 当图片附件变化时，重置警告关闭状态
  useEffect(() => {
    if (imageAttachments.length > 0) {
      setDismissedWarning(false);
    }
  }, [imageAttachments.length]);

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

  // 🏆 Phase 3: 线程切换时保存/恢复输入框内容
  const inputRef = useRef(input);
  inputRef.current = input;
  const currentThreadId = useRealChatStore((s: any) => s.currentThreadId);

  useEffect(() => {
    // 恢复新线程的输入内容
    const saved = typeof window !== 'undefined'
      ? (window as any).__getPerThreadSessionStore?.()?.getInputContent(currentThreadId)
      : '';
    setInput(saved || '');

    return () => {
      // 保存旧线程的输入内容
      if (typeof window !== 'undefined' && currentThreadId) {
        (window as any).__getPerThreadSessionStore?.()?.setInputContent(currentThreadId, inputRef.current);
      }
    };
  }, [currentThreadId]);

  const [historyIndex, setHistoryIndex] = useState(-1);
  const [originalInput, setOriginalInput] = useState('');

  const userHistory = React.useMemo(() => {
    return messages
      .filter(m => m.role === 'user' && typeof m.content === 'string')
      .map(m => m.content as string)
      .reverse();
  }, [messages]);

  useEffect(() => {
    if (allFilePaths.length === 0) refreshFileTree();
  }, []);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    if (e.clientX <= rect.left || e.clientX >= rect.right || e.clientY <= rect.top || e.clientY >= rect.bottom) {
      setIsDragging(false);
    }
  }, []);

  const processFiles = useCallback(async (files: File[]) => {
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    for (const file of imageFiles) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        const attachment: ImageAttachment = {
          id: crypto.randomUUID(),
          content: { data: base64.split(',')[1], mime_type: file.type, name: file.name, size: file.size },
          previewUrl: base64,
          status: 'ready',
        };
        setImageAttachments(prev => [...prev, attachment]);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processFiles(Array.from(e.dataTransfer.files));
    }
  }, [processFiles]);

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) { e.preventDefault(); await processFiles(files); }
  }, [processFiles]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInput(value);
    const cursor = e.target.selectionStart || 0;
    const textBefore = value.slice(0, cursor);
    const mMatch = textBefore.match(/@([\w.-]*)$/);
    const sMatch = textBefore.match(/#([\w-]*)$/);
    const slashMatch = textBefore.match(/^\/(\w*)$/);

    if (mMatch) {
      // @ 触发：优先展示 Agent 选择器，如果没有 Agent 匹配则展示文件搜索
      const agentText = mMatch[1].toLowerCase();
      const matchedAgents = getAllAgents().filter(
        (a) => a.name.toLowerCase().includes(agentText) ||
               a.abbr.toLowerCase().includes(agentText) ||
               a.command.toLowerCase().includes(agentText) ||
               a.id.toLowerCase().includes(agentText),
      );
      if (matchedAgents.length > 0 || agentText === '') {
        setShowAgentSelector(true); setAgentFilter(mMatch[1]);
        setShowMention(false); setShowSymbol(false); setShowCommands(false);
      } else {
        setShowMention(true); setMentionFilter(mMatch[1]);
        setShowAgentSelector(false); setShowSymbol(false); setShowCommands(false);
      }
    }
    else if (sMatch) { setShowSymbol(true); setSymbolFilter(sMatch[1]); setShowMention(false); setShowAgentSelector(false); setShowCommands(false); }
    else if (slashMatch) { setShowCommands(true); setShowMention(false); setShowAgentSelector(false); setShowSymbol(false); }
    else { setShowMention(false); setShowAgentSelector(false); setShowSymbol(false); setShowCommands(false); }
  };

  const handleSelectFile = (filePath: string) => {
    const cursor = textareaRef.current?.selectionStart || 0;
    const textBefore = input.slice(0, cursor).replace(/@[\w.-]*$/, '');
    const textAfter = input.slice(cursor);
    setInput(`${textBefore}[#${filePath.split('/').pop()}](${filePath}) ${textAfter}`);
    setShowMention(false);
    textareaRef.current?.focus();
  };

  const handleSelectAgent = (agentId: string, command: string) => {
    const cursor = textareaRef.current?.selectionStart || 0;
    const textBefore = input.slice(0, cursor).replace(/@[\w.-]*$/, '');
    const textAfter = input.slice(cursor);
    setInput(`${textBefore}${command} ${textAfter}`);
    setShowAgentSelector(false);
    textareaRef.current?.focus();
  };

  const handleSelectSymbol = (symbol: any) => {
    const cursor = textareaRef.current?.selectionStart || 0;
    const textBefore = input.slice(0, cursor).replace(/#[\w-]*$/, '');
    const textAfter = input.slice(cursor);
    const activeFile = useFileStore.getState().activeFileId || '';
    setInput(`${textBefore}[#${symbol.name}](${activeFile}:${symbol.line}-${symbol.line + 15}) ${textAfter}`);
    setShowSymbol(false);
    textareaRef.current?.focus();
  };

  const handleSelectCommand = (cmd: string) => {
    setInput(cmd + ' ');
    setShowCommands(false);
    textareaRef.current?.focus();
  };

  const handleSend = async () => {
    // 🔥 FIX: 移除 isLoading 检查，允许在 LLM 处理时继续发送消息
    // 这实现了"连续发送"功能：用户可以连续发送多条消息，它们会被排队处理
    if (!input.trim() && imageAttachments.length === 0) return;

    // 🔥 Phase 2: 使用消息队列发送消息
    console.log('[ChatInputArea] 🚀 Using MessageQueue to send message');

    // 保存当前输入内容，用于清空
    const messageToSend = input;
    const attachmentsToSend = [...imageAttachments];

    // 🔥 判断是否是工作流消息（以 / 开头）
    const isWorkflowCommand = messageToSend.trim().startsWith('/');
    const priority = isWorkflowCommand ? 'high' : 'normal';

    // 立即清空输入框和附件，允许用户继续输入
    setInput('');
    setImageAttachments([]);
    setHistoryIndex(-1);
    setOriginalInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    // 🔥 使用消息队列发送
    const sendAsync = async () => {
      try {
        // 动态导入 messageQueue
        const { messageQueue } = await import('../../stores/chat/MessageQueue');

        // 捕获当前线程 ID（在 await 之前，避免竞态）
        const { useThreadStore } = await import('../../stores/threadStore');
        const currentThreadId = useThreadStore.getState().activeThreadId || 'default-thread';

        // 构建消息内容
        const content = attachmentsToSend.length > 0
          ? [{ type: 'text', text: messageToSend }, ...attachmentsToSend.map(img => ({
              type: 'image_url',
              image_url: { url: img.previewUrl }
            }))]
          : messageToSend;

        // 入队消息（带上线程 ID 以便跨线程并发处理）
        const messageId = await messageQueue.enqueue({
          content,
          providerId: currentProviderId,
          model: currentModel,
          priority,
        }, currentThreadId);

        console.log('[ChatInputArea] ✅ Message enqueued:', messageId, 'priority:', priority);
      } catch (err) {
        console.error('[ChatInputArea] ❌ Error:', err);

        // 🔥 降级方案：如果队列失败，使用原有的直接调用方式
        console.log('[ChatInputArea] ⚠️ Fallback to direct orchestrator call');
        try {
          const { sendMessageOrchestrator } = await import('../../stores/chat/sendMessage/SendMessageOrchestrator');

          const result = attachmentsToSend.length > 0
            ? await sendMessageOrchestrator.send(
                [{ type: 'text', text: messageToSend }, ...attachmentsToSend.map(img => ({
                  type: 'image_url',
                  image_url: { url: img.previewUrl }
                }))],
                currentProviderId,
                currentModel
              )
            : await sendMessageOrchestrator.send(messageToSend, currentProviderId, currentModel);

          if (result && (result as any).skipped) {
            console.log('[ChatInputArea] ⚡ Workflow handled message');
            return;
          }

          const store = useChatStore.getState();
          if (typeof store.generateResponse === 'function') {
            await store.generateResponse(
              result.context || [],
              currentProviderId,
              currentModel,
              result.correlationId
            );
          }
        } catch (fallbackErr) {
          console.error('[ChatInputArea] ❌ Fallback also failed:', fallbackErr);
        }
      }
    };

    // 不等待，让消息在后台处理
    sendAsync();

    console.log('[ChatInputArea] ✅ Message queued, input cleared, ready for next message');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const isPanelOpen = showMention || showSymbol || showCommands || showAgentSelector;

    // 🏆 v0.4.1: 事件转发机制 - 将键盘事件路由到当前活跃的面板
    if (isPanelOpen) {
      let handled = false;
      if (showCommands && commandListRef.current) {
        handled = commandListRef.current.handleKeyDown(e);
      } else if (showMention && fileSearchRef.current) {
        handled = fileSearchRef.current.handleKeyDown(e);
      } else if (showSymbol && symbolSearchRef.current) {
        handled = symbolSearchRef.current.handleKeyDown(e);
      }
      
      if (handled) return;
    }

    if (e.key === 'Enter' && !e.shiftKey && !isPanelOpen) { e.preventDefault(); handleSend(); }
    else if (e.key === 'ArrowUp' && !isPanelOpen && (input === '' || historyIndex !== -1)) {
      if (userHistory.length > 0 && historyIndex < userHistory.length - 1) {
        e.preventDefault(); const newIndex = historyIndex + 1;
        if (historyIndex === -1) setOriginalInput(input);
        setHistoryIndex(newIndex); setInput(userHistory[newIndex]);
      }
    } else if (e.key === 'ArrowDown' && !isPanelOpen && historyIndex !== -1) {
      e.preventDefault(); const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex); if (newIndex === -1) setInput(originalInput); else setInput(userHistory[newIndex]);
    }
  };

  const activeReferences = React.useMemo(() => {
    const matches = [...input.matchAll(/\[#(.*?)\]\((.*?)\)/g)];
    return matches.map(m => ({ name: m[1], path: m[2], fullMatch: m[0] }));
  }, [input]);

  return (
    <div className="relative group px-1" data-testid="chat-input-area" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} onPaste={handlePaste}>
      {showMention && <FuzzyFileSearch ref={fileSearchRef} filter={mentionFilter} onSelect={handleSelectFile} onClose={() => setShowMention(false)} />}
      {showAgentSelector && <AgentSelector filter={agentFilter} onSelect={handleSelectAgent} onClose={() => setShowAgentSelector(false)} />}
      {showSymbol && <SymbolSearch ref={symbolSearchRef} filter={symbolFilter} onSelect={handleSelectSymbol} onClose={() => setShowSymbol(false)} />}
      {showCommands && <SlashCommandList ref={commandListRef} filter={input} onSelect={handleSelectCommand} onClose={() => setShowCommands(false)} />}

      <AnimatePresence>
        {isDragging && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="theme-dropzone-accent absolute inset-0 z-[100] flex items-center justify-center gap-3 rounded-2xl border-2 border-dashed backdrop-blur-md pointer-events-none flex-col">
            <div className="theme-button-primary theme-glow-accent rounded-full p-4 animate-bounce"><Image size={32} /></div>
            <span className="text-sm font-black tracking-wider">
              {t('chatInput.dropImageHint')}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <div
        data-testid="chat-input-container"
        className="theme-panel-elevated theme-border theme-shadow group-focus-within:border-[var(--accent-soft-border)] relative flex w-full flex-col rounded-2xl border shadow-2xl backdrop-blur-3xl transition-all duration-500"
      >
        {/* 0. 多模态支持警告 (在预览流之前) */}
        <AnimatePresence mode="popLayout">
          {multimodalWarning && (
            <div className="p-2 pt-3">
              <MultimodalWarning
                title={multimodalWarning.title}
                message={multimodalWarning.message}
                suggestion={multimodalWarning.suggestion}
                recommendedModel={multimodalWarning.recommendedModel}
                onClose={() => setDismissedWarning(true)}
              />
            </div>
          )}
        </AnimatePresence>

        {/* 1. 顶部预览流 (附件与图片) */}
        <AnimatePresence mode="popLayout">
          {(imageAttachments.length > 0 || activeReferences.length > 0) && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="theme-border flex flex-wrap items-center gap-3 overflow-x-auto rounded-t-2xl border-b bg-gradient-to-b from-[var(--bg-secondary)] to-[var(--bg-primary)] p-3 scrollbar-none"
            >
              {activeReferences.map(ref => (
                <div key={ref.path} className="theme-badge-accent flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black group/chip transition-all hover:border-[var(--accent-color)] hover:bg-[var(--selected-bg)]">
                  <Hash size={10} /><span className="max-w-[120px] truncate">{ref.name}</span>
                  <button onClick={() => setInput(prev => prev.replace(ref.fullMatch, '').trim())} className="theme-soft-hover-accent theme-text-subtle rounded-full p-0.5 opacity-60 transition-opacity group-hover/chip:opacity-100 hover:text-[var(--accent-color)]"><X size={10} /></button>
                </div>
              ))}
              {imageAttachments.map(img => (
                <motion.div layout key={img.id} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} data-testid="image-attachment-item" className="relative group/img">
                  <img src={img.previewUrl} className="theme-border h-14 w-14 rounded-xl border object-cover shadow-lg ring-2 ring-transparent transition-all group-hover/img:ring-[var(--accent-soft-border)]" />
                  <button onClick={() => setImageAttachments(prev => prev.filter(i => i.id !== img.id))} className="theme-button-danger absolute -top-1.5 -right-1.5 rounded-full p-0.5 opacity-0 scale-75 transition-all shadow-lg group-hover/img:opacity-100 group-hover/img:scale-100"><X size={10} /></button>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* 2. 中部输入区 (Textarea 占满宽度) */}
        <div className="flex flex-col p-2">
          <textarea
            ref={textareaRef}
            data-testid="chat-input"
            rows={1}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={t('chat.placeholder')}
            className={clsx(
              'w-full max-h-48 min-h-[44px] py-2.5 px-3 bg-transparent outline-none text-[13px] resize-none leading-relaxed font-semibold transition-all',
              'theme-text placeholder:theme-text-subtle'
            )}
          />
        </div>

        {/* 3. 底部集成状态栏 (Status Dashboard) */}
        <div
          className="theme-border flex min-h-[40px] items-center justify-between rounded-b-2xl border-t bg-gradient-to-r from-[var(--bg-secondary)] via-[var(--bg-primary)] to-[var(--bg-secondary)] px-3 py-1.5 backdrop-blur-sm"
        >
          {/* 左侧：识别状态与性能指标 */}
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="scale-95 origin-left">
              <ToolClassificationIndicator input={input} className="flex-shrink-0" />
            </div>
            {input.length > 0 && (
              <>
                <div className="theme-divider hidden h-3 w-px sm:block" />
                <div className="scale-95 origin-left opacity-60 hover:opacity-100 transition-opacity">
                  <ContextHUD text={input} />
                </div>
              </>
            )}
          </div>

          {/* 右侧：操作按钮与发送 */}
          <div className="flex items-center gap-0.5" ref={modelPanelRef}>
            {/* Phase 6: Interaction Descent - Bottom Model Selector */}
            <div className="relative flex items-center">
              <button
                data-testid="ai-model-selector-bottom"
                onClick={() => setIsModelPanelOpen(!isModelPanelOpen)}
                className={clsx(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-all active:scale-95 group/model",
                  isModelPanelOpen 
                    ? "theme-badge-accent theme-text-accent"
                    : "theme-button-secondary theme-text-subtle hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
                )}
                title={t('chatInput.currentModel', {
                  model: currentModel,
                })}
              >
                <Cpu size={12} className="theme-text-accent" />
                <span className="text-[9px] font-black uppercase tracking-tighter max-w-[60px] truncate">
                  {currentModel.split('/').pop()?.replace('glm-', '') || 'AI'}
                </span>
              </button>

              <AnimatePresence>
                {isModelPanelOpen && (
                  <div className="absolute bottom-[calc(100%+12px)] right-0 z-[150] w-64 origin-bottom-right">
                    <ModelCapsulePanel 
                      onClose={() => setIsModelPanelOpen(false)} 
                      setSettingsOpen={setSettingsOpen}
                    />
                  </div>
                )}
              </AnimatePresence>
            </div>

            <div className="theme-divider mx-1 h-4 w-px" />

            <div className="flex items-center">
              <ImageInput attachments={imageAttachments} onAddAttachment={(a) => setImageAttachments(prev => [...prev, a])} onRemoveAttachment={(id) => setImageAttachments(prev => prev.filter(i => i.id !== id))} />
              <button
                onClick={() => setShowMention(!showMention)}
                className="theme-soft-hover-accent theme-text-subtle rounded-xl p-2 transition-all hover:text-[var(--accent-color)]"
                title={t('chatInput.referenceFile')}
              >
                <AtSign size={16} />
              </button>
              <button
                onClick={() => setShowSymbol(!showSymbol)}
                className="theme-soft-hover-accent theme-text-subtle rounded-xl p-2 transition-all hover:text-[var(--accent-color)]"
                title={t('chatInput.referenceSymbol')}
              >
                <Hash size={16} />
              </button>
            </div>
            <div className="theme-divider mx-1.5 h-4 w-px" />
            <button
              onClick={handleSend}
              data-testid="chat-send-button"
              disabled={(!input.trim() && imageAttachments.length === 0)}
              className={clsx(
                "p-2 rounded-xl transition-all duration-300 relative overflow-hidden group/send",
                (input.trim() || imageAttachments.length > 0)
                  ? "theme-button-primary theme-glow-accent scale-105 active:scale-95"
                  : 'theme-button-secondary theme-text-subtle'
              )}
            >
              <motion.div
                animate={(input.trim() || imageAttachments.length > 0) ? { opacity: [0.7, 1, 0.7] } : {}}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                className="theme-glow-accent absolute inset-0 rounded-xl"
              />
              <Send size={18} className="relative z-10 group-hover/send:translate-x-0.5 group-hover/send:-translate-y-0.5 transition-transform" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
