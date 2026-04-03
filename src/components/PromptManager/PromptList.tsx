import React, { useEffect, useMemo } from 'react';
import { usePromptStore } from '../../stores/promptStore';
import { useFileStore } from '../../stores/fileStore';
import { RefreshCw, AlertCircle, FileText, Eye, EyeOff } from 'lucide-react';
import { AccessTierBadge } from './AccessTierBadge';
import { AccessTier } from '../../types/prompt';

export const PromptList: React.FC = () => {
  const { prompts, loadPrompts, selectPrompt, selectedPrompt, isLoading, error, expertMode, toggleExpertMode } = usePromptStore();
  const rootPath = useFileStore(state => state.rootPath);

  // 根据 expertMode 过滤提示词
  const filteredPrompts = useMemo(() => {
    if (expertMode) {
      return prompts; // 专家模式显示所有提示词
    }
    return prompts.filter(p => p.metadata.access_tier !== AccessTier.Private);
  }, [prompts, expertMode]);

  useEffect(() => {
    if (rootPath) {
        loadPrompts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootPath]);

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 w-64">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex justify-between items-center mb-2">
          <h2 className="font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2">
            <FileText size={16} />
            Prompts
          </h2>
          <button
            onClick={() => loadPrompts()}
            disabled={isLoading}
            className={`p-1 hover:bg-gray-200 dark:hover:bg-gray-800 rounded transition-colors ${isLoading ? 'animate-spin text-blue-500' : 'text-gray-500'}`}
            title="Refresh"
          >
            <RefreshCw size={14} />
          </button>
        </div>
        <button
          data-testid="expert-mode-toggle"
          onClick={toggleExpertMode}
          className={`w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
            expertMode
              ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
              : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border border-gray-200 dark:border-gray-700'
          }`}
          title={expertMode ? '关闭专家模式' : '开启专家模式'}
        >
          {expertMode ? <Eye size={12} /> : <EyeOff size={12} />}
          <span>{expertMode ? '专家模式' : '普通模式'}</span>
        </button>
      </div>

      {error && (
        <div className="p-3 m-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded flex items-start gap-2">
            <AlertCircle size={14} className="text-red-500 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-red-600 dark:text-red-400 break-all">{error}</div>
        </div>
      )}

      <div data-testid="prompt-list" className="flex-1 overflow-y-auto custom-scrollbar">
        {isLoading && filteredPrompts.length === 0 && (
            <div className="p-8 text-center text-xs text-gray-500">Loading prompts...</div>
        )}

        {!isLoading && filteredPrompts.length === 0 && !error && (
            <div className="p-8 text-center">
                <div className="text-3xl mb-2 opacity-20">📁</div>
                <div className="text-xs text-gray-500">No prompts found</div>
                <div className="text-[10px] text-gray-400 break-all mt-1">{rootPath}/.ifai/prompts</div>
            </div>
        )}

        {filteredPrompts.map((prompt, idx) => {
          // Safety check for prompt structure
          if (!prompt || !prompt.metadata) return null;

          const path = prompt.path || `unknown-${idx}`;
          const isSelected = selectedPrompt?.path === path;
          const tier: AccessTier = prompt.metadata.access_tier || AccessTier.Public;

          return (
            <div
              key={path}
              data-testid="prompt-item"
              data-prompt-access-tier={tier}
              onClick={() => prompt.path && selectPrompt(prompt.path)}
              className={`p-3 cursor-pointer border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-all ${
                isSelected ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 shadow-sm' : 'border-l-4 border-transparent'
              }`}
            >
              <div className="font-medium text-sm text-gray-800 dark:text-gray-200 truncate" title={prompt.metadata.name}>
                  {prompt.metadata.name || 'Untitled Prompt'}
              </div>
              <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate mt-0.5">
                  {prompt.metadata.description || 'No description'}
              </div>
              <div className="mt-2 flex items-center justify-between">
                  <AccessTierBadge tier={tier} />
                  <span className="text-[10px] text-gray-400 font-mono">v{prompt.metadata.version || '1.0.0'}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
