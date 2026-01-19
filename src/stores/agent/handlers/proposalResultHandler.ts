/**
 * Proposal 结果处理器
 * 处理 proposal-generator agent 的结果
 * @module proposalResultHandler
 */

import { toast } from 'sonner';
import { parseProposalFromMarkdown } from '@/utils/proposalMarkdownParser';
import { useProposalStore } from '@/stores/proposalStore';

/**
 * 处理 proposal-generator agent 的完成结果
 */
export async function handleProposalGeneratorResult(
  result: string,
  agentId: string
): Promise<{ success: boolean; proposalId?: string; error?: string }> {
  console.log('[ProposalResultHandler] 📋 Proposal generator completed, processing Markdown...');
  console.log('[ProposalResultHandler] 📋 Result preview:', result.substring(0, 200));

  try {
    // 从 Markdown 中解析 proposal 数据
    console.log('[ProposalResultHandler] 📋 Parsing Markdown to extract proposal data...');
    const parsedProposal = parseProposalFromMarkdown(result);

    if (!parsedProposal) {
      console.warn('[ProposalResultHandler] ⚠️ Failed to parse proposal from Markdown');
      toast.info('提案已生成', {
        description: '提案内容已显示在聊天中，但无法创建审核记录',
      });
      return { success: false, error: 'Failed to parse proposal from Markdown' };
    }

    console.log('[ProposalResultHandler] 📋 Parsed proposal data:', {
      changeId: parsedProposal.changeId,
      tasksCount: parsedProposal.tasks.length,
      specDeltasCount: parsedProposal.specDeltas.length,
    });

    // 使用 proposalStore 创建提案
    const proposalStore = useProposalStore.getState();

    const proposalOptions = {
      id: parsedProposal.changeId,
      why: parsedProposal.why,
      whatChanges: parsedProposal.whatChanges,
      impact: parsedProposal.impact,
      tasks: parsedProposal.tasks,
      specDeltas: parsedProposal.specDeltas,
    };

    console.log('[ProposalResultHandler] 📋 Creating proposal...');
    const proposal = await proposalStore.createProposal(proposalOptions);

    console.log('[ProposalResultHandler] ✅ Proposal created:', proposal.id);

    // 显示成功通知
    toast.success('提案生成成功', {
      description: `"${parsedProposal.changeId}" 已创建，正在打开审核...`,
    });

    // 延迟打开审核弹窗
    console.log('[ProposalResultHandler] 📋 Scheduling review modal open for:', proposal.id);
    setTimeout(() => {
      console.log('[ProposalResultHandler] 📋 Opening review modal for:', proposal.id);
      proposalStore.openReviewModal(proposal.id);
      console.log('[ProposalResultHandler] 📋 Review modal should be open now');
    }, 100);

    return { success: true, proposalId: proposal.id };
  } catch (error) {
    console.error('[ProposalResultHandler] ❌ Failed to process proposal result:', error);

    // 即使处理失败，Markdown 也已经显示在聊天中
    toast.error('提案处理失败', {
      description: '提案内容已显示，但无法打开审核弹窗',
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * 检查是否应该处理 proposal 结果
 */
export function shouldHandleProposalResult(agentType: string | undefined, result: string): boolean {
  return agentType === 'proposal-generator' && !!result;
}

/**
 * 验证 proposal 结果格式
 */
export function validateProposalResult(result: string): { valid: boolean; error?: string } {
  const trimmedResult = result.trim();

  if (!trimmedResult) {
    return { valid: false, error: 'Result is empty' };
  }

  if (trimmedResult.length < 50) {
    return { valid: false, error: 'Result is too short to be a valid proposal' };
  }

  // 检查是否包含基本的 proposal 结构标记
  const hasProposalStructure =
    trimmedResult.includes('## ') || // Markdown 标题
    trimmedResult.includes('### ') || // Markdown 子标题
    trimmedResult.includes('**') || // Markdown 粗体
    trimmedResult.includes('####'); // 更深层级的标题

  if (!hasProposalStructure) {
    return { valid: false, error: 'Result does not appear to be a valid proposal format' };
  }

  return { valid: true };
}
