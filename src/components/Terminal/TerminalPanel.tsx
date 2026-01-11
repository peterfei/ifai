import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useFileStore } from '../../stores/fileStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { X, Bug } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useChatStore } from '../../stores/useChatStore';

interface TerminalPanelProps {
  onClose: () => void;
}

// 错误模式匹配（常见编译器/运行时错误）
const ERROR_PATTERNS = [
  /error\[?([E]\d+)\]?:/gi,           // Rust: error[E0433]
  /error:\s/gi,                         // General: error:
  /Error:\s/gi,                         // General: Error:
  /Exception:/gi,                       // General: Exception:
  /failed to resolve/gi,                // Rust: failed to resolve
  /undefined reference/gi,              // C/C++: undefined reference
  /cannot find/gi,                      // TypeScript/JS: cannot find
  /TypeError:/gi,                       // JavaScript: TypeError
  /SyntaxError:/gi,                     // JavaScript: SyntaxError
];

export const TerminalPanel = ({ onClose }: TerminalPanelProps) => {
  const { t } = useTranslation();
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const ptyIdRef = useRef<number | null>(null);
  const { rootPath } = useFileStore();
  const [terminalOutput, setTerminalOutput] = useState('');
  const [hasError, setHasError] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  // Store refs to avoid stale closures
  const hasErrorRef = useRef(false);
  const lastErrorRef = useRef<string | null>(null);

  // Update refs when state changes
  useEffect(() => {
    hasErrorRef.current = hasError;
    lastErrorRef.current = lastError;
  }, [hasError, lastError]);

  // Get settings and stores
  const currentProviderId = useSettingsStore(state => state.currentProviderId);
  const currentModel = useSettingsStore(state => state.currentModel);
  const sendMessage = useChatStore(state => state.sendMessage);
  const toggleChat = useLayoutStore(state => state.toggleChat);
  const isChatOpen = useLayoutStore(state => state.isChatOpen);

  /**
   * 检测终端输出中的错误
   */
  const detectError = (output: string): boolean => {
    return ERROR_PATTERNS.some(pattern => pattern.test(output));
  };

  /**
   * 提取错误代码（用于显示在按钮上）
   */
  const extractErrorCode = (output: string): string | null => {
    // Rust: error[E0425]
    const rustMatch = output.match(/error\[E(\d+)\]/i);
    if (rustMatch) return `E${rustMatch[1]}`;

    // TypeScript: error TS2304
    const tsMatch = output.match(/error\s+TS(\d+)/i);
    if (tsMatch) return `TS${tsMatch[1]}`;

    return null;
  };

  /**
   * 处理 Debug with AI 按钮点击
   */
  const handleDebugWithAI = () => {
    if (!lastError) return;

    // 如果聊天面板未打开，先打开它
    if (!isChatOpen) {
      toggleChat();
    }

    // 构建错误修复提示
    const debugPrompt = `请帮我修复以下错误：

\`\`\`
${lastError}
\`\`\`

请分析错误原因并提供修复建议。`;

    // 发送到 AI 聊天
    sendMessage(debugPrompt, currentProviderId, currentModel);
  };

  useEffect(() => {
    if (terminalRef.current) {
      const terminal = new Terminal({
        cursorBlink: true,
        fontFamily: 'MesloLGS NF, Menlo, Monaco, "Courier New", monospace',
        fontSize: 15,
        theme: {
          background: '#1e1e1e',
          foreground: '#cccccc',
          cursor: '#cccccc',
          selectionBackground: '#5f78ee',
          // ANSI colors from VSCode Dark+ theme
          black: '#000000',
          red: '#cd3131',
          green: '#0d810d',
          yellow: '#e5e510',
          blue: '#2472c8',
          magenta: '#bc3fbc',
          cyan: '#0598bc',
          white: '#e5e5e5',
          brightBlack: '#666666',
          brightRed: '#f14c4c',
          brightGreen: '#17a317',
          brightYellow: '#f5f543',
          brightBlue: '#3b8eed',
          brightMagenta: '#d670d6',
          brightCyan: '#07b6e9',
          brightWhite: '#ffffff',
        },
      });

      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.open(terminalRef.current);
      fitAddon.fit();

      xtermRef.current = terminal;
      fitAddonRef.current = fitAddon;

      // Create PTY session
      const createNewPty = async () => {
        try {
          const newPtyId = await invoke<number>('create_pty', {
            cols: terminal.cols,
            rows: terminal.rows,
            cwd: rootPath // Pass current project root as CWD
          });
          ptyIdRef.current = newPtyId;

          // Listen for PTY output
          const unlistenOutput = await listen<string>(`pty-output-${newPtyId}`, (event) => {
            terminal.write(event.payload);

            // 检测错误
            const output = event.payload;
            const currentOutput = terminalOutput + output;
            setTerminalOutput(currentOutput);

            if (detectError(currentOutput)) {
              setHasError(true);
              setLastError(output.trim());
            }
          });
          const unlistenExit = await listen<number>(`pty-exit-${newPtyId}`, (event) => {
            console.log(`PTY ${event.payload} exited`);
            terminal.write('\n\n[Process exited]\n');
            // Optionally close terminal or disable input
            unlistenOutput();
            unlistenExit();
            unlistenError();
          });
          const unlistenError = await listen<string>(`pty-error-${newPtyId}`, (event) => {
            console.error(`PTY error ${newPtyId}:`, event.payload);
            terminal.write(`\n\n[PTY Error: ${event.payload}]\n`);
            unlistenOutput();
            unlistenExit();
            unlistenError();
          });

          terminal.onData(async (data) => {
            if (ptyIdRef.current !== null) {
              await invoke('write_pty', { ptyId: ptyIdRef.current, data });
            }
          });

          terminal.onResize(async ({ cols, rows }) => {
            if (ptyIdRef.current !== null) {
              await invoke('resize_pty', { ptyId: ptyIdRef.current, cols, rows });
            }
          });

        } catch (e) {
          terminal.write(`\nFailed to create terminal: ${String(e)}\n`);
          console.error("Failed to create terminal:", e);
        }
      };

      createNewPty();

      return () => {
        // Cleanup
        if (ptyIdRef.current !== null) {
          invoke('kill_pty', { ptyId: ptyIdRef.current }).catch(console.error);
        }
        terminal.dispose();
      };
    }
  }, [rootPath]);

  // Resize observer to fit terminal when container size changes
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      fitAddonRef.current?.fit();
    });
    if (terminalRef.current) {
      observer.observe(terminalRef.current);
    }
    return () => observer.disconnect();
  }, []);

  // v0.2.9: Listen for terminal-output events (E2E testing support)
  useEffect(() => {
    const handleTerminalOutput = (event: Event) => {
      const customEvent = event as CustomEvent<{ data: string; type?: string; exitCode?: number }>;
      const { data, type } = customEvent.detail;

      console.log('[TerminalPanel] Received terminal-output event:', data.substring(0, 100));

      // Write to terminal if it exists
      if (xtermRef.current) {
        xtermRef.current.write(data);
      }

      // Update output state
      setTerminalOutput(prev => prev + data);

      // Check for errors
      if (detectError(data)) {
        console.log('[TerminalPanel] Error detected, setting hasError to true');
        setHasError(true);
        setLastError(data.trim());
      }
    };

    window.addEventListener('terminal-output', handleTerminalOutput as EventListener);

    return () => {
      window.removeEventListener('terminal-output', handleTerminalOutput as EventListener);
    };
  }, []);

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e]">
      <div className="flex items-center justify-between p-2 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-300">{t('terminal.title')}</span>
          {hasError && (
            <button
              onClick={handleDebugWithAI}
              className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white text-xs px-2 py-1 rounded transition-colors terminal-fix-hint"
              data-testid="debug-with-ai-button"
            >
              <Bug size={12} />
              <span>Debug with AI</span>
              {lastError && extractErrorCode(lastError) && (
                <span className="ml-1 opacity-75">({extractErrorCode(lastError)})</span>
              )}
            </button>
          )}
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-white">
          <X size={16} />
        </button>
      </div>
      <div ref={terminalRef} className="flex-1 w-full terminal-view" data-testid="terminal-view" />
    </div>
  );
};

