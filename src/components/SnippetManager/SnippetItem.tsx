import React from 'react';
import { Snippet } from '../../types/snippet';
import { Clock, Tag } from 'lucide-react';
import { clsx } from 'clsx';

interface SnippetItemProps {
  snippet: Snippet;
  isActive: boolean;
  onClick: () => void;
}

export const SnippetItem: React.FC<SnippetItemProps> = ({ snippet, isActive, onClick }) => {
  return (
    <div
      className={clsx(
        'theme-border cursor-pointer border-b p-3 transition-colors',
        isActive
          ? 'theme-panel-elevated border-l-2 border-l-blue-500 bg-blue-500/10'
          : 'theme-hoverable'
      )}
      onClick={onClick}
    >
      <div className="flex justify-between items-start mb-1">
        <h3 className="theme-text truncate pr-2 text-sm font-semibold">
          {snippet.title || 'Untitled Snippet'}
        </h3>
        <span className="theme-input-surface theme-border theme-text-subtle rounded border px-1.5 py-0.5 text-[10px] font-mono capitalize">
          {snippet.language}
        </span>
      </div>
      
      <p className="theme-text-subtle mb-2 line-clamp-2 text-xs font-mono opacity-80">
        {snippet.code.substring(0, 100)}
      </p>
      
      <div className="theme-text-subtle flex items-center gap-3 text-[10px]">
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
