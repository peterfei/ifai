export interface FileNode {
  id: string;
  name: string;
  path: string;
  kind: 'file' | 'directory';
  children?: FileNode[];
  isExpanded?: boolean;
}

export interface OpenedFile {
  id: string; // uuid or path
  path: string;
  name: string;
  content: string;
  isDirty: boolean;
  language: string;
}
