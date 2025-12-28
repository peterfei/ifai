import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

/**
 * Project configuration parsed from `.ifai/IFAI.md` YAML frontmatter
 */
export interface ProjectConfig {
  /** Default language for this project (e.g., "zh-CN", "en-US") */
  default_language?: string;

  /** Project-specific AI provider settings */
  ai_provider_id?: string;

  /** Project-specific AI model */
  ai_model?: string;

  /** Whether RAG is enabled for this project */
  enable_rag?: boolean;

  /** Custom system prompt for this project */
  custom_system_prompt?: string;

  /** Custom instructions for LLM (user editable) */
  custom_instructions?: string;

  /** Project creation timestamp */
  created_at?: number;
}

interface ProjectConfigState {
  /** Raw IFAI.md content (including markdown notes) */
  content: string | null;

  /** Parsed configuration */
  config: ProjectConfig | null;

  /** Current project root path */
  projectRoot: string | null;

  /** Loading state */
  isLoading: boolean;

  /** Error state */
  error: string | null;

  /** Load IFAI.md content for a project (creates default if not exists) */
  loadConfig: (projectRoot: string) => Promise<string>;

  /** Parse configuration from IFAI.md content */
  parseConfig: (content: string) => Promise<ProjectConfig>;

  /** Save IFAI.md content */
  saveConfig: (content: string) => Promise<void>;

  /** Clear config (when project is closed) */
  clearConfig: () => void;

  /** Check if IFAI.md exists for a project */
  configExists: (projectRoot: string) => Promise<boolean>;
}

export const useProjectConfigStore = create<ProjectConfigState>((set, get) => ({
  content: null,
  config: null,
  projectRoot: null,
  isLoading: false,
  error: null,

  loadConfig: async (projectRoot: string) => {
    console.log('[ProjectConfig] Loading config for project:', projectRoot);
    set({ isLoading: true, error: null });

    try {
      const content = await invoke<string>('load_project_config', {
        projectRoot,
      });

      console.log('[ProjectConfig] Config content loaded, length:', content.length);

      // Parse the content
      const config = await invoke<ProjectConfig>('parse_project_config', { content });

      console.log('[ProjectConfig] Parsed config:', config);

      set({
        content,
        config,
        projectRoot,
        isLoading: false,
      });

      console.log('[ProjectConfig] Successfully loaded config for:', projectRoot);
      return content;
    } catch (e) {
      const error = String(e);
      console.error('[ProjectConfig] Failed to load config:', error);
      console.error('[ProjectConfig] Error details:', e);
      set({
        error,
        isLoading: false,
      });
      throw e;
    }
  },

  parseConfig: async (content: string) => {
    try {
      return await invoke<ProjectConfig>('parse_project_config', { content });
    } catch (e) {
      console.error('[ProjectConfig] Failed to parse config:', e);
      throw e;
    }
  },

  saveConfig: async (content: string) => {
    const { projectRoot } = get();

    if (!projectRoot) {
      throw new Error('No project loaded');
    }

    set({ isLoading: true, error: null });

    try {
      // Save the content
      await invoke('save_project_config', {
        projectRoot,
        content,
      });

      // Parse and update the config
      const config = await invoke<ProjectConfig>('parse_project_config', { content });

      set({
        content,
        config,
        isLoading: false,
      });

      console.log('[ProjectConfig] Saved config:', config);
    } catch (e) {
      const error = String(e);
      console.error('[ProjectConfig] Failed to save config:', error);
      set({
        error,
        isLoading: false,
      });
      throw e;
    }
  },

  clearConfig: () => {
    set({
      content: null,
      config: null,
      projectRoot: null,
      error: null,
    });
  },

  configExists: async (projectRoot: string) => {
    try {
      return await invoke<boolean>('project_config_exists', {
        projectRoot,
      });
    } catch (e) {
      console.error('[ProjectConfig] Failed to check config existence:', e);
      return false;
    }
  },
}));
