import React, { useEffect } from 'react';
import { SnippetList } from './SnippetList';
import { SnippetSearchBar } from './SnippetSearchBar';
import { useSnippetStore } from '../../stores/snippetStore';
import { Code2 } from 'lucide-react';

export const SnippetManager: React.FC = () => {
  const { fetchSnippets } = useSnippetStore();

  useEffect(() => {
    fetchSnippets();
  }, []);

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] border-r border-gray-700 w-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 p-3 bg-[#252526] border-b border-gray-700">
        <Code2 className="w-4 h-4 text-blue-400" />
        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Snippet Manager</span>
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
  return (
    <div className="p-1.5 px-3 bg-[#007acc] text-[10px] text-white flex justify-between items-center shrink-0">
      <span>{snippets.length} items</span>
      <span className="opacity-70">IndexedDB Storage</span>
    </div>
  );
};
