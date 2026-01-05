export interface Snippet {
  id: string;
  title: string;
  description?: string;
  code: string;
  language: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  isFavorite?: boolean;
}

export interface SnippetFilter {
  search?: string;
  language?: string;
  tags?: string[];
  isFavorite?: boolean;
}
