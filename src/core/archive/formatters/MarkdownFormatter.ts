/**
 * Markdown 格式化器
 *
 * 将 ArchiveData 序列化为 Markdown 格式
 * 人类可读优先，Git 友好，适合作为 LLM 输入
 */

import type { Formatter, ArchiveData, FormatOptions, ArchiveMessage } from '../types';

export class MarkdownFormatter implements Formatter {
  /**
   * 序列化为 Markdown
   */
  async format(data: ArchiveData, options: FormatOptions = {}): Promise<Uint8Array> {
    const lines: string[] = [];

    // Frontmatter（机器可读元数据）
    lines.push('---');
    lines.push(`id: ${data.id}`);
    lines.push(`timestamp: ${data.timestamp}`);
    lines.push(`summary: ${this.escapeYaml(data.summary)}`);

    const messageCount = data.originalMessages.length;
    const originalSize = JSON.stringify(data.originalMessages).length;
    const compactedSize = JSON.stringify(data.compactedMessages).length;
    const compressionRatio = originalSize > 0
      ? ((originalSize - compactedSize) / originalSize) * 100
      : 0;

    lines.push(`messageCount: ${messageCount}`);
    lines.push(`compressionRatio: ${Math.round(compressionRatio * 100) / 100}%`);

    if (options.metadata) {
      Object.entries(options.metadata).forEach(([key, value]) => {
        lines.push(`${key}: ${value}`);
      });
    }

    lines.push('---');
    lines.push('');

    // 标题（人类可读）
    lines.push('# Conversation Archive');
    lines.push('');
    lines.push(`**Summary:** ${this.escapeMarkdown(data.summary)}`);
    lines.push('');

    // 元数据统计
    lines.push('## Metadata');
    lines.push('');
    lines.push(`- **Original Messages:** ${data.originalMessages.length}`);
    lines.push(`- **Compacted Messages:** ${data.compactedMessages.length}`);
    lines.push(`- **Compression Ratio:** ${Math.round(compressionRatio * 100) / 100}%`);
    lines.push('');

    // 原始对话内容
    if (data.originalMessages.length > 0) {
      lines.push('## Original Conversation');
      lines.push('');

      for (const msg of data.originalMessages) {
        lines.push(this.formatMessage(msg));
        lines.push('');
      }
    }

    // 压缩后的对话
    if (data.compactedMessages.length > 0) {
      lines.push('## Compacted Conversation');
      lines.push('');

      for (const msg of data.compactedMessages) {
        lines.push(this.formatMessage(msg));
        lines.push('');
      }
    }

    return new TextEncoder().encode(lines.join('\n'));
  }

  /**
   * 格式化单条消息
   */
  private formatMessage(msg: ArchiveMessage): string {
    const emoji = this.getRoleEmoji(msg.role);
    const roleName = this.getRoleName(msg.role);
    const lines: string[] = [];

    lines.push(`### ${emoji} ${roleName}`);
    lines.push('');
    lines.push(this.escapeMarkdown(msg.content));

    return lines.join('\n');
  }

  /**
   * 获取角色图标
   */
  private getRoleEmoji(role: string): string {
    const emojiMap: Record<string, string> = {
      user: '👤',
      assistant: '🤖',
      system: '⚙️'
    };
    return emojiMap[role] || '💬';
  }

  /**
   * 获取角色名称
   */
  private getRoleName(role: string): string {
    const nameMap: Record<string, string> = {
      user: 'User',
      assistant: 'Assistant',
      system: 'System'
    };
    return nameMap[role] || role.charAt(0).toUpperCase() + role.slice(1);
  }

  /**
   * 转义 Markdown 特殊字符
   */
  private escapeMarkdown(text: string): string {
    // 不转义代码块和行内代码
    const codeBlockRegex = /```[\s\S]*?```/g;
    const inlineCodeRegex = /`[^`]+`/g;

    const parts: string[] = [];
    let lastIndex = 0;

    // 提取所有代码块和行内代码
    const allMatches = [
      ...text.matchAll(codeBlockRegex),
      ...text.matchAll(inlineCodeRegex)
    ].sort((a, b) => (a.index || 0) - (b.index || 0));

    allMatches.forEach(match => {
      const matchStart = match.index || 0;
      const matchEnd = matchStart + match[0].length;

      // 转义代码前的文本
      if (matchStart > lastIndex) {
        const beforeText = text.slice(lastIndex, matchStart);
        parts.push(this.escapeMarkdownInline(beforeText));
      }

      // 保留代码不变
      parts.push(match[0]);
      lastIndex = matchEnd;
    });

    // 转义剩余文本
    if (lastIndex < text.length) {
      parts.push(this.escapeMarkdownInline(text.slice(lastIndex)));
    }

    return parts.join('') || text;
  }

  /**
   * 转义行内 Markdown 特殊字符
   */
  private escapeMarkdownInline(text: string): string {
    // 转义但不影响已有格式的字符
    return text
      .replace(/(?<!\\)_/g, '\\_')  // 转义下划线（斜体）
      .replace(/(?<!\\)\*\*(?!\*)/g, '\\*\\*')  // 转义加粗
      .replace(/(?<!\\)\*(?!\*)/g, '\\*');  // 转义斜体
  }

  /**
   * 转义 YAML 特殊字符
   */
  private escapeYaml(text: string): string {
    // YAML 需要转义的字符
    return text
      .replace(/:/g, '\\:')
      .replace(/#/g, '\\#')
      .replace(/\n/g, ' ');
  }

  /**
   * 从 Markdown 解析（暂不实现）
   */
  async parse(input: Uint8Array): Promise<ArchiveData> {
    throw new Error('Markdown parsing not implemented (not required for current use case)');
  }

  getMimeType(): string {
    return 'text/markdown';
  }

  getExtension(): string {
    return '.md';
  }
}
