/**
 * GitStorage Module
 *
 * Handles Git operations for checkpoint storage using ~/.pt/git directory.
 */

import type { CheckpointData, FileChange, GitStorageOptions, GitResult } from './types.js';
import { GIT_STORAGE_DIR, GIT_REF_BASE, generateCheckpointId, getCurrentTimestamp, formatTimestamp } from './utils.js';

/**
 * Git Storage - manages checkpoint storage in Git
 */
export class GitStorage {
  private gitDir: string;
  private workTree: string;
  private refBase: string;
  private execFn: (command: string, args: string[], options: any) => Promise<{ stdout: string; stderr: string; code: number }>;
  private cleanupLock?: (lockPath: string) => Promise<void>;

  constructor(
    workTree: string,
    execFn: (command: string, args: string[], options: any) => Promise<{ stdout: string; stderr: string; code: number }>,
    options: GitStorageOptions = {}
  ) {
    this.workTree = workTree;
    this.refBase = options.refBase || GIT_REF_BASE;
    this.execFn = execFn;
    this.cleanupLock = options.cleanupLock;

    // Generate unique git dir for this project
    this.gitDir = GIT_STORAGE_DIR(workTree);
  }

  /**
   * Initialize Git repository
   */
  async initialize(): Promise<void> {
    try {
      console.log('[Checkpoint V2] Initializing Git storage...');
      console.log(`[Checkpoint V2] Git dir: ${this.gitDir}`);
      console.log(`[Checkpoint V2] Work tree: ${this.workTree}`);
      console.log(`[Checkpoint V2] Project hash: ${this.gitDir.replace(`${process.env.HOME}/.pt/git/`, '')}`);

      // Create git directory if not exists (may fail if already exists)
      try {
        await this.git(['init']);
        console.log('[Checkpoint V2] Git repository initialized');
      } catch (error) {
        console.log('[Checkpoint V2] Git init failed (may already exist):', error);
        // Continue anyway - repository might already exist
      }

      // Configure user
      try {
        await this.git(['config', 'user.name', 'pi-checkpoint']);
        await this.git(['config', 'user.email', 'checkpoint@pi']);
        console.log('[Checkpoint V2] Git user config completed');
      } catch (error) {
        console.error('[Checkpoint V2] Failed to configure Git user:', error);
        throw new Error(`Failed to configure Git user: ${error}`);
      }

      console.log('[Checkpoint V2] Git storage initialization completed');
    } catch (error) {
      console.error('[Checkpoint V2] Git storage initialization failed:', error);
      throw new Error(`Failed to initialize Git storage: ${error}`);
    }
  }

  /**
   * Create a checkpoint snapshot
   */
  async createSnapshot(sessionId: string, turnIndex: number, files: FileChange[]): Promise<CheckpointData> {
    const timestamp = getCurrentTimestamp();
    const checkpointId = generateCheckpointId(sessionId, turnIndex);
    const isoTimestamp = formatTimestamp(timestamp);

    try {
      // Clean up lock file if it exists (synchronous)
      const lockPath = `${this.gitDir}/index.lock`;
      const { spawnSync } = require('child_process');
      
      try {
        if (require('fs').existsSync(lockPath)) {
          console.log('[Checkpoint V2] Cleaning lock file synchronously');
          spawnSync('rm', ['-f', lockPath]);
          console.log('[Checkpoint V2] Lock file removed');
        }
      } catch (error) {
        console.log(`[Checkpoint V2] Lock cleanup sync failed: ${error}`);
      }

      // Stage all files
      await this.git(['add', '-A']);

      // Create tree object
      const treeResult = await this.git(['write-tree']);
      const treeSha = treeResult.stdout.trim();

      // Create commit with metadata
      const metadata = {
        sessionId,
        turnIndex,
        timestamp: isoTimestamp,
        files,
      };

      const commitMessage = [
        `checkpoint:${checkpointId}`,
        `sessionId ${sessionId}`,
        `turn ${turnIndex}`,
        `timestamp ${isoTimestamp}`,
        `files ${JSON.stringify(metadata)}`,
      ].join('\n');

      const commitResult = await this.git(['commit-tree', treeSha], { input: commitMessage });
      const commitSha = commitResult.stdout.trim();

      // Update ref
      const refName = `${this.refBase}/${checkpointId}`;
      await this.git(['update-ref', refName, commitSha]);

      return {
        id: checkpointId,
        turnIndex,
        sessionId,
        timestamp,
        files,
        gitRef: commitSha,
      };
    } catch (error) {
      throw new Error(`Failed to create snapshot: ${error}`);
    }
  }

  /**
   * Restore files from a checkpoint
   */
  async restore(gitRef: string): Promise<void> {
    try {
      // Get commit SHA from ref
      const refResult = await this.git(['rev-parse', '--verify', gitRef]);
      const commitSha = refResult.stdout.trim();

      // Get commit message to check if it's a checkpoint
      const commitResult = await this.git(['cat-file', '-p', commitSha]);
      const commitLines = commitResult.stdout.split('\n');
      
      // Find worktree tree SHA
      const treeLine = commitLines.find(line => line.startsWith('tree '));
      if (!treeLine) {
        throw new Error('Invalid commit: no tree found');
      }
      const treeSha = treeLine.slice(5).trim();

      // Read tree into index and working tree
      await this.git(['read-tree', '--reset', '-u', treeSha]);

      // Clean untracked files (safe clean)
      await this.git(['clean', '-fd']);
    } catch (error) {
      throw new Error(`Failed to restore checkpoint: ${error}`);
    }
  }

  /**
   * Get checkpoint data from Git ref
   */
  async loadCheckpoint(refName: string): Promise<CheckpointData | null> {
    try {
      // Resolve ref to commit SHA
      const fullRef = `${this.refBase}/${refName}`;
      const refResult = await this.git(['rev-parse', '--verify', fullRef]);
      const commitSha = refResult.stdout.trim();

      // Get commit message
      const commitResult = await this.git(['cat-file', 'commit', commitSha]);
      const commitLines = commitResult.stdout.split('\n');

      // Parse metadata from commit message
      let checkpointId = '';
      let sessionId = '';
      let turnIndex = 0;
      let timestamp = 0;
      let files: FileChange[] = [];

      for (const line of commitLines) {
        if (line.startsWith('checkpoint:')) {
          checkpointId = line.slice(11);
        } else if (line.startsWith('sessionId ')) {
          sessionId = line.slice(11);
        } else if (line.startsWith('turn ')) {
          turnIndex = parseInt(line.slice(5), 10);
        } else if (line.startsWith('timestamp ')) {
          const isoTimestamp = line.slice(10);
          timestamp = new Date(isoTimestamp).getTime();
        } else if (line.startsWith('files ')) {
          try {
            const metadata = JSON.parse(line.slice(6));
            if (metadata.files) {
              files = metadata.files;
            }
          } catch {
            // Ignore parse errors
          }
        }
      }

      if (!checkpointId || !sessionId) {
        return null;
      }

      return {
        id: checkpointId,
        turnIndex,
        sessionId,
        timestamp,
        files,
        gitRef: commitSha,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * List all checkpoints
   */
  async listCheckpoints(sessionId?: string): Promise<CheckpointData[]> {
    try {
      // List all refs
      const refsResult = await this.git(['for-each-ref', '--format=%(refname)', this.refBase]);
      const refs = refsResult.stdout
        .split('\n')
        .filter(Boolean)
        .map(ref => ref.replace(`${this.refBase}/`, ''));

      // Load each checkpoint
      const checkpoints: CheckpointData[] = [];
      for (const ref of refs) {
        const checkpoint = await this.loadCheckpoint(ref);
        if (checkpoint) {
          if (!sessionId || checkpoint.sessionId === sessionId) {
            checkpoints.push(checkpoint);
          }
        }
      }

      // Sort by timestamp
      checkpoints.sort((a, b) => a.timestamp - b.timestamp);

      return checkpoints;
    } catch (error) {
      return [];
    }
  }

  /**
   * Delete a checkpoint
   */
  async deleteCheckpoint(refName: string): Promise<void> {
    try {
      const fullRef = `${this.refBase}/${refName}`;
      await this.git(['update-ref', '-d', fullRef]);
    } catch (error) {
      throw new Error(`Failed to delete checkpoint: ${error}`);
    }
  }

  /**
   * Get the latest checkpoint for a session
   */
  async getLatestCheckpoint(sessionId: string): Promise<CheckpointData | null> {
    const checkpoints = await this.listCheckpoints(sessionId);
    return checkpoints.length > 0 ? checkpoints[checkpoints.length - 1] : null;
  }

  /**
   * Get checkpoint by ID
   */
  async getCheckpointById(id: string): Promise<CheckpointData | null> {
    return await this.loadCheckpoint(id);
  }

  /**
   * Clean up old checkpoints (older than 30 days)
   */
  async cleanupOldCheckpoints(days: number = 30): Promise<number> {
    const cutoffTimestamp = getCurrentTimestamp() - (days * 24 * 60 * 60);
    const checkpoints = await this.listCheckpoints();

    let deleted = 0;
    for (const checkpoint of checkpoints) {
      if (checkpoint.timestamp < cutoffTimestamp) {
        await this.deleteCheckpoint(checkpoint.id);
        deleted++;
      }
    }

    return deleted;
  }

  /**
   * Execute a Git command
   */
  private async git(args: string[], options: any = {}): Promise<GitResult> {
    const fullArgs = [
      `--git-dir=${this.gitDir}`,
      `--work-tree=${this.workTree}`,
      ...args
    ];

    try {
      const result = await this.execFn('git', fullArgs, options);

      if (result.code !== 0 && !options.allowFailure) {
        throw new Error(result.stderr || `git ${args.join(' ')} failed with code ${result.code}`);
      }

      return result;
    } catch (error) {
      if (options.allowFailure) {
        return { stdout: '', stderr: String(error), code: 1 };
      }
      throw error;
    }
  }
}