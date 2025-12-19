import React, { useEffect } from 'react';
import { usePromptStore } from '../../stores/promptStore';
import { useFileStore } from '../../stores/fileStore';
import { RefreshCw, AlertCircle } from 'lucide-react';

export const PromptList: React.FC = () => {
  const { prompts, loadPrompts, selectPrompt, selectedPrompt, isLoading, error } = usePromptStore();
  const rootPath = useFileStore(state => state.rootPath);

  useEffect(() => {
    if (rootPath) {
        console.log('[PromptList] rootPath available, loading prompts...');
        loadPrompts();
    }
  }, [rootPath]);

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 w-64">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
        <h2 className="font-semibold text-gray-700 dark:text-gray-200">Prompts</h2>
        <button 
            onClick={() => loadPrompts()}
            disabled={isLoading}
            className={`p-1 hover:bg-gray-200 dark:hover:bg-gray-800 rounded transition-colors ${isLoading ? 'animate-spin' : ''}`}
            title="Refresh"
        >
            <RefreshCw size={14} />
        </button>
      </div>

      {error && (
        <div className="p-3 m-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded flex items-start gap-2">
            <AlertCircle size={14} className="text-red-500 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-red-600 dark:text-red-400 break-all">{error}</div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {isLoading && prompts.length === 0 && (
            <div className="p-4 text-center text-xs text-gray-500">Loading prompts...</div>
        )}
        
        {!isLoading && prompts.length === 0 && !error && (
            <div className="p-4 text-center">
                <div className="text-2xl mb-2">📁</div>
                <div className="text-xs text-gray-500">No prompts found in</div>
                <div className="text-[10px] text-gray-400 break-all mt-1">{rootPath}/.ifai/prompts</div>
            </div>
        )}

        {prompts.map((prompt) => (
          <div
            key={prompt.path}
            onClick={() => prompt.path && selectPrompt(prompt.path)}
            className={`p-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${
              selectedPrompt?.path === prompt.path ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500' : ''
            }`}
          >
            <div className="font-medium text-sm text-gray-800 dark:text-gray-200 truncate">{prompt.metadata.name}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{prompt.metadata.description}</div>
            <div className="mt-2 flex items-center justify-between">
                <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded ${
                    prompt.metadata.access_tier === 'public' ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' :
                    prompt.metadata.access_tier === 'protected' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300' :
                    'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
                }`}>
                    {prompt.metadata.access_tier}
                </span>
                <span className="text-[10px] text-gray-400">v{prompt.metadata.version}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};