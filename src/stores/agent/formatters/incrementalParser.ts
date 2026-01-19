/**
 * 增量解析器
 * 从流式 JSON 缓冲区中增量提取任务标题
 * @module incrementalParser
 */

/**
 * 从缓冲区增量提取任务标题
 *
 * 功能说明：
 * - 解析流式 JSON 缓冲区，提取新的任务标题
 * - 自动去重，跳过已存在的日志
 * - 支持嵌套结构的树状显示
 * - 解析失败时回退到正则模式
 *
 * @param buffer - 原始 JSON 缓冲区字符串
 * @param existingLogs - 已存在的日志数组（用于去重）
 * @returns 新提取的日志行（带树状结构）
 */
export function extractTaskTitlesIncremental(buffer: string, existingLogs: string[]): string[] {
  const newLogs: string[] = [];
  // 从现有日志中提取纯标题，用于去重（支持带前缀和不带前缀的日志）
  const seenTitles = new Set(existingLogs.filter(log => log.includes('📋')).map(log => log.replace(/^[├│└─ ]*📋 /, '')));

  // 尝试解析部分 JSON 结构来构建层级关系
  try {
    // 找到所有 { ... "title": "...", "children": [ ... ] ... } 模式
    // 使用栈来跟踪嵌套层级
    const stack: Array<{ title: string; depth: number; parentIsLast: boolean }> = [];
    let depth = 0;
    let inChildren = false;
    let currentTitle = '';

    // 简单的 token 匹配
    const tokens = buffer.split(/([{}[\]",])/).filter(t => t.trim());
    let i = 0;

    while (i < tokens.length) {
      const token = tokens[i];

      if (token === '{') {
        depth++;
      } else if (token === '}') {
        if (currentTitle && depth > 0) {
          // 检查是否已经显示过
          if (!seenTitles.has(currentTitle)) {
            // 构建前缀
            const parent = stack[stack.length - 1];
            let prefix = '';
            if (parent) {
              prefix = parent.parentIsLast ? '    ' : '│   ';
            }
            const isLast = i < tokens.length - 1 && tokens[i + 1]?.trim() === ']';
            prefix += isLast ? '└─ ' : '├─ ';

            newLogs.push(`${prefix}📋 ${currentTitle}`);
            seenTitles.add(currentTitle);
          }
        }
        currentTitle = '';
        depth--;
      } else if (token === '[') {
        inChildren = true;
      } else if (token === ']') {
        inChildren = false;
        if (stack.length > 0) {
          stack.pop();
        }
      } else if (token === '"title"') {
        // 下一个 token 应该是 :
        if (tokens[i + 1]?.trim() === ':') {
          // 再下一个应该是字符串值
          const valueToken = tokens[i + 2];
          if (valueToken) {
            currentTitle = valueToken.replace(/^["']|["']$/g, '');
          }
        }
      }

      i++;
    }

    // 如果上面解析失败，回退到简单模式
    if (newLogs.length === 0) {
      const titleRegex = /"title"\s*:\s*"([^"]+)"/g;
      let match;
      while ((match = titleRegex.exec(buffer)) !== null) {
        const title = match[1];
        if (!seenTitles.has(title) && !newLogs.some(log => log.includes(title))) {
          newLogs.push(`📋 ${title}`);
          seenTitles.add(title);
        }
      }
    }
  } catch (e) {
    // 出错时回退到简单模式
    const titleRegex = /"title"\s*:\s*"([^"]+)"/g;
    let match;
    while ((match = titleRegex.exec(buffer)) !== null) {
      const title = match[1];
      if (!seenTitles.has(title) && !newLogs.some(log => log.includes(title))) {
        newLogs.push(`📋 ${title}`);
        seenTitles.add(title);
      }
    }
  }

  return newLogs;
}
