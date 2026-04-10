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

    console.log('[WorkflowIntentHandler] 🔍 checkSlashCommands:', {
      originalText: text,
      parts,
      command,
      commandInMap: command in WORKFLOW_SLASH_COMMANDS,
      allCommands: Object.keys(WORKFLOW_SLASH_COMMANDS)
    });

    if (!(command in WORKFLOW_SLASH_COMMANDS)) {
      console.log('[WorkflowIntentHandler] ❌ Command not found in WORKFLOW_SLASH_COMMANDS');
      return { isWorkflow: false, confidence: 0 };
    }

    const commandType = WORKFLOW_SLASH_COMMANDS[command as keyof typeof WORKFLOW_SLASH_COMMANDS];

    console.log('[WorkflowIntentHandler] ✅ Command found:', {
      command,
      commandType,
      isGenericWorkflow: commandType === 'workflow'
    });

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

    const result = {
      isWorkflow: true,
      workflowType,
      targetPath,
      confidence: 1.0,
      response: this.getExecutionResponse(workflowType, targetPath),
    };

    console.log('[WorkflowIntentHandler] ✅ Returning workflow intent:', result);
    return result;
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
    // 🔥 FIX: 在函数作用域顶部声明 workflowId，确保在 catch 块中可以访问
    let workflowId: string;

    try {
      console.log('[WorkflowIntentHandler] 🎯 Starting workflow execution:', {
        workflowType,
        targetPath,
      });

      // 🔥 FIX: 使用真实的 Tauri 调用执行工作流
      // 但在 E2E 测试环境中使用 Mock 模式
      // 除非设置了 __E2E_REAL_TAURI_MODE__ 标志（表示要在 E2E 测试中使用真实的 Tauri）
      const isE2EMode = typeof window !== 'undefined' && (window as any).__E2E__;
      const isRealTauriMode = typeof window !== 'undefined' && (window as any).__E2E_REAL_TAURI_MODE__;

      if (isE2EMode && !isRealTauriMode) {
        // E2E 测试环境 + 非 Tauri 模式：使用 Mock 执行
        const mockWorkflowId = `workflow-${Date.now()}`;
        console.log('[WorkflowIntentHandler] 🧪 Using mock workflow execution (E2E mode)');
        console.log('[WorkflowIntentHandler] ✅ Mock workflow ID:', mockWorkflowId);

        // 🔥 根据工作流类型生成模拟的计划节点
        const mockPlannedNodes = (() => {
          if (workflowType === 'exploration') {
            return [
              { id: 'explore', label: '探索代码', agent_type: 'explore' }
            ];
          } else if (workflowType === 'code_review') {
            return [
              { id: 'explore', label: '探索代码', agent_type: 'explore' },
              { id: 'review', label: '代码审查', agent_type: 'review' },
              { id: 'refactor', label: '重构建议', agent_type: 'refactor' }
            ];
          } else if (workflowType === 'quality_check') {
            return [
              { id: 'review', label: '代码审查', agent_type: 'review' },
              { id: 'security', label: '安全检查', agent_type: 'review' }
            ];
          } else {
            return [
              { id: 'task', label: '执行任务', agent_type: 'general_purpose' }
            ];
          }
        })();

        console.log('[WorkflowIntentHandler] 📋 Mock planned nodes:', mockPlannedNodes);
        console.log('[WorkflowIntentHandler] 📋 Nodes length:', mockPlannedNodes.length);
        console.log('[WorkflowIntentHandler] 📋 First node:', mockPlannedNodes[0]);

        // 🔥 发布工作流启动事件（包含计划节点）
        const workflowStartedEvent = {
          workflowId: mockWorkflowId,
          workflowType,
          targetPath,
          timestamp: Date.now(),
          nodes: mockPlannedNodes,  // 🔥 包含计划节点
          ...(payload || {})
        };
        console.log('[WorkflowIntentHandler] 📤 About to emit workflow:started event:', JSON.stringify(workflowStartedEvent, null, 2));
        chatEventBus.emit('workflow:started', workflowStartedEvent);
        console.log('[WorkflowIntentHandler] ✅ Emitted workflow:started event with nodes');

        // 🔥 模拟渐进式节点执行（模拟真实工作流的行为）
        // 每个节点依次启动、执行、完成
        for (let i = 0; i < mockPlannedNodes.length; i++) {
          const node = mockPlannedNodes[i];

          // 等待一小段时间
          await new Promise(resolve => setTimeout(resolve, 800));

          // 发送 node_started 事件
          chatEventBus.emit('workflow:progress', {
            workflowId: mockWorkflowId,
            event_type: 'node_started',
            node_id: node.id,
            message: `开始执行: ${node.label}`,
            timestamp: Date.now()
          });
          console.log('[WorkflowIntentHandler] 📊 Mock node_started:', node.id);

          // 模拟工具调用（仅对 explore 节点）
          if (node.agent_type === 'explore') {
            await new Promise(resolve => setTimeout(resolve, 400));

            // 发送 tool_call 事件
            chatEventBus.emit('workflow:progress', {
              workflowId: mockWorkflowId,
              event_type: 'tool_call',
              node_id: node.id,
              message: '扫描项目文件',
              timestamp: Date.now(),
              tool_details: {
                tool_name: 'agent_scan_project',
                tool_input: JSON.stringify({ path: targetPath || '.' }),
                tool_output: '发现 15 个文件',
                output_length: 50,
                execution_time_ms: 350,
                is_error: false
              }
            });
            console.log('[WorkflowIntentHandler] 🔧 Mock tool_call: agent_scan_project');
          }

          // 等待节点执行完成
          await new Promise(resolve => setTimeout(resolve, 600));

          // 发送 node_completed 事件
          chatEventBus.emit('workflow:progress', {
            workflowId: mockWorkflowId,
            event_type: 'node_completed',
            node_id: node.id,
            message: `✓ ${node.label} 完成`,
            timestamp: Date.now()
          });
          console.log('[WorkflowIntentHandler] ✅ Mock node_completed:', node.id);
        }

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

        // 🔥 CRITICAL FIX: 在开发环境的浏览器中模拟工作流进度
        const isDevelopment = process.env.NODE_ENV === 'development';

        if (isDevelopment) {
          console.log('[WorkflowIntentHandler] 🔧 Development mode: simulating workflow progress in browser...');

          // 🔥 创建模拟的 workflowId
          const mockWorkflowId = `workflow-dev-${Date.now()}`;
          console.log('[WorkflowIntentHandler] ✅ Mock workflow ID:', mockWorkflowId);

          // 🔥 根据工作流类型生成模拟的计划节点
          const mockPlannedNodes = (() => {
            if (workflowType === 'exploration') {
              return [
                { id: 'explore', label: '探索代码', agent_type: 'explore' }
              ];
            } else if (workflowType === 'code_review') {
              return [
                { id: 'explore', label: '探索代码', agent_type: 'explore' },
                { id: 'review', label: '代码审查', agent_type: 'review' },
                { id: 'refactor', label: '重构建议', agent_type: 'refactor' }
              ];
            } else {
              return [
                { id: 'task', label: '执行任务', agent_type: 'general_purpose' }
              ];
            }
          })();

          console.log('[WorkflowIntentHandler] 📋 Mock planned nodes (dev mode):', mockPlannedNodes);

          // 🔥 立即发出工作流启动事件（包含计划节点）
          chatEventBus.emit('workflow:started', {
            workflowId: mockWorkflowId,
            workflowType,
            targetPath,
            timestamp: Date.now(),
            nodes: mockPlannedNodes,  // 🔥 包含计划节点
            ...payload
          });

          // 模拟一些典型的探索工作流节点
          const mockNodes = [
            { node_id: 'Search(pattern:"**/*.ts",path:".")', message: '搜索 TypeScript 文件' },
            { node_id: 'Read(package.json)', message: '读取 package.json' },
            { node_id: 'Analyze(project_structure)', message: '分析项目结构' },
            { node_id: 'Generate(summary)', message: '生成项目摘要' },
          ];

          // 模拟发送进度事件
          for (let i = 0; i < mockNodes.length; i++) {
            await new Promise(resolve => setTimeout(resolve, 800)); // 每 800ms 发送一个节点

            const node = mockNodes[i];
            console.log('[WorkflowIntentHandler] 📊 Simulating workflow:progress:', node);

            // 发送节点开始事件
            chatEventBus.emit('workflow:progress', {
              workflowId: mockWorkflowId,
              event_type: 'node_started',
              node_id: node.node_id,
              message: node.message,
              timestamp: Date.now()
            });

            // 再等待一小段时间后发送节点完成事件
            await new Promise(resolve => setTimeout(resolve, 400));

            chatEventBus.emit('workflow:progress', {
              workflowId: mockWorkflowId,
              event_type: 'node_completed',
              node_id: node.node_id,
              message: `✓ ${node.message}`,
              timestamp: Date.now()
            });
          }

          // 所有节点完成后，等待一下再发送完成事件
          await new Promise(resolve => setTimeout(resolve, 500));

          // 发送模拟的完成事件
          console.log('[WorkflowIntentHandler] ✅ Simulating workflow:completed');
          chatEventBus.emit('workflow:completed', {
            workflow_id: mockWorkflowId,
            status: 'completed',
            node_results: {},
            started_at: Date.now() - 5000,
            completed_at: Date.now()
          });

          // 发送模拟的响应
          chatEventBus.emit('workflow:response', {
            ...payload,
            workflowId: mockWorkflowId,
            workflowType,
            response: `✅ **工作流执行完成**

工作流类型: \`${workflowType}\`
目标路径: \`${targetPath}\`

**执行步骤**:
${mockNodes.map(n => `- ${n.message}`).join('\n')}

💡 这是开发环境的模拟响应。在生产环境中，将显示真实的执行结果。`,
            timestamp: Date.now(),
          });

          console.log('[WorkflowIntentHandler] ✅ Development simulation complete');
          return mockWorkflowId;
        }

        // 🔥 非开发环境：显示错误消息
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

      // 🔥 启动 SSE Progress 监听（E2E 测试环境）
      const { startSSEProgressMonitoringIfNeeded, getSSEProgressMonitor } = await import('../../../utils/sseProgressMonitor');
      const sseStarted = await startSSEProgressMonitoringIfNeeded();
      console.log('[WorkflowIntentHandler] 🌐 SSE monitoring started:', sseStarted);

      // 如果 SSE 监听启动成功，添加 progress 事件监听器
      if (sseStarted) {
        const sseMonitor = getSSEProgressMonitor();

        // 监听所有 progress 事件并转发到 chatEventBus
        sseMonitor.on('*', (progressEvent) => {
          console.log('[WorkflowIntentHandler] 🌐 SSE Progress Event:', progressEvent);

          // 转发 progress 事件到 chatEventBus
          chatEventBus.emit('workflow:progress', progressEvent);
        });

        // 监听工作流完成事件
        sseMonitor.on('workflow:completed', (event) => {
          console.log('[WorkflowIntentHandler] 🌐 SSE workflow:completed:', event);

          // 转发到 chatEventBus
          chatEventBus.emit('workflow:completed', {
            workflow_id: event.workflow_id,
            status: 'completed',
            timestamp: event.timestamp
          });
        });
      }

      workflowId = await invoke<string>('execute_quick_workflow', {
        workflowType,
        targetPath,
        projectRoot,  // 🔥 传递项目根目录
        providerConfig: currentProvider,  // 🔥 传递 provider 配置
        currentModel,  // 🔥 传递用户当前选择的模型
        correlationId: payload?.correlationId,  // 🔥 传递 correlationId 用于关联消息
      });

      console.log('[WorkflowIntentHandler] ✅ Workflow ID received:', workflowId);

      // 🔥 CRITICAL FIX: 立即发出工作流启动事件，确保监控器能显示
      // 不等待异步监听器设置完成
      chatEventBus.emit('workflow:started', {
        workflowId,
        workflowType,
        targetPath,
        timestamp: Date.now(),
        ...payload
      });
      console.log('[WorkflowIntentHandler] 📢 workflow:started event emitted for:', workflowId);

      // 🔥 异步设置事件监听器，不阻塞返回
      // 即使监听器设置失败，也不影响工作流的正常执行
      (async () => {
        try {
          // 🔥 监听 Tauri 工作流完成事件
          const { listen } = await import('@tauri-apps/api/event');

          // 🔥 监听工作流响应事件（包含最终结果）
          const unlistenResponse = await listen('workflow:response', (event: any) => {
        try {
          const result = event.payload || {};
          console.log('[WorkflowIntentHandler] 📝 Received workflow:response from Tauri:', {
            result,
            currentWorkflowId: workflowId,
            currentCorrelationId: payload?.correlationId,
          });

          // 🔥 FIX: 支持两种字段名（correlation_id 和 correlationId）
          // 使用可选链避免访问未定义属性
          const eventCorrelationId = result.correlationId || result.correlation_id;
          const payloadCorrelationId = payload?.correlationId;

          if (eventCorrelationId && payloadCorrelationId && eventCorrelationId !== payloadCorrelationId) {
            console.log('[WorkflowIntentHandler] ⚠️ Ignoring workflow:response for different correlation:', {
              expected: payloadCorrelationId,
              received: eventCorrelationId
            });
            return;
          }

        console.log('[WorkflowIntentHandler] ✅ workflow:response matches current workflow');

        // 🔥 标记已收到响应（用于 fallback 判断）
        if (!(window as any).__workflowResponseReceived) {
          (window as any).__workflowResponseReceived = {};
        }
        (window as any).__workflowResponseReceived[workflowId] = true;

        // 转发到 chatEventBus，更新助手消息
        chatEventBus.emit('workflow:response', {
          ...payload,  // 包含 correlationId 和 messageId
          workflowId,
          workflowType,
          response: result.response || result.message,
          timestamp: Date.now(),
        });
        } catch (error) {
          console.error('[WorkflowIntentHandler] ❌ Error in workflow:response handler:', error);
        }
      });

      const unlistenCompleted = await listen('workflow:completed', (event: any) => {
        try {
          const result = event.payload || {};
          console.log('[WorkflowIntentHandler] ✅ Received workflow:completed from Tauri:', result);

          // 🔥 FIX: 检查 workflow_id 是否匹配当前工作流
          const eventWorkflowId = result.workflow_id;
          if (eventWorkflowId !== workflowId) {
            console.log('[WorkflowIntentHandler] ⚠️ Ignoring workflow:completed for different workflow:', {
              expected: workflowId,
              received: eventWorkflowId
            });
            return;
          }

          // 🔥 检查是否已经收到 workflow:response 事件
          // 如果 Tauri 后端没有发送 workflow:response，我们需要生成一个
          const hasReceivedResponse = (window as any).__workflowResponseReceived?.[result.workflow_id];

          if (!hasReceivedResponse && result.status === 'completed') {
            console.log('[WorkflowIntentHandler] 📝 No workflow:response received, generating default response');

            // 生成默认的完成响应
            const defaultResponse = `✅ **工作流执行完成**

工作流类型: \`${workflowType}\`
目标路径: \`${targetPath}\`

状态: 已完成
开始时间: ${new Date(result.started_at || Date.now()).toLocaleTimeString()}
结束时间: ${new Date(result.completed_at || Date.now()).toLocaleTimeString()}

💡 工作流已成功完成。`;

            // 发送默认响应
            chatEventBus.emit('workflow:response', {
              ...payload,
              workflowId,
              workflowType,
              response: defaultResponse,
              timestamp: Date.now(),
            });
          }

          // 转发到 chatEventBus
          chatEventBus.emit('workflow:completed', {
            workflow_id: result.workflow_id,
            status: result.status,
            node_results: result.node_results,
            started_at: result.started_at,
            completed_at: result.completed_at,
          });
        } catch (error) {
          console.error('[WorkflowIntentHandler] ❌ Error in workflow:completed handler:', error);
        }
      });

      // 🔥 监听 workflow:started 事件（包含计划节点）
      const unlistenStarted = await listen('workflow:started', (event: any) => {
        try {
          const startedData = event.payload || {};
          console.log('[WorkflowIntentHandler] 📋 Received workflow:started from Tauri:', {
            workflowId: startedData.workflowId,
            workflowType: startedData.workflowType,
            nodesCount: startedData.nodes?.length || 0,
            nodes: startedData.nodes
          });

          // 🔥 FIX: 检查 workflowId 是否匹配当前工作流
          const eventWorkflowId = startedData.workflowId;
          if (eventWorkflowId && eventWorkflowId !== workflowId) {
            console.log('[WorkflowIntentHandler] ⚠️ Ignoring workflow:started for different workflow:', {
              expected: workflowId,
              received: eventWorkflowId
            });
            return;
          }

          console.log('[WorkflowIntentHandler] ✅ Forwarding workflow:started to chatEventBus with', startedData.nodes?.length || 0, 'planned nodes');

          // 🔥 转发到 chatEventBus（包含计划节点）
          chatEventBus.emit('workflow:started', {
            workflowId,
            workflowType: startedData.workflowType || workflowType,
            targetPath: startedData.targetPath,
            timestamp: startedData.timestamp,
            nodes: startedData.nodes || [],  // 🔥 关键：包含计划节点
            correlationId: payload?.correlationId,
            sessionId: payload?.sessionId
          });
        } catch (error) {
          console.error('[WorkflowIntentHandler] ❌ Error in workflow:started handler:', error);
        }
      });

      const unlistenError = await listen('workflow:error', (event: any) => {
        try {
          const errorData = event.payload || {};
          console.log('[WorkflowIntentHandler] ❌ Received workflow:error from Tauri:', errorData);

          // 🔥 FIX: 检查 workflow_id 是否匹配当前工作流
          const eventWorkflowId = errorData.workflow_id;
          if (eventWorkflowId && eventWorkflowId !== workflowId) {
            console.log('[WorkflowIntentHandler] ⚠️ Ignoring workflow:error for different workflow:', {
              expected: workflowId,
              received: eventWorkflowId
            });
            return;
          }

          // 转发到 chatEventBus（需要包含 correlationId）
          chatEventBus.emit('workflow:error', {
            correlationId: payload?.correlationId,
            error: errorData.error || errorData,
          });
        } catch (error) {
          console.error('[WorkflowIntentHandler] ❌ Error in workflow:error handler:', error);
        }
      });

      // 🔥 监听工作流进度事件（实时进度）
      const unlistenProgress = await listen('workflow:progress', (event: any) => {
        try {
          const progress = event.payload || {};
          console.log('[WorkflowIntentHandler] 📊 Received workflow:progress from Tauri:', {
            ...progress,
            has_tool_details: !!progress.tool_details,
            tool_details_preview: progress.tool_details ? {
              tool_name: progress.tool_details.tool_name,
              output_length: progress.tool_details.output_length
            } : undefined
          });

          // 🔥 FIX: 检查 workflow_id 是否匹配当前工作流
          const eventWorkflowId = progress.workflow_id;
          if (eventWorkflowId && eventWorkflowId !== workflowId) {
            console.log('[WorkflowIntentHandler] ⚠️ Ignoring workflow:progress for different workflow:', {
              expected: workflowId,
              received: eventWorkflowId
            });
            return;
          }

          console.log('[WorkflowIntentHandler] ✅ Forwarding progress event to chatEventBus, has tool_details:', !!progress.tool_details);

          // 转发到 chatEventBus
          chatEventBus.emit('workflow:progress', {
            workflowId,
            event_type: progress.event_type,
            node_id: progress.node_id,
            message: progress.message,
            timestamp: progress.timestamp,
            // 🔥 转发工具调用详情（关键修复）
            tool_details: progress.tool_details,
          });
        } catch (error) {
          console.error('[WorkflowIntentHandler] ❌ Error in workflow:progress handler:', error);
        }
      });

      console.log('[WorkflowIntentHandler] ✅ Event listeners setup complete (workflow:started already emitted)');

      // 🔥 CRITICAL FIX: Fallback 模拟 - 如果后端不发送进度事件，前端自动模拟
      // 这样即使在 Tauri 应用中，用户也能看到工作流执行过程
      let progressReceived = false;
      let progressTimeout: NodeJS.Timeout | null = null;

      // 🔥 延迟检查，给真实后端更多时间发送进度事件
      // 监听一次 progress 事件来检测后端是否发送
      const uncheckProgressOnce = chatEventBus.on('workflow:progress' as any, (payload: any) => {
        const payloadWorkflowId = payload.workflowId || payload.workflow_id;
        if (payloadWorkflowId === workflowId) {
          progressReceived = true;
          console.log('[WorkflowIntentHandler] ✅ Progress event received from backend, canceling fallback');
          if (progressTimeout) {
            clearTimeout(progressTimeout);
            progressTimeout = null;
          }
          // 🔥 FIX: 正确调用返回的 unsubscribe 函数
          uncheckProgressOnce();
        }
      });

      // 保存 unlisten 函数以便稍后清理（可选）
      (window as any).__workflowUnlisteners = (window as any).__workflowUnlisteners || [];
      (window as any).__workflowUnlisteners.push(unlistenStarted, unlistenResponse, unlistenCompleted, unlistenError, unlistenProgress, uncheckProgressOnce);

      // 🔥 10 秒后检查，如果没有收到进度事件，发送一个通用提示
      // 不再使用硬编码的节点模拟数据
      progressTimeout = setTimeout(() => {
        if (!progressReceived) {
          console.log('[WorkflowIntentHandler] ⚠️ No progress events from backend after 10s');
          console.log('[WorkflowIntentHandler] 📊 WorkflowId:', workflowId, 'WorkflowType:', workflowType);
          console.log('[WorkflowIntentHandler] ℹ️  Waiting for backend to send real progress events...');
          console.log('[WorkflowIntentHandler] 🔍 Debug info:');
          console.log('  - Expected workflowId:', workflowId);
          console.log('  - Frontend workflowId type:', typeof workflowId);
          console.log('  - Check if backend is sending workflow_id in progress events');

          // 🔥 检查是否有任何 workflow:progress 事件到达（但 workflow_id 不匹配）
          const anyProgressReceived = (window as any).__any_workflow_progress_received || false;
          const globalWorkflowStates = (window as any).__GLOBAL_WORKFLOW_STATES__;
          const allWorkflowIds = globalWorkflowStates ? Array.from(globalWorkflowStates.keys()) : [];

          console.log('  - Any progress events received:', anyProgressReceived);
          console.log('  - All workflow IDs in global state:', allWorkflowIds);
          console.log('  - Expected workflowId:', workflowId);

          // 🔥 检查是否有任何工作流状态（可能 workflow_id 不匹配）
          if (allWorkflowIds.length > 0) {
            console.log('  - ⚠️ Found workflow states but with different IDs!');
            console.log('    Possible reasons:');
            console.log('    1. Backend is not sending workflow_id in progress events');
            console.log('    2. Backend workflow_id does not match frontend workflowId');
            console.log('    3. Events are being sent but not captured by our listener');
          }

          // 🔥 移除硬编码的节点模拟，只发送一个简单的状态更新
          // 让 WorkflowInlineMonitor 显示真实的工作流状态，而不是虚假的进度
          chatEventBus.emit('workflow:progress', {
            workflowId,
            event_type: 'waiting',
            node_id: 'waiting',
            message: '等待后端发送执行进度...',
            timestamp: Date.now()
          });
        }
      }, 10000); // 🔥 增加超时时间到10秒，给真实后端足够时间
    } catch (error) {
      console.error('[WorkflowIntentHandler] ❌ Error setting up event listeners:', error);
    }
    })();  // 🔥 异步IIFE闭合

      return workflowId;
    } catch (error) {
      console.error('[WorkflowIntentHandler] ❌ Workflow execution failed:', error);
      console.error('[WorkflowIntentHandler] Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        error,
      });

      // 🔥 FIX: 如果工作流已经成功启动（有 workflowId），即使事件监听失败也返回 workflowId
      // 这样可以确保工作流监控器能够显示
      // 检查错误是否是事件监听器设置失败
      const isListenerError = error instanceof Error && (
        error.message.includes('listen') ||
        error.message.includes('event') ||
        error.message.includes('uninitialized')
      );

      if (isListenerError) {
        console.warn('[WorkflowIntentHandler] ⚠️ Listener setup failed, but workflow may still be running');
        // 仍然返回 workflowId，让工作流监控器能够显示
        return workflowId;
      }

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
