import React, { useState } from 'react';
import { ChevronDown, Sun, Moon } from 'lucide-react';
import { useFileStore } from '../../stores/fileStore';
import { useEditorStore } from '../../stores/editorStore';
import { v4 as uuidv4 } from 'uuid';
import { openDirectory, readFileContent, writeFileContent, saveFileAs } from '../../utils/fileSystem';

export const Titlebar = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { openFile, activeFileId, openedFiles, updateFileContent, setFileDirty } = useFileStore();
  const { theme, setTheme } = useEditorStore();

  const handleNewFile = () => {
    setIsMenuOpen(false);
    openFile({
      id: uuidv4(),
      name: 'Untitled',
      path: '',
      content: '',
      isDirty: true,
      language: 'plaintext',
    });
  };

  const handleOpenFile = async () => {
    setIsMenuOpen(false);
    const selected = await window.__TAURI_INTERNALS__.plugins.dialog.open({
      multiple: false,
    });

    if (selected && typeof selected === 'string') {
      try {
        const content = await readFileContent(selected);
        openFile({
          id: uuidv4(),
          path: selected,
          name: selected.split('/').pop() || 'Untitled',
          content: content,
          isDirty: false,
          language: getLanguageFromPath(selected),
        });
      } catch (error) {
        console.error('Failed to open file:', error);
      }
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
        } else {
          // If it's a new untitled file, use Save As
          await handleSaveFileAs();
        }
      } catch (error) {
        console.error('Failed to save file:', error);
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
            name: newPath.split('/').pop() || 'Untitled',
            content: activeFile.content,
            isDirty: false,
            language: getLanguageFromPath(newPath),
          });
          setFileDirty(activeFile.id, false);
        }
      } catch (error) {
        console.error('Failed to save file as:', error);
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
            File <ChevronDown size={14} className="ml-1" />
          </button>
          {isMenuOpen && (
            <div className="absolute top-full left-0 mt-1 bg-gray-700 rounded shadow-lg z-50 py-1 w-40">
              <div 
                className="px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-600 cursor-pointer"
                onClick={handleNewFile}
              >
                New File
              </div>
              <div 
                className="px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-600 cursor-pointer"
                onClick={handleOpenFile}
              >
                Open File
              </div>
              <div 
                className="px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-600 cursor-pointer"
                onClick={handleSaveFile}
              >
                Save
              </div>
              <div 
                className="px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-600 cursor-pointer"
                onClick={handleSaveFileAs}
              >
                Save As...
              </div>
            </div>
          )}
        </div>
      </div>

      <div>
        <button 
          className="p-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded"
          onClick={handleThemeToggle}
          title="Toggle Theme"
        >
          {theme === 'vs-dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>
    </div>
  );
};
