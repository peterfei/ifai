/**
 * Task Monitor Type Definitions
 *
 * Industrial-grade task monitoring system types.
 */

// ============================================================================
// Enums
// ============================================================================

/**
 * Task category - determines display style and icon
 */
export enum TaskCategory {
  /** Scan - file search, code analysis */
  SCAN = 'scan',

  /** Build - compile, bundle */
  BUILD = 'build',

  /** Generation - AI generation, code writing */
  GENERATION = 'generation',

  /** Transfer - download, upload, sync */
  TRANSFER = 'transfer',

  /** Analysis - code analysis, metrics */
  ANALYSIS = 'analysis',

  /** Test - unit tests, integration tests, e2e */
  TEST = 'test',

  /** Deploy - deployment to servers */
  DEPLOY = 'deploy',

  /** Install - package installation, dependencies */
  INSTALL = 'install',

  /** Git - git operations (clone, pull, push) */
  GIT = 'git',

  /** Format - code formatting, linting */
  FORMAT = 'format',

  /** Document - documentation generation */
  DOCUMENT = 'document',

  /** Refactor - code refactoring operations */
  REFACTOR = 'refactor',

  /** Backup - backup and restore operations */
  BACKUP = 'backup',

  /** Cleanup - cache cleanup, temp files */
  CLEANUP = 'cleanup',

  /** Optimize - performance optimization */
  OPTIMIZE = 'optimize',

  /** Security - security scans, vulnerability checks */
  SECURITY = 'security',
}

/**
 * Task status - complete lifecycle
 */
export enum TaskStatus {
  /** Pending - not started yet */
  PENDING = 'pending',

  /** Running - currently executing */
  RUNNING = 'running',

  /** Paused - user paused */
  PAUSED = 'paused',

  /** Success - completed successfully */
  SUCCESS = 'success',

  /** Failed - error termination */
  FAILED = 'failed',

  /** Cancelled - user cancelled */
  CANCELLED = 'cancelled',
}

/**
 * Task priority
 */
export enum TaskPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent',
}

// ============================================================================
// Core Types
// ============================================================================

/**
 * Task progress information
 */
export interface TaskProgress {
  current: number;
  total: number;
  percentage: number;
}

/**
 * Task performance metrics
 */
export interface TaskMetrics {
  /** Speed rate (files/sec, MB/sec, etc.) */
  speed?: number;

  /** Estimated time remaining (milliseconds) */
  eta?: number;

  /** Resource usage */
  resources?: {
    cpu?: number;
    memory?: number;
  };
}

/**
 * Task action button
 */
export interface TaskAction {
  id: string;
  label: string;
  icon?: string;
  destructive?: boolean;
  disabled?: boolean;
  handler: () => void | Promise<void>;
}

/**
 * Task result data
 */
export interface TaskResult {
  summary?: string;
  output?: string;
  error?: Error;
  metrics?: Record<string, any>;
}

/**
 * Task metadata - complete task information
 */
export interface TaskMetadata {
  // Identification
  id: string;
  category: TaskCategory;
  status: TaskStatus;
  priority: TaskPriority;

  // Basic info
  title: string;
  description?: string;
  icon?: string;

  // Timing
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  estimatedDuration?: number;

  // Progress
  progress: TaskProgress;

  // Metrics
  metrics?: TaskMetrics;

  // Result
  result?: TaskResult;

  // Actions
  actions?: TaskAction[];

  // Logs
  logs?: LogEntry[];

  // Additional data
  data?: Record<string, any>;
}

// ============================================================================
// Filter & Query Types
// ============================================================================

/**
 * Task filter options
 */
export interface TaskFilter {
  status?: TaskStatus | 'all';
  category?: TaskCategory | 'all';
  priority?: TaskPriority | 'all';
  search?: string;
}

/**
 * Task sort options
 */
export interface TaskSort {
  field: 'createdAt' | 'startedAt' | 'priority' | 'progress';
  order: 'asc' | 'desc';
}

// ============================================================================
// Component Props Types
// ============================================================================

/**
 * Task card display mode
 */
export type TaskCardMode = 'compact' | 'normal' | 'detailed';

/**
 * Progress bar color theme
 */
export type ProgressBarColor = 'blue' | 'green' | 'orange' | 'red' | 'gray';

/**
 * Status badge size
 */
export type StatusBadgeSize = 'sm' | 'md' | 'lg';

// ============================================================================
// Log Types (for future use)
// ============================================================================

/**
 * Log entry level
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

/**
 * Log entry
 */
export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  message: string;
  data?: any;
}

// ============================================================================
// Helper Types
// ============================================================================

/**
 * Task update (partial metadata)
 */
export type TaskUpdate = Partial<Omit<TaskMetadata, 'id'>>;

/**
 * Task store state
 */
export interface TaskStoreState {
  tasks: Map<string, TaskMetadata>;
  activeTaskId: string | null;
  filter: TaskFilter;
  history: TaskMetadata[];
  maxHistorySize: number;
}

/**
 * Task store actions
 */
export interface TaskStoreActions {
  // Task operations
  addTask: (task: TaskMetadata) => void;
  updateTask: (id: string, updates: TaskUpdate) => void;
  removeTask: (id: string) => void;

  // Query
  getTask: (id: string) => TaskMetadata | undefined;
  getTasksByStatus: (status: TaskStatus) => TaskMetadata[];
  getTasksByCategory: (category: TaskCategory) => TaskMetadata[];
  getAllTasks: () => TaskMetadata[];
  getFilteredTasks: () => TaskMetadata[];

  // Batch operations
  clearCompleted: () => void;
  cancelAll: () => void;

  // Filter
  setFilter: (filter: TaskFilter) => void;
  setActiveTask: (id: string | null) => void;

  // History
  clearHistory: () => void;
  getHistory: () => TaskMetadata[];
}

/**
 * Complete task store type
 */
export type TaskStore = TaskStoreState & TaskStoreActions;
