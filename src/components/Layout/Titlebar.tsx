import React, { useState } from 'react';
import { ChevronDown, Sun, Moon, MessageSquare, Terminal, Settings } from 'lucide-react';
import { useFileStore } from '../../stores/fileStore';
import { useEditorStore } from '../../stores/editorStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { v4 as uuidv4 } from 'uuid';
import { openDirectory, readFileContent, writeFileContent, saveFileAs } from '../../utils/fileSystem';
import { toast } from 'sonner';
import { open } from '@tauri-apps/plugin-dialog';
import { useTranslation } from 'react-i18next';

interface TitlebarProps {
  onToggleChat?: () => void;
  isChatOpen?: boolean;
  onToggleTerminal?: () => void;
  isTerminalOpen?: boolean;
}

export const Titlebar = ({ onToggleChat, isChatOpen, onToggleTerminal, isTerminalOpen }: TitlebarProps) => {
  const { t } = useTranslation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { openFile, activeFileId, openedFiles, updateFileContent, setFileDirty, fetchGitStatuses } = useFileStore();
  const { theme, setTheme } = useEditorStore();
  const { toggleSettings } = useLayoutStore();

  const handleNewFile = () => {
    setIsMenuOpen(false);
    openFile({
      id: uuidv4(),
      name: t('common.untitled'),
      path: '',
      content: '',
      isDirty: true,
      language: 'plaintext',
    });
  };

  const handleOpenFile = async () => {
    setIsMenuOpen(false);
    try {
      const selected = await open({
        multiple: false,
      });

      if (selected && typeof selected === 'string') {
        const content = await readFileContent(selected);
        openFile({
          id: uuidv4(),
          path: selected,
          name: selected.split('/').pop() || t('common.untitled'),
          content: content,
          isDirty: false,
          language: getLanguageFromPath(selected),
        });
      }
    } catch (error) {
      console.error('Failed to open file:', error);
      toast.error(t('common.fileOpenFailed'));
    }
  };

  const handleSaveFile = async () => {
    setIsMenuOpen(false);
    const activeFile = openedFiles.find(f => f.id === activeFileId);
    if (activeFile && activeFile.isDirty) {
      try {
        if (activeFile.path) {
          await writeFileContent(activeFile.path, activeFile.content);
          setFileDirty(activeFile.id, false);
          toast.success(t('common.fileSaved'));
          fetchGitStatuses();
        } else {
          // If it's a new untitled file, use Save As
          await handleSaveFileAs();
        }
      } catch (error) {
        console.error('Failed to save file:', error);
        toast.error(t('common.fileSaveFailed'));
      }
    }
  };

  const handleSaveFileAs = async () => {
    setIsMenuOpen(false);
    const activeFile = openedFiles.find(f => f.id === activeFileId);
    if (activeFile) {
      try {
        const newPath = await saveFileAs(activeFile.content);
        if (newPath) {
          // Update the opened file with new path and name
          openFile({
            id: activeFile.id, // Keep same ID
            path: newPath,
            name: newPath.split('/').pop() || t('common.untitled'),
            content: activeFile.content,
            isDirty: false,
            language: getLanguageFromPath(newPath),
          });
          setFileDirty(activeFile.id, false);
          toast.success(t('common.fileSaved'));
          fetchGitStatuses();
        }
      } catch (error) {
        console.error('Failed to save file as:', error);
        toast.error(t('common.fileSaveFailed'));
      }
    }
  };

  const handleThemeToggle = () => {
    setTheme(theme === 'vs-dark' ? 'light' : 'vs-dark');
  };

  const getLanguageFromPath = (path: string): string => {
    if (path.endsWith('.ts') || path.endsWith('.tsx')) return 'typescript';
    if (path.endsWith('.js') || path.endsWith('.jsx')) return 'javascript';
    if (path.endsWith('.rs')) return 'rust';
    if (path.endsWith('.json')) return 'json';
    if (path.endsWith('.md')) return 'markdown';
    if (path.endsWith('.css')) return 'css';
    if (path.endsWith('.html')) return 'html';
    return 'plaintext';
  };

  return (
    <div className="h-8 bg-gray-800 flex items-center px-4 border-b border-gray-700 select-none justify-between">
      <div className="flex items-center">
        <div className="text-gray-300 text-sm font-medium mr-4">IfAI Editor</div>
        
        <div className="relative">
          <button 
            className="flex items-center text-gray-400 hover:text-white text-sm px-2 py-1 rounded hover:bg-gray-700"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            {t('menu.file')} <ChevronDown size={14} className="ml-1" />
          </button>
          {isMenuOpen && (
            <div className="absolute top-full left-0 mt-1 bg-gray-700 rounded shadow-lg z-50 py-1 w-40">
              <div 
                className="px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-600 cursor-pointer"
                onClick={handleNewFile}
              >
                {t('menu.newFile')}
              </div>
              <div 
                className="px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-600 cursor-pointer"
                onClick={handleOpenFile}
              >
                {t('menu.openFile')}
              </div>
              <div 
                className="px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-600 cursor-pointer"
                onClick={handleSaveFile}
              >
                {t('menu.save')}
              </div>
              <div 
                className="px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-600 cursor-pointer"
                onClick={handleSaveFileAs}
              >
                {t('menu.saveAs')}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <button 
          className={`p-1 rounded text-gray-400 hover:text-white hover:bg-gray-700`}
          onClick={toggleSettings}
          title={t('chat.settings')}
        >
          <Settings size={16} />
        </button>
        <button 
          className={`p-1 rounded ${isTerminalOpen ? 'text-green-400 bg-gray-700' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
          onClick={onToggleTerminal}
          title={t('terminal.title') + " (Cmd+J)"}
        >
          <Terminal size={16} />
        </button>
        <button 
          className={`p-1 rounded ${isChatOpen ? 'text-blue-400 bg-gray-700' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
          onClick={onToggleChat}
          title={t('chat.title') + " (Cmd+L)"}
        >
          <MessageSquare size={16} />
        </button>
        <button 
          className="p-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded"
          onClick={handleThemeToggle}
          title="Toggle Theme"
        >
          {theme === 'vs-dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </div>
  );
};
