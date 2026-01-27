/**
 * Commands Module
 *
 * Registers /undo, /redo, and /view commands.
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import type { UndoResult, RedoResult, ViewResult } from './types.js';
import { FileTracker } from './file-tracker.js';
import { CheckpointManager } from './checkpoint-manager.js';
import { GitStorage } from './git-storage.js';
import { FileChangesViewer } from './components/file-changes-viewer.js';

/**
 * Register all checkpoint commands
 */
export function registerCommands(
  pi: ExtensionAPI,
  fileTracker: FileTracker | null,
  checkpointManager: CheckpointManager | null,
  getGitStorage: () => GitStorage | null
): void {
  // Register /undo command
  pi.registerCommand('undo', {
    description: 'Undo last file changes',
    handler: async (_args: string, ctx: any) => {
      console.log('[Checkpoint V2] /undo command called');
      await handleUndo(pi, checkpointManager, getGitStorage, ctx);
    },
  });

  // Register /redo command
  pi.registerCommand('redo', {
    description: 'Redo last undone changes',
    handler: async (_args: string, ctx: any) => {
      console.log('[Checkpoint V2] /redo command called');
      await handleRedo(pi, checkpointManager, getGitStorage, ctx);
    },
  });

  // Register /changes command
  pi.registerCommand('changes', {
    description: 'View file changes in current session',
    handler: async (_args: string, ctx: any) => {
      console.log('[Checkpoint V2] /changes command called');
      await handleView(pi, fileTracker, checkpointManager, ctx);
    },
  });
}

/**
 * Handle /undo command
 */
async function handleUndo(
  pi: ExtensionAPI,
  checkpointManager: CheckpointManager | null,
  getGitStorage: () => GitStorage | null,
  ctx: any
): Promise<void> {
  try {
    // Check if modules are initialized
    if (!checkpointManager) {
      ctx.ui.notify('Checkpoint system not initialized. Please start a session first.', 'warning');
      return;
    }

    // Wait for agent to finish
    await ctx.waitForIdle();

    // Check if undo is possible
    if (!checkpointManager.canUndo()) {
      ctx.ui.notify('Nothing to undo', 'warning');
      return;
    }

    // Get previous checkpoint
    const previousCheckpoint = checkpointManager.undo();
    if (!previousCheckpoint) {
      ctx.ui.notify('No previous checkpoint found', 'warning');
      return;
    }

    // Get Git storage
    const gitStorage = getGitStorage();
    if (!gitStorage) {
      ctx.ui.notify('Git storage not available', 'error');
      return;
    }

    // Restore files from checkpoint
    await gitStorage.restore(previousCheckpoint.gitRef);

    // Persist state
    await pi.appendEntry('checkpoint-state', { checkpointState: checkpointManager.getState() });

    // Show RevertInfo component
    const { RevertInfo } = await import('./components/revert-info.js');

    await ctx.ui.custom<null>((tui, theme, _kb, done) => {
      return new RevertInfo(
        {
          revertedMessages: 1,
          files: previousCheckpoint.files,
          showHint: checkpointManager.canRedo(),
          theme,
        },
        tui,
        done
      );
    }, {
      overlay: true,
      overlayOptions: {
        anchor: 'top',
        width: '80%',
        maxHeight: 20,
      }
    });
  } catch (error) {
    ctx.ui.notify(
      `Undo failed: ${error instanceof Error ? error.message : String(error)}`,
      'error'
    );
  }
}

/**
 * Handle /redo command
 */
async function handleRedo(
  pi: ExtensionAPI,
  checkpointManager: CheckpointManager | null,
  getGitStorage: () => GitStorage | null,
  ctx: any
): Promise<void> {
  try {
    // Check if modules are initialized
    if (!checkpointManager) {
      ctx.ui.notify('Checkpoint system not initialized. Please start a session first.', 'warning');
      return;
    }

    // Wait for agent to finish
    await ctx.waitForIdle();

    // Check if redo is possible
    if (!checkpointManager.canRedo()) {
      ctx.ui.notify('Nothing to redo', 'warning');
      return;
    }

    // Get checkpoint to redo
    const redoCheckpoint = checkpointManager.redo();
    if (!redoCheckpoint) {
      ctx.ui.notify('No checkpoint to redo', 'warning');
      return;
    }

    // Get Git storage
    const gitStorage = getGitStorage();
    if (!gitStorage) {
      ctx.ui.notify('Git storage not available', 'error');
      return;
    }

    // Restore files from checkpoint
    await gitStorage.restore(redoCheckpoint.gitRef);

    // Persist state
    await pi.appendEntry('checkpoint-state', { checkpointState: checkpointManager.getState() });

    // Show RevertInfo component
    const { RevertInfo } = await import('./components/revert-info.js');

    await ctx.ui.custom<null>((tui, theme, _kb, done) => {
      return new RevertInfo(
        {
          revertedMessages: 1,
          files: redoCheckpoint.files,
          showHint: checkpointManager.canUndo(),
          theme,
        },
        tui,
        done
      );
    }, {
      overlay: true,
      overlayOptions: {
        anchor: 'top',
        width: '80%',
        maxHeight: 20,
      }
    });
  } catch (error) {
    ctx.ui.notify(
      `Redo failed: ${error instanceof Error ? error.message : String(error)}`,
      'error'
    );
  }
}

/**
 * Handle /view command
 */
async function handleView(
  pi: ExtensionAPI,
  fileTracker: FileTracker | null,
  checkpointManager: CheckpointManager | null,
  ctx: any
): Promise<void> {
  try {
    console.log('[Checkpoint V2] /changes command - handleView called');

    // Check if modules are initialized
    if (!fileTracker && !checkpointManager) {
      console.log('[Checkpoint V2] No fileTracker or checkpointManager');
      ctx.ui.notify('Checkpoint system not initialized. Please start a session first.', 'warning');
      return;
    }

    console.log('[Checkpoint V2] FileTracker exists:', !!fileTracker);
    console.log('[Checkpoint V2] CheckpointManager exists:', !!checkpointManager);

    // Wait for agent to finish
    await ctx.waitForIdle();

    // Debug: Check CheckpointManager state
    if (checkpointManager) {
      const state = checkpointManager.getState();
      console.log('[Checkpoint V2] CheckpointManager state:', {
        historyLength: state.history.length,
        redoStackLength: state.redoStack.length,
        undoStackLength: state.undoStack.length,
        checkpoints: state.history.map(cp => ({
          id: cp.id,
          turnIndex: cp.turnIndex,
          filesCount: cp.files.length,
        })),
      });
    }

    // Get file changes from current turn (fileTracker)
    const currentChanges = fileTracker ? fileTracker.getChanges() : [];
    console.log('[Checkpoint V2] Current turn changes:', currentChanges);

    // Get all file changes from current session (checkpointManager)
    const allChanges = checkpointManager ? checkpointManager.getAllFileChanges() : [];
    console.log('[Checkpoint V2] All session changes:', allChanges);

    // Use current turn changes if available, otherwise use session changes
    const changes = currentChanges.length > 0 ? currentChanges : allChanges;
    console.log('[Checkpoint V2] Final changes to display:', changes);

    if (changes.length === 0) {
      ctx.ui.notify('No file changes in current session', 'info');
      return;
    }

    // Show file list and diff
    const { FileChangesViewer } = await import('./components/file-changes-viewer.js');
    const { DiffViewer } = await import('./components/diff-viewer.js');

    // Dual view mode: file list -> diff details
    let selectedFile: FileChange | null = null;

    while (true) {
      // Show file list
      selectedFile = await ctx.ui.custom<FileChange | null>((tui, theme, done) => {
        return new FileChangesViewer(changes, theme, tui, done);
      }, {
        overlay: true,
        overlayOptions: {
          width: '80%',
          maxHeight: 20,
        }
      });

      // User cancelled selection
      if (!selectedFile) {
        break;
      }

      console.log('[Checkpoint V2] Selected file:', selectedFile.path);

      // Generate diff
      let diffText = '';
      try {
        // Get file diff
        const diffResult = await pi.exec('git', ['diff', '--', selectedFile.path], { cwd: ctx.cwd });
        diffText = diffResult.stdout;

        if (!diffText) {
          // File might be newly created
          diffText = `diff --git a/${selectedFile.path} b/${selectedFile.path}\nnew file mode 100644\n`;
        }
      } catch (error) {
        diffText = `Error generating diff: ${error}`;
      }

      // Show diff
      await ctx.ui.custom<null>((tui, theme, _kb, done) => {
        return new DiffViewer(
          {
            diff: diffText,
            theme,
            maxHeight: 30,
            showLineNumbers: true,
          },
          tui,
          done
        );
      }, {
        overlay: true,
        overlayOptions: {
          width: '100%',
          maxHeight: 30,
        }
      });

      // User closed diff, return to file list (loop continues)
    }

    console.log('[Checkpoint V2] File viewer closed');
  } catch (error) {
    console.error('[Checkpoint V2] /changes command error:', error);
    ctx.ui.notify(
      `View failed: ${error instanceof Error ? error.message : String(error)}`,
      'error'
    );
  }
}