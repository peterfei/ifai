/**
 * 编辑器命令行组件 (Editor Command Bar)
 *
 * 类似 Vim 的命令行模式，通过 : 键唤起。
 * 小步快跑 - Step 5: 实现自动补全建议
 */

import React, { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import { useLayoutStore } from '../../stores/layoutStore';
import { useFileStore } from '../../stores/fileStore';
import { useEditorStore } from '../../stores/editorStore';
import { getCommandLineCore } from '../../core/commandBar/bridge';
import type { CommandResult, CommandSuggestion, CommandContext } from '../../core/commandBar/types';
import { writeFileContent, readFileContent } from '../../utils/fileSystem';
import { invoke } from '@tauri-apps/api/core';
import { Command } from '@tauri-apps/plugin-shell';
import './CommandBar.css';

export const CommandBar = () => {
  const { isCommandBarOpen, setCommandBarOpen, setSidebarActiveTab } = useLayoutStore();
  const { activeFileId, openedFiles, setFileDirty, rootPath } = useFileStore();
  const { getActiveEditor } = useEditorStore();
  const [input, setInput] = useState('');
  const [result, setResult] = useState<CommandResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<CommandSuggestion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1); // 命令建议选中索引
  const [searchResults, setSearchResults] = useState<any[]>([]); // 实时搜索结果
  const [selectedSearchIndex, setSelectedSearchIndex] = useState(-1); // 搜索结果选中索引
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * 构建命令执行上下文（包含 store 回调）
   */
  const buildCommandContext = (): CommandContext => {
    const activeFile = openedFiles.find(f => f.id === activeFileId);
    const editor = getActiveEditor();

    return {
      activeFileId,
      workspace: '',
      editorState: {
        readonly: false,
        language: activeFile?.language || 'plaintext',
      },
      stores: {
        file: {
          saveCurrentFile: async () => {
            if (!activeFile || !activeFile.path) {
              return { success: false, error: '没有活动的文件' };
            }
            try {
              await writeFileContent(activeFile.path, activeFile.content || '');
              setFileDirty(activeFileId, false);
              return { success: true, path: activeFile.path };
            } catch (error) {
              return { success: false, error: error instanceof Error ? error.message : '保存失败' };
            }
          },
          saveAllFiles: async () => {
            const dirtyFiles = openedFiles.filter(f => f.isDirty && f.path);
            let savedCount = 0;
            for (const file of dirtyFiles) {
              try {
                await writeFileContent(file.path!, file.content || '');
                setFileDirty(file.id, false);
                savedCount++;
              } catch (error) {
                console.error(`Failed to save ${file.path}:`, error);
              }
            }
            return { success: true, count: savedCount };
          },
          getOpenedFiles: () => openedFiles.map(f => ({
            id: f.id,
            path: f.path || '',
            name: f.name,
            isDirty: f.isDirty,
          })),
        },
        editor: {
          getActiveEditor: () => editor,
          formatDocument: async () => {
            if (!editor) {
              return { success: false, error: '没有活动的编辑器' };
            }
            try {
              // 使用 Monaco 的 formatDocument action
              const action = editor.getAction('editor.action.formatDocument');
              if (!action || !action.isSupported()) {
                return { success: false, error: '格式化不支持' };
              }
              action.run();
              return { success: true };
            } catch (error) {
              return { success: false, error: error instanceof Error ? error.message : '格式化失败' };
            }
          },
          executeAction: async (actionId: string) => {
            if (!editor) {
              return { success: false, error: '没有活动的编辑器' };
            }
            try {
              const action = editor.getAction(actionId);
              if (!action) {
                return { success: false, error: `操作不存在: ${actionId}` };
              }
              if (!action.isSupported()) {
                return { success: false, error: `操作不支持: ${actionId}` };
              }
              action.run();
              return { success: true };
            } catch (error) {
              return { success: false, error: error instanceof Error ? error.message : '执行失败' };
            }
          },
        },
        layout: {
          splitVertical: async (file?: string) => {
            // TODO: 实现视图分割
            return { success: false, error: '视图分割功能未实现' };
          },
          splitHorizontal: async (file?: string) => {
            // TODO: 实现视图分割
            return { success: false, error: '视图分割功能未实现' };
          },
        },
        search: {
          searchInProject: async (pattern: string) => {
            if (!rootPath) {
              return { success: false, error: '未打开项目' };
            }
            try {
              // 调用 Tauri 后端搜索
              const matches = await invoke<any[]>('search_in_files', {
                rootPath,
                query: pattern,
                caseSensitive: false
              });
              // 将查询存储到 sessionStorage，供 SearchPanel 读取
              sessionStorage.setItem('commandbar-search-query', pattern);
              return { success: true, count: matches.length };
            } catch (error) {
              return { success: false, error: error instanceof Error ? error.message : '搜索失败' };
            }
          },
          showSearchPanel: async () => {
            // 切换到搜索标签
            setSidebarActiveTab('search');
            // 关闭命令栏
            setCommandBarOpen(false);
            return { success: true };
          },
        },
        build: {
          executeBuild: async (target?: string) => {
            if (!rootPath) {
              return { success: false, error: '未打开项目' };
            }

            try {
              // 构建命令：npm run build 或 npm run <target>
              const buildArgs = target ? ['run', target] : ['run', 'build'];
              const command = Command.create('npm', buildArgs);

              // 在项目目录中执行
              command.stdout((line) => {
                console.log('[Build]', line);
              });
              command.stderr((line) => {
                console.error('[Build Error]', line);
              });

              const output = await command.execute();
              const exitCode = await output.code;

              if (exitCode === 0) {
                return { success: true };
              } else {
                return { success: false, error: `构建失败 (退出码: ${exitCode})` };
              }
            } catch (error) {
              return { success: false, error: error instanceof Error ? error.message : '构建失败' };
            }
          },
          showBuildOutput: async () => {
            // TODO: 显示构建输出面板
            // 可以打开一个 Terminal 或显示构建日志
            return { success: false, error: '构建输出面板未实现' };
          },
        },
        settings: {
          set: async (key: string, value: unknown) => {
            // TODO: 实现配置设置
            return { success: false, error: '配置功能未实现' };
          },
        },
      },
    };
  };

  // 全局键盘监听：按下 : 键唤起命令行
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isCommandBarOpen && e.key === ':') {
        const target = e.target as HTMLElement;
        const isInputField =
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.contentEditable === 'true';

        if (!isInputField) {
          e.preventDefault();
          setCommandBarOpen(true);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCommandBarOpen, setCommandBarOpen]);

  // 自动聚焦输入框，重置状态
  useEffect(() => {
    if (isCommandBarOpen) {
      setInput(':');
      setResult(null);
      setSuggestions([]);
      setSelectedIndex(-1);
      inputRef.current?.focus();
    } else {
      setInput('');
      setResult(null);
      setSuggestions([]);
      setSelectedIndex(-1);
    }
  }, [isCommandBarOpen]);

  // 获取建议
  useEffect(() => {
    if (!isCommandBarOpen || !input.startsWith(':')) {
      setSuggestions([]);
      setSelectedIndex(-1);
      return;
    }

    const query = input.slice(1).trim(); // 移除 : 前缀
    const debounceTimer = setTimeout(async () => {
      try {
        const core = await getCommandLineCore();
        const results = await core.getSuggestions(query);
        setSuggestions(results);
        setSelectedIndex(results.length > 0 ? 0 : -1);
      } catch {
        setSuggestions([]);
      }
    }, 150);

    return () => clearTimeout(debounceTimer);
  }, [input, isCommandBarOpen]);

  // 实时搜索预览 - 当输入 :grep xxx 时自动执行搜索
  useEffect(() => {
    if (!isCommandBarOpen || !input.startsWith(':')) {
      setSearchResults([]);
      return;
    }

    const command = input.slice(1).trim();
    const grepMatch = command.match(/^grep\s+(.+)$/);

    if (!grepMatch) {
      setSearchResults([]);
      return;
    }

    const pattern = grepMatch[1].trim();
    if (!pattern || pattern.length < 2) {
      setSearchResults([]);
      return;
    }

    // 防抖执行搜索
    const searchTimer = setTimeout(async () => {
      if (!rootPath) {
        setSearchResults([]);
        return;
      }

      setIsSearching(true);
      try {
        const matches = await invoke<any[]>('search_in_files', {
          rootPath,
          query: pattern,
          caseSensitive: false
        });
        // 限制显示前 10 个结果
        setSearchResults(matches.slice(0, 10));
      } catch (error) {
        console.error('[CommandBar] Search failed:', error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300); // 300ms 防抖

    return () => clearTimeout(searchTimer);
  }, [input, isCommandBarOpen, rootPath]);

  // 当搜索结果更新时，自动选中第一个结果
  useEffect(() => {
    if (searchResults.length > 0) {
      setSelectedSearchIndex(0);
    } else {
      setSelectedSearchIndex(-1);
    }
  }, [searchResults]);

  const handleClose = () => {
    setCommandBarOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      // 优先处理搜索结果导航
      if (searchResults.length > 0) {
        setSelectedSearchIndex(prev => (prev + 1) % searchResults.length);
      } else if (suggestions.length > 0) {
        setSelectedIndex(prev => (prev + 1) % suggestions.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      // 优先处理搜索结果导航
      if (searchResults.length > 0) {
        setSelectedSearchIndex(prev => (prev - 1 + searchResults.length) % searchResults.length);
      } else if (suggestions.length > 0) {
        setSelectedIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
      }
    } else if (e.key === 'Enter') {
      // 优先处理搜索结果的回车
      if (selectedSearchIndex >= 0 && searchResults[selectedSearchIndex]) {
        e.preventDefault();
        // 打开选中的搜索结果
        const match = searchResults[selectedSearchIndex];
        openSearchResult(match);
      } else if (selectedIndex >= 0 && suggestions[selectedIndex]) {
        e.preventDefault();
        // 选择命令建议
        const selected = suggestions[selectedIndex];
        setInput(`:${selected.text}`);
        setSuggestions([]);
        setSelectedIndex(-1);
        inputRef.current?.focus();
      }
    }
  };

  // 打开搜索结果的辅助函数
  const openSearchResult = async (match: any) => {
    try {
      const content = await readFileContent(match.path);
      const fileName = match.path.split('/').pop() || 'unknown';
      const { openFile } = useFileStore.getState();

      // 使用 v4 生成 ID
      const { v4: uuidv4 } = await import('uuid');
      const language = await import(
        '../../utils/languageDetection'
      ).then(m => m.detectLanguageFromPath(match.path));

      const openedId = openFile({
        id: uuidv4(),
        name: fileName,
        path: match.path,
        content,
        language,
        isDirty: false,
        initialLine: match.line_number, // 跳转到对应行
      });

      // 分配到活动的编辑器窗格
      const { activePaneId, assignFileToPane } = useLayoutStore.getState();
      if (activePaneId && assignFileToPane) {
        assignFileToPane(activePaneId, openedId);
      }

      handleClose();
    } catch (error) {
      console.error('[CommandBar] Failed to open file:', error);
    }
  };

  // 执行命令
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!input.trim() || isLoading) return;

    setIsLoading(true);
    setSuggestions([]);
    setSelectedIndex(-1);

    try {
      const core = await getCommandLineCore();
      const commandResult = await core.execute(input, buildCommandContext());

      setResult(commandResult);

      if (commandResult.outputType === 'toast') {
        console.log('[Toast]', commandResult.message);
        setTimeout(() => handleClose(), 2000);
      }
    } catch (error) {
      setResult({
        success: false,
        message: `执行错误: ${error instanceof Error ? error.message : String(error)}`,
        outputType: 'error',
        timestamp: Date.now(),
      });
    } finally {
      setIsLoading(false);
    }
  };

  const selectSuggestion = (suggestion: CommandSuggestion) => {
    setInput(`:${suggestion.text}`);
    setSuggestions([]);
    setSelectedIndex(-1);
    inputRef.current?.focus();
  };

  // 始终渲染组件以确保键盘监听器正常工作，但使用 CSS 隐藏
  // 这样可以确保键盘快捷键始终有效
  if (!isCommandBarOpen) {
    // 返回一个隐藏的 div 以保持组件挂载和键盘监听器激活
    return (
      <div
        className="command-bar-overlay command-bar-hidden"
        data-test-id="quick-command-bar"
        style={{ display: 'none' }}
        aria-hidden="true"
      />
    );
  }

  return (
    <div
      className="command-bar-overlay"
      onClick={handleClose}
      data-test-id="quick-command-bar"
    >
      <div
        className="command-bar-container"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit} className="command-bar-form">
          <div className="command-bar-input-wrapper">
            <span className="command-bar-prefix">:</span>
            <input
              ref={inputRef}
              type="text"
              className="command-bar-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入命令..."
              disabled={isLoading}
              data-test-id="quick-command-input"
            />
            <button
              type="button"
              className="command-bar-close"
              onClick={handleClose}
              disabled={isLoading}
              data-test-id="close-command-bar"
            >
              <X size={16} />
            </button>
          </div>
        </form>

        {/* 命令反馈区域 */}
        {result && (
          <div
            className={`command-bar-feedback ${
              result.success ? 'command-bar-success' : 'command-bar-error'
            }`}
            data-test-id="command-feedback"
          >
            {result.outputType === 'html' ? (
              <div dangerouslySetInnerHTML={{ __html: result.message }} />
            ) : (
              <div className="command-bar-message">{result.message}</div>
            )}
          </div>
        )}

        {isLoading && (
          <div className="command-bar-feedback">
            <div className="command-bar-loading">执行中...</div>
          </div>
        )}

        {/* 自动补全建议列表 */}
        {!isLoading && suggestions.length > 0 && (
          <div className="command-bar-suggestions">
            {suggestions.map((suggestion, index) => (
              <div
                key={`${suggestion.text}-${index}`}
                className={`command-bar-suggestion-item ${
                  index === selectedIndex ? 'selected' : ''
                }`}
                onClick={() => selectSuggestion(suggestion)}
                data-test-id={`command-suggestion-${index}`}
              >
                {suggestion.icon && (
                  <span className="command-bar-suggestion-icon">
                    {suggestion.icon}
                  </span>
                )}
                <div className="command-bar-suggestion-text">
                  <span className="command-bar-suggestion-name">{suggestion.text}</span>
                  {suggestion.description && (
                    <span className="command-bar-suggestion-description">
                      {suggestion.description}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 实时搜索结果预览 */}
        {!isLoading && searchResults.length > 0 && (
          <div className="command-bar-search-preview">
            <div className="search-preview-header">
              <span className="search-preview-title">搜索结果</span>
              <span className="search-preview-count">{searchResults.length}+ 个结果</span>
            </div>
            <div className="search-preview-results">
              {searchResults.map((match, index) => (
                <div
                  key={`${match.path}-${match.line_number}-${index}`}
                  className={`search-preview-item ${
                    index === selectedSearchIndex ? 'selected' : ''
                  }`}
                  onClick={() => {
                    // 点击时也打开文件
                    openSearchResult(match);
                  }}
                >
                  <div className="search-preview-file">{match.path}</div>
                  <div className="search-preview-line">
                    <span className="search-preview-line-number">{match.line_number}</span>
                    <span className="search-preview-content">{match.content}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 搜索中状态 */}
        {isSearching && (
          <div className="command-bar-feedback">
            <div className="command-bar-loading">搜索中...</div>
          </div>
        )}
      </div>
    </div>
  );
};
