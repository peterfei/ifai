import React from 'react';
import { Virtuoso } from 'react-virtuoso';
import { useSnippetStore } from '../../stores/snippetStore';
import { SnippetItem } from './SnippetItem';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export const SnippetList: React.FC = () => {
  const { snippets, isLoading, activeSnippetId, openSnippetAsFile } = useSnippetStore();
  const { t } = useTranslation();

  if (isLoading && snippets.length === 0) {
    return (
      <div className="theme-text-subtle flex h-full flex-col items-center justify-center gap-2">
        <Loader2 className="animate-spin w-6 h-6" />
        <span className="text-xs">{t('snippetList.loading')}</span>
      </div>
    );
  }

  if (snippets.length === 0) {
    return (
      <div className="theme-text-subtle flex h-full items-center justify-center text-xs italic">
        {t('snippetList.noSnippets')}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-hidden h-full">
      <Virtuoso
        style={{ height: '100%' }}
        data={snippets}
        totalCount={snippets.length}
        itemContent={(index, snippet) => (
          <SnippetItem
            key={snippet.id}
            snippet={snippet}
            isActive={activeSnippetId === snippet.id}
            onClick={() => openSnippetAsFile(snippet)}
          />
        )}
      />
    </div>
  );
};
