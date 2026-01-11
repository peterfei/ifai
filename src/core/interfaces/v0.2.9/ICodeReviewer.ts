export type IssueSeverity = 'error' | 'warning' | 'info';

export interface ReviewIssue {
  rule: string;
  severity: IssueSeverity;
  file: string;
  line: number;
  message: string;
  suggestion?: string;
}

export interface DiffChunk {
  file: string;
  content: string; // 简化版，实际可能结构更复杂
}

export interface ICodeReviewer {
  /**
   * 解析 Git Diff 文本
   */
  parseDiff(diffText: string): DiffChunk[];

  /**
   * 执行审查规则
   */
  review(diff: DiffChunk[]): Promise<ReviewIssue[]>;
}
