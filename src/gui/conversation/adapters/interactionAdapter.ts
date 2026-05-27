/**
 * interactionAdapter — InteractionCard 适配器
 *
 * 将 StoreMapper 注入的 metadata.interactionData 适配为 InteractionCard 格式。
 * cardType === 'interaction' 的透传由 cardTypePassthroughAdapter 处理。
 */
import type { MessageAdapter } from '../MessageAdapterRegistry';
import type { InteractionData } from '../WORKFLOW_DSL';

export const interactionAdapter: MessageAdapter = {
  id: 'interaction',
  match: (msg: any) => {
    // 检测 metadata.interactionData.questions 数组（StoreMapper 注入路径）
    return !!msg.metadata?.interactionData?.questions?.length;
  },
  adapt: (msg: any) => {
    const data = msg.metadata?.interactionData as InteractionData | undefined;
    if (!data?.questions?.length) return null;

    return {
      cardType: 'interaction',
      id: msg.id,
      role: msg.role,
      content: msg.content,
      data: {
        type: data.questions.length > 1 ? 'multiple' : data.type,
        title: data.title,
        questions: data.questions,
        onSelect: data.onSelect,
      },
    };
  },
};
