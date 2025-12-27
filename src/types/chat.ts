/**
 * Extended Message types for IfAI Editor
 * Adds explore agent specific fields to the core Message type
 */

import type { ExplorePhase } from './agent';

// Module augmentation to extend the core Message type from ifainew-core
declare module 'ifainew-core' {
  export interface Message {
    // Explore agent specific fields
    exploreProgress?: {
      phase: 'scanning' | 'analyzing';
      currentPath?: string;
      progress: {
        total: number;
        scanned: number;
        byDirectory: Record<string, {
          total: number;
          scanned: number;
          status: 'pending' | 'scanning' | 'completed';
        }>;
      };
    };

    exploreFindings?: {
      summary: string;
      directories: Array<{
        path: string;
        fileCount: number;
        keyFiles: string[];
      }>;
      patterns?: Array<{
        type: 'import' | 'export' | 'class' | 'function';
        description: string;
      }>;
    };

    // Agent streaming state
    isAgentLive?: boolean;
  }
}

// Export explore types for components
export type { ExplorePhase, ExploreDirectory, ExploreFile } from './agent';

