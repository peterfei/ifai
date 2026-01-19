/**
 * Markdown 格式化器
 * 将流式 JSON 内容格式化为 Markdown
 * @module markdownFormatter
 */

/**
 * 将流式内容格式化为 Markdown（只显示 title 和 description）
 *
 * 功能说明：
 * - 移除 markdown 代码块标记（```json, ```）
 * - 提取所有任务的 title 和 description
 * - 按顺序匹配 title 和 description
 * - 自动去重，跳过 previousContent 中已有的任务
 * - 格式化为 **title** 和 > description
 *
 * @param buffer - 原始 JSON 缓冲区
 * @param previousContent - 之前的内容（用于去重）
 * @returns Markdown 格式的文本
 */
export function formatStreamToMarkdown(buffer: string, previousContent: string = ''): string {
  try {
    // 移除 markdown 代码块标记
    const cleanBuffer = buffer.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

    // 提取所有的 title 和 description
    const titleRegex = /"title"\s*:\s*"([^"]+)"/g;
    const descRegex = /"description"\s*:\s*"([^"]+)"/g;

    const tasks: Array<{ title: string; description: string }> = [];
    let match;

    // 提取所有任务
    while ((match = titleRegex.exec(cleanBuffer)) !== null) {
      tasks.push({ title: match[1], description: '' });
    }

    // 重置并提取 description
    titleRegex.lastIndex = 0;
    let descIndex = 0;
    while ((match = descRegex.exec(cleanBuffer)) !== null) {
      if (descIndex < tasks.length) {
        tasks[descIndex].description = match[1];
        descIndex++;
      }
    }

    // 只返回新增的任务（去重）
    const previousTitles = new Set();
    const prevTitleRegex = /"title"\s*:\s*"([^"]+)"/g;
    let prevMatch;
    while ((prevMatch = prevTitleRegex.exec(previousContent)) !== null) {
      previousTitles.add(prevMatch[1]);
    }

    const newTasks = tasks.filter(t => !previousTitles.has(t.title));

    // 格式化为 Markdown
    const lines: string[] = [];
    for (const task of newTasks) {
      lines.push(`**${task.title}**`);
      if (task.description) {
        lines.push(`> ${task.description}`);
      }
      lines.push(''); // 空行分隔
    }

    return lines.join('\n');
  } catch (e) {
    // 失败时返回空字符串（避免显示乱码）
    return '';
  }
}
