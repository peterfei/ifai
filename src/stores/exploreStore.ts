/**
 * Explore UI State Management
 *
 * Manages the UI state for explore agent results, including:
 * - Collapsed/expanded sections
 * - User preferences
 * - State persistence to localStorage
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ============================================================================
// Types
// ============================================================================

export interface ExploreUIState {
  /**
   * Map of section IDs to their collapsed state
   * @example { 'overview': false, 'directories': true, 'patterns': true }
   */
  collapsedSections: Record<string, boolean>;

  /**
   * Toggle the collapsed state of a section
   * @param id - The section ID to toggle
   */
  toggleSection: (id: string) => void;

  /**
   * Reset all sections to their default collapsed state
   */
  reset: () => void;

  /**
   * Set the collapsed state of a specific section
   * @param id - The section ID
   * @param collapsed - Whether the section should be collapsed
   */
  setSectionCollapsed: (id: string, collapsed: boolean) => void;
}

// ============================================================================
// Default State
// ============================================================================

const DEFAULT_COLLAPSED_STATE: Record<string, boolean> = {
  'overview': false,      // Overview expanded by default
  'directories': false,   // Directories expanded by default
  'patterns': true,       // Patterns collapsed by default
  'progress-tree': true,  // Progress tree collapsed by default
};

// ============================================================================
// Store
// ============================================================================

/**
 * Explore UI state store with localStorage persistence
 */
export const useExploreStore = create<ExploreUIState>()(
  persist(
    (set) => ({
      collapsedSections: DEFAULT_COLLAPSED_STATE,

      toggleSection: (id) => set((state) => ({
        collapsedSections: {
          ...state.collapsedSections,
          [id]: !state.collapsedSections[id],
        },
      })),

      reset: () => set({
        collapsedSections: DEFAULT_COLLAPSED_STATE,
      }),

      setSectionCollapsed: (id, collapsed) => set((state) => ({
        collapsedSections: {
          ...state.collapsedSections,
          [id]: collapsed,
        },
      })),
    }),
    {
      name: 'explore-ui-storage',
      // Versioning for future migrations
      version: 1,
      migrate: (persistedState: any, version: number) => {
        console.log(`[ExploreStore] Migrating from version ${version} to 1`);
        return persistedState;
      },
    }
  )
);

// ============================================================================
// Hooks
// ============================================================================

/**
 * Hook to get the collapsed state of a specific section
 * @param id - The section ID
 * @returns Whether the section is collapsed
 */
export const useSectionCollapsed = (id: string): boolean => {
  return useExploreStore((state) => state.collapsedSections[id] ?? false);
};

/**
 * Hook to get the toggle function for a specific section
 * @param id - The section ID
 * @returns Function to toggle the section
 */
export const useToggleSection = (id: string): () => void => {
  const toggleSection = useExploreStore((state) => state.toggleSection);
  return () => toggleSection(id);
};
