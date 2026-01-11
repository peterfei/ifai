/**
 * Mock for @tauri-apps/plugin-shell
 * Used in E2E test environment where actual Tauri API is not available
 */

import { invoke } from '@tauri-apps/api/core';

export interface CommandOptions {
  cwd?: string;
  env?: Record<string, string>;
}

export interface CommandOutput {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Mock Command class
 * Represents a shell command that can be executed
 */
export class Command {
  private program: string;
  private args: string[];
  private options?: CommandOptions;

  constructor(program: string, args?: string[], options?: CommandOptions) {
    this.program = program;
    this.args = args || [];
    this.options = options;
    console.log('[Mock Shell] Command created:', program, args);
  }

  /**
   * Execute the command
   */
  async execute(): Promise<CommandOutput> {
    console.log('[Mock Shell] Command.execute called:', this.program, this.args);

    try {
      // Try to use the E2E mock bash command handler
      const commandStr = [this.program, ...this.args].join(' ');
      const mockFS = (window as any).__E2E_INVOKE_HANDLER__;
      if (mockFS) {
        const result = await mockFS('execute_bash_command', { command: commandStr });
        if (result) {
          return {
            code: result.exitCode || 0,
            stdout: result.stdout || '',
            stderr: result.stderr || '',
          };
        }
      }

      // Fallback to invoke-based mock
      return await invoke<CommandOutput>('execute_shell_command', {
        program: this.program,
        args: this.args,
        options: this.options,
      });
    } catch (error) {
      console.error('[Mock Shell] Command error:', error);
      return {
        code: 0,
        stdout: '',
        stderr: '',
      };
    }
  }

  /**
   * Create a new sidecar command
   */
  static sidecar(program: string, args?: string[]): Command {
    console.log('[Mock Shell] Command.sidecar called:', program, args);
    return new Command(program, args);
  }
}

/**
 * Mock open function
 * Opens a URL or file with the system default application
 */
export async function open(path: string, openWith?: string): Promise<void> {
  console.log('[Mock Shell] open called:', path, openWith);
}

/**
 * Mock execute function
 * Execute a command directly
 */
export async function execute(program: string, args?: string[], options?: CommandOptions): Promise<CommandOutput> {
  const cmd = new Command(program, args, options);
  return cmd.execute();
}
