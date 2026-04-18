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
import clsx from 'clsx';
import { isDarkTheme } from '../../utils/theme';

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
  const theme = useSettingsStore(state => state.theme);
  const dark = isDarkTheme(theme);
  // 🔥 FIX: 安全的 null 检查，防止 chatStore 未初始化时出错
  const sendMessage = useChatStore(state => state?.sendMessage ?? (() => Promise.resolve()));
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
    const debugPrompt = t('terminal.debugPrompt', { error: lastError });

    // 发送到 AI 聊天
    sendMessage(debugPrompt, currentProviderId, currentModel);
  };

  useEffect(() => {
    if (terminalRef.current) {
      const rootStyles = getComputedStyle(document.documentElement);
      const token = (name: string, fallback: string) =>
        rootStyles.getPropertyValue(name).trim() || fallback;

      const terminal = new Terminal({
        cursorBlink: true,
        fontFamily: token('--font-mono', 'Menlo, Monaco, monospace'),
        fontSize: 13,
        theme: {
          background: token('--bg-strong', dark ? '#12161c' : '#f5f7fa'),
          foreground: token('--text-secondary', dark ? '#c4ccd6' : '#405065'),
          cursor: token('--text-primary', dark ? '#eef2f6' : '#192434'),
          selectionBackground: token('--accent-soft-bg', dark ? 'rgba(75, 137, 255, 0.15)' : 'rgba(47, 111, 235, 0.1)'),
          selectionInactiveBackground: token('--hover-soft', 'rgba(255,255,255,0.06)'),
          black: token('--bg-primary', dark ? '#17191c' : '#f5f7fa'),
          red: token('--danger-color', dark ? '#d16969' : '#c24b4b'),
          green: token('--success-color', dark ? '#5ea16e' : '#3f8a56'),
          yellow: token('--warning-color', dark ? '#c6933f' : '#a56f1c'),
          blue: token('--accent-color', dark ? '#4b89ff' : '#2f6feb'),
          magenta: token('--info-color', dark ? '#6c9cff' : '#2f6feb'),
          cyan: token('--info-color', dark ? '#6c9cff' : '#2f6feb'),
          white: token('--text-secondary', dark ? '#c4ccd6' : '#405065'),
          brightBlack: token('--text-subtle', dark ? '#748091' : '#748091'),
          brightRed: token('--danger-color', dark ? '#d16969' : '#c24b4b'),
          brightGreen: token('--success-color', dark ? '#5ea16e' : '#3f8a56'),
          brightYellow: token('--warning-color', dark ? '#c6933f' : '#a56f1c'),
          brightBlue: token('--accent-color', dark ? '#4b89ff' : '#2f6feb'),
          brightMagenta: token('--info-color', dark ? '#6c9cff' : '#2f6feb'),
          brightCyan: token('--info-color', dark ? '#6c9cff' : '#2f6feb'),
          brightWhite: token('--text-primary', dark ? '#eef2f6' : '#192434'),
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
            terminal.write(`\n\n[${t('terminal.processExited')}]\n`);
            // Optionally close terminal or disable input
            unlistenOutput();
            unlistenExit();
            unlistenError();
          });
          const unlistenError = await listen<string>(`pty-error-${newPtyId}`, (event) => {
            console.error(`PTY error ${newPtyId}:`, event.payload);
            terminal.write(`\n\n[${t('terminal.ptyError', { error: event.payload })}]\n`);
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
          terminal.write(`\n${t('terminal.createFailed', { error: String(e) })}\n`);
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
  }, [rootPath, dark, t]);

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
    <div className="theme-panel flex h-full flex-col transition-colors">
      <div className="theme-border flex items-center justify-between border-b p-2">
        <div className="flex items-center gap-2">
          <span className="theme-text-muted text-sm">{t('terminal.title')}</span>
          {hasError && (
            <button
              onClick={handleDebugWithAI}
              className="theme-button-primary terminal-fix-hint flex items-center gap-1 rounded px-2 py-1 text-xs"
              data-testid="debug-with-ai-button"
            >
              <Bug size={12} />
              <span>{t('terminal.debugWithAI')}</span>
              {lastError && extractErrorCode(lastError) && (
                <span className="ml-1 opacity-75">({extractErrorCode(lastError)})</span>
              )}
            </button>
          )}
        </div>
        <button onClick={onClose} className="theme-button-ghost rounded p-1" title={t('common.close')}>
          <X size={16} />
        </button>
      </div>
      <div ref={terminalRef} className="flex-1 w-full terminal-view" data-testid="terminal-view" />
    </div>
  );
};
