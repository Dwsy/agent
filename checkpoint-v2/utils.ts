/**
 * Checkpoint V2 Extension - Utility Functions and Constants
 */

import type { FileChange } from './types.js';

// ============================================================================
// Constants
// ============================================================================

/** Get Git storage directory for a project */
export const GIT_STORAGE_DIR = (projectPath: string): string => {
  const home = typeof process !== 'undefined' && process.env ? process.env.HOME || '' : '';
  const hash = require('crypto').createHash('md5').update(projectPath).digest('hex');
  return `${home}/.pt/git/${hash}`;
};

/** Git ref base for checkpoints */
export const GIT_REF_BASE = "refs/checkpoints";

/** Maximum file size to include in checkpoint (10 MiB) */
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Maximum number of files in a directory to include in checkpoint */
export const MAX_DIR_FILES = 200;

/** Directories to ignore when creating checkpoints */
export const IGNORED_DIRS: ReadonlySet<string> = new Set([
  "node_modules",
  ".venv",
  "venv",
  "env",
  ".env",
  "dist",
  "build",
  ".pytest_cache",
  ".mypy_cache",
  ".cache",
  ".tox",
  "__pycache__",
  ".git",
  ".pt",  // Don't include our own storage directory
]);

/** File extensions to ignore */
export const IGNORED_EXTENSIONS: ReadonlySet<string> = new Set([
  ".log",
  ".tmp",
  ".swp",
  ".swo",
  ".DS_Store",
]);

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if a path should be ignored based on directory name or extension
 */
export function shouldIgnorePath(path: string): boolean {
  const normalizedPath = path.replace(/\\/g, '/');
  const components = normalizedPath.split('/');

  // Check if any component is an ignored directory
  for (const component of components) {
    if (IGNORED_DIRS.has(component)) {
      return true;
    }
  }

  // Check file extension
  const ext = normalizedPath.split('.').pop();
  if (ext && IGNORED_EXTENSIONS.has(`.${ext}`)) {
    return true;
  }

  return false;
}

/**
 * Generate a unique checkpoint ID
 */
export function generateCheckpointId(sessionId: string, turnIndex: number): string {
  return `${sessionId}-turn-${turnIndex}-${Date.now()}`;
}

/**
 * Get current timestamp in milliseconds
 */
export function getCurrentTimestamp(): number {
  return Date.now();
}

/**
 * Format timestamp to human-readable string
 */
export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

/**
 * Check if a file path is within an ignored directory
 */
export function isInIgnoredDir(path: string): boolean {
  const normalizedPath = path.replace(/\\/g, '/');
  for (const dir of IGNORED_DIRS) {
    if (normalizedPath.includes(`/${dir}/`) || normalizedPath.startsWith(`${dir}/`)) {
      return true;
    }
  }
  return false;
}

/**
 * Merge file changes, combining additions/deletions for the same file
 */
export function mergeFileChanges(changes: FileChange[]): FileChange[] {
  const merged = new Map<string, FileChange>();

  for (const change of changes) {
    const existing = merged.get(change.path);

    if (existing) {
      // Combine additions/deletions
      merged.set(change.path, {
        ...existing,
        additions: (existing.additions || 0) + (change.additions || 0),
        deletions: (existing.deletions || 0) + (change.deletions || 0),
      });
    } else {
      merged.set(change.path, { ...change });
    }
  }

  return Array.from(merged.values());
}

/**
 * Parse git diff --numstat output
 */
export function parseGitNumstat(output: string): Array<{
  path: string;
  additions: number;
  deletions: number;
}> {
  const results: Array<{
    path: string;
    additions: number;
    deletions: number;
  }> = [];

  for (const line of output.split('\n')) {
    if (!line.trim()) continue;

    const parts = line.split(/\s+/);
    if (parts.length >= 3) {
      const additions = parseInt(parts[0], 10) || 0;
      const deletions = parseInt(parts[1], 10) || 0;
      const path = parts.slice(2).join(' ');
      results.push({ path, additions, deletions });
    }
  }

  return results;
}