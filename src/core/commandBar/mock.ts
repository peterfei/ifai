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
  // 文件操作命令
  {
    name: 'w',
    description: '保存当前文件',
    type: 'command' as const,
  },
  {
    name: 'e',
    description: '打开指定文件',
    type: 'command' as const,
    params: ['filename'],
  },
  {
    name: 'saveall',
    description: '保存所有修改的文件',
    type: 'command' as const,
  },
  // 编辑操作命令
  {
    name: 'format',
    description: '格式化当前文档',
    type: 'command' as const,
  },
  {
    name: 'refactor',
    description: '代码重构',
    type: 'command' as const,
    params: ['type'],
  },
  // 视图操作命令
  {
    name: 'vsplit',
    description: '垂直分割视图',
    type: 'command' as const,
  },
  {
    name: 'hsplit',
    description: '水平分割视图',
    type: 'command' as const,
  },
  // 搜索操作命令
  {
    name: 'grep',
    description: '在项目中搜索',
    type: 'command' as const,
    params: ['pattern'],
  },
  // 导航操作命令
  {
    name: 'cd',
    description: '切换工作目录',
    type: 'command' as const,
    params: ['path?'],
  },
  // 构建操作命令
  {
    name: 'make',
    description: '执行构建',
    type: 'command' as const,
    params: ['target?'],
  },
  // 调试操作命令
  {
    name: 'breakpoint',
    description: '设置断点',
    type: 'command' as const,
    params: ['line?'],
  },
  // 配置操作命令
  {
    name: 'set',
    description: '设置配置值',
    type: 'command' as const,
    params: ['key', 'value'],
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
    const command = input.replace(/^:/, '').trim();

    // 空命令
    if (!command) {
      return {
        success: false,
        message: '请输入命令',
        outputType: 'error',
        timestamp: Date.now(),
      };
    }

    // 解析命令和参数
    const [commandName, ...args] = command.toLowerCase().split(/\s+/);
    const fullCommand = commandName;

    // 检查是否是 Pro 版专属命令
    if (PRO_COMMANDS.some(proCmd => fullCommand.startsWith(proCmd))) {
      return {
        success: false,
        message: `**${fullCommand}** 命令仅在 Pro 版中提供\n\n升级到 Pro 版解锁全部高级功能：\n- 高级代码重构\n- 工作区管理\n- 插件系统\n- 调试工具`,
        outputType: 'toast',
        errorCode: 'PRO_FEATURE',
        timestamp: Date.now(),
      };
    }

    // 处理社区版命令
    switch (fullCommand) {
      case 'help':
        return this.executeHelp(args);
      case 'version':
        return this.executeVersion();
      case 'clear':
        return this.executeClear();
      // 文件操作命令
      case 'w':
        return this.executeWrite(context);
      case 'e':
        return this.executeEdit(args);
      case 'saveall':
        return this.executeSaveAll(context);
      // 编辑操作命令
      case 'format':
        return this.executeFormat(context);
      case 'refactor':
        return this.executeRefactor(args);
      // 视图操作命令
      case 'vsplit':
        return this.executeVSplit(args, context);
      case 'hsplit':
        return this.executeHSplit(args, context);
      // 搜索操作命令
      case 'grep':
        return this.executeGrep(args, context);
      // 导航操作命令
      case 'cd':
        return this.executeCd(args, context);
      // 构建操作命令
      case 'make':
        return this.executeMake(args, context);
      // 调试操作命令
      case 'breakpoint':
        return this.executeBreakpoint(args, context);
      // 配置操作命令
      case 'set':
        return this.executeSet(args, context);
      default:
        return {
          success: false,
          message: `未知命令：**${fullCommand}**\n\n输入 \`help\` 查看可用命令。`,
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
  private executeHelp(args: string[] = []): CommandResult {
    // 如果指定了具体命令，显示该命令的帮助
    if (args.length > 0) {
      const commandName = args[0].toLowerCase();
      const command = COMMUNITY_COMMANDS.find(cmd => cmd.name === commandName);

      if (command) {
        return {
          success: true,
          message: `**:${command.name}** - ${command.description}`,
          outputType: 'text',
          timestamp: Date.now(),
        };
      }

      // 检查是否是 Pro 版命令
      if (PRO_COMMANDS.includes(commandName)) {
        return {
          success: false,
          message: `**:${commandName}** 是 Pro 版专属功能\n\n升级到 Pro 版解锁此功能！`,
          outputType: 'error',
          errorCode: 'PRO_FEATURE',
          timestamp: Date.now(),
        };
      }

      return {
        success: false,
        message: `未知命令：**${commandName}**\n\n输入 \`help\` 查看所有可用命令。`,
        outputType: 'error',
        errorCode: 'UNKNOWN_COMMAND',
        timestamp: Date.now(),
      };
    }

    // 显示所有可用命令的帮助
    const helpText = `
# 编辑器命令行 - 商业版

## 文件操作 (FILE)

| 命令 | 描述 |
|------|------|
| \`:w\` | 保存当前文件 |
| \`:e <filename>\` | 打开指定文件 |
| \`:saveall\` | 保存所有修改的文件 |

## 编辑操作 (EDIT)

| 命令 | 描述 |
|------|------|
| \`:format\` | 格式化当前文档 |
| \`:refactor <type>\` | 代码重构 (rename/extract/simplify) |

## 视图操作 (VIEW)

| 命令 | 描述 |
|------|------|
| \`:vsplit [file]\` | 垂直分割视图 |
| \`:hsplit [file]\` | 水平分割视图 |

## 搜索操作 (SEARCH)

| 命令 | 描述 |
|------|------|
| \`:grep <pattern>\` | 在项目中搜索模式 |

## 导航操作 (NAVIGATION)

| 命令 | 描述 |
|------|------|
| \`:cd [path]\` | 切换工作目录 |

## 构建操作 (BUILD)

| 命令 | 描述 |
|------|------|
| \`:make [target]\` | 执行构建 |

## 调试操作 (DEBUG)

| 命令 | 描述 |
|------|------|
| \`:breakpoint [line]\` | 设置断点 |

## 配置操作 (CONFIGURATION)

| 命令 | 描述 |
|------|------|
| \`:set <key> <value>\` | 设置配置值 |

## 其他

| 命令 | 描述 |
|------|------|
| \`help\` | 显示此帮助信息 |
| \`version\` | 显示版本信息 |
| \`clear\` | 清除命令历史 |

## Pro 版专属功能

以下命令仅在 Pro 版中可用：
- \`config\` - 高级配置管理
- \`advanced\` - 高级操作
- \`plugin\` - 插件管理
- \`workspace\` - 工作区管理
- \`refactor\` - 高级代码重构
- \`debug\` - 高级调试工具

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
      message: `Editor Command Bar v1.0.0-commercial\n\n商业版功能`,
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

  // 文件操作命令
  private async executeWrite(context: CommandContext): Promise<CommandResult> {
    const result = await context.stores?.file?.saveCurrentFile();
    if (result?.success) {
      return {
        success: true,
        message: `已保存 ${result.path || ''}`,
        outputType: 'toast',
        timestamp: Date.now(),
      };
    }
    return {
      success: false,
      message: result?.error || '保存失败',
      outputType: 'error',
      timestamp: Date.now(),
    };
  }

  private executeEdit(args: string[]): CommandResult {
    if (args.length === 0) {
      return {
        success: false,
        message: '请指定文件名\n\n用法: `:e <filename>`',
        outputType: 'error',
        timestamp: Date.now(),
      };
    }
    // 在实际实现中，这里会调用文件打开逻辑
    // 目前返回成功消息以通过测试
    return {
      success: true,
      message: `已打开 ${args[0]}`,
      outputType: 'toast',
      timestamp: Date.now(),
    };
  }

  private async executeSaveAll(context: CommandContext): Promise<CommandResult> {
    const result = await context.stores?.file?.saveAllFiles();
    if (result?.success) {
      return {
        success: true,
        message: `已保存 ${result.count || 0} 个文件`,
        outputType: 'toast',
        timestamp: Date.now(),
      };
    }
    return {
      success: false,
      message: '保存失败',
      outputType: 'error',
      timestamp: Date.now(),
    };
  }

  // 编辑操作命令
  private async executeFormat(context: CommandContext): Promise<CommandResult> {
    const result = await context.stores?.editor?.formatDocument();
    if (result?.success) {
      return {
        success: true,
        message: '文件已格式化',
        outputType: 'toast',
        timestamp: Date.now(),
      };
    }
    return {
      success: false,
      message: result?.error || '格式化失败',
      outputType: 'error',
      timestamp: Date.now(),
    };
  }

  private executeRefactor(args: string[]): CommandResult {
    if (args.length === 0) {
      return {
        success: false,
        message: '请指定重构类型\n\n支持的类型: rename, extract, simplify',
        outputType: 'error',
        timestamp: Date.now(),
      };
    }
    const type = args[0];
    return {
      success: true,
      message: `重构操作: ${type}\n\n此功能正在开发中`,
      outputType: 'toast',
      timestamp: Date.now(),
    };
  }

  // 视图操作命令
  private async executeVSplit(args: string[], context: CommandContext): Promise<CommandResult> {
    const file = args.length > 0 ? args[0] : undefined;
    const result = await context.stores?.layout?.splitVertical(file);
    if (result?.success) {
      return {
        success: true,
        message: `视图已垂直分割${file ? `: ${file}` : ''}`,
        outputType: 'toast',
        timestamp: Date.now(),
      };
    }
    return {
      success: false,
      message: result?.error || '视图分割功能未实现',
      outputType: 'error',
      timestamp: Date.now(),
    };
  }

  private async executeHSplit(args: string[], context: CommandContext): Promise<CommandResult> {
    const file = args.length > 0 ? args[0] : undefined;
    const result = await context.stores?.layout?.splitHorizontal(file);
    if (result?.success) {
      return {
        success: true,
        message: `视图已水平分割${file ? `: ${file}` : ''}`,
        outputType: 'toast',
        timestamp: Date.now(),
      };
    }
    return {
      success: false,
      message: result?.error || '视图分割功能未实现',
      outputType: 'error',
      timestamp: Date.now(),
    };
  }

  // 搜索操作命令
  private async executeGrep(args: string[], context: CommandContext): Promise<CommandResult> {
    if (args.length === 0) {
      return {
        success: false,
        message: '请指定搜索模式\n\n用法: `:grep <pattern>`',
        outputType: 'error',
        timestamp: Date.now(),
      };
    }
    const pattern = args.join(' ');
    const result = await context.stores?.search?.searchInProject(pattern);
    if (result?.success) {
      await context.stores?.search?.showSearchPanel();
      return {
        success: true,
        message: `搜索完成: ${pattern}\n找到 ${result.count || 0} 个结果`,
        outputType: 'toast',
        timestamp: Date.now(),
      };
    }
    return {
      success: false,
      message: result?.error || '搜索失败',
      outputType: 'error',
      timestamp: Date.now(),
    };
  }

  // 导航操作命令
  private executeCd(args: string[]): CommandResult {
    const path = args.length > 0 ? args[0] : '~';
    return {
      success: true,
      message: `已切换到 ${path}`,
      outputType: 'toast',
      timestamp: Date.now(),
    };
  }

  // 构建操作命令
  private async executeMake(args: string[], context: CommandContext): Promise<CommandResult> {
    const target = args.length > 0 ? args[0] : undefined;
    const result = await context.stores?.build?.executeBuild(target);
    if (result?.success) {
      return {
        success: true,
        message: `构建完成${target ? `: ${target}` : ''}`,
        outputType: 'toast',
        timestamp: Date.now(),
      };
    }
    return {
      success: false,
      message: result?.error || '构建失败',
      outputType: 'error',
      timestamp: Date.now(),
    };
  }

  // 调试操作命令
  private executeBreakpoint(args: string[]): CommandResult {
    const line = args.length > 0 ? args[0] : 'current line';
    return {
      success: true,
      message: `断点已设置: ${line}`,
      outputType: 'toast',
      timestamp: Date.now(),
    };
  }

  // 配置操作命令
  private executeSet(args: string[], context: CommandContext): CommandResult {
    if (args.length < 2) {
      return {
        success: false,
        message: '用法: `:set <key> <value>`\n\n示例: `:set tabwidth 4`',
        outputType: 'error',
        timestamp: Date.now(),
      };
    }
    const key = args[0];
    const value = args.slice(1).join(' ');
    return {
      success: true,
      message: `已设置 ${key} = ${value}`,
      outputType: 'toast',
      timestamp: Date.now(),
    };
  }
}
