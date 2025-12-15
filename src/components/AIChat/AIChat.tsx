import React, { useState, useEffect, useRef } from 'react';
import { Send, Settings, Bot } from 'lucide-react';
import { useChatStore } from '../../stores/useChatStore';
import { useSettingsStore, AIProviderConfig } from '../../stores/settingsStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { useFileStore } from '../../stores/fileStore';
import { readFileContent } from '../../utils/fileSystem';
import { v4 as uuidv4 } from 'uuid';
import { useTranslation } from 'react-i18next';
import { MessageItem } from './MessageItem';

interface AIChatProps {
  width?: number;
  onResizeStart?: (e: React.MouseEvent) => void;
}

export const AIChat = ({ width, onResizeStart }: AIChatProps) => {
  const { t } = useTranslation();
  const { messages, isLoading, sendMessage, approveToolCall, rejectToolCall } = useChatStore();
  const { providers, currentProviderId, currentModel, setCurrentProviderAndModel } = useSettingsStore();
  const { setSettingsOpen } = useLayoutStore();
  const { openFile } = useFileStore();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const currentProvider = providers.find(p => p.id === currentProviderId);
  const isProviderConfigured = currentProvider && currentProvider.apiKey && currentProvider.enabled;

  const handleSend = async () => {
    if (!input.trim() || !isProviderConfigured) return;
    const msg = input;
    setInput('');
    await sendMessage(msg, currentProviderId, currentModel);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleOpenFile = async (path: string) => {
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
  };

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
        <Bot size={48} className="text-gray-500 mb-4" />
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
        style={{ width: width ? `${width}px` : '384px' }}
    >
      {onResizeStart && (
        <div 
            className="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-blue-500 transition-colors z-50"
            onMouseDown={onResizeStart}
        />
      )}
      <div className="flex items-center justify-between p-3 border-b border-gray-700 bg-[#252526]">
        <span className="font-bold text-gray-300 flex items-center"><Bot size={18} className="mr-2"/> {t('chat.title')}</span>
        
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
                    ))}
                </select>
            )}

            <button onClick={() => setSettingsOpen(true)} className="text-gray-400 hover:text-white">
                <Settings size={16} />
            </button>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message, index) => (
          <MessageItem 
            key={message.id} 
            message={message} 
            onApprove={approveToolCall} 
            onReject={rejectToolCall}
            onOpenFile={handleOpenFile}
            isStreaming={isLoading && index === messages.length - 1 && message.role === 'assistant'}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-gray-700 p-3 bg-[#252526] flex items-center">
        <input
          type="text"
          className="flex-1 bg-transparent outline-none text-white text-sm placeholder-gray-500 mr-2"
          placeholder={t('chat.placeholder')}
          value={input}
          onChange={(e) => setInput(e.target.value)}
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
