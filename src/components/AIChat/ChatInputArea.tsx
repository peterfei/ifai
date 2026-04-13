import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Hash, Image, AtSign, X, Code, Terminal, ChevronRight, Activity } from 'lucide-react';
// 🔥 FIX: 使用 CoreStoreProxy 的代理版本，确保工作流意图识别生效
import { useChatStore } from '../../stores/chat/CoreStoreProxy';
import { useSettingsStore } from '../../stores/settingsStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { useFileStore } from '../../stores/fileStore';
import { ImageInput } from '../Multimodal/ImageInput';
import { FuzzyFileSearch } from './FuzzyFileSearch';
import { SymbolSearch } from './SymbolSearch';
import { SlashCommandList } from './SlashCommandList';
import { ContextHUD } from './ContextHUD';
import { ToolClassificationIndicator } from '../ToolClassification';
import { ModelCapsulePanel } from './ModelCapsulePanel';
import type { ImageAttachment } from '../../types/multimodal';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';

interface ChatInputAreaProps {
  isLoading: boolean;
}

/**
 * v0.3.6: 顶级重构 - 沉浸式多模态输入框 (仪表盘布局版)
 * 优化重点：释放输入宽度，引入底部集成状态栏
 */
export const ChatInputArea: React.FC<ChatInputAreaProps> = ({ isLoading }) => {
  const [input, setInput] = useState('');
  const [showMention, setShowMention] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [showSymbol, setShowSymbol] = useState(false);
  const [symbolFilter, setSymbolFilter] = useState('');
  const [showCommands, setShowCommands] = useState(false);
  const [imageAttachments, setImageAttachments] = useState<ImageAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isModelPanelOpen, setIsModelPanelOpen] = useState(false);
  const modelPanelRef = useRef<HTMLDivElement>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const commandListRef = useRef<any>(null);
  const fileSearchRef = useRef<any>(null);
  const symbolSearchRef = useRef<any>(null);

  // 🔥 FIX: 添加 null 检查，防止在 E2E 测试环境中 store 未初始化
  const chatStoreState = useChatStore();
  const { providers, currentProviderId, currentModel } = useSettingsStore();
  const { allFilePaths, refreshFileTree } = useFileStore();
  const setSettingsOpen = useLayoutStore(state => state.setSettingsOpen);

  // 🔥 FIX: 使用默认值而不是早期返回，避免违反 React Hooks 规则
  const sendMessage = chatStoreState?.sendMessage;
  const messages = chatStoreState?.messages || [];

  const currentProvider = React.useMemo(() => 
    providers.find(p => p.id === currentProviderId),
    [providers, currentProviderId]
  );

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

    if (mMatch) { setShowMention(true); setMentionFilter(mMatch[1]); setShowSymbol(false); setShowCommands(false); }
    else if (sMatch) { setShowSymbol(true); setSymbolFilter(sMatch[1]); setShowMention(false); setShowCommands(false); }
    else if (slashMatch) { setShowCommands(true); setShowMention(false); setShowSymbol(false); }
    else { setShowMention(false); setShowSymbol(false); setShowCommands(false); }
  };

  const handleSelectFile = (filePath: string) => {
    const cursor = textareaRef.current?.selectionStart || 0;
    const textBefore = input.slice(0, cursor).replace(/@[\w.-]*$/, '');
    const textAfter = input.slice(cursor);
    setInput(`${textBefore}[#${filePath.split('/').pop()}](${filePath}) ${textAfter}`);
    setShowMention(false);
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

    // 🔥 CRITICAL FIX: 绕过 store，直接调用 SendMessageOrchestrator
    // 这样即使 store 状态被破坏，消息发送仍然能工作
    console.log('[ChatInputArea] 🔍 Using direct orchestrator call (bypassing store)');

    // 保存当前输入内容，用于清空
    const messageToSend = input;
    const attachmentsToSend = [...imageAttachments];

    // 立即清空输入框和附件，允许用户继续输入
    setInput('');
    setImageAttachments([]);
    setHistoryIndex(-1);
    setOriginalInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    // 🔥 异步发送消息（不阻塞输入框）
    const sendAsync = async () => {
      try {
        // 🔥 直接导入 orchestrator，绕过 store
        const { sendMessageOrchestrator } = await import('../../stores/chat/sendMessage/SendMessageOrchestrator');

        // 发送消息
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

        // 🔥 检查是否是工作流消息
        if (result && (result as any).skipped) {
          console.log('[ChatInputArea] ⚡ Workflow handled message');
          return;
        }

        // 🔥 对于普通聊天，需要调用 generateResponse
        const store = useChatStore.getState();
        if (typeof store.generateResponse === 'function') {
          await store.generateResponse(
            result.context || [],
            currentProviderId,
            currentModel,
            result.correlationId
          );
        } else {
          console.error('[ChatInputArea] ❌ generateResponse not available');
        }
      } catch (err) {
        console.error('[ChatInputArea] ❌ Error:', err);
      }
    };

    // 不等待，让消息在后台处理
    sendAsync();

    console.log('[ChatInputArea] ✅ Message queued, input cleared, ready for next message');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const isPanelOpen = showMention || showSymbol || showCommands;

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
      {showSymbol && <SymbolSearch ref={symbolSearchRef} filter={symbolFilter} onSelect={handleSelectSymbol} onClose={() => setShowSymbol(false)} />}
      {showCommands && <SlashCommandList ref={commandListRef} filter={input} onSelect={handleSelectCommand} onClose={() => setShowCommands(false)} />}

      <AnimatePresence>
        {isDragging && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-[100] bg-blue-600/30 backdrop-blur-md border-2 border-dashed border-blue-500 rounded-2xl flex flex-col items-center justify-center gap-3 text-white pointer-events-none">
            <div className="bg-blue-500 p-4 rounded-full shadow-2xl animate-bounce"><Image size={32} /></div>
            <span className="text-sm font-black tracking-wider">释放图片，AI 即刻读图</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div data-testid="chat-input-container" className={clsx("relative flex flex-col w-full transition-all duration-500 rounded-2xl border bg-[#1e1e1e]/90 backdrop-blur-3xl border-white/5 shadow-2xl group-focus-within:border-blue-500/40")}>
        {/* 1. 顶部预览流 (附件与图片) */}
        <AnimatePresence mode="popLayout">
          {(imageAttachments.length > 0 || activeReferences.length > 0) && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="flex flex-wrap items-center gap-3 p-3 border-b border-white/5 bg-gradient-to-b from-white/5 to-transparent overflow-x-auto scrollbar-none rounded-t-2xl">
              {activeReferences.map(ref => (
                <div key={ref.path} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-black group/chip hover:bg-blue-500/20 transition-all">
                  <Hash size={10} /><span className="max-w-[120px] truncate">{ref.name}</span>
                  <button onClick={() => setInput(prev => prev.replace(ref.fullMatch, '').trim())} className="hover:text-blue-300 opacity-60 group-hover/chip:opacity-100 transition-opacity"><X size={10} /></button>
                </div>
              ))}
              {imageAttachments.map(img => (
                <motion.div layout key={img.id} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} data-testid="image-attachment-item" className="relative group/img">
                  <img src={img.previewUrl} className="w-14 h-14 rounded-xl object-cover border border-white/10 shadow-lg ring-2 ring-transparent group-hover/img:ring-blue-500/50 transition-all" />
                  <button onClick={() => setImageAttachments(prev => prev.filter(i => i.id !== img.id))} className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover/img:opacity-100 transition-all shadow-lg scale-75 group-hover/img:scale-100"><X size={10} /></button>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* 2. 中部输入区 (Textarea 占满宽度) */}
        <div className="flex flex-col p-2">
          <textarea ref={textareaRef} data-testid="chat-input" rows={1} value={input} onChange={handleInputChange} onKeyDown={handleKeyDown} placeholder="问问 IfAI..." className="w-full max-h-48 min-h-[44px] py-2.5 px-3 bg-transparent outline-none text-gray-100 text-[13px] placeholder-gray-500 resize-none leading-relaxed font-semibold transition-all" />
        </div>

        {/* 3. 底部集成状态栏 (Status Dashboard) */}
        <div className="flex items-center justify-between px-3 py-1.5 bg-gradient-to-r from-black/20 via-white/[0.02] to-black/20 border-t border-white/5 backdrop-blur-sm min-h-[40px] rounded-b-2xl">
          {/* 左侧：识别状态与性能指标 */}
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="scale-95 origin-left">
              <ToolClassificationIndicator input={input} className="flex-shrink-0" />
            </div>
            {input.length > 0 && (
              <>
                <div className="h-3 w-px bg-white/10 hidden sm:block" />
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
                    ? "bg-blue-600/20 border-blue-500/50 text-blue-400" 
                    : "bg-white/5 border-white/5 text-gray-500 hover:border-white/10 hover:text-gray-300"
                )}
                title={`当前模型: ${currentModel}`}
              >
                <span className="text-[10px] leading-none">🧠</span>
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

            <div className="w-px h-4 bg-white/5 mx-1" />

            <div className="flex items-center">
              <ImageInput attachments={imageAttachments} onAddAttachment={(a) => setImageAttachments(prev => [...prev, a])} onRemoveAttachment={(id) => setImageAttachments(prev => prev.filter(i => i.id !== id))} />
              <button onClick={() => setShowMention(!showMention)} className="p-2 text-gray-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-xl transition-all" title="引用文件"><AtSign size={16} /></button>
              <button onClick={() => setShowSymbol(!showSymbol)} className="p-2 text-gray-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-xl transition-all" title="引用符号"><Hash size={16} /></button>
            </div>
            <div className="w-px h-4 bg-white/5 mx-1.5" />
            <button
              onClick={handleSend}
              data-testid="chat-send-button"
              disabled={(!input.trim() && imageAttachments.length === 0)}
              className={clsx(
                "p-2 rounded-xl transition-all duration-300 relative overflow-hidden group/send",
                (input.trim() || imageAttachments.length > 0)
                  ? "bg-blue-600 text-white shadow-[0_0_20px_rgba(59,130,246,0.5)] scale-105 active:scale-95"
                  : "bg-gray-800 text-gray-600"
              )}
            >
              <motion.div
                animate={(input.trim() || imageAttachments.length > 0) ? {
                  boxShadow: ["0 0 20px rgba(59,130,246,0.4)", "0 0 35px rgba(59,130,246,0.7)", "0 0 20px rgba(59,130,246,0.4)"]
                } : {}}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                className="absolute inset-0 rounded-xl"
              />
              <Send size={18} className="relative z-10 group-hover/send:translate-x-0.5 group-hover/send:-translate-y-0.5 transition-transform" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};