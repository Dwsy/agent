/**
 * Checkpoint V2 Extension - Type Definitions
 *
 * Core types for file tracking, checkpoint management, and undo/redo functionality.
 */

// ============================================================================
// File Change Types
// ============================================================================

/**
 * File action types
 */
export type FileAction = 'created' | 'modified' | 'deleted';

/**
 * Represents a single file change in a checkpoint
 */
export interface FileChange {
  /** File path relative to repository root */
  path: string;
  /** Type of change */
  action: FileAction;
  /** Number of lines added (for modified/deleted files) */
  additions?: number;
  /** Number of lines removed (for modified/deleted files) */
  deletions?: number;
}

// ============================================================================
// Checkpoint Types
// ============================================================================

/**
 * Checkpoint data stored in Git refs
 */
export interface CheckpointData {
  /** Unique checkpoint ID */
  id: string;
  /** Turn index when checkpoint was created */
  turnIndex: number;
  /** Session ID */
  sessionId: string;
  /** Creation timestamp in milliseconds */
  timestamp: number;
  /** Files changed in this checkpoint */
  files: FileChange[];
  /** Git reference (commit/tree SHA) */
  gitRef: string;
}

/**
 * Checkpoint state managed by CheckpointManager
 */
export interface CheckpointState {
  /** Current turn index */
  currentTurnIndex: number;
  /** Complete checkpoint history */
  history: CheckpointData[];
  /** Redo stack (checkpoints that were undone, available for redo) */
  redoStack: CheckpointData[];
  /** Undo stack (checkpoints that were redone, available for undo again) */
  undoStack: CheckpointData[];
}

// ============================================================================
// Extension State Types
// ============================================================================

/**
 * Extension state persisted to session via pi.appendEntry()
 */
export interface ExtensionState {
  /** Checkpoint state */
  checkpointState: CheckpointState;
  /** Last checkpoint ID */
  lastCheckpointId?: string;
}

// ============================================================================
// Git Storage Types
// ============================================================================

/**
 * Git storage options
 */
export interface GitStorageOptions {
  /** Git directory path (default: ~/.pt/git) */
  gitDir?: string;
  /** Work tree path (repository root) */
  workTree?: string;
  /** Ref base (default: refs/checkpoints) */
  refBase?: string;
  /** Lock file cleanup function */
  cleanupLock?: (lockPath: string) => Promise<void>;
}

/**
 * Git operation result
 */
export interface GitResult {
  /** Command output */
  stdout: string;
  /** Command error output */
  stderr: string;
  /** Exit code */
  code: number;
}

// ============================================================================
// Command Types
// ============================================================================

/**
 * Undo command result
 */
export interface UndoResult {
  /** Number of files restored */
  filesRestored: number;
  /** Checkpoint ID that was restored */
  checkpointId: string;
}

/**
 * Redo command result
 */
export interface RedoResult {
  /** Number of files restored */
  filesRestored: number;
  /** Checkpoint ID that was restored */
  checkpointId: string;
}

/**
 * View command result
 */
export interface ViewResult {
  /** Total files changed */
  totalFiles: number;
  /** Total additions */
  totalAdditions: number;
  /** Total deletions */
  totalDeletions: number;
}

// ============================================================================
// Component Types
// ============================================================================

/**
 * File changes viewer options
 */
export interface FileChangesViewerOptions {
  /** Maximum visible items */
  maxVisible?: number;
  /** Show file statistics (additions/deletions) */
  showStats?: boolean;
}

/**
 * Revert info component options
 */
export interface RevertInfoOptions {
  /** Number of reverted messages */
  revertedMessages: number;
  /** Files changed */
  files: FileChange[];
  /** Show undo hint */
  showHint?: boolean;
  /** Theme for styling */
  theme?: any;
}

/**
 * Diff viewer options
 */
export interface DiffViewerOptions {
  /** Diff content */
  diff: string;
  /** Theme for styling */
  theme: any;
  /** Maximum height */
  maxHeight?: number;
  /** Show line numbers */
  showLineNumbers?: boolean;
}