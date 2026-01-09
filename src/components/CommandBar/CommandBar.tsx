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
import { writeFileContent } from '../../utils/fileSystem';
import './CommandBar.css';

export const CommandBar = () => {
  const { isCommandBarOpen, setCommandBarOpen } = useLayoutStore();
  const { activeFileId, openedFiles, setFileDirty } = useFileStore();
  const { getActiveEditor } = useEditorStore();
  const [input, setInput] = useState('');
  const [result, setResult] = useState<CommandResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<CommandSuggestion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
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
          splitVertical: async () => {
            // TODO: 实现视图分割
            return { success: false, error: '视图分割功能未实现' };
          },
          splitHorizontal: async () => {
            // TODO: 实现视图分割
            return { success: false, error: '视图分割功能未实现' };
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

  const handleClose = () => {
    setCommandBarOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleClose();
    } else if (e.key === 'ArrowDown' && suggestions.length > 0) {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp' && suggestions.length > 0) {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter' && selectedIndex >= 0 && suggestions[selectedIndex]) {
      e.preventDefault();
      // 选择建议
      const selected = suggestions[selectedIndex];
      setInput(`:${selected.text}`);
      setSuggestions([]);
      setSelectedIndex(-1);
      inputRef.current?.focus();
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

  if (!isCommandBarOpen) {
    return null;
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
      </div>
    </div>
  );
};
