import { toast } from 'sonner';
import { IInlineEditStore, IStoreInstance } from '../interfaces/ICoreChatStore';

/**
 * Service to synchronize AI state to Inline Assistant UI
 * Implements PIVO 3.0 logic for task extraction and stage synchronization
 */
export class InlineSyncService {
  /**
   * Synchronizes AI progress to the Inline Edit Store
   * @param toolName Name of the tool being called (if any)
   * @param content Code content being generated (if any)
   * @param textChunk Text description being generated (if any)
   */
  static syncState(toolName: string, content: string, textChunk?: string) {
    if (typeof window === 'undefined') return;

    const inlineStore = (window as any).__inlineEditStore as IStoreInstance<IInlineEditStore>;
    if (!inlineStore) return;

    const state = inlineStore.getState();
    if (!state.isInlineEditVisible) return;

    inlineStore.setState((prev: IInlineEditStore) => {
      const currentTasks = [...(prev.pivoTasks || [])];
      let pivoStage = prev.pivoStage;

      // 1. Text-based heuristic task extraction (Planning stage)
      if (textChunk && (prev.pivoStage === 'plan' || prev.pivoStage === 'idle')) {
        // Improved regex to strip common planning prefixes
        const planMatch = textChunk.match(/(?:我将|首先|接着|然后|最后|开始)\s*(?:我将)?\s*(.*?)(?:。| |\n|$)/);
        if (planMatch && planMatch[1].length > 2) {
          const desc = planMatch[1].trim();
          if (!currentTasks.some(t => t.description.includes(desc))) {
            currentTasks.push({ 
              id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`, 
              description: desc, 
              status: 'running', 
              stage: 'plan' 
            });
            pivoStage = 'plan';
          }
        }
      }

      // 2. Tool-driven task generation (Implementation stage)
      if (toolName) {
        pivoStage = 'implement';
        const toolNameLower = toolName.toLowerCase();
        let desc = '';
        
        if (toolNameLower.includes('read')) desc = '读取关联上下文';
        else if (toolNameLower.includes('scan') || toolNameLower.includes('list')) desc = '分析项目结构';
        else if (toolNameLower.includes('write') || toolNameLower.includes('replace')) desc = '正在编写优化代码';
        
        if (desc && !currentTasks.some(t => t.description === desc)) {
          // Mark previous running tasks as success
          currentTasks.forEach(t => { 
            if (t.status === 'running') t.status = 'success'; 
          });
          
          currentTasks.push({ 
            id: `tool_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`, 
            description: desc, 
            status: 'running', 
            stage: 'implement' 
          });
        }
      }

      return {
        pivoStage: toolName ? 'implement' : (textChunk && pivoStage === 'idle' ? 'plan' : pivoStage),
        modifiedCode: (toolName && content !== undefined) ? content : prev.modifiedCode,
        pivoTasks: currentTasks
      };
    });
  }

  /**
   * Updates the status of an ongoing task based on tool call completion
   * @param toolName Name of the tool
   * @param status New status of the tool call
   */
  static updateToolStatus(toolName: string, status: string) {
    if (typeof window === 'undefined') return;
    const inlineStore = (window as any).__inlineEditStore as IStoreInstance<IInlineEditStore>;
    if (!inlineStore) return;

    if (status === 'completed' || status === 'executed') {
      inlineStore.setState((prev: IInlineEditStore) => {
        const currentTasks = [...(prev.pivoTasks || [])];
        const toolNameLower = toolName.toLowerCase();
        
        const taskIndex = currentTasks.findIndex(t => {
          if (toolNameLower.includes('read') && t.description === '读取关联上下文') return true;
          if ((toolNameLower.includes('scan') || toolNameLower.includes('list')) && t.description === '分析项目结构') return true;
          if ((toolNameLower.includes('write') || toolNameLower.includes('replace')) && t.description === '正在编写优化代码') return true;
          return false;
        });

        if (taskIndex !== -1 && currentTasks[taskIndex].status === 'running') {
          currentTasks[taskIndex].status = 'success';
        }

        return { pivoTasks: currentTasks };
      });
    }
  }

  /**
   * Handles the end of an AI response, providing visual feedback
   */
  static handleResponseFinish() {
    if (typeof window === 'undefined') return;
    const inlineStore = (window as any).__inlineEditStore as any;
    if (!inlineStore) return;

    const { isInlineEditVisible, modifiedCode, pivoStage, pivoTasks } = inlineStore.getState();
    if (!isInlineEditVisible) return;

    // 如果生成结束了但没有代码修改，说明 AI 只是给出 了文字建议
    if (!modifiedCode && (pivoStage === 'plan' || pivoStage === 'implement')) {
        toast.warning('AI 仅提供了文字建议，已在侧边栏显示。');
        setTimeout(() => inlineStore.getState().hideInlineEdit(), 1000);
    } else {
        // 强制清理：将所有进行的任务标记为成功
        const updatedTasks = pivoTasks.map((t: any) => 
          t.status === 'running' ? { ...t, status: 'success' as const } : t
        );
        inlineStore.setState({ 
          pivoTasks: updatedTasks,
          pivoStage: 'complete'
        });
    }
  }

  /**
   * Finalizes the inline edit session
   */
  static finalize() {
    const inlineStore = (window as any).__inlineEditStore;
    if (inlineStore) {
      inlineStore.setState({ pivoStage: 'complete' });
    }
  }
}
