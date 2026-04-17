import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Search, ShieldCheck, TestTube, FileText, Zap, Terminal, HelpCircle, ListTree, FileEdit } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Command {
  id: string;
  label: string;
  description: string;
  icon: React.ReactElement;
  color: string;
}

interface Props {
  filter: string;
  onSelect: (cmd: string) => void;
  onClose: () => void;
}

export interface SlashCommandListHandle {
  handleKeyDown: (e: React.KeyboardEvent | KeyboardEvent) => boolean;
}

export const SlashCommandList = React.forwardRef<SlashCommandListHandle, Props>(({ filter, onSelect, onClose }, ref) => {
  const { t } = useTranslation();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  
  const COMMANDS: Command[] = useMemo(() => [
    { id: '/explore', label: t('commands.explore.label'), description: t('commands.explore.description'), icon: <Search size={16} />, color: 'bg-blue-500' },
    { id: '/review', label: t('commands.review.label'), description: t('commands.review.description'), icon: <ShieldCheck size={16} />, color: 'bg-purple-500' },
    { id: '/test', label: t('commands.test.label'), description: t('commands.test.description'), icon: <TestTube size={16} />, color: 'bg-green-500' },
    { id: '/doc', label: t('commands.doc.label'), description: t('commands.doc.description'), icon: <FileText size={16} />, color: 'bg-orange-500' },
    { id: '/refactor', label: t('commands.refactor.label'), description: t('commands.refactor.description'), icon: <Zap size={16} />, color: 'bg-yellow-500' },
    // v0.2.6: 提案生成命令
    { id: '/proposal', label: t('commands.proposal.label'), description: t('commands.proposal.description'), icon: <FileEdit size={16} />, color: 'bg-rose-500' },
    { id: '/help', label: t('commands.help.label'), description: t('commands.help.description'), icon: <HelpCircle size={16} />, color: 'bg-teal-500' },
    { id: '/index', label: t('commands.index.label'), description: t('commands.index.description'), icon: <Search size={16} />, color: 'bg-indigo-500' },
    // v0.2.6: 任务拆解命令
    { id: '/task', label: t('commands.task.label'), description: t('commands.task.description'), icon: <ListTree size={16} />, color: 'bg-cyan-500' },
  ], [t]);

  const filteredCommands = useMemo(() => 
    COMMANDS.filter(c => 
      c.id.toLowerCase().startsWith(filter.toLowerCase()) || 
      c.label.toLowerCase().includes(filter.toLowerCase())
    ), [COMMANDS, filter]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [filter]);

  // Auto-scroll to selected item
  useEffect(() => {
    if (listRef.current) {
      const selectedElement = listRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedIndex]);

  React.useImperativeHandle(ref, () => ({
    handleKeyDown: (e: React.KeyboardEvent | KeyboardEvent) => {
      if (filteredCommands.length === 0) return false;

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + filteredCommands.length) % filteredCommands.length);
        return true;
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % filteredCommands.length);
        return true;
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (filteredCommands[selectedIndex]) {
          e.preventDefault();
          e.stopPropagation();
          onSelect(filteredCommands[selectedIndex].id);
          return true;
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return true;
      }
      return false;
    }
  }));

  if (filteredCommands.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 mx-2 theme-panel-elevated border theme-border rounded-lg theme-shadow overflow-hidden z-[100] animate-in slide-in-from-bottom-2 fade-in duration-150 ring-1 ring-black/5">
      <div className="flex items-center justify-between px-3 py-2 theme-panel-muted border-b theme-border backdrop-blur-sm">
        <span className="text-[10px] uppercase font-bold theme-text-subtle tracking-wider flex items-center gap-1">
            <Terminal size={10} />
            {t('commands.title')}
        </span>
        <span className="text-[9px] theme-panel px-1.5 py-0.5 rounded border theme-border theme-text-subtle">
            ↑↓ to navigate
        </span>
      </div>
      
      <div ref={listRef} className="max-h-72 overflow-y-auto p-1 custom-scrollbar">
        {filteredCommands.map((cmd, index) => (
          <div
            key={cmd.id}
            data-testid={`slash-command-item-${cmd.id}`}
            data-selected={index === selectedIndex}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-md cursor-pointer transition-all duration-75 group ${
              index === selectedIndex
                ? 'bg-blue-500/10 border border-blue-500/20'
                : 'theme-soft-hover border border-transparent'
            }`}
            onClick={() => onSelect(cmd.id)}
          >
            {/* Icon Box */}
            <div className={`flex items-center justify-center w-8 h-8 rounded-lg shadow-sm ${cmd.color} text-white`}>
                {React.cloneElement(cmd.icon, { 
                  // @ts-ignore
                  size: 16, 
                  strokeWidth: 2.5 
                })}
            </div>
            
            {/* Content */}
            <div className="flex flex-col min-w-0 flex-1">
              <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <span className={`text-sm font-bold truncate ${index === selectedIndex ? 'text-blue-500' : 'theme-text'}`}>
                        {cmd.id}
                    </span>
                    <span className={`text-[10px] opacity-60 font-medium truncate ${index === selectedIndex ? 'text-blue-500' : 'theme-text-subtle'}`}>
                        {cmd.label}
                    </span>
                  </div>
                  {index === selectedIndex && (
                      <span className="text-[10px] theme-panel px-1.5 rounded shadow-sm border theme-border theme-text-subtle">
                          Enter
                      </span>
                  )}
              </div>
              <span className={`text-[11px] truncate ${index === selectedIndex ? 'text-blue-500/80' : 'theme-text-subtle'}`}>
                {cmd.description}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});
