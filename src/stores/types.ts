export enum GitStatus {
  Untracked = 'Untracked',
  Modified = 'Modified',
  Added = 'Added',
  Deleted = 'Deleted',
  Renamed = 'Renamed',
  TypeChange = 'TypeChange',
  Conflicted = 'Conflicted',
  Ignored = 'Ignored',
  Unmodified = 'Unmodified',
  Unknown = 'Unknown',
}

export interface FileNode {
  id: string;
  name: string;
  path: string;
  kind: 'file' | 'directory';
  children?: FileNode[];
  isExpanded?: boolean;
  gitStatus?: GitStatus;
}

export interface OpenedFile {
  id: string; // uuid or path
  path: string;
  name: string;
  content: string;
  isDirty: boolean;
  language: string;
  encoding: string; // 编码类型，如 'UTF-8', 'CP936'
  initialLine?: number;
  previewDiff?: {
    oldContent: string;
    newContent: string;
    toolCallId?: string;
  };
}

/**
 * 多工作区根目录
 * @since v0.3.0
 */
export interface WorkspaceRoot {
  id: string;
  path: string;
  name: string;
  fileTree: FileNode | null;
  isActive: boolean;
  indexedAt: Date | null;
}

/**
 * PIVO 工作流阶段
 * @since v0.3.7
 */
export type PivoStage = 'plan' | 'implement' | 'verify' | 'optimize' | 'idle';
