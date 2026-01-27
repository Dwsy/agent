/**
 * CheckpointManager Module
 *
 * Manages checkpoint state, undo/redo stack, and history.
 */

import type { CheckpointData, CheckpointState, FileChange } from './types.js';
import { generateCheckpointId, getCurrentTimestamp } from './utils.js';

/**
 * Checkpoint Manager - manages checkpoint state and undo/redo
 */
export class CheckpointManager {
  private state: CheckpointState;

  constructor() {
    this.state = {
      currentTurnIndex: 0,
      history: [],
      redoStack: [],  // Stores checkpoints that were undone (for redo)
      undoStack: [],  // Stores checkpoints that were redone (for undo again)
    };
  }

  /**
   * Create a new checkpoint
   */
  createCheckpoint(
    turnIndex: number,
    sessionId: string,
    files: FileChange[],
    gitRef: string
  ): CheckpointData {
    const timestamp = getCurrentTimestamp();
    const checkpointId = generateCheckpointId(sessionId, turnIndex);

    const checkpoint: CheckpointData = {
      id: checkpointId,
      turnIndex,
      sessionId,
      timestamp,
      files,
      gitRef,
    };

    // Add to history
    this.state.history.push(checkpoint);

    // Update current turn index
    this.state.currentTurnIndex = turnIndex;

    // Clear redo stack (new action clears redo history)
    this.state.redoStack = [];

    return checkpoint;
  }

  /**
   * Undo to previous checkpoint
   */
  undo(): CheckpointData | null {
    // Check if undo is possible
    if (this.state.history.length <= 1) {
      return null;
    }

    // Remove current checkpoint from history
    const current = this.state.history.pop()!;

    // Push to undo stack for potential redo
    this.state.undoStack.push(current);

    // Update turn index
    const previous = this.state.history[this.state.history.length - 1];
    if (previous) {
      this.state.currentTurnIndex = previous.turnIndex;
    }

    return previous;
  }

  /**
   * Redo to next checkpoint
   */
  redo(): CheckpointData | null {
    // Check if redo is possible
    if (this.state.redoStack.length === 0) {
      return null;
    }

    // Pop from redo stack
    const checkpoint = this.state.redoStack.pop()!;

    // Push back to history
    this.state.history.push(checkpoint);

    // Update turn index
    this.state.currentTurnIndex = checkpoint.turnIndex;

    return checkpoint;
  }

  /**
   * Get current checkpoint state
   */
  getState(): CheckpointState {
    return {
      currentTurnIndex: this.state.currentTurnIndex,
      history: [...this.state.history],
      redoStack: [...this.state.redoStack],
      undoStack: [...this.state.undoStack],
    };
  }

  /**
   * Restore checkpoint state
   */
  setState(state: CheckpointState): void {
    this.state = {
      currentTurnIndex: state.currentTurnIndex,
      history: [...state.history],
      redoStack: [...state.redoStack],
      undoStack: [...state.undoStack],
    };
  }

  /**
   * Get checkpoint by ID
   */
  getCheckpoint(id: string): CheckpointData | undefined {
    return this.state.history.find(cp => cp.id === id);
  }

  /**
   * Get latest checkpoint
   */
  getLatestCheckpoint(): CheckpointData | undefined {
    return this.state.history[this.state.history.length - 1];
  }

  /**
   * Get checkpoint by turn index
   */
  getCheckpointByTurn(turnIndex: number): CheckpointData | undefined {
    return this.state.history.find(cp => cp.turnIndex === turnIndex);
  }

  /**
   * Get all checkpoints for a session
   */
  getCheckpointsForSession(sessionId: string): CheckpointData[] {
    return this.state.history.filter(cp => cp.sessionId === sessionId);
  }

  /**
   * Check if undo is available
   */
  canUndo(): boolean {
    return this.state.history.length > 1;
  }

  /**
   * Check if redo is available
   */
  canRedo(): boolean {
    return this.state.redoStack.length > 0;
  }

  /**
   * Get total number of checkpoints
   */
  getCheckpointCount(): number {
    return this.state.history.length;
  }

  /**
   * Get undo stack size
   */
  getUndoStackSize(): number {
    return this.state.redoStack.length;
  }

  /**
   * Get redo stack size
   */
  getRedoStackSize(): number {
    return this.state.undoStack.length;
  }

  /**
   * Clear all checkpoints
   */
  clear(): void {
    this.state = {
      currentTurnIndex: 0,
      history: [],
      redoStack: [],
      undoStack: [],
    };
  }

  /**
   * Remove checkpoint by ID
   */
  removeCheckpoint(id: string): boolean {
    const index = this.state.history.findIndex(cp => cp.id === id);
    if (index === -1) {
      return false;
    }

    this.state.history.splice(index, 1);

    // Also remove from redo/undo stacks
    this.state.redoStack = this.state.redoStack.filter(cp => cp.id !== id);
    this.state.undoStack = this.state.undoStack.filter(cp => cp.id !== id);

    return true;
  }

  /**
   * Get summary of all file changes across all checkpoints
   */
  getAllFileChanges(): FileChange[] {
    const allChanges = new Map<string, FileChange>();

    console.log('[CheckpointManager] getAllFileChanges - history length:', this.state.history.length);

    for (const checkpoint of this.state.history) {
      console.log('[CheckpointManager] getAllFileChanges - checkpoint:', checkpoint.id, 'files:', checkpoint.files);
      for (const change of checkpoint.files) {
        const existing = allChanges.get(change.path);

        if (existing) {
          allChanges.set(change.path, {
            ...existing,
            additions: (existing.additions || 0) + (change.additions || 0),
            deletions: (existing.deletions || 0) + (change.deletions || 0),
          });
        } else {
          allChanges.set(change.path, { ...change });
        }
      }
    }

    const result = Array.from(allChanges.values());
    console.log('[CheckpointManager] getAllFileChanges - result:', result);
    return result;
  }

  /**
   * Get checkpoints in a time range
   */
  getCheckpointsInRange(startTime: number, endTime: number): CheckpointData[] {
    return this.state.history.filter(
      cp => cp.timestamp >= startTime && cp.timestamp <= endTime
    );
  }

  /**
   * Get checkpoint before a given timestamp
   */
  getCheckpointBefore(timestamp: number): CheckpointData | undefined {
    for (let i = this.state.history.length - 1; i >= 0; i--) {
      if (this.state.history[i].timestamp < timestamp) {
        return this.state.history[i];
      }
    }
    return undefined;
  }

  /**
   * Get checkpoint after a given timestamp
   */
  getCheckpointAfter(timestamp: number): CheckpointData | undefined {
    return this.state.history.find(cp => cp.timestamp > timestamp);
  }

  /**
   * Check if a checkpoint exists
   */
  hasCheckpoint(id: string): boolean {
    return this.state.history.some(cp => cp.id === id);
  }

  /**
   * Get the first checkpoint
   */
  getFirstCheckpoint(): CheckpointData | undefined {
    return this.state.history[0];
  }

  /**
   * Get the last N checkpoints
   */
  getLastNCheckpoints(n: number): CheckpointData[] {
    return this.state.history.slice(-n);
  }

  /**
   * Serialize state for persistence
   */
  serialize(): string {
    return JSON.stringify(this.state);
  }

  /**
   * Deserialize state from persistence
   */
  deserialize(json: string): void {
    try {
      const state = JSON.parse(json) as CheckpointState;
      this.setState(state);
    } catch (error) {
      throw new Error(`Failed to deserialize state: ${error}`);
    }
  }

  /**
   * Validate state integrity
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check turn index consistency
    if (this.state.history.length > 0) {
      const latest = this.state.history[this.state.history.length - 1];
      if (latest.turnIndex !== this.state.currentTurnIndex) {
        errors.push(`Turn index mismatch: current=${this.state.currentTurnIndex}, latest=${latest.turnIndex}`);
      }
    }

    // Check for duplicate IDs
    const ids = new Set<string>();
    for (const cp of this.state.history) {
      if (ids.has(cp.id)) {
        errors.push(`Duplicate checkpoint ID: ${cp.id}`);
      }
      ids.add(cp.id);
    }

    // Check redo/undo stack consistency
    for (const cp of this.state.redoStack) {
      if (!ids.has(cp.id)) {
        errors.push(`Redo stack contains unknown checkpoint: ${cp.id}`);
      }
    }

    for (const cp of this.state.undoStack) {
      if (!ids.has(cp.id)) {
        errors.push(`Undo stack contains unknown checkpoint: ${cp.id}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}