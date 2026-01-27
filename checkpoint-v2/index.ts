/**
 * Checkpoint V2 Extension
 *
 * Provides undo/redo functionality for file changes with TUI visualization.
 * Uses ~/.pt/git for checkpoint storage.
 *
 * Features:
 * - Track file modifications (edit/write tools)
 * - Create checkpoints at each turn
 * - Undo/redo commands
 * - File changes viewer
 * - Diff viewer with syntax highlighting
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { FileTracker } from './file-tracker.js';
import { CheckpointManager } from './checkpoint-manager.js';
import { GitStorage } from './git-storage.js';
import { registerCommands } from './commands.js';
import type { ExtensionState } from './types.js';

export default function (pi: ExtensionAPI) {
  // Module instances
  let fileTracker: FileTracker | null = null;
  let checkpointManager: CheckpointManager | null = null;
  let gitStorage: GitStorage | null = null;
  let currentSessionId = '';

  // Global turn counter for unique turnIndex
  let globalTurnCounter = 0;

  // ============================================================================
  // Session Lifecycle
  // ============================================================================

  pi.on('session_start', async (_event: any, ctx: any) => {
    console.log('[Checkpoint V2] session_start triggered');
    console.log('[Checkpoint V2] cwd:', ctx.cwd);
    console.log('[Checkpoint V2] sessionId:', ctx.sessionManager.getHeader()?.id);

    // Initialize modules
    fileTracker = new FileTracker();
    checkpointManager = new CheckpointManager();
    currentSessionId = ctx.sessionManager.getHeader()?.id || '';

    console.log('[Checkpoint V2] FileTracker created');
    console.log('[Checkpoint V2] CheckpointManager created');

    // Load extension state from session
    await loadExtensionState(ctx);
    console.log('[Checkpoint V2] Extension state loaded');

    // Initialize Git storage (works in any directory, uses ~/.pt/git with project-specific hash)
    try {
      gitStorage = new GitStorage(ctx.cwd, (cmd, args, opts) => pi.exec(cmd, args, opts), {
        cleanupLock: async (lockPath: string) => {
          try {
            console.log(`[Checkpoint V2] Cleaning lock file: ${lockPath}`);
            await pi.exec('rm', ['-f', lockPath], { cwd: ctx.cwd });
            console.log(`[Checkpoint V2] Lock file removed`);
          } catch (error) {
            console.log(`[Checkpoint V2] Failed to remove lock file: ${error}`);
          }
        }
      });
      console.log('[Checkpoint V2] GitStorage instance created');
      await gitStorage.initialize();
      console.log('[Checkpoint V2] GitStorage initialized successfully');
    } catch (error) {
      console.error('[Checkpoint V2] Failed to initialize Git storage:', error);
      ctx.ui.notify(`Failed to initialize Git storage: ${error}`, 'error');
      gitStorage = null;
    }

    // Register commands after initialization
    console.log('[Checkpoint V2] Registering commands...');
    registerCommands(pi, fileTracker, checkpointManager, () => gitStorage);
    console.log('[Checkpoint V2] Commands registered');

    console.log('[Checkpoint V2] Initialization complete');
    console.log('[Checkpoint V2] CheckpointManager initialized:', !!checkpointManager);
    console.log('[Checkpoint V2] GitStorage initialized:', !!gitStorage);
  });

  pi.on('session_switch', async (_event: any, ctx: any) => {
    // Update session ID
    currentSessionId = ctx.sessionManager.getHeader()?.id || '';

    // Reload extension state
    await loadExtensionState(ctx);
  });

  pi.on('session_fork', async (_event: any, ctx: any) => {
    // Update session ID
    currentSessionId = ctx.sessionManager.getHeader()?.id || '';

    // Reload extension state
    await loadExtensionState(ctx);
  });

  // ============================================================================
  // Turn Lifecycle
  // ============================================================================

  pi.on('turn_start', async (event: any, ctx: any) => {
    if (!fileTracker) return;

    // Increment global turn counter
    globalTurnCounter++;

    // Clear file tracker for new turn
    fileTracker.clear();

    // Set repo root for path normalization
    fileTracker.setRepoRoot(ctx.cwd);
  });

  pi.on('turn_end', async (event: any, ctx: any) => {
    if (!fileTracker || !gitStorage || !checkpointManager) return;

    try {
      console.log('[Checkpoint V2] turn_end - creating checkpoint...');

      // Get file change statistics from git diff
      let fileChanges: FileChange[] = [];

      try {
        const diffResult = await pi.exec('git', ['diff', '--name-status'], { cwd: ctx.cwd });
        const diffLines = diffResult.stdout.trim().split('\n').filter(Boolean);

        console.log('[Checkpoint V2] turn_end - git diff lines:', diffLines);

        for (const line of diffLines) {
          const parts = line.split('\t');
          if (parts.length >= 2) {
            const status = parts[0];
            const path = parts[1];

            let action: 'created' | 'modified' | 'deleted' = 'modified';
            if (status === 'A') {
              action = 'created';
            } else if (status === 'D') {
              action = 'deleted';
            }

            fileChanges.push({ path, action });
          }
        }

        console.log('[Checkpoint V2] turn_end - file changes from git:', fileChanges);

        // Get file change statistics from git diff --numstat
        const statsResult = await pi.exec('git', ['diff', '--numstat'], { cwd: ctx.cwd });
        const stats = require('./utils.js').parseGitNumstat(statsResult.stdout);
        console.log('[Checkpoint V2] turn_end - git diff stats:', stats);

        // Merge stats into file changes
        const statsMap = new Map(stats.map(s => [s.path, s]));
        for (const change of fileChanges) {
          const stat = statsMap.get(change.path);
          if (stat) {
            change.additions = stat.additions;
            change.deletions = stat.deletions;
          }
        }
      } catch (diffError) {
        console.log('[Checkpoint V2] turn_end - failed to get git diff:', diffError);
        // Continue with empty changes
      }

      // Skip checkpoint creation if no changes
      if (fileChanges.length === 0) {
        console.log('[Checkpoint V2] turn_end - no changes, skipping checkpoint');
        return;
      }

      // Create checkpoint with file changes
      const checkpoint = await gitStorage.createSnapshot(
        currentSessionId,
        globalTurnCounter,
        fileChanges
      );
      console.log('[Checkpoint V2] turn_end - checkpoint created:', checkpoint);

      // Add to checkpoint manager
      checkpointManager.createCheckpoint(
        globalTurnCounter,
        currentSessionId,
        fileChanges,
        checkpoint.gitRef
      );
      console.log('[Checkpoint V2] turn_end - checkpoint added to manager');

      // Persist state
      await pi.appendEntry('checkpoint-state', { checkpointState: checkpointManager.getState() });
    } catch (error) {
      console.error('[Checkpoint V2] turn_end - failed to create checkpoint:', error);
      ctx.ui.notify(`Failed to create checkpoint: ${error}`, 'error');
    }
  });

  // ============================================================================
  // Tool Tracking
  // ============================================================================

  pi.on('tool_result', async (event: any, ctx: any) => {
    console.log('[Checkpoint V2] tool_result triggered:', event.toolName);

    if (!fileTracker) return;

    // Track file modifications from edit/write tools
    if (event.toolName === 'edit' || event.toolName === 'write') {
      const filePath = event.input.path as string;
      if (filePath) {
        console.log('[Checkpoint V2] Tracking file:', filePath);

        // Detect file action
        const action = fileTracker.detectFileAction(filePath);
        console.log('[Checkpoint V2] File action:', action);

        // Track file
        fileTracker.trackFile(filePath, action);
        console.log('[Checkpoint V2] Tracked changes:', fileTracker.getChanges());
      }
    }
  });

  // ============================================================================
  // Helper Functions
  // ============================================================================

  /**
   * Load extension state from session entries
   */
  async function loadExtensionState(ctx: any): Promise<void> {
    if (!checkpointManager) return;

    const entries = ctx.sessionManager.getEntries();
    const stateEntry = entries.find(
      (e: any) => e.type === 'custom' && e.customType === 'checkpoint-state'
    );

    console.log('[Checkpoint V2] loadExtensionState - entries:', entries.length);
    console.log('[Checkpoint V2] loadExtensionState - stateEntry:', !!stateEntry);

    if (stateEntry) {
      const state = stateEntry.data as ExtensionState;
      console.log('[Checkpoint V2] loadExtensionState - state:', state);
      checkpointManager.setState(state.checkpointState);
      console.log('[Checkpoint V2] loadExtensionState - state loaded');
    } else {
      console.log('[Checkpoint V2] loadExtensionState - no state entry found');
    }
  }

  /**
   * Save extension state to session
   */
  async function saveExtensionState(ctx: any): Promise<void> {
    if (!checkpointManager) return;

    const state: ExtensionState = {
      checkpointState: checkpointManager.getState(),
    };

    pi.appendEntry('checkpoint-state', state);
  }
}