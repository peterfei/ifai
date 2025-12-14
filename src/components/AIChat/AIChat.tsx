import React, { useState, useEffect, useRef } from 'react';
import { Send, Settings, User, Bot, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useChatStore } from '../../stores/useChatStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { useTranslation } from 'react-i18next';

export const AIChat = () => {
  const { t } = useTranslation();
  const { messages, isLoading, sendMessage } = useChatStore();
  const { aiApiKey } = useSettingsStore();
  const { setSettingsOpen } = useLayoutStore();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || !aiApiKey) return;
    const msg = input;
    setInput('');
    await sendMessage(msg);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!aiApiKey) {
    return (
      <div className="flex flex-col h-full bg-[#1e1e1e] border-l border-gray-700 p-4 items-center justify-center text-center">
        <Bot size={48} className="text-gray-500 mb-4" />
        <p className="text-gray-400 mb-4">{t('chat.errorNoKey')}</p>
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
    <div className="flex flex-col h-full bg-[#1e1e1e] border-l border-gray-700 w-80">
      <div className="flex items-center justify-between p-3 border-b border-gray-700 bg-[#252526]">
        <span className="font-bold text-gray-300 flex items-center"><Bot size={18} className="mr-2"/> {t('chat.title')}</span>
        <button onClick={() => setSettingsOpen(true)} className="text-gray-400 hover:text-white">
            <Settings size={16} />
        </button>
      </div>
// ... (rest is same)

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-lg p-3 text-sm ${
                msg.role === 'user' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-[#2d2d2d] text-gray-200'
            }`}>
                <div className="prose prose-invert prose-sm max-w-none">
                    <ReactMarkdown
                      components={{
                        code({node, className, children, ...props}) {
                          const match = /language-(\w+)/.exec(className || '')
                          return match ? (
                            <SyntaxHighlighter
                              // @ts-ignore
                              style={vscDarkPlus}
                              language={match[1]}
                              PreTag="div"
                              {...props}
                            >
                              {String(children).replace(/\n$/, '')}
                            </SyntaxHighlighter>
                          ) : (
                            <code className={className} {...props}>
                              {children}
                            </code>
                          )
                        }
                      }}
                    >
                        {msg.content}
                    </ReactMarkdown>
                </div>
            </div>
          </div>
        ))}
        {isLoading && (
            <div className="flex justify-start">
                <div className="bg-[#2d2d2d] rounded-lg p-3">
                    <Loader2 size={16} className="animate-spin text-gray-400" />
                </div>
            </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-3 border-t border-gray-700 bg-[#252526]">
        <div className="relative">
            <textarea
                className="w-full bg-[#3c3c3c] text-white rounded p-2 pr-10 text-sm focus:outline-none resize-none h-20"
                placeholder={t('chat.placeholder')}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
            />
            <button 
                className={`absolute bottom-2 right-2 p-1 rounded ${
                    input.trim() && !isLoading ? 'text-blue-400 hover:text-blue-300' : 'text-gray-500 cursor-not-allowed'
                }`}
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
            >
                <Send size={18} />
            </button>
        </div>
      </div>
    </div>
  );
};
