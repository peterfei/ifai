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
    <div className="p-3 border-b border-gray-700 bg-[#252526] space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-500" />
          <input
            type="text"
            className="w-full bg-[#1e1e1e] border border-gray-700 rounded py-1.5 pl-8 pr-2 text-xs text-white focus:outline-none focus:border-blue-500 transition-colors"
            placeholder={t('snippetSearch.placeholder')}
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
          />
        </div>
        <button
          title={t('snippetSearch.newSnippet')}
          onClick={handleAddSnippet}
          className="p-1.5 bg-blue-600 hover:bg-blue-700 rounded transition-colors text-white"
        >
          <Plus size={14} />
        </button>
      </div>

      <div className="flex items-center justify-between text-[10px]">
        <div className="flex items-center gap-2">
           <button
             onClick={handleGenerateData}
             className="flex items-center gap-1 text-gray-400 hover:text-green-500 transition-colors"
             title={t('snippetSearch.genDataTitle')}
           >
             <Database size={12} />
             <span>{t('snippetSearch.genData')}</span>
           </button>
        </div>
        <button
          onClick={() => confirm(t('snippetSearch.confirmClear')) && clearAll()}
          className="flex items-center gap-1 text-gray-500 hover:text-red-500 transition-colors"
        >
          <Trash2 size={12} />
          <span>{t('snippetSearch.clearAll')}</span>
        </button>
      </div>
    </div>
  );
};
