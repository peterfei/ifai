import React from 'react';
import { Snippet } from '../../types/snippet';
import { Clock, Tag, Code } from 'lucide-react';
import { clsx } from 'clsx';

interface SnippetItemProps {
  snippet: Snippet;
  isActive: boolean;
  onClick: (id: string) => void;
}

export const SnippetItem: React.FC<SnippetItemProps> = ({ snippet, isActive, onClick }) => {
  return (
    <div
      className={clsx(
        "p-3 cursor-pointer border-b border-gray-700 transition-colors",
        isActive ? "bg-blue-600/20 border-l-2 border-l-blue-500" : "hover:bg-gray-800"
      )}
      onClick={() => onClick(snippet.id)}
    >
      <div className="flex justify-between items-start mb-1">
        <h3 className="text-sm font-semibold text-gray-200 truncate pr-2">
          {snippet.title || "Untitled Snippet"}
        </h3>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-400 font-mono capitalize">
          {snippet.language}
        </span>
      </div>
      
      <p className="text-xs text-gray-500 line-clamp-2 mb-2 font-mono opacity-80">
        {snippet.code.substring(0, 100)}
      </p>
      
      <div className="flex items-center gap-3 text-[10px] text-gray-500">
        <div className="flex items-center gap-1">
          <Clock size={10} />
          <span>{new Date(snippet.updatedAt).toLocaleDateString()}</span>
        </div>
        {snippet.tags.length > 0 && (
          <div className="flex items-center gap-1">
            <Tag size={10} />
            <span className="truncate max-w-[80px]">{snippet.tags.join(', ')}</span>
          </div>
        )}
      </div>
    </div>
  );
};
