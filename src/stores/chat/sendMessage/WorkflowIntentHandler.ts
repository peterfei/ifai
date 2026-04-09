/**
 * WorkflowIntentHandler - 工作流意图识别处理器
 *
 * 识别用户输入中的工作流相关意图，支持自然语言和斜杠命令
 *
 * @version v1.0.0
 */

import { BasePayload, chatEventBus } from '../eventBus/ChatEventBus';

export interface WorkflowIntent {
  workflowType: 'code_review' | 'exploration' | 'quality_check' | 'custom';
  targetPath?: string;
  confidence: number;
  matched: boolean;
}

export interface WorkflowIntentResult {
  isWorkflow: boolean;
  workflowType?: string;
  targetPath?: string;
  confidence: number;
  response?: string;
}

/**
 * 工作流关键词映射
 */
const WORKFLOW_KEYWORDS = {
  code_review: {
    patterns: [
      '代码审查',
      'code review',
      '审查代码',
      '代码检查',
      'review code',
      '运行审查',
      '执行审查',
    ],
    workflowType: 'code_review' as const,
    name: '代码审查',
    description: '自动探索、审查、测试和生成文档',
  },
  exploration: {
    patterns: [
      '代码探索',
      '探索代码',
      '探索项目',
      '分析代码',
      '代码分析',
      'explore code',
      'exploration',
      '了解代码',
      '查看项目',
    ],
    workflowType: 'exploration' as const,
    name: '代码探索',
    description: '快速探索和分析项目结构',
  },
  quality_check: {
    patterns: [
      '质量检查',
      '代码质量',
      '质量分析',
      '检查质量',
      'quality check',
      '检测问题',
      '代码体检',
      '健康检查',
    ],
    workflowType: 'quality_check' as const,
    name: '质量检查',
    description: '全面的代码质量检查和分析',
  },
};

/**
 * 斜杠命令映射
 */
const WORKFLOW_SLASH_COMMANDS = {
  '/workflow': 'workflow',
  '/wf': 'workflow',
  '/code-review': 'code_review',
  '/review': 'code_review',
  '/explore': 'exploration',
  '/exploration': 'exploration',
  '/quality-check': 'quality_check',
  '/quality': 'quality_check',
};

/**
 * 默认目标路径提取模式
 * 注意：不使用 g 标志，因为我们需要捕获组
 */
const TARGET_PATH_PATTERNS = [
  /(?:路径|path|目标|target|目录|dir)[:\s]+([^\s,。，]+)/i,
  /(?:在|对|for|at)\s+([^\s,。，]+)\s*(?:运行|执行|run)/i,
  // 新增：匹配 "对 [path] 运行" 模式，允许路径中包含点号、斜杠等
  /(?:在|对|for|at)\s+([./\w-]+)\s*(?:运行|执行|run)/i,
  // 新增：更宽松的路径匹配
  /(?:运行|执行|run|execute).+?[:\s]+([./\w-]+)/i,
];

export class WorkflowIntentHandler {
  /**
   * 识别工作流意图（自然语言）
   */
  recognizeWorkflowIntent(text: string): WorkflowIntentResult {
    const normalizedText = text.toLowerCase().trim();
    console.log('[WorkflowIntentHandler] 🔍 Checking text:', text, '-> normalized:', normalizedText);

    // 1. 检查斜杠命令
    const slashResult = this.checkSlashCommands(normalizedText);
    if (slashResult.isWorkflow) {
      return slashResult;
    }

    // 2. 检查自然语言关键词
    const keywordResult = this.checkKeywords(normalizedText);
    if (keywordResult.isWorkflow) {
      return keywordResult;
    }

    // 3. 未识别到工作流意图
    return {
      isWorkflow: false,
      confidence: 0,
    };
  }

  /**
   * 检查斜杠命令
   */
  private checkSlashCommands(text: string): WorkflowIntentResult {
    const parts = text.split(' ');
    const command = parts[0].toLowerCase();

    if (!(command in WORKFLOW_SLASH_COMMANDS)) {
      return { isWorkflow: false, confidence: 0 };
    }

    const commandType = WORKFLOW_SLASH_COMMANDS[command as keyof typeof WORKFLOW_SLASH_COMMANDS];

    // 如果是通用工作流命令，需要从参数中获取具体类型
    if (commandType === 'workflow') {
      if (parts.length < 2) {
        return {
          isWorkflow: true,
          workflowType: 'code_review', // 默认
          confidence: 0.5,
          response: this.getWorkflowListResponse(),
        };
      }

      const subCommand = parts[1].toLowerCase();
      const typeMap: Record<string, string> = {
        'review': 'code_review',
        'code-review': 'code_review',
        'explore': 'exploration',
        'exploration': 'exploration',
        'quality': 'quality_check',
        'quality-check': 'quality_check',
      };

      const workflowType = typeMap[subCommand];
      if (workflowType) {
        const targetPath = this.extractTargetPath(parts.slice(2).join(' '));

        return {
          isWorkflow: true,
          workflowType,
          targetPath,
          confidence: 1.0,
          response: this.getExecutionResponse(workflowType, targetPath),
        };
      }

      return {
        isWorkflow: true,
        confidence: 0.3,
        response: this.getWorkflowListResponse(),
      };
    }

    // 直接工作流命令（如 /review, /explore 等）
    // 需要从 WORKFLOW_SLASH_COMMANDS 中获取工作流类型
    let workflowType: string;
    if (commandType === 'workflow') {
      // 这种情况在上面已经处理了
      workflowType = 'code_review'; // 默认
    } else {
      // commandType 就是工作流类型（如 'code_review', 'exploration' 等）
      workflowType = commandType;
    }
    const targetPath = this.extractTargetPath(parts.slice(1).join(' '));

    return {
      isWorkflow: true,
      workflowType,
      targetPath,
      confidence: 1.0,
      response: this.getExecutionResponse(workflowType, targetPath),
    };
  }

  /**
   * 检查关键词
   */
  private checkKeywords(text: string): WorkflowIntentResult {
    let bestMatch: { type: string; confidence: number } | null = null;

    // 遍历所有工作流类型
    for (const [workflowType, config] of Object.entries(WORKFLOW_KEYWORDS)) {
      for (const pattern of config.patterns) {
        if (text.includes(pattern.toLowerCase())) {
          // 计算匹配置信度
          const confidence = this.calculateConfidence(text, pattern);

          if (!bestMatch || confidence > bestMatch.confidence) {
            bestMatch = {
              type: workflowType,
              confidence,
            };
          }
        }
      }
    }

    if (bestMatch && bestMatch.confidence >= 0.6) {
      const targetPath = this.extractTargetPath(text);

      return {
        isWorkflow: true,
        workflowType: bestMatch.type,
        targetPath,
        confidence: bestMatch.confidence,
        response: this.getExecutionResponse(bestMatch.type, targetPath),
      };
    }

    return { isWorkflow: false, confidence: 0 };
  }

  /**
   * 计算匹配置信度
   */
  private calculateConfidence(text: string, pattern: string): number {
    let confidence = 0.7; // 基础置信度

    // 精确匹配提升置信度
    if (text === pattern) {
      confidence = 1.0;
    }
    // 包含"运行"、"执行"等动词提升置信度
    else if (text.includes('运行') || text.includes('执行') || text.includes('run') || text.includes('execute')) {
      confidence = 0.9;
    }
    // 包含"工作流"关键词提升置信度
    else if (text.includes('工作流') || text.includes('workflow')) {
      confidence = 0.85;
    }

    return confidence;
  }

  /**
   * 提取目标路径
   */
  private extractTargetPath(text: string): string | undefined {
    console.log('[WorkflowIntentHandler] 🔍 Extracting path from:', text);

    // 尝试所有路径提取模式
    for (const pattern of TARGET_PATH_PATTERNS) {
      const match = text.match(pattern);
      console.log('[WorkflowIntentHandler] 🎯 Pattern:', pattern, 'Match:', match, 'match[1]:', match?.[1]);
      if (match && match[1]) {
        console.log('[WorkflowIntentHandler] ✅ Path extracted:', match[1]);
        return match[1];
      }
    }

    // 默认路径
    console.log('[WorkflowIntentHandler] ⚠️ No path found, using undefined');
    return undefined;
  }

  /**
   * 获取执行响应
   */
  private getExecutionResponse(workflowType: string, targetPath?: string): string {
    const path = targetPath || '.';  // 🔥 修复：默认使用当前目录
    const workflowInfo = Object.values(WORKFLOW_KEYWORDS).find(w => w.workflowType === workflowType);

    if (!workflowInfo) {
      return `正在启动工作流...`;
    }

    return `🚀 正在启动 **${workflowInfo.name}** 工作流

${workflowInfo.description}

目标路径: \`${path}\`

工作流已开始执行，您可以在"执行监控"标签页查看实时进度。`;
  }

  /**
   * 获取工作流列表响应
   */
  private getWorkflowListResponse(): string {
    const workflows = Object.values(WORKFLOW_KEYWORDS);

    let response = `## 📋 可用工作流

`;

    workflows.forEach(wf => {
      response += `
### ${wf.name}
- **类型**: \`${wf.workflowType}\`
- **描述**: ${wf.description}
- **触发方式**:
`;

      // 显示前3个触发词
      wf.patterns.slice(0, 3).forEach(pattern => {
        response += `  - "${pattern}"\n`;
      });
    });

    response += `
## 💡 使用方法

**方式1: 自然语言**
- "请对我的代码运行${workflows[0].name}"
- "执行代码探索"
- "质量检查"

**方式2: 斜杠命令**
- \`/workflow ${workflows[0].workflowType}\`
- \`/${workflows[0].workflowType}\`
- \`/wf exploration\`

**方式3: 自定义路径**
- "对 ./components 运行代码审查"
- \`/workflow code-review ./src\`

请选择您要执行的工作流！`;

    return response;
  }

  /**
   * 执行工作流
   */
  async executeWorkflow(
    workflowType: string,
    targetPath: string = '.',  // 🔥 修复：默认使用当前目录而不是 ./src
    payload?: BasePayload
  ): Promise<string> {
    try {
      console.log('[WorkflowIntentHandler] 🎯 Starting workflow execution:', {
        workflowType,
        targetPath,
      });

      // 🔥 FIX: 使用真实的 Tauri 调用执行工作流
      // 但在 E2E 测试环境中使用 Mock 模式
      // 只有明确设置 __E2E__ 标志时才使用 Mock 模式
      const isE2EMode = typeof window !== 'undefined' && (window as any).__E2E__;

      if (isE2EMode) {
        // E2E 测试环境：使用 Mock 执行
        const mockWorkflowId = `workflow-${Date.now()}`;
        console.log('[WorkflowIntentHandler] 🧪 Using mock workflow execution (E2E mode)');
        console.log('[WorkflowIntentHandler] ✅ Mock workflow ID:', mockWorkflowId);

        // 发布工作流启动事件
        chatEventBus.emit('workflow:started', {
          workflowId: mockWorkflowId,
          workflowType,
          targetPath,
          timestamp: Date.now(),
          ...(payload || {})
        });

        // 模拟异步执行
        await new Promise(resolve => setTimeout(resolve, 100));

        // 模拟工作流完成并返回结果
        const mockResponse = `📊 **项目探索完成**

目标路径: \`${targetPath || '.'}\`

**项目概览**:
- 项目类型检测成功
- 目录结构分析完成
- 关键文件识别完成

💡 提示: 这是 E2E 测试环境的模拟响应。`;

        // 发布工作流响应事件
        chatEventBus.emit('workflow:response', {
          ...payload,
          workflowId: mockWorkflowId,
          workflowType,
          response: mockResponse,
          timestamp: Date.now(),
        });

        // 发布工作流完成事件
        chatEventBus.emit('workflow:completed', {
          workflow_id: mockWorkflowId,
          status: 'completed',
          node_results: {},
          started_at: Date.now(),
          completed_at: Date.now(),
        });

        return mockWorkflowId;
      }

      // 🔥 环境检测：确保在 Tauri 应用中运行
      const w = window as any;
      const isTauriApp = !!(w.__TAURI_INTERNALS__?.invoke || w.__TAURI__?.core?.invoke);

      if (!isTauriApp) {
        console.error('[WorkflowIntentHandler] ❌ Not running in Tauri app!');
        console.error('[WorkflowIntentHandler] 💡 Workflow execution requires Tauri desktop app');
        console.error('[WorkflowIntentHandler] 📝 Current environment:', {
          hasTAURI_INTERNALS: !!w.__TAURI_INTERNALS__,
          hasTAURICore: !!w.__TAURI__?.core,
          hasInvoke: !!(w.__TAURI_INTERNALS__?.invoke || w.__TAURI__?.core?.invoke),
          userAgent: navigator.userAgent,
          location: window.location.href,
        });

        // 🔥 FIX: 在非 Tauri 环境中，创建带有正确元数据的错误消息
        const errorWorkflowId = `workflow-error-${Date.now()}`;
        const errorMessage = `❌ **工作流执行失败**

工作流功能需要在 Tauri 桌面应用中运行。

**当前环境**: 浏览器 (${window.location.href})

**解决方法**:
1. 使用 \`npm run tauri dev\` 启动桌面应用
2. 或者在 Tauri 应用中执行此命令

工作流类型: \`${workflowType}\`
目标路径: \`${targetPath}\``;

        // 发布工作流响应事件（包含错误信息，但有正确的元数据）
        chatEventBus.emit('workflow:response', {
          ...payload,
          workflowId: errorWorkflowId,
          workflowType,
          response: errorMessage,
          timestamp: Date.now(),
        });

        // 发布工作流完成事件（标记为失败）
        chatEventBus.emit('workflow:completed', {
          workflow_id: errorWorkflowId,
          status: 'failed',
          node_results: {},
          started_at: Date.now(),
          completed_at: Date.now(),
        });

        throw new Error(errorMessage);
      }

      // 生产环境：使用真实的 Tauri 调用
      const { invoke } = await import('@tauri-apps/api/core');
      console.log('[WorkflowIntentHandler] ✅ Tauri API imported');

      // 🔥 获取当前 provider 配置
      const { useSettingsStore } = await import('../../settingsStore');
      const settingsStore = useSettingsStore.getState();
      const currentProvider = settingsStore.providers.find(p => p.id === settingsStore.currentProviderId);
      const currentModel = settingsStore.currentModel;

      console.log('[WorkflowIntentHandler] 🔧 Current provider:', currentProvider?.name, 'models:', currentProvider?.models?.length);
      console.log('[WorkflowIntentHandler] 🔧 Current model:', currentModel);

      // 🔥 获取项目根目录
      const { useFileStore } = await import('../../fileStore');
      const projectRoot = useFileStore.getState().rootPath;

      console.log('[WorkflowIntentHandler] 📂 Project root:', projectRoot);

      const workflowId = await invoke<string>('execute_quick_workflow', {
        workflowType,
        targetPath,
        projectRoot,  // 🔥 传递项目根目录
        providerConfig: currentProvider,  // 🔥 传递 provider 配置
        currentModel,  // 🔥 传递用户当前选择的模型
      });

      console.log('[WorkflowIntentHandler] ✅ Workflow ID received:', workflowId);

      // 🔥 监听 Tauri 工作流完成事件
      const { listen } = await import('@tauri-apps/api/event');
      const unlistenCompleted = await listen('workflow:completed', (event: any) => {
        const result = event.payload;
        console.log('[WorkflowIntentHandler] ✅ Received workflow:completed from Tauri:', result);

        // 转发到 chatEventBus
        chatEventBus.emit('workflow:completed', {
          workflow_id: result.workflow_id,
          status: result.status,
          node_results: result.node_results,
          started_at: result.started_at,
          completed_at: result.completed_at,
        });
      });

      const unlistenError = await listen('workflow:error', (event: any) => {
        const errorData = event.payload;
        console.log('[WorkflowIntentHandler] ❌ Received workflow:error from Tauri:', errorData);

        // 转发到 chatEventBus（需要包含 correlationId）
        chatEventBus.emit('workflow:error', {
          correlationId: payload?.correlationId,
          error: errorData.error || errorData,
        });
      });

      // 🔥 监听工作流进度事件（实时进度）
      const unlistenProgress = await listen('workflow:progress', (event: any) => {
        const progress = event.payload;
        console.log('[WorkflowIntentHandler] 📊 Received workflow:progress from Tauri:', progress);

        // 转发到 chatEventBus
        chatEventBus.emit('workflow:progress', {
          workflowId,
          event_type: progress.event_type,
          node_id: progress.node_id,
          message: progress.message,
          timestamp: progress.timestamp,
        });
      });

      // 保存 unlisten 函数以便稍后清理（可选）
      (window as any).__workflowUnlisteners = (window as any).__workflowUnlisteners || [];
      (window as any).__workflowUnlisteners.push(unlistenCompleted, unlistenError, unlistenProgress);

      // 发布工作流启动事件
      chatEventBus.emit('workflow:started', {
        workflowId,
        workflowType,
        targetPath,
        timestamp: Date.now(),
        ...(payload || {})
      });

      return workflowId;
    } catch (error) {
      console.error('[WorkflowIntentHandler] ❌ Workflow execution failed:', error);
      console.error('[WorkflowIntentHandler] Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        error,
      });
      throw error;
    }
  }

  /**
   * 处理用户输入并执行工作流（如果识别到意图）
   */
  async handleAndExecute(text: string, payload?: BasePayload): Promise<{ handled: boolean; response?: string; workflowId?: string }> {
    const intent = this.recognizeWorkflowIntent(text);

    if (!intent.isWorkflow) {
      return { handled: false };
    }

    if (intent.workflowType) {
      try {
        const workflowId = await this.executeWorkflow(
          intent.workflowType,
          intent.targetPath || '.',  // 🔥 修复：默认使用当前目录
          payload
        );

        return {
          handled: true,
          response: intent.response,
          workflowId,
        };
      } catch (error) {
        return {
          handled: true,
          response: `❌ 启动工作流失败: ${error instanceof Error ? error.message : '未知错误'}`,
        };
      }
    }

    return {
      handled: true,
      response: intent.response,
    };
  }
}

export const workflowIntentHandler = new WorkflowIntentHandler();
