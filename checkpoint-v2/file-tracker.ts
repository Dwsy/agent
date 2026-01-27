/**
 * FileTracker Module
 *
 * Tracks file modifications during a turn (edit/write tool calls).
 */

import { existsSync } from 'fs';
import { resolve as resolvePath } from 'path';
import type { FileChange, FileAction } from './types.js';
import {
  shouldIgnorePath,
  isInIgnoredDir,
  mergeFileChanges,
} from './utils.js';

/**
 * File Tracker - tracks file changes during a turn
 */
export class FileTracker {
  private changes = new Map<string, FileChange>();
  private repoRoot: string = '';

  /**
   * Set repository root path
   */
  setRepoRoot(root: string): void {
    this.repoRoot = root;
  }

  /**
   * Track a file modification
   */
  trackFile(path: string, action: FileAction): void {
    // Normalize path
    const normalizedPath = this.normalizePath(path);

    // Check if path should be ignored
    if (shouldIgnorePath(normalizedPath)) {
      return;
    }

    // Update or add file change
    const existing = this.changes.get(normalizedPath);

    if (existing) {
      // Merge with existing change
      this.changes.set(normalizedPath, {
        ...existing,
        action: this.mergeAction(existing.action, action),
      });
    } else {
      // Add new change
      this.changes.set(normalizedPath, {
        path: normalizedPath,
        action,
      });
    }
  }

  /**
   * Get all tracked changes
   */
  getChanges(): FileChange[] {
    return Array.from(this.changes.values());
  }

  /**
   * Clear all tracked changes
   */
  clear(): void {
    this.changes.clear();
  }

  /**
   * Check if any changes were tracked
   */
  hasChanges(): boolean {
    return this.changes.size > 0;
  }

  /**
   * Get number of tracked files
   */
  getFileCount(): number {
    return this.changes.size;
  }

  /**
   * Check if a specific file is tracked
   */
  hasFile(path: string): boolean {
    const normalizedPath = this.normalizePath(path);
    return this.changes.has(normalizedPath);
  }

  /**
   * Get change for a specific file
   */
  getFileChange(path: string): FileChange | undefined {
    const normalizedPath = this.normalizePath(path);
    return this.changes.get(normalizedPath);
  }

  /**
   * Normalize path to be relative to repository root
   */
  private normalizePath(path: string): string {
    if (!this.repoRoot) {
      return path.replace(/\\/g, '/');
    }

    const absolutePath = resolvePath(this.repoRoot, path);
    const relativePath = absolutePath.slice(this.repoRoot.length).replace(/^[\\/]/, '');
    return relativePath.replace(/\\/g, '/');
  }

  /**
   * Merge file actions
   */
  private mergeAction(existing: FileAction, newAction: FileAction): FileAction {
    // If any action is 'deleted', the file is deleted
    if (existing === 'deleted' || newAction === 'deleted') {
      return 'deleted';
    }

    // If any action is 'created', the file is created
    if (existing === 'created' || newAction === 'created') {
      return 'created';
    }

    // Otherwise, it's modified
    return 'modified';
  }

  /**
   * Detect file action based on file existence
   */
  detectFileAction(path: string): FileAction {
    const normalizedPath = this.normalizePath(path);
    const absolutePath = this.repoRoot
      ? resolvePath(this.repoRoot, normalizedPath)
      : resolvePath(path);

    const exists = existsSync(absolutePath);

    // Check if we have a previous change for this file
    const existingChange = this.changes.get(normalizedPath);

    // If file was previously deleted and now exists, it's re-created
    if (existingChange && existingChange.action === 'deleted' && exists) {
      return 'created';
    }

    // If file was previously created and still exists, it's modified
    if (existingChange && existingChange.action === 'created' && exists) {
      return 'modified';
    }

    // If file was previously modified and still exists, it's still modified
    if (existingChange && existingChange.action === 'modified' && exists) {
      return 'modified';
    }

    // New file that exists after tool execution
    if (!existingChange && exists) {
      return 'created';
    }

    // File was deleted (tool was 'write' or 'edit' with deletion)
    return 'deleted';
  }

  /**
   * Update file statistics (additions/deletions)
   */
  updateFileStats(path: string, additions: number, deletions: number): void {
    const normalizedPath = this.normalizePath(path);
    const existing = this.changes.get(normalizedPath);

    if (existing) {
      this.changes.set(normalizedPath, {
        ...existing,
        additions: (existing.additions || 0) + additions,
        deletions: (existing.deletions || 0) + deletions,
      });
    }
  }

  /**
   * Update file stats from git numstat output
   */
  updateFileStatsFromGit(stats: Array<{ path: string; additions: number; deletions: number }>): void {
    for (const stat of stats) {
      const normalizedPath = this.normalizePath(stat.path);
      const existing = this.changes.get(normalizedPath);

      if (existing) {
        this.changes.set(normalizedPath, {
          ...existing,
          additions: stat.additions,
          deletions: stat.deletions,
        });
      }
    }
  }

  /**
   * Get summary of changes
   */
  getSummary(): {
    totalFiles: number;
    created: number;
    modified: number;
    deleted: number;
    totalAdditions: number;
    totalDeletions: number;
  } {
    const changes = this.getChanges();
    const summary = {
      totalFiles: changes.length,
      created: 0,
      modified: 0,
      deleted: 0,
      totalAdditions: 0,
      totalDeletions: 0,
    };

    for (const change of changes) {
      if (change.action === 'created') {
        summary.created++;
      } else if (change.action === 'modified') {
        summary.modified++;
      } else if (change.action === 'deleted') {
        summary.deleted++;
      }
      summary.totalAdditions += change.additions || 0;
      summary.totalDeletions += change.deletions || 0;
    }

    return summary;
  }
}