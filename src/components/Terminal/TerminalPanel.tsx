import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useFileStore } from '../../stores/fileStore';
import { X } from 'lucide-react';

interface TerminalPanelProps {
  onClose: () => void;
}

export const TerminalPanel = ({ onClose }: TerminalPanelProps) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const ptyIdRef = useRef<number | null>(null);
  const { rootPath } = useFileStore();
  const [terminalOutput, setTerminalOutput] = useState('');

  useEffect(() => {
    if (terminalRef.current) {
      const terminal = new Terminal({
        cursorBlink: true,
        fontFamily: 'Fira Code, monospace',
        fontSize: 14,
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

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e]">
      <div className="flex items-center justify-between p-2 border-b border-gray-700">
        <span className="text-sm text-gray-300">Terminal</span>
        <button onClick={onClose} className="text-gray-400 hover:text-white">
          <X size={16} />
        </button>
      </div>
      <div ref={terminalRef} className="flex-1 w-full" />
    </div>
  );
};
