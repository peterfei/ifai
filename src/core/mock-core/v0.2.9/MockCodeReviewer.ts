import { ICodeReviewer, ReviewIssue, DiffChunk } from '../../interfaces/v0.2.9/ICodeReviewer';

export class MockCodeReviewer implements ICodeReviewer {
  parseDiff(diffText: string): DiffChunk[] {
    // Mock: 简单检测文件名
    const match = diffText.match(/diff --git a\/(.+) b\/(.+)/);
    if (match) {
      return [{
        file: match[2], // 新文件名
        content: diffText
      }];
    }
    return [];
  }

  async review(diff: DiffChunk[]): Promise<ReviewIssue[]> {
    const issues: ReviewIssue[] = [];
    
    // Mock 规则：如果发现 "console.log" 就报错
    for (const chunk of diff) {
      if (chunk.content.includes('console.log')) {
        issues.push({
          rule: 'no-console',
          severity: 'warning',
          file: chunk.file,
          line: 0, // Mock line
          message: 'Avoid using console.log in production'
        });
      }
    }
    return issues;
  }
}
