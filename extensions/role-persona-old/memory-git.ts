import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { config } from "./config.ts";

const LOCK_TIMEOUT_MS = 120_000;
const LOCK_STALE_MS = 300_000;
const LOCK_SLEEP = new Int32Array(new SharedArrayBuffer(4));

export interface MemoryWriteOptions {
  /** Require the file to still contain this exact content before writing. */
  expectedContent?: string | null;
  /** Require the file to still have this content hash before writing. */
  expectedHash?: string;
  /** Test-only override; normal callers use config.storage.rolesDir. */
  rolesDir?: string;
}

interface GitContext {
  repoRoot: string;
  gitDir: string;
  relativeFile: string;
}

function expandHome(path: string): string {
  return path.startsWith("~/")
    ? join(process.env.HOME || process.env.USERPROFILE || "", path.slice(2))
    : path;
}

function runGit(args: string[], cwd: string, env?: NodeJS.ProcessEnv): string {
  return execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf-8",
    env,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function gitRoot(rolesDir: string): string | null {
  try {
    return runGit(["rev-parse", "--show-toplevel"], rolesDir) || null;
  } catch {
    return null;
  }
}

function gitDir(repoRoot: string): string | null {
  try {
    const raw = runGit(["rev-parse", "--git-dir"], repoRoot);
    return realpathSync(resolve(repoRoot, raw));
  } catch {
    return null;
  }
}

function canonicalFilePath(filePath: string): string {
  const absolute = resolve(filePath);
  return join(realpathSync(dirname(absolute)), basename(absolute));
}

function resolveGitContext(filePath: string, rolesDirOverride?: string): GitContext | null {
  const configuredRolesDir = resolve(expandHome(rolesDirOverride || config.storage.rolesDir));
  if (!existsSync(configuredRolesDir)) return null;

  const rolesDir = realpathSync(configuredRolesDir);
  const root = gitRoot(rolesDir);
  if (!root) return null;

  const repoRoot = realpathSync(root);
  const gitDirectory = gitDir(repoRoot);
  if (!gitDirectory) return null;

  const absoluteFile = canonicalFilePath(filePath);
  const relativeFile = relative(repoRoot, absoluteFile);
  if (!relativeFile || relativeFile.startsWith("..") || relativeFile.split(/[\\/]/).includes("..")) {
    return null;
  }

  return { repoRoot, gitDir: gitDirectory, relativeFile };
}

function safeRoleName(rolePath: string): string {
  return basename(resolve(rolePath)).replace(/[^\w\-.\u4e00-\u9fff]+/g, "-");
}

function isWithin(basePath: string, targetPath: string): boolean {
  const rel = relative(resolve(basePath), resolve(targetPath));
  return rel === "" || (!rel.startsWith("..") && !rel.split(/[\\/]/).includes(".."));
}

function contentHash(content: string): string {
  return createHash("sha1").update(content).digest("hex");
}

function sleep(ms: number): void {
  Atomics.wait(LOCK_SLEEP, 0, 0, ms);
}

function withGitLock<T>(gitDirectory: string, callback: () => T): T {
  const lockPath = join(gitDirectory, "role-persona-memory.lock");
  const startedAt = Date.now();

  while (true) {
    try {
      mkdirSync(lockPath);
      break;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") throw error;

      try {
        if (Date.now() - statSync(lockPath).mtimeMs > LOCK_STALE_MS) {
          rmSync(lockPath, { recursive: true, force: true });
          continue;
        }
      } catch {
        // The owner may be replacing or releasing the lock; retry.
      }

      if (Date.now() - startedAt >= LOCK_TIMEOUT_MS) {
        throw new Error(`timed out waiting for ${lockPath}`);
      }
      sleep(25);
    }
  }

  try {
    return callback();
  } finally {
    try {
      rmSync(lockPath, { recursive: true, force: true });
    } catch {
      // Do not mask the memory or commit result with lock cleanup failure.
    }
  }
}

function hasMainIndexChanges(context: GitContext): boolean {
  try {
    execFileSync("git", ["-C", context.repoRoot, "diff", "--cached", "--quiet", "--", context.relativeFile], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    return false;
  } catch (error) {
    const status = (error as NodeJS.ErrnoException & { status?: number }).status;
    if (status === 1) return true;
    throw error;
  }
}

function syncMainIndex(context: GitContext): void {
  try {
    execFileSync("git", ["-C", context.repoRoot, "reset", "--quiet", "HEAD", "--", context.relativeFile], {
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    // HEAD already contains the committed file; index repair is best-effort.
  }
}

function commitLocked(context: GitContext, rolePath: string, action: string): boolean {
  if (hasMainIndexChanges(context)) {
    throw new Error(`memory file has pre-existing staged changes: ${context.relativeFile}`);
  }

  const tempDir = mkdtempSync(join(tmpdir(), "role-persona-git-index-"));
  const indexPath = join(tempDir, "index");
  const env = {
    ...process.env,
    GIT_INDEX_FILE: indexPath,
    GIT_TERMINAL_PROMPT: "0",
  };

  try {
    try {
      runGit(["read-tree", "HEAD"], context.repoRoot, env);
    } catch {
      // Allow first memory initialization in an unborn repository.
      runGit(["read-tree", "--empty"], context.repoRoot, env);
    }
    runGit(["add", "--", context.relativeFile], context.repoRoot, env);
    const staged = runGit(["diff", "--cached", "--name-only", "--", context.relativeFile], context.repoRoot, env);
    if (!staged) return true;

    const subject = `docs(${safeRoleName(rolePath)}): ${action}`.slice(0, 120);
    runGit(["commit", "-m", subject], context.repoRoot, env);
    syncMainIndex(context);
    return true;
  } finally {
    try {
      if (existsSync(indexPath)) unlinkSync(indexPath);
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Temporary index cleanup must not mask the commit result.
    }
  }
}

/**
 * Commit exactly one memory file without touching unrelated staged changes.
 * An alternate index and a repository lock protect the commit sequence.
 * Returns false only when the file is outside the configured roles repository.
 */
export function commitRoleMemoryFile(
  rolePath: string,
  filePath: string,
  action: string,
  options?: Pick<MemoryWriteOptions, "rolesDir">,
): boolean {
  const configuredRolesDir = resolve(expandHome(options?.rolesDir || config.storage.rolesDir));
  const context = resolveGitContext(filePath, options?.rolesDir);
  if (!context) {
    if (existsSync(configuredRolesDir) && isWithin(configuredRolesDir, rolePath)) {
      throw new Error(`configured roles directory is not a Git repository: ${configuredRolesDir}`);
    }
    return false;
  }

  return withGitLock(context.gitDir, () => {
    try {
      return commitLocked(context, rolePath, action);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`git commit failed for ${context.relativeFile}: ${detail}`);
    }
  });
}

function writeAtomic(filePath: string, content: string): void {
  const directory = dirname(filePath);
  const tempDir = mkdtempSync(join(directory, ".role-persona-memory-"));
  const tempFile = join(tempDir, basename(filePath));
  try {
    writeFileSync(tempFile, content, "utf-8");
    renameSync(tempFile, filePath);
  } finally {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Do not mask the write result with temporary-file cleanup failure.
    }
  }
}

function assertExpectedContent(filePath: string, options?: MemoryWriteOptions): void {
  if (!options || (options.expectedContent === undefined && options.expectedHash === undefined)) return;

  const current = existsSync(filePath) ? readFileSync(filePath, "utf-8") : null;
  if (options.expectedContent !== undefined && current !== options.expectedContent) {
    throw new Error(`memory changed concurrently: ${filePath}`);
  }
  if (options.expectedHash !== undefined && (current === null || contentHash(current) !== options.expectedHash)) {
    throw new Error(`memory changed concurrently: ${filePath}`);
  }
}

/**
 * Write a memory file and commit it. If committing fails, restore the previous
 * file contents only when no newer content replaced this write.
 */
export function writeCommittedMemoryFile(
  rolePath: string,
  filePath: string,
  content: string,
  action: string,
  options?: MemoryWriteOptions,
): void {
  const existed = existsSync(filePath);
  const previous = existed ? readFileSync(filePath, "utf-8") : null;
  const configuredRolesDir = resolve(expandHome(options?.rolesDir || config.storage.rolesDir));
  const context = resolveGitContext(filePath, options?.rolesDir);
  if (!context && existsSync(configuredRolesDir) && isWithin(configuredRolesDir, rolePath)) {
    throw new Error(`configured roles directory is not a Git repository: ${configuredRolesDir}`);
  }

  const write = (): void => {
    assertExpectedContent(filePath, options);
    writeAtomic(filePath, content);
    try {
      if (context) {
        try {
          const committed = commitLocked(context, rolePath, action);
          if (!committed) throw new Error(`memory file is outside the roles repository: ${filePath}`);
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          throw new Error(`git commit failed for ${context.relativeFile}: ${detail}`);
        }
      }
    } catch (error) {
      const current = existsSync(filePath) ? readFileSync(filePath, "utf-8") : null;
      if (current === content) {
        if (existed) writeAtomic(filePath, previous!);
        else if (existsSync(filePath)) unlinkSync(filePath);
      }
      throw error;
    }
  };

  if (context) {
    withGitLock(context.gitDir, write);
  } else {
    // Test fixtures and explicitly non-Git storage still retain file semantics.
    write();
  }
}

export { contentHash };
