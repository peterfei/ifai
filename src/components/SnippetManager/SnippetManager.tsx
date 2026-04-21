import React, { useEffect } from 'react';
import { SnippetList } from './SnippetList';
import { SnippetSearchBar } from './SnippetSearchBar';
import { useSnippetStore } from '../../stores/snippetStore';
import { Code2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export const SnippetManager: React.FC = () => {
  const { fetchSnippets } = useSnippetStore();
  const { t } = useTranslation();

  useEffect(() => {
    fetchSnippets();
  }, [fetchSnippets]);

  return (
    <div className="theme-panel theme-border flex h-full w-full flex-col overflow-hidden border-r">
      {/* Header */}
      <div className="theme-panel-muted theme-border flex items-center gap-2 border-b p-3">
        <Code2 className="theme-text-accent h-4 w-4" />
        <span className="theme-text-subtle text-xs font-bold uppercase tracking-wider">{t('snippetManager.title')}</span>
      </div>

      {/* Toolbar / Search */}
      <SnippetSearchBar />

      {/* List */}
      <div className="flex-1 min-h-0">
        <SnippetList />
      </div>

      {/* Footer / Stats */}
      <SnippetStats />
    </div>
  );
};

const SnippetStats: React.FC = () => {
  const snippets = useSnippetStore(state => state.snippets);
  const { t } = useTranslation();
  return (
    <div className="theme-panel-muted theme-border theme-text-subtle flex shrink-0 items-center justify-between border-t px-3 py-1.5 text-[10px]">
      <span>{snippets.length} {t('snippetManager.items')}</span>
      <span className="opacity-70">{t('snippetManager.storage')}</span>
    </div>
  );
};
