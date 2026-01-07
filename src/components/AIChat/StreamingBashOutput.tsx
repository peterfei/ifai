import React, { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Terminal, X, Minimize2, Maximize2 } from 'lucide-react';

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
                text: `❌ ${payload.content}`,
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
          text: `❌ 执行失败: ${errorMsg}`,
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
  }, [command, workingDir, timeoutMs, envVars, throttleLines, propEventId, onComplete, onError]);

  // 获取状态指示器
  const getStatusIndicator = () => {
    if (isRunning) {
      return (
        <div className="flex items-center gap-2 text-yellow-400">
          <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
          <span className="text-xs">执行中... ({lineCount} 行)</span>
        </div>
      );
    }

    if (exitCode === 0) {
      return (
        <div className="flex items-center gap-2 text-green-400">
          <div className="w-2 h-2 bg-green-400 rounded-full" />
          <span className="text-xs">已完成 ({lineCount} 行, {elapsedMs}ms)</span>
        </div>
      );
    }

    if (exitCode !== null) {
      return (
        <div className="flex items-center gap-2 text-red-400">
          <div className="w-2 h-2 bg-red-400 rounded-full" />
          <span className="text-xs">失败 (退出码: {exitCode}, {lineCount} 行)</span>
        </div>
      );
    }

    return null;
  };

  return (
    <div className={`border border-gray-700 rounded-lg overflow-hidden bg-[#1e1e1e] ${className}`}>
      {/* 头部：命令和状态 */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#252526] border-b border-gray-700">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Terminal size={14} className="text-gray-400 shrink-0" />
          <code className="text-xs text-gray-300 truncate font-mono">
            {command}
          </code>
        </div>

        <div className="flex items-center gap-3">
          {getStatusIndicator()}

          {/* 折叠按钮 */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-gray-200 transition-colors"
            title={isCollapsed ? '展开' : '折叠'}
          >
            {isCollapsed ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
          </button>
        </div>
      </div>

      {/* 输出内容 */}
      {!isCollapsed && (
        <div
          ref={outputRef}
          className="p-3 max-h-[400px] overflow-y-auto font-mono text-xs leading-relaxed"
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: '#4b5563 #1e1e1e',
          }}
        >
          {outputLines.length === 0 && isRunning && (
            <div className="text-gray-500 italic">等待输出...</div>
          )}

          {outputLines.map((line, index) => (
            <div
              key={`${line.lineNum}-${index}`}
              className={`py-0.5 px-1 -mx-1 hover:bg-[#2a2a2a] rounded ${
                line.isStderr ? 'text-red-400' : 'text-gray-300'
              }`}
            >
              <span className="inline-block w-6 text-gray-600 select-none mr-2 text-right">
                {line.lineNum}
              </span>
              <span className="whitespace-pre-wrap break-words">{line.text}</span>
            </div>
          ))}

          {/* 执行中光标 */}
          {isRunning && outputLines.length > 0 && (
            <div className="flex items-center gap-2 mt-2 text-gray-500">
              <div className="w-2 h-4 bg-gray-500 animate-pulse" />
              <span className="text-xs italic">等待输出...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StreamingBashOutput;
