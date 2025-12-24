import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Settings } from 'lucide-react';
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
import ifaiLogo from '../../../imgs/ifai.png'; // Import the IfAI logo

interface AIChatProps {
  width?: number;
  onResizeStart?: (e: React.MouseEvent) => void;
}

export const AIChat = ({ width, onResizeStart }: AIChatProps) => {
  const { t } = useTranslation();
  
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
  
  // Throttled messages for smoother rendering
  const [displayMessages, setDisplayMessages] = useState(rawMessages);
  const lastUpdateTime = useRef(0);
  const throttleTimeout = useRef<number | null>(null);

  useEffect(() => {
    const now = Date.now();
    const isLastMessageStreaming = rawMessages.length > 0 && 
                                   rawMessages[rawMessages.length - 1].role === 'assistant' && 
                                   isLoading;

    if (!isLastMessageStreaming) {
      // If not streaming, update immediately
      setDisplayMessages(rawMessages);
      lastUpdateTime.current = now;
      if (throttleTimeout.current) {
        window.clearTimeout(throttleTimeout.current);
        throttleTimeout.current = null;
      }
      return;
    }

    // If streaming, throttle updates (e.g., every 50ms for better responsiveness)
    const timeSinceLastUpdate = now - lastUpdateTime.current;
    const throttleMs = isLastMessageStreaming ? 50 : 150;

    if (timeSinceLastUpdate >= throttleMs) {
      setDisplayMessages(rawMessages);
      lastUpdateTime.current = now;
    } else if (!throttleTimeout.current) {
      throttleTimeout.current = window.setTimeout(() => {
        setDisplayMessages(rawMessages);
        lastUpdateTime.current = Date.now();
        throttleTimeout.current = null;
      }, throttleMs - timeSinceLastUpdate);
    }
  }, [rawMessages, isLoading]);

  const setSettingsOpen = useLayoutStore(state => state.setSettingsOpen);
  const openFile = useFileStore(state => state.openFile);
  const [input, setInput] = useState('');
  const [showCommands, setShowCommands] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const commandListRef = useRef<SlashCommandListHandle>(null);

  const scrollToBottom = (instant = false) => {
    messagesEndRef.current?.scrollIntoView({ behavior: instant ? 'instant' : 'smooth' });
  };

  // Auto-scroll to bottom when messages update, use instant scroll during streaming
  useEffect(() => {
    const isStreaming = isLoading && displayMessages.length > 0 &&
                        displayMessages[displayMessages.length - 1].role === 'assistant';
    scrollToBottom(isStreaming);
  }, [displayMessages, isLoading]);

  const currentProvider = providers.find(p => p.id === currentProviderId);
  const isProviderConfigured = currentProvider && currentProvider.apiKey && currentProvider.enabled;

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
            V0.2.1
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
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {displayMessages.map((message, index) => (
          <MessageItem
            key={message.id}
            message={message}
            onApprove={handleApprove}
            onReject={handleReject}
            onOpenFile={handleOpenFile}
            isStreaming={isLoading && message.role === 'assistant' && message.isAgentLive !== true}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

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
    </div>
  );
};