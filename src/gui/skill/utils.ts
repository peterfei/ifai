/**
 * utils — 工具函数
 *
 * highlightText: 搜索高亮文本分段（供组件渲染 highlight span）
 * formatCompactNumber: 数字紧凑格式化（复用 skillUi.ts）
 */

export interface TextSegment {
  text: string;
  isMatch: boolean;
}

/**
 * 将文本按搜索词分割为高亮/非高亮段。
 * 大小写不敏感，返回数组供组件映射为 <span>。
 */
export function highlightText(text: string, query: string): TextSegment[] {
  if (!text) return [];
  if (!query) return [{ text, isMatch: false }];

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const segments: TextSegment[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const matchIndex = lowerText.indexOf(lowerQuery, cursor);
    if (matchIndex === -1) {
      // 无更多匹配
      segments.push({ text: text.slice(cursor), isMatch: false });
      break;
    }

    // 匹配前的非高亮段
    if (matchIndex > cursor) {
      segments.push({ text: text.slice(cursor, matchIndex), isMatch: false });
    }

    // 高亮段
    segments.push({ text: text.slice(matchIndex, matchIndex + query.length), isMatch: true });
    cursor = matchIndex + query.length;
  }

  return segments;
}
