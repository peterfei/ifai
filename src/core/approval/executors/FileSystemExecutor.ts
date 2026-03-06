import { BaseExecutor } from './BaseExecutor';
import { ToolCallResult } from '../types';

export class FileSystemExecutor extends BaseExecutor {
  type = 'filesystem';

  constructor(
    private invoker: (cmd: string, args?: any) => Promise<any>,
    private rootPath: string
  ) {
    super();
  }

  async execute(toolName: string, args: any): Promise<ToolCallResult> {
    // 1. 极致鲁棒的参数物理化 (支持各种命名变体)
    const relPath = args.rel_path || args.relPath || args.path || (["agent_list_dir", "agent_scan_project"].includes(toolName) ? "." : "");
    const inputContent = args.content || args.new_content || args.text || "";
    
    // 🏆 PIVO 3.0: 日志物理校准 - 对于 read/scan 操作，不统计 inputContent 的长度
    const traceSize = (toolName === 'agent_read_file' || toolName === 'agent_list_dir' || toolName === 'agent_scan_project') ? 0 : inputContent.length;
    console.log(`[FS Tool] 📂 Physical Trace (Input):`, { tool: toolName, relPath, inputSize: traceSize });

    // 🏆 物理熔断：防止空路径导致的目录操作错误 (放行 scan 操作)
    if (!relPath && !["agent_list_dir", "agent_scan_project"].includes(toolName)) {
      return { success: false, content: '', error: `Invalid file path: path is empty for ${toolName}` };
    }
    
    // 2. 自动备份逻辑 (仅针对写/删操作)
    if (toolName === 'agent_write_file' || toolName === 'agent_delete_file') {
      if (relPath) {
        console.log(`[FS Tool] 💾 Creating physical snapshot for ${relPath}...`);
        await this.prepareBackup(relPath);
      }
    }

    try {
      let outputContent: any;
      const rootPath = this.rootPath;

      // 🏆 物理映射：确保传递给 Tauri 的键名绝对正确
      if (toolName === "agent_scan_project") {
        outputContent = await this.invoker("agent_scan_project", { 
          rootPath, 
          relPath, 
          maxDepth: args.max_depth || args.maxDepth || 3 
        });
      } else if (toolName === "agent_list_functions") {
        outputContent = await this.invoker("agent_list_functions", { rootPath, relPath });
      } else if (toolName === "agent_write_file") {
        outputContent = await this.invoker("agent_write_file", { 
          rootPath, 
          relPath, 
          content: inputContent 
        });
      } else {
        // 其他工具走通用映射，但强制注入 rootPath 和 relPath
        const tauriArgs = { ...args, rootPath, relPath };
        outputContent = await this.invoker(toolName, tauriArgs);
      }

      // 3. 结果物理化与防御性处理
      let stringResult: string;
      if (outputContent === undefined || outputContent === null) {
        console.warn(`[FS Tool] ⚠️ Received empty output for ${toolName}`);
        stringResult = toolName === 'agent_read_file' 
          ? `[Error] 文件内容为空或读取失败 (path: ${relPath})。请检查文件是否存在。`
          : "";
      } else if (typeof outputContent === "object" && "content" in outputContent) {
        stringResult = String((outputContent as any).content);
      } else {
        stringResult = typeof outputContent === "object" ? JSON.stringify(outputContent) : String(outputContent);
      }

      // 🏆 PIVO 3.0: 物理截断告知 (如果是读取大文件且内容为空，触发警告)
      if (toolName === 'agent_read_file' && stringResult.length === 0) {
          console.warn(`[FS Tool] 🚨 Empty content read from: ${relPath}`);
      }

      console.log(`[FS Tool] ✅ Execution Success:`, { tool: toolName, outputSize: stringResult.length });
      return { success: true, content: stringResult };
    } catch (e) {
      console.error(`[FS Tool] ❌ Physical execution failed:`, e);
      return { success: false, content: '', error: String(e) };
    }
  }

  /**
   * 🚀 提供预览数据
   */
  async preview(toolName: string, args: any): Promise<any> {
    if (toolName !== 'agent_write_file') return null;
    
    const relPath = args.rel_path || args.relPath || args.path;
    const content = args.content || args.new_content || args.text || "";
    
    try {
      const oldContent = await this.invoker('agent_read_file', {
        rootPath: this.rootPath,
        relPath
      });
      return {
        oldContent: oldContent?.content || oldContent || null,
        newContent: content
      };
    } catch (e) {
      return { oldContent: null, newContent: content };
    }
  }

  private async prepareBackup(relPath: string) {
    try {
      const content = await this.invoker('agent_read_file', {
        rootPath: this.rootPath,
        relPath
      });
      this.saveBackup({ relPath, content: content.content || content });
    } catch (e) {
      this.saveBackup({ relPath, content: null });
    }
  }

  async undo(): Promise<boolean> {
    if (!this.backupData) return false;
    const { relPath, content } = this.backupData;
    try {
      if (content === null) {
        await this.invoker('agent_delete_file', { rootPath: this.rootPath, relPath });
      } else {
        await this.invoker('agent_write_file', { rootPath: this.rootPath, relPath, content });
      }
      return true;
    } catch (e) { return false; }
  }
}
