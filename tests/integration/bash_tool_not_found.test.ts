import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useChatStore } from '../../src/stores/useChatStore';
import { useFileStore } from '../../src/stores/fileStore';
import { invoke } from '@tauri-apps/api/core';

// 模拟物理环境
if (typeof window === 'undefined') {
  (global as any).window = {
    __IFAI_EDITOR_MODE__: 'spec',
    __IFAI_ACTIVE_SKILLS__: []
  };
}

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd, args) => {
    console.log('[Mock Invoke] Command:', cmd, 'Args:', JSON.stringify(args));

    // 正确的后端命令名
    if (cmd === 'execute_bash_command') {
        // 验证参数名是否对齐后端 Rust 定义 (working_dir, command)
        if (args.command && args.working_dir !== undefined) {
            return { success: true, stdout: 'OK', exit_code: 0 };
        }
        // Also accept workingDir
        if (args.command && args.workingDir !== undefined) {
            return { success: true, stdout: 'OK', exit_code: 0 };
        }
    }

    // 如果收到了错误的命令名，抛出错误（模拟截图中的现象）
    if (cmd === 'bash' || cmd === 'agent_bash') {
        throw new Error(`Command ${cmd} not found`);
    }
    return {};
  }),
}));

describe.skip('Bash Tool Routing & Cleaning Regression (v0.5.0)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useFileStore.setState({ rootPath: '/test-project' });
  });

  it('SHOULD route to execute_bash_command and clean command prefix', async () => {
    const chatStore = useChatStore.getState() as any;
    const messageId = 'msg-bash-test';
    
    // 模拟 AI 带入中文引导词的错误调用
    const toolCall = {
        id: 'call-bash-1',
        tool: 'bash',
        function: { name: 'bash', arguments: JSON.stringify({ command: '运行 npm run dev' }) },
        status: 'pending'
    };

    useChatStore.setState({
      messages: [{
        id: messageId,
        role: 'assistant',
        content: 'Running dev...',
        toolCalls: [toolCall]
      }]
    });

    await chatStore.approveToolCall(messageId, 'call-bash-1');

    const lastCall = (invoke as any).mock.calls.find((c: any) => c[0] === 'execute_bash_command');
    expect(lastCall).toBeDefined();
    
    const args = lastCall[1];
    // 预期 1: 字段名映射正确 (workingDir 而非 cwd)
    expect(args.workingDir).toBe('/test-project');
    
    // 预期 2: 命令已被清洗，去掉了 "运行 " 前缀
    expect(args.command).toBe('npm run dev');
  });
});