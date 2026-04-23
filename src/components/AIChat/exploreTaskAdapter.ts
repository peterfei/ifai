/**
 * Explore Task Adapter
 *
 * Adapts ExploreProgressData to TaskMetadata format
 * for integration with the TaskMonitor system.
 */

import type { ExploreProgressData } from './ExploreProgress';
import type { TaskMetadata, TaskCategory, TaskStatus, TaskPriority } from '../TaskMonitor/types';
import { generateTaskId } from '../../stores/taskStore';
import i18n from 'i18next';

/**
 * Convert ExploreProgress phase to TaskStatus
 */
function explorePhaseToStatus(phase: ExploreProgressData['phase']): TaskStatus {
  switch (phase) {
    case 'scanning':
      return 'running' as TaskStatus;
    case 'analyzing':
      return 'running' as TaskStatus;
    case 'completed':
      return 'success' as TaskStatus;
    default:
      return 'pending' as TaskStatus;
  }
}

/**
 * Convert ExploreProgressData to TaskMetadata
 */
export function exploreToTaskMetadata(
  exploreData: ExploreProgressData,
  existingTask?: TaskMetadata
): TaskMetadata {
  const now = Date.now();
  const status = explorePhaseToStatus(exploreData.phase);
  const isComplete = status === 'success';

  // Calculate progress
  const { total, scanned } = exploreData.progress;
  const percentage = total > 0 ? Math.min(100, Math.round((scanned / total) * 100)) : 0;

  // Calculate metrics (scan rate)
  const metrics = existingTask?.metrics || {};
  if (!isComplete && exploreData.scannedFiles && exploreData.scannedFiles.length > 0) {
    // Calculate scan rate (files/second) based on elapsed time
    if (existingTask?.startedAt) {
      const elapsed = (now - existingTask.startedAt) / 1000; // seconds
      if (elapsed > 0) {
        const rate = Math.round(exploreData.scannedFiles.length / elapsed);
        metrics.speed = rate;
      }
    }

    // Calculate ETA
    if (metrics.speed && metrics.speed > 0) {
      const remainingFiles = (total - scanned) * 10; // Estimate 10 files per directory
      metrics.eta = Math.round((remainingFiles / metrics.speed) * 1000);
    }
  }

  // Generate title based on phase and progress
  const getTitle = () => {
    if (isComplete) {
      return i18n.t('exploreTaskAdapter.scanComplete', { count: scannedFilesCount });
    }
    if (exploreData.phase === 'analyzing') {
      return i18n.t('exploreTaskAdapter.processingResults');
    }
    // Always show project scan title with progress
    return i18n.t('exploreTaskAdapter.scanningProject', { scanned, total });
  };

  const scannedFilesCount = exploreData.scannedFiles?.length || 0;

  // Generate description based on phase
  const getDescription = () => {
    if (isComplete) {
      return i18n.t('exploreTaskAdapter.scanFinished', { total });
    }
    if (exploreData.phase === 'analyzing') {
      return i18n.t('exploreTaskAdapter.analyzingResults');
    }
    return exploreData.currentFile
      ? i18n.t('exploreTaskAdapter.currentFile', { file: exploreData.currentFile })
      : i18n.t('exploreTaskAdapter.scanningDirectories', { total });
  };

  return {
    id: existingTask?.id || generateTaskId(),
    title: getTitle(),
    description: getDescription(),
    category: 'scan' as TaskCategory,
    status,
    priority: 'normal' as TaskPriority,
    icon: '🔍',

    // Timing
    createdAt: existingTask?.createdAt || now,
    startedAt: existingTask?.startedAt || (status === 'running' ? now : undefined),
    completedAt: isComplete ? now : existingTask?.completedAt,
    estimatedDuration: existingTask?.estimatedDuration,

    // Progress
    progress: {
      current: scanned,
      total,
      percentage,
    },

    // Metrics
    metrics,

    // Store explore data for custom rendering
    data: {
      exploreData,
      currentFile: exploreData.currentFile,
      currentPath: exploreData.currentPath,
      scannedFiles: exploreData.scannedFiles || [],
      phase: exploreData.phase,
    },
  };
}

/**
 * Update task from explore progress
 */
export function updateExploreTask(
  exploreData: ExploreProgressData,
  existingTask: TaskMetadata
): TaskMetadata {
  return exploreToTaskMetadata(exploreData, existingTask);
}

/**
 * Create explore task from initial data
 */
export function createExploreTask(exploreData: ExploreProgressData): TaskMetadata {
  return exploreToTaskMetadata(exploreData);
}
