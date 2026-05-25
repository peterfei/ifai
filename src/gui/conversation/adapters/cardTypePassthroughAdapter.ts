/**
 * cardTypePassthroughAdapter — cardType 透传适配器配置
 *
 * 已有 cardType 的消息直接透传（预览/后端注入场景）。
 * 在 MessageAdapterRegistry 中集中注册。
 */
import type { MessageAdapter } from '../MessageAdapterRegistry';

export const cardTypePassthroughAdapter: MessageAdapter = {
  id: 'cardType-passthrough',
  match: (msg: any) => !!msg.cardType,
  adapt: (msg: any) => ({
    cardType: msg.cardType,
    id: msg.id,
    role: msg.role,
    content: msg.content,
    data: msg.data || {},
  }),
};
