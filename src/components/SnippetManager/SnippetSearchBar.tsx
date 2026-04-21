import React, { useState, useEffect } from 'react';
import { Search, Plus, Trash2, Database } from 'lucide-react';
import { useSnippetStore } from '../../stores/snippetStore';
import { TestDataGenerator } from '../../utils/testDataGenerator';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '../UI/ConfirmDialog';

export const SnippetSearchBar: React.FC = () => {
  const { setFilter, filter, clearAll, bulkAddSnippets } = useSnippetStore();
  const { t } = useTranslation();
  const [searchValue, setSearchValue] = useState(filter.search || '');
  const [confirmAction, setConfirmAction] = useState<'generate' | 'clear' | null>(null);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilter({ search: searchValue });
    }, 300);
    return () => clearTimeout(timer);
  }, [searchValue, setFilter]);

  const handleGenerateData = async () => {
    setConfirmAction('generate');
  };

  const handleAddSnippet = async () => {
    const id = await useSnippetStore.getState().addSnippet({
      title: t('snippetSearch.defaultTitle'),
      code: t('snippetSearch.defaultCode'),
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
      <ConfirmDialog
        open={confirmAction !== null}
        title={t(confirmAction === 'generate' ? 'snippetSearch.genDataTitle' : 'snippetSearch.clearAll')}
        description={t(confirmAction === 'generate' ? 'snippetSearch.confirmGenerate' : 'snippetSearch.confirmClear')}
        confirmLabel={t('common.confirm')}
        cancelLabel={t('common.cancel')}
        tone={confirmAction === 'clear' ? 'danger' : 'default'}
        onCancel={() => setConfirmAction(null)}
        onConfirm={async () => {
          if (confirmAction === 'generate') {
            await clearAll();
            const mockSnippets = TestDataGenerator.generateSnippets({
              count: 1000,
              complexity: 'medium'
            });
            const snippets = mockSnippets.map(s => ({
              ...s,
              updatedAt: new Date(Date.now() - Math.random() * 1000000000).toISOString()
            }));
            await bulkAddSnippets(snippets);
          } else if (confirmAction === 'clear') {
            await clearAll();
          }
          setConfirmAction(null);
        }}
      />
      <div className="flex items-center gap-2">
        <div className="theme-input-surface theme-border relative flex flex-1 items-center rounded-[var(--radius-sm)] border transition-colors focus-within:border-[var(--accent-color)] focus-within:shadow-[0_0_0_1px_var(--accent-color),0_0_0_4px_var(--accent-soft-bg)]">
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
          type="button"
          title={t('snippetSearch.newSnippet')}
          onClick={handleAddSnippet}
          className="theme-button-primary rounded p-1.5"
          aria-label={t('snippetSearch.newSnippet')}
        >
          <Plus size={14} />
        </button>
      </div>

      <div className="flex items-center justify-between text-[10px]">
        <div className="flex items-center gap-2">
           <button
             type="button"
             onClick={handleGenerateData}
             className="theme-button-ghost theme-text-success flex items-center gap-1 rounded px-2 py-1 text-[10px] hover:bg-[var(--success-soft-bg)] hover:text-[var(--success-color)]"
             title={t('snippetSearch.genDataTitle')}
             aria-label={t('snippetSearch.genDataTitle')}
           >
             <Database size={12} />
             <span>{t('snippetSearch.genData')}</span>
           </button>
        </div>
        <button
          type="button"
          onClick={() => setConfirmAction('clear')}
          className="theme-button-ghost theme-text-danger flex items-center gap-1 rounded px-2 py-1 text-[10px] hover:bg-[var(--danger-soft-bg)] hover:text-[var(--danger-color)]"
          aria-label={t('snippetSearch.clearAll')}
        >
          <Trash2 size={12} />
          <span>{t('snippetSearch.clearAll')}</span>
        </button>
      </div>
    </div>
  );
};
