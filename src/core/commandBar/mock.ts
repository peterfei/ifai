/**
 * 编辑器命令行 Mock 实现
 *
 * 此文件为社区版提供回退实现，当私有库不可用时使用。
 * 提供基础的命令支持，并提示高级功能需要 Pro 版。
 */

import type {
  ICommandLineCore,
  CommandResult,
  CommandSuggestion,
  CommandContext,
  ICommandDiagnostics,
} from './types';

/**
 * 社区版支持的命令列表
 */
const COMMUNITY_COMMANDS = [
  {
    name: 'help',
    description: '显示可用命令帮助',
    type: 'command' as const,
  },
  {
    name: 'version',
    description: '显示版本信息',
    type: 'command' as const,
  },
  {
    name: 'clear',
    description: '清除命令历史',
    type: 'command' as const,
  },
];

/**
 * Pro 版专属命令（用于提示）
 */
const PRO_COMMANDS = [
  'config',
  'advanced',
  'plugin',
  'workspace',
  'refactor',
  'debug',
];

/**
 * Mock 命令行核心实现
 */
export class MockCommandLineCore implements ICommandLineCore {
  private initialized = false;
  private loadStartTime = 0;
  private readonly version = '1.0.0-community';

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    this.loadStartTime = performance.now();
    // 模拟初始化延迟
    await new Promise(resolve => setTimeout(resolve, 10));
    this.initialized = true;
  }

  async execute(input: string, context: CommandContext): Promise<CommandResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    // 移除命令前缀（如果存在）
    const command = input.replace(/^:/, '').trim().toLowerCase();

    // 空命令
    if (!command) {
      return {
        success: false,
        message: '请输入命令',
        outputType: 'error',
        timestamp: Date.now(),
      };
    }

    // 检查是否是 Pro 版专属命令
    if (PRO_COMMANDS.some(proCmd => command.startsWith(proCmd))) {
      return {
        success: false,
        message: `**${command}** 命令仅在 Pro 版中提供\n\n升级到 Pro 版解锁全部高级功能：\n- 高级代码重构\n- 工作区管理\n- 插件系统\n- 调试工具`,
        outputType: 'toast',
        errorCode: 'PRO_FEATURE',
        timestamp: Date.now(),
      };
    }

    // 处理社区版命令
    switch (command) {
      case 'help':
        return this.executeHelp();
      case 'version':
        return this.executeVersion();
      case 'clear':
        return this.executeClear();
      default:
        return {
          success: false,
          message: `未知命令：**${command}**\n\n输入 \`help\` 查看可用命令。`,
          outputType: 'error',
          errorCode: 'UNKNOWN_COMMAND',
          timestamp: Date.now(),
        };
    }
  }

  async getSuggestions(query: string): Promise<CommandSuggestion[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    const q = query.toLowerCase();

    // 如果查询为空，返回所有社区版命令
    if (!q) {
      return COMMUNITY_COMMANDS.map(cmd => ({
        text: cmd.name,
        description: cmd.description,
        type: cmd.type,
      }));
    }

    // 过滤匹配的命令
    const suggestions = COMMUNITY_COMMANDS
      .filter(cmd => cmd.name.startsWith(q))
      .map(cmd => ({
        text: cmd.name,
        description: cmd.description,
        type: cmd.type,
      }));

    // 如果社区版命令没有匹配，但 Pro 版有匹配，显示提示
    if (suggestions.length === 0) {
      const proMatch = PRO_COMMANDS.find(proCmd => proCmd.startsWith(q));
      if (proMatch) {
        return [
          {
            text: proMatch,
            description: 'Pro 版专属功能',
            type: 'command',
          },
        ];
      }
    }

    return suggestions;
  }

  getDiagnostics(): ICommandDiagnostics {
    return {
      type: 'mock',
      version: this.version,
      loadTime: this.initialized ? performance.now() - this.loadStartTime : 0,
      initialized: this.initialized,
    };
  }

  dispose(): void {
    this.initialized = false;
  }

  // 私有方法：执行 help 命令
  private executeHelp(): CommandResult {
    const helpText = `
# 编辑器命令行 - 社区版

## 可用命令

| 命令 | 描述 |
|------|------|
| \`help\` | 显示此帮助信息 |
| \`version\` | 显示版本信息 |
| \`clear\` | 清除命令历史 |

## Pro 版专属功能

以下命令仅在 Pro 版中可用：
- \`config\` - 配置管理
- \`advanced\` - 高级操作
- \`plugin\` - 插件管理
- \`workspace\` - 工作区管理
- \`refactor\` - 代码重构
- \`debug\` - 调试工具

升级解锁全部功能！
    `.trim();

    return {
      success: true,
      message: helpText,
      outputType: 'html',
      timestamp: Date.now(),
    };
  }

  // 私有方法：执行 version 命令
  private executeVersion(): CommandResult {
    return {
      success: true,
      message: `Editor Command Bar v${this.version}\n\n社区版功能`,
      outputType: 'text',
      data: { version: this.version },
      timestamp: Date.now(),
    };
  }

  // 私有方法：执行 clear 命令
  private executeClear(): CommandResult {
    return {
      success: true,
      message: '命令历史已清除',
      outputType: 'toast',
      timestamp: Date.now(),
    };
  }
}
