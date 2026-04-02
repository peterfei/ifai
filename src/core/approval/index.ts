import { ApprovalCoordinator } from './coordinators/ApprovalCoordinator';
import { FileSystemExecutor } from './executors/FileSystemExecutor';
import { ShellExecutor } from './executors/ShellExecutor';
import { SearchExecutor } from './executors/SearchExecutor';
import { SymbolExecutor } from './executors/SymbolExecutor';
import { invoke } from '@tauri-apps/api/core';
import { useFileStore } from '../../stores/fileStore';

let instance: ApprovalCoordinator | null = null;

export function getApprovalCoordinator(): ApprovalCoordinator {
  if (!instance) {
    console.log('[ApprovalEngine] 🚀 PIVO 2.0 Engine Initializing...');
    instance = new ApprovalCoordinator();

    // 1. 初始化文件执行器
    const rootPath = useFileStore.getState().rootPath || '';
    const fsExecutor = new FileSystemExecutor(invoke, rootPath);
    const fsTools = [
      "agent_write_file", "agent_read_file", "agent_list_dir",
      "agent_delete_file", "agent_list_functions",
      "agent_read_file_range", "agent_scan_project",
      "write_file", "read_file"
    ];
    fsTools.forEach(tool => instance!.registerExecutor(tool, fsExecutor));

    // 2. 初始化 Shell 执行器
    const shellExecutor = new ShellExecutor(invoke);
    const shellTools = ["bash", "agent_bash", "agent_execute_command", "execute_bash_command", "agent_run_shell_command"];
    shellTools.forEach(tool => instance!.registerExecutor(tool, shellExecutor));

    // 3. 初始化搜索执行器
    const searchExecutor = new SearchExecutor(invoke, rootPath);
    const searchTools = ["agent_search", "search_semantic", "agent_batch_read", "init_rag_index"];
    searchTools.forEach(tool => instance!.registerExecutor(tool, searchExecutor));

    // 4. 初始化符号执行器
    const symbolExecutor = new SymbolExecutor(invoke, rootPath);
    const symbolTools = ["get_file_symbols", "agent_list_functions"];
    symbolTools.forEach(tool => instance!.registerExecutor(tool, symbolExecutor));

    // 5. 🆕 P4: 注册 TodoWrite 工具（需要用户批准）
    // TodoWrite 创建任务列表，虽然是只读操作，但应该告知用户
    const todoTools = ["TodoWrite"];
    // 使用一个特殊的执行器，总是返回 true（自动批准，但会显示通知）
    class TodoExecutor {
      async execute(toolName: string, args: any): Promise<any> {
        console.log(`[ApprovalEngine] 📝 TodoWrite tool invoked: ${toolName}`, args);
        // 直接返回 args，让后端处理
        return args;
      }
    }
    const todoExecutor = new TodoExecutor() as any;
    todoTools.forEach(tool => instance!.registerExecutor(tool, todoExecutor));

    console.log(`[ApprovalEngine] ✅ Registered ${fsTools.length} FS, ${shellTools.length} Shell, ${searchTools.length} Search, ${symbolTools.length} Symbol, & ${todoTools.length} Todo tools.`);
  }
  return instance;
}
