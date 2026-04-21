import React, { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Terminal, Minimize2, Maximize2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface BashStreamEvent {
  event_type: 'output' | 'error' | 'complete';
  content: string;
  is_stderr: boolean;
  line_count: number;
}

interface BashStreamResult {
  exit_code: number;
  total_lines: number;
  success: boolean;
  elapsed_ms: number;
  timed_out: boolean;
}

interface StreamingBashOutputProps {
  command: string;
  workingDir?: string;
  timeoutMs?: number;
  envVars?: Record<string, string>;
  onComplete?: (result: BashStreamResult) => void;
  onError?: (error: string) => void;
  eventId?: string;
  throttleLines?: number;
  className?: string;
}

/**
 * Bash 流式输出组件
 *
 * 实时显示 Bash 命令的输出，逐行更新
 *
 * 特性：
 * - 自动滚动到最新输出
 * - 区分 stdout 和 stderr
 * - 显示执行状态和统计
 * - 可折叠/展开
 */
export const StreamingBashOutput: React.FC<StreamingBashOutputProps> = ({
  command,
  workingDir,
  timeoutMs = 30000,
  envVars,
  onComplete,
  onError,
  eventId: propEventId,
  throttleLines = 10,
  className = '',
}) => {
  const { t } = useTranslation();
  const [outputLines, setOutputLines] = useState<Array<{ text: string; isStderr: boolean; lineNum: number }>>([]);
  const [isRunning, setIsRunning] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [lineCount, setLineCount] = useState(0);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const outputRef = useRef<HTMLDivElement>(null);
  const eventIdRef = useRef<string>(propEventId || `bash_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  const unlistenRef = useRef<(() => void) | null>(null);

  // 自动滚动到底部
  useEffect(() => {
    if (outputRef.current && !isCollapsed) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [outputLines, isCollapsed]);

  // 设置流式监听和执行命令
  useEffect(() => {
    const eventId = eventIdRef.current;

    // 监听流式输出事件
    const setupListener = async () => {
      const unlisten = await listen<BashStreamEvent[] | BashStreamEvent>(
        `bash://stream/${eventId}`,
        (event) => {
          const payload = event.payload;

          // 处理批量事件
          if (Array.isArray(payload)) {
            const newLines = payload.map(p => ({
              text: p.content,
              isStderr: p.is_stderr,
              lineNum: p.line_count,
            }));
            setOutputLines(prev => [...prev, ...newLines]);
            if (newLines.length > 0) {
              setLineCount(newLines[newLines.length - 1].lineNum);
            }
          } else {
            // 处理单个事件
            if (payload.event_type === 'complete') {
              setIsRunning(false);
            } else if (payload.event_type === 'error') {
              setIsRunning(false);
              setOutputLines(prev => [...prev, {
                text: t('aiChat.streamingBash.streamError', { error: payload.content }),
                isStderr: true,
                lineNum: payload.line_count,
              }]);
            } else {
              setOutputLines(prev => [...prev, {
                text: payload.content,
                isStderr: payload.is_stderr,
                lineNum: payload.line_count,
              }]);
              setLineCount(payload.line_count);
            }
          }
        }
      );

      unlistenRef.current = unlisten;
    };

    setupListener();

    // 执行命令
    const executeCommand = async () => {
      try {
        const result = await invoke<BashStreamResult>('bash_execute_streaming', {
          command,
          workingDir: workingDir || null,
          timeoutMs,
          envVars: envVars || null,
          eventId: eventIdRef.current,
          throttleLines,
        });

        setIsRunning(false);
        setExitCode(result.exit_code);
        setElapsedMs(result.elapsed_ms);
        onComplete?.(result);
      } catch (error) {
        setIsRunning(false);
        const errorMsg = error instanceof Error ? error.message : String(error);
        onError?.(errorMsg);
        setOutputLines(prev => [...prev, {
          text: t('aiChat.streamingBash.commandFailed', { error: errorMsg }),
          isStderr: true,
          lineNum: lineCount + 1,
        }]);
      }
    };

    executeCommand();

    // 清理
    return () => {
      if (unlistenRef.current) {
        unlistenRef.current();
      }
    };
  }, [command, workingDir, timeoutMs, envVars, throttleLines, propEventId, onComplete, onError, t]);

  // 获取状态指示器
  const getStatusIndicator = () => {
    if (isRunning) {
      return (
        <div className="theme-surface-warning flex items-center gap-2 rounded-full px-2 py-1">
          <div className="h-2 w-2 rounded-full bg-[var(--warning-color)] animate-pulse" />
          <span className="theme-text-warning text-xs">
            {t('aiChat.streamingBash.running', { lineCount })}
          </span>
        </div>
      );
    }

    if (exitCode === 0) {
      return (
        <div className="theme-surface-success flex items-center gap-2 rounded-full px-2 py-1">
          <div className="h-2 w-2 rounded-full bg-[var(--success-color)]" />
          <span className="theme-text-success text-xs">
            {t('aiChat.streamingBash.completed', { lineCount, elapsedMs })}
          </span>
        </div>
      );
    }

    if (exitCode !== null) {
      return (
        <div className="theme-surface-danger flex items-center gap-2 rounded-full px-2 py-1">
          <div className="h-2 w-2 rounded-full bg-[var(--danger-color)]" />
          <span className="theme-text-danger text-xs">
            {t('aiChat.streamingBash.failed', { exitCode, lineCount })}
          </span>
        </div>
      );
    }

    return null;
  };

  return (
    <div className={`theme-panel theme-border rounded-lg border overflow-hidden ${className}`}>
      {/* 头部：命令和状态 */}
      <div className="theme-panel-muted theme-border flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Terminal size={14} className="theme-text-subtle shrink-0" />
          <code className="theme-text truncate font-mono text-xs">
            {command}
          </code>
        </div>

        <div className="flex items-center gap-3">
          {getStatusIndicator()}

          {/* 折叠按钮 */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="theme-button-ghost theme-focus-ring-accent rounded p-1"
            title={isCollapsed ? t('aiChat.streamingBash.expand') : t('aiChat.streamingBash.collapse')}
            aria-label={isCollapsed ? t('aiChat.streamingBash.expand') : t('aiChat.streamingBash.collapse')}
          >
            {isCollapsed ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
          </button>
        </div>
      </div>

      {/* 输出内容 */}
      {!isCollapsed && (
        <div
          ref={outputRef}
          role="log"
          aria-live="polite"
          aria-label={t('aiChat.streamingBash.commandOutput')}
          className="theme-code-surface max-h-[400px] overflow-y-auto p-3 font-mono text-xs leading-relaxed"
        >
          {outputLines.length === 0 && isRunning && (
            <div className="theme-text-subtle italic">{t('aiChat.streamingBash.waitingOutput')}</div>
          )}

          {outputLines.map((line, index) => (
            <div
              key={`${line.lineNum}-${index}`}
              className={`theme-hoverable -mx-1 rounded px-1 py-0.5 ${line.isStderr ? 'theme-text-danger' : 'theme-text'}`}
            >
              <span className="theme-text-subtle mr-2 inline-block w-6 select-none text-right">
                {line.lineNum}
              </span>
              <span className="whitespace-pre-wrap break-words">{line.text}</span>
            </div>
          ))}

          {/* 执行中光标 */}
          {isRunning && outputLines.length > 0 && (
            <div className="theme-text-subtle mt-2 flex items-center gap-2">
              <div className="theme-divider h-4 w-2 animate-pulse" />
              <span className="text-xs italic">{t('aiChat.streamingBash.waitingOutput')}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StreamingBashOutput;
