/**
 * timeGrouping — 消息时间分组纯函数
 *
 * 将消息按天分组：今天 / 昨天 / 更早
 * 用于 VirtualMessageList 中渲染时间分隔线
 */

export type TimeGroupKey = 'today' | 'yesterday' | 'older';

const GROUP_LABELS: Record<TimeGroupKey, string> = {
  today: '今天',
  yesterday: '昨天',
  older: '更早',
};

interface MinimalMessage {
  timestamp: number;
}

/**
 * 判断时间戳属于哪个分组
 */
export function getTimeGroupKey(ts: number): TimeGroupKey {
  const now = new Date();
  const date = new Date(ts);

  // 今天：同一年同一月同一天
  if (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  ) {
    return 'today';
  }

  // 昨天：今天 - 1 天
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  if (
    date.getFullYear() === yesterdayDate.getFullYear() &&
    date.getMonth() === yesterdayDate.getMonth() &&
    date.getDate() === yesterdayDate.getDate()
  ) {
    return 'yesterday';
  }

  // 更早：其他
  return 'older';
}

/**
 * 获取分组中文标签
 */
export function getTimeGroupLabel(key: TimeGroupKey): string {
  return GROUP_LABELS[key];
}

/**
 * 判断两条消息之间是否需要显示时间分隔线
 *
 * 规则：两条消息属于不同的天时显示分隔线
 */
export function shouldShowTimeDivider<T extends MinimalMessage>(
  prev: T,
  curr: T,
): boolean {
  return getTimeGroupKey(prev.timestamp) !== getTimeGroupKey(curr.timestamp);
}
