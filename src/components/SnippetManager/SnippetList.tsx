import React from 'react';
import { Virtuoso } from 'react-virtuoso';
import { useSnippetStore } from '../../stores/snippetStore';
import { SnippetItem } from './SnippetItem';
import { Loader2 } from 'lucide-react';

export const SnippetList: React.FC = () => {
  const { snippets, isLoading, activeSnippetId, openSnippetAsFile } = useSnippetStore();

  if (isLoading && snippets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-2">
        <Loader2 className="animate-spin w-6 h-6" />
        <span className="text-xs">Loading snippets...</span>
      </div>
    );
  }

  if (snippets.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 italic text-xs">
        No snippets found
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
