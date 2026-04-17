import React, { useState, useEffect } from 'react';
import { Search, Plus, Trash2, Database } from 'lucide-react';
import { useSnippetStore } from '../../stores/snippetStore';
import { TestDataGenerator } from '../../utils/testDataGenerator';
import { useTranslation } from 'react-i18next';

export const SnippetSearchBar: React.FC = () => {
  const { setFilter, filter, clearAll, bulkAddSnippets } = useSnippetStore();
  const { t } = useTranslation();
  const [searchValue, setSearchValue] = useState(filter.search || '');

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilter({ search: searchValue });
    }, 300);
    return () => clearTimeout(timer);
  }, [searchValue, setFilter]);

  const handleGenerateData = async () => {
    if (confirm(t('snippetSearch.confirmGenerate'))) {
      await clearAll();
      const mockSnippets = TestDataGenerator.generateSnippets({
        count: 1000,
        complexity: 'medium'
      });
      // Add more randomness to data for search testing
      const snippets = mockSnippets.map(s => ({
        ...s,
        updatedAt: new Date(Date.now() - Math.random() * 1000000000).toISOString()
      }));
      await bulkAddSnippets(snippets);
    }
  };

  const handleAddSnippet = async () => {
    const id = await useSnippetStore.getState().addSnippet({
      title: 'New Snippet',
      code: '// Start coding here...',
      language: 'typescript',
      tags: []
    });
    const snippet = useSnippetStore.getState().snippets.find(s => s.id === id);
    if (snippet) {
      useSnippetStore.getState().openSnippetAsFile(snippet);
    }
  };

  return (
    <div className="theme-panel-muted theme-border space-y-3 border-b p-3">
      <div className="flex items-center gap-2">
        <div className="theme-input-surface theme-border focus-within:border-blue-500 relative flex flex-1 items-center rounded border transition-colors">
          <Search className="theme-text-subtle absolute left-2.5 h-3.5 w-3.5" />
          <input
            type="text"
            className="theme-text w-full bg-transparent py-1.5 pl-8 pr-2 text-xs outline-none placeholder:theme-text-subtle"
            placeholder={t('snippetSearch.placeholder')}
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
          />
        </div>
        <button
          title={t('snippetSearch.newSnippet')}
          onClick={handleAddSnippet}
          className="theme-button-primary rounded p-1.5"
        >
          <Plus size={14} />
        </button>
      </div>

      <div className="flex items-center justify-between text-[10px]">
        <div className="flex items-center gap-2">
           <button
             onClick={handleGenerateData}
             className="theme-button-ghost flex items-center gap-1 rounded px-2 py-1 text-[10px] hover:text-green-500"
             title={t('snippetSearch.genDataTitle')}
           >
             <Database size={12} />
             <span>{t('snippetSearch.genData')}</span>
           </button>
        </div>
        <button
          onClick={() => confirm(t('snippetSearch.confirmClear')) && clearAll()}
          className="theme-button-ghost flex items-center gap-1 rounded px-2 py-1 text-[10px] hover:text-red-500"
        >
          <Trash2 size={12} />
          <span>{t('snippetSearch.clearAll')}</span>
        </button>
      </div>
    </div>
  );
};
