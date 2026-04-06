import { SettingsState } from '../stores/settingsStore';

export type ToolCategory = 'safe' | 'dangerous' | 'destructive';

export interface ApprovalContext {
  settings: Partial<SettingsState>;
  editorMode: 'vibe' | 'spec' | 'standard';
  isSessionTrusted: boolean;
  toolName: string;
  isSandbox: boolean;
  userMessageHasAutoApprove?: boolean;
}

/**
 * 统一的工具调用分类逻辑
 */
export function categorizeTool(toolName: string): ToolCategory {
  if (!toolName) return 'dangerous';

  // 归一化处理：转小写，移除 agent_ 前缀，统一将空格/横杠转为下划线
  const normalizedName = toolName.toLowerCase()
    .replace(/^agent_/, '')
    .replace(/[\s-]/g, '_');
  
  const safeBaseNames = [
    'read_file',
    'list_dir',
    'list_directory',
    'scan_project',
    'scan_directory',
    'get_file_tree',
    'search_file_content',
    'grep_search',
    'search',
    'glob',
    'list_files',
    'ls',
    'todowrite',
    'todo_write'
  ];

  const destructiveBaseNames = [
    'bash',
    'execute_command',
    'run_shell_command',
    'delete_file',
    'remove_file'
  ];

  if (safeBaseNames.includes(normalizedName)) return 'safe';
  if (destructiveBaseNames.includes(normalizedName)) return 'destructive';
  
  return 'dangerous'; // 默认：写入操作等
}

/**
 * 统一的审批策略判断逻辑 (P0 里程碑核心)
 */
export function shouldAutoApprove(context: ApprovalContext): boolean {
  const {
    settings,
    editorMode,
    isSessionTrusted,
    toolName,
    isSandbox,
    userMessageHasAutoApprove
  } = context;

  const category = categorizeTool(toolName);
  
  // 🚨 调试日志：在控制台显式输出判定过程
  const logPrefix = `[Approval] [${toolName}]`;
  console.log(`${logPrefix} Decision context:`, { 
    category, 
    editorMode, 
    isSessionTrusted, 
    userAuthorized: userMessageHasAutoApprove 
  });

  // 1. 安全底线：非沙箱环境下的破坏性操作绝对禁止自动审批
  if (!isSandbox && category === 'destructive') {
    console.warn(`${logPrefix} ❌ Destructive tool blocked in non-sandbox environment.`);
    return false;
  }

  // 2. 用户显式授权优先 (例如在消息中携带了授权标志)
  if (userMessageHasAutoApprove) {
    console.log(`${logPrefix} ✅ Auto-approved by message authorization.`);
    return true;
  }

  // 3. 全局设置优先
  if (settings.agentAutoApprove) {
    console.log(`${logPrefix} ✅ Auto-approved by global settings.`);
    return true;
  }

  // 4. 编辑器模式特权 (Vibe/Spec 模式)
  if (editorMode === 'vibe' || editorMode === 'spec') {
    if (category === 'safe') {
      console.log(`${logPrefix} ✅ Auto-approved in ${editorMode} mode (Safe tool).`);
      return true;
    }
  }

  const approvalMode = settings.agentApprovalMode || 'session-once';

  // 5. 根据审批模式判断
  if (approvalMode === 'always') {
    console.log(`${logPrefix} ✅ Auto-approved by 'always' policy.`);
    return true;
  }

  if (approvalMode === 'session-once' && isSessionTrusted) {
    console.log(`${logPrefix} ✅ Auto-approved by session trust.`);
    return true;
  }

  console.log(`${logPrefix} ✋ Manual approval required.`);
  return false;
}