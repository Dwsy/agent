/**
 * Tests for checkpoint hook git operations
 *
 * Run with: npm test
 */

import { mkdtemp, rm, writeFile, readFile, mkdir } from "fs/promises";
import { readdirSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  git,
  getRepoRoot,
  createCheckpoint,
  restoreCheckpoint,
  shouldIgnoreForSnapshot,
  IGNORED_DIR_NAMES,
  MAX_UNTRACKED_FILE_SIZE,
  MAX_UNTRACKED_DIR_FILES,
  isLargeFile,
  isLargeDirectory,
} from "../checkpoint-core.js";

// ============================================================================
// Test utilities
// ============================================================================

const listFiles = (cwd: string) =>
  readdirSync(cwd).filter((f) => !f.startsWith("."));

const getIndexFiles = async (cwd: string) =>
  (await git("ls-files", cwd)).split("\n").filter(Boolean);

// ============================================================================
// Test runner
// ============================================================================

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const tests: Array<{ name: string; fn: () => Promise<void> }> = [];

function test(name: string, fn: () => Promise<void>) {
  tests.push({ name, fn });
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function assertArrayEquals(
  actual: string[],
  expected: string[],
  message: string
) {
  const sortedActual = [...actual].sort();
  const sortedExpected = [...expected].sort();
  assert(
    sortedActual.length === sortedExpected.length &&
      sortedActual.every((v, i) => v === sortedExpected[i]),
    `${message}\nExpected: [${sortedExpected.join(", ")}]\nActual: [${sortedActual.join(", ")}]`
  );
}

/** Create test repo, run test, cleanup */
async function withTestRepo(
  fn: (dir: string, root: string) => Promise<void>
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "checkpoint-test-"));
  try {
    await git("init", dir);
    await git("config user.email test@test.com", dir);
    await git("config user.name Test", dir);

    // Create initial commit
    await writeFile(join(dir, "initial.txt"), "initial content");
    await git("add .", dir);
    await git("commit -m 'initial'", dir);

    const root = await getRepoRoot(dir);
    await fn(dir, root);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// ============================================================================
// Tests
// ============================================================================

test("restore: empty worktree checkpoint removes all files", () =>
  withTestRepo(async (dir, root) => {
    // Create checkpoint with empty worktree (delete all files)
    await rm(join(dir, "initial.txt"));
    const cp = await createCheckpoint(root, "empty-test", 0, "session-1");

    // Mess up state - add files back
    await writeFile(join(dir, "initial.txt"), "back");
    await writeFile(join(dir, "extra.txt"), "extra");
    await git("add .", dir);

    // Restore
    await restoreCheckpoint(root, cp);

    // Verify empty
    assertArrayEquals(listFiles(dir), [], "Working tree should be empty");
  }));

test("restore: staged file is restored correctly", () =>
  withTestRepo(async (dir, root) => {
    // Stage a new file (but don't commit)
    await writeFile(join(dir, "staged.txt"), "staged content");
    await git("add staged.txt", dir);

    const cp = await createCheckpoint(root, "staged-test", 0, "session-1");

    // Mess up - remove the file
    await rm(join(dir, "staged.txt"));
    await git("reset HEAD", dir);

    // Restore
    await restoreCheckpoint(root, cp);

    // Verify file is back and staged
    assert(listFiles(dir).includes("staged.txt"), "staged.txt should exist");
    assert(
      (await getIndexFiles(dir)).includes("staged.txt"),
      "staged.txt should be in index"
    );
    assert(
      (await readFile(join(dir, "staged.txt"), "utf-8")) === "staged content",
      "Content should match"
    );
  }));

test("restore: unstaged delete is preserved", () =>
  withTestRepo(async (dir, root) => {
    // Delete initial.txt but don't stage the deletion
    await rm(join(dir, "initial.txt"));

    // Add a new untracked file
    await writeFile(join(dir, "new.txt"), "new content");

    const cp = await createCheckpoint(root, "delete-test", 0, "session-1");

    // Mess up - restore initial.txt
    await git("checkout -- initial.txt", dir);
    await rm(join(dir, "new.txt"));

    // Restore
    await restoreCheckpoint(root, cp);

    // Verify: initial.txt should NOT exist, new.txt should exist
    const files = listFiles(dir);
    assert(!files.includes("initial.txt"), "initial.txt should NOT exist");
    assert(files.includes("new.txt"), "new.txt should exist");

    // Index should still have initial.txt (it was staged before deletion)
    assert(
      (await getIndexFiles(dir)).includes("initial.txt"),
      "initial.txt should be in index"
    );
  }));

test("restore: untracked files are restored", () =>
  withTestRepo(async (dir, root) => {
    // Add untracked files
    await writeFile(join(dir, "untracked1.txt"), "content1");
    await writeFile(join(dir, "untracked2.txt"), "content2");

    const cp = await createCheckpoint(root, "untracked-test", 0, "session-1");

    // Mess up - remove them
    await rm(join(dir, "untracked1.txt"));
    await rm(join(dir, "untracked2.txt"));

    // Restore
    await restoreCheckpoint(root, cp);

    // Verify files are back
    const files = listFiles(dir);
    assert(files.includes("untracked1.txt"), "untracked1.txt should exist");
    assert(files.includes("untracked2.txt"), "untracked2.txt should exist");
  }));

test("restore: extra untracked files are removed", () =>
  withTestRepo(async (dir, root) => {
    const cp = await createCheckpoint(root, "extra-test", 0, "session-1");

    // Add extra files after checkpoint
    await writeFile(join(dir, "extra1.txt"), "extra1");
    await writeFile(join(dir, "extra2.txt"), "extra2");

    // Restore
    await restoreCheckpoint(root, cp);

    // Verify extra files are gone
    const files = listFiles(dir);
    assert(!files.includes("extra1.txt"), "extra1.txt should NOT exist");
    assert(!files.includes("extra2.txt"), "extra2.txt should NOT exist");
    assert(files.includes("initial.txt"), "initial.txt should exist");
  }));

test("restore: modified untracked file content is restored", () =>
  withTestRepo(async (dir, root) => {
    // Add untracked file with specific content
    await writeFile(join(dir, "untracked.txt"), "original content");

    const cp = await createCheckpoint(root, "untracked-modify-test", 0, "session-1");

    // Modify the untracked file
    await writeFile(join(dir, "untracked.txt"), "modified content");

    // Restore
    await restoreCheckpoint(root, cp);

    // Verify original content is back
    assert(
      (await readFile(join(dir, "untracked.txt"), "utf-8")) === "original content",
      "Untracked file content should be restored to original"
    );
  }));

test("restore: modified file content is restored", () =>
  withTestRepo(async (dir, root) => {
    // Modify file
    await writeFile(join(dir, "initial.txt"), "modified content");

    const cp = await createCheckpoint(root, "modify-test", 0, "session-1");

    // Change it again
    await writeFile(join(dir, "initial.txt"), "changed again");

    // Restore
    await restoreCheckpoint(root, cp);

    // Verify content
    assert(
      (await readFile(join(dir, "initial.txt"), "utf-8")) === "modified content",
      "Content should be restored"
    );
  }));

test("restore: subdirectories are handled correctly", () =>
  withTestRepo(async (dir, root) => {
    // Create subdirectory with files
    await mkdir(join(dir, "subdir"));
    await writeFile(join(dir, "subdir", "file.txt"), "subdir content");

    const cp = await createCheckpoint(root, "subdir-test", 0, "session-1");

    // Remove subdir
    await rm(join(dir, "subdir"), { recursive: true });

    // Restore
    await restoreCheckpoint(root, cp);

    // Verify subdir is back
    assert(
      (await readFile(join(dir, "subdir", "file.txt"), "utf-8")) ===
        "subdir content",
      "Subdir file should be restored"
    );
  }));

test("restore: file in HEAD but not in worktree is removed", () =>
  withTestRepo(async (dir, root) => {
    // This was the bug: initial.txt is in HEAD commit,
    // but we delete it (unstaged) before checkpoint.
    // After restore, it should NOT be in working tree.
    await rm(join(dir, "initial.txt"));

    const cp = await createCheckpoint(
      root,
      "head-not-worktree-test",
      0,
      "session-1"
    );

    // Mess up - restore the file
    await git("checkout -- initial.txt", dir);
    assert(listFiles(dir).includes("initial.txt"), "Setup: initial.txt should exist");

    // Restore
    await restoreCheckpoint(root, cp);

    // Verify: initial.txt should NOT exist (was deleted at checkpoint time)
    assert(
      !listFiles(dir).includes("initial.txt"),
      "initial.txt should NOT exist after restore"
    );
  }));

test("restore: complex state with mixed staged/unstaged/untracked", () =>
  withTestRepo(async (dir, root) => {
    // Complex state:
    // - initial.txt: modified and staged
    // - staged_new.txt: new file, staged
    // - unstaged_new.txt: new file, not staged
    // - to_delete.txt: will be deleted (unstaged)

    await writeFile(join(dir, "to_delete.txt"), "will delete");
    await git("add to_delete.txt", dir);
    await git("commit -m 'add to_delete'", dir);

    await writeFile(join(dir, "initial.txt"), "modified");
    await git("add initial.txt", dir);

    await writeFile(join(dir, "staged_new.txt"), "staged new");
    await git("add staged_new.txt", dir);

    await writeFile(join(dir, "unstaged_new.txt"), "unstaged new");

    await rm(join(dir, "to_delete.txt"));

    const cp = await createCheckpoint(root, "complex-test", 0, "session-1");

    // Mess everything up
    await git("reset --hard HEAD", dir);
    await writeFile(join(dir, "random.txt"), "random");

    // Restore
    await restoreCheckpoint(root, cp);

    // Verify working tree
    const files = listFiles(dir);
    assert(files.includes("initial.txt"), "initial.txt should exist");
    assert(files.includes("staged_new.txt"), "staged_new.txt should exist");
    assert(files.includes("unstaged_new.txt"), "unstaged_new.txt should exist");
    assert(!files.includes("to_delete.txt"), "to_delete.txt should NOT exist");
    assert(!files.includes("random.txt"), "random.txt should NOT exist");

    assert(
      (await readFile(join(dir, "initial.txt"), "utf-8")) === "modified",
      "initial.txt should have modified content"
    );

    // Verify index
    const indexFiles = await getIndexFiles(dir);
    assert(indexFiles.includes("initial.txt"), "initial.txt should be in index");
    assert(indexFiles.includes("staged_new.txt"), "staged_new.txt should be in index");
    assert(
      indexFiles.includes("to_delete.txt"),
      "to_delete.txt should be in index (staged before delete)"
    );
  }));

// ============================================================================
// Exclusion/filtering tests
// ============================================================================

test("shouldIgnoreForSnapshot: ignores node_modules at root", () =>
  Promise.resolve().then(() => {
    assert(
      shouldIgnoreForSnapshot("node_modules/package/index.js"),
      "Should ignore files in node_modules"
    );
  }));

test("shouldIgnoreForSnapshot: ignores nested node_modules", () =>
  Promise.resolve().then(() => {
    assert(
      shouldIgnoreForSnapshot("packages/app/node_modules/lodash/index.js"),
      "Should ignore files in nested node_modules"
    );
  }));

test("shouldIgnoreForSnapshot: ignores all known directories", () =>
  Promise.resolve().then(() => {
    for (const dir of IGNORED_DIR_NAMES) {
      assert(
        shouldIgnoreForSnapshot(`${dir}/file.txt`),
        `Should ignore files in ${dir}`
      );
      assert(
        shouldIgnoreForSnapshot(`foo/${dir}/bar.txt`),
        `Should ignore nested files in ${dir}`
      );
    }
  }));

test("shouldIgnoreForSnapshot: does not ignore regular paths", () =>
  Promise.resolve().then(() => {
    assert(
      !shouldIgnoreForSnapshot("src/index.ts"),
      "Should not ignore regular src file"
    );
    assert(
      !shouldIgnoreForSnapshot("lib/utils.js"),
      "Should not ignore regular lib file"
    );
    assert(
      !shouldIgnoreForSnapshot("my_node_modules/file.js"),
      "Should not ignore path with node_modules as substring"
    );
  }));

test("checkpoint: excludes node_modules from snapshot", () =>
  withTestRepo(async (dir, root) => {
    // Create node_modules directory (simulate npm install)
    await mkdir(join(dir, "node_modules"));
    await mkdir(join(dir, "node_modules", "lodash"));
    await writeFile(
      join(dir, "node_modules", "lodash", "index.js"),
      "module.exports = {};"
    );

    // Also create a regular source file
    await writeFile(join(dir, "src.ts"), "const x = 1;");

    const cp = await createCheckpoint(root, "exclude-test", 0, "session-1");

    // Verify that node_modules is tracked as pre-existing but excluded from tree
    // The preexistingUntrackedFiles should NOT include node_modules files
    // (they're filtered out because they're ignored)
    assert(
      !(cp.preexistingUntrackedFiles ?? []).some((f) =>
        f.includes("node_modules")
      ),
      "preexistingUntrackedFiles should not include node_modules"
    );

    // Now mess up the state and restore
    await writeFile(join(dir, "extra.txt"), "extra");
    await restoreCheckpoint(root, cp);

    // Verify node_modules still exists (wasn't deleted during restore)
    const files = listFiles(dir);
    assert(
      files.includes("node_modules"),
      "node_modules should still exist after restore"
    );
    assert(!files.includes("extra.txt"), "extra.txt should be removed");
  }));

test("restore: preserves pre-existing untracked files", () =>
  withTestRepo(async (dir, root) => {
    // Create an untracked file that exists before checkpoint
    await writeFile(join(dir, "local-config.txt"), "my local config");

    const cp = await createCheckpoint(root, "preserve-test", 0, "session-1");

    // Verify the file is tracked as pre-existing
    assert(
      (cp.preexistingUntrackedFiles ?? []).includes("local-config.txt"),
      "local-config.txt should be in preexistingUntrackedFiles"
    );

    // Add new files after checkpoint (these should be removed on restore)
    await writeFile(join(dir, "new-after-checkpoint.txt"), "new file");

    // Restore
    await restoreCheckpoint(root, cp);

    // Pre-existing untracked files should still exist
    const files = listFiles(dir);
    assert(
      files.includes("local-config.txt"),
      "Pre-existing untracked file should be preserved"
    );
    // New files should be removed
    assert(
      !files.includes("new-after-checkpoint.txt"),
      "New untracked file should be removed"
    );
  }));

test("restore: handles mixed pre-existing and new untracked files", () =>
  withTestRepo(async (dir, root) => {
    // Create pre-existing untracked files
    await writeFile(join(dir, "existing1.txt"), "existing 1");
    await writeFile(join(dir, "existing2.txt"), "existing 2");

    const cp = await createCheckpoint(root, "mixed-test", 0, "session-1");

    // Add new files and modify existing
    await writeFile(join(dir, "new1.txt"), "new 1");
    await writeFile(join(dir, "new2.txt"), "new 2");
    await writeFile(join(dir, "existing1.txt"), "modified"); // modify pre-existing

    // Restore
    await restoreCheckpoint(root, cp);

    const files = listFiles(dir);
    // Pre-existing should be preserved (content restored to original)
    assert(files.includes("existing1.txt"), "existing1.txt should exist");
    assert(files.includes("existing2.txt"), "existing2.txt should exist");
    assert(
      (await readFile(join(dir, "existing1.txt"), "utf-8")) === "existing 1",
      "existing1.txt content should be restored"
    );
    // New files should be removed
    assert(!files.includes("new1.txt"), "new1.txt should be removed");
    assert(!files.includes("new2.txt"), "new2.txt should be removed");
  }));

// ============================================================================
// Large file/directory filtering tests
// ============================================================================

test("isLargeFile: returns false for small files", () =>
  withTestRepo(async (dir, root) => {
    await writeFile(join(dir, "small.txt"), "small content");
    assert(!isLargeFile(root, "small.txt"), "Small file should not be large");
  }));

test("isLargeFile: returns true for files > 10 MiB", () =>
  withTestRepo(async (dir, root) => {
    // Create a file just over 10 MiB
    const largeContent = Buffer.alloc(MAX_UNTRACKED_FILE_SIZE + 1, "x");
    await writeFile(join(dir, "large.bin"), largeContent);
    assert(isLargeFile(root, "large.bin"), "File over 10 MiB should be large");
  }));

test("isLargeFile: returns false for files exactly at limit", () =>
  withTestRepo(async (dir, root) => {
    // Create a file exactly at 10 MiB
    const exactContent = Buffer.alloc(MAX_UNTRACKED_FILE_SIZE, "x");
    await writeFile(join(dir, "exact.bin"), exactContent);
    assert(!isLargeFile(root, "exact.bin"), "File exactly at 10 MiB should not be large");
  }));

test("isLargeDirectory: returns false for small directories", () =>
  withTestRepo(async (dir, root) => {
    await mkdir(join(dir, "smalldir"));
    for (let i = 0; i < 10; i++) {
      await writeFile(join(dir, "smalldir", `file${i}.txt`), `content ${i}`);
    }
    assert(!isLargeDirectory(root, "smalldir"), "Directory with 10 files should not be large");
  }));

test("isLargeDirectory: returns true for directories > 200 files", () =>
  withTestRepo(async (dir, root) => {
    await mkdir(join(dir, "largedir"));
    // Create 201 files (just over the limit)
    for (let i = 0; i < MAX_UNTRACKED_DIR_FILES + 1; i++) {
      await writeFile(join(dir, "largedir", `file${i}.txt`), `content ${i}`);
    }
    assert(isLargeDirectory(root, "largedir"), "Directory with 201 files should be large");
  }));

test("isLargeDirectory: returns false for directories just below the limit", () =>
  withTestRepo(async (dir, root) => {
    await mkdir(join(dir, "justbelow"));
    // Create one less than the limit
    for (let i = 0; i < MAX_UNTRACKED_DIR_FILES - 1; i++) {
      await writeFile(join(dir, "justbelow", `file${i}.txt`), `content ${i}`);
    }
    assert(
      !isLargeDirectory(root, "justbelow"),
      "Directory with 199 files should not be large"
    );
  }));

test("isLargeDirectory: returns true for directories exactly at the limit", () =>
  withTestRepo(async (dir, root) => {
    await mkdir(join(dir, "exactdir"));
    // Create exactly 200 files
    for (let i = 0; i < MAX_UNTRACKED_DIR_FILES; i++) {
      await writeFile(join(dir, "exactdir", `file${i}.txt`), `content ${i}`);
    }
    assert(
      isLargeDirectory(root, "exactdir"),
      "Directory with exactly 200 files should be large"
    );
  }));

test("checkpoint: excludes large files from snapshot", () =>
  withTestRepo(async (dir, root) => {
    // Create a large file (> 10 MiB)
    const largeContent = Buffer.alloc(MAX_UNTRACKED_FILE_SIZE + 1024, "x");
    await writeFile(join(dir, "large-file.bin"), largeContent);
    
    // Also create a regular file
    await writeFile(join(dir, "regular.txt"), "regular content");

    const cp = await createCheckpoint(root, "large-file-test", 0, "session-1");

    // Verify the large file is tracked as skipped
    assert(
      (cp.skippedLargeFiles ?? []).includes("large-file.bin"),
      "large-file.bin should be in skippedLargeFiles"
    );

    // Verify the regular file is tracked as pre-existing
    assert(
      (cp.preexistingUntrackedFiles ?? []).includes("regular.txt"),
      "regular.txt should be in preexistingUntrackedFiles"
    );

    // Large file should NOT be in preexistingUntrackedFiles
    assert(
      !(cp.preexistingUntrackedFiles ?? []).includes("large-file.bin"),
      "large-file.bin should NOT be in preexistingUntrackedFiles"
    );
  }));

test("checkpoint: excludes large untracked directories from snapshot", () =>
  withTestRepo(async (dir, root) => {
    // Create a large directory (>= 200 files) that is entirely untracked
    await mkdir(join(dir, "large-dir"));
    for (let i = 0; i < MAX_UNTRACKED_DIR_FILES; i++) {
      await writeFile(join(dir, "large-dir", `file${i}.txt`), `content ${i}`);
    }

    // Also create a regular file
    await writeFile(join(dir, "regular.txt"), "regular content");

    const cp = await createCheckpoint(root, "large-dir-test", 0, "session-1");

    // Verify the large directory is tracked as skipped
    assert(
      (cp.skippedLargeDirs ?? []).includes("large-dir"),
      "large-dir should be in skippedLargeDirs"
    );

    // Verify the regular file is tracked as pre-existing
    assert(
      (cp.preexistingUntrackedFiles ?? []).includes("regular.txt"),
      "regular.txt should be in preexistingUntrackedFiles"
    );

    // Files from large-dir should NOT be in preexistingUntrackedFiles
    assert(
      !(cp.preexistingUntrackedFiles ?? []).some((f) => f.startsWith("large-dir/")),
      "Files from large-dir should NOT be in preexistingUntrackedFiles"
    );
  }));

test("checkpoint: detects nested large untracked directories under tracked parents", () =>
  withTestRepo(async (dir, root) => {
    await mkdir(join(dir, "src"));
    await writeFile(join(dir, "src", "main.ts"), "console.log('hi');");
    await git("add src/main.ts", dir);
    await git("commit -m 'add src'", dir);

    const generatedDir = join(dir, "src", "generated", "cache");
    await mkdir(generatedDir, { recursive: true });
    for (let i = 0; i < MAX_UNTRACKED_DIR_FILES + 1; i++) {
      await writeFile(join(generatedDir, `file${i}.bin`), `data ${i}`);
    }

    const cp = await createCheckpoint(root, "nested-large-dir-test", 0, "session-1");

    assert(
      (cp.skippedLargeDirs ?? []).includes("src/generated/cache"),
      "Nested untracked directory should be skipped when it exceeds the threshold"
    );

    assert(
      !(cp.skippedLargeDirs ?? []).includes("src"),
      "Tracked parent directory should not be marked as large"
    );

    assert(
      !(cp.preexistingUntrackedFiles ?? []).some((f) =>
        f.startsWith("src/generated/cache/")
      ),
      "Files from nested large dir should NOT be in preexistingUntrackedFiles"
    );
  }));

test("checkpoint: skips large untracked directories even when tracked files exist", () =>
  withTestRepo(async (dir, root) => {
    await mkdir(join(dir, "big-tracked"));

    // Add a tracked file so we can verify it's still snapshotted.
    await writeFile(join(dir, "big-tracked", "tracked.txt"), "tracked");
    await git("add big-tracked/tracked.txt", dir);
    await git("commit -m 'add tracked file in big-tracked'", dir);

    // Modify tracked file so the snapshot captures a working-tree change.
    await writeFile(join(dir, "big-tracked", "tracked.txt"), "modified tracked");

    // Now create many untracked files in the same directory.
    for (let i = 0; i < MAX_UNTRACKED_DIR_FILES + 5; i++) {
      await writeFile(
        join(dir, "big-tracked", `u${i}.txt`),
        `untracked ${i}`
      );
    }

    const cp = await createCheckpoint(root, "big-tracked-test", 0, "session-1");

    assert(
      (cp.skippedLargeDirs ?? []).includes("big-tracked"),
      "big-tracked should be skipped when it contains many untracked files"
    );

    assert(
      !(cp.preexistingUntrackedFiles ?? []).some((f) => f.startsWith("big-tracked/u")),
      "Untracked files inside big-tracked should be excluded from preexistingUntrackedFiles"
    );

    // Mess up state
    await git("checkout -- big-tracked/tracked.txt", dir);

    // Restore
    await restoreCheckpoint(root, cp);

    assert(
      (await readFile(join(dir, "big-tracked", "tracked.txt"), "utf-8")) ===
        "modified tracked",
      "Tracked file inside big-tracked should be restored even when directory is skipped"
    );
  }));

test(
  "restore: tracked directory with many tracked files is not treated as large due to a small number of untracked files",
  () =>
    withTestRepo(async (dir, root) => {
      // Simulate something like a Flutter project: lib/ has many tracked files.
      await mkdir(join(dir, "lib"));
      for (let i = 0; i < MAX_UNTRACKED_DIR_FILES + 5; i++) {
        await writeFile(
          join(dir, "lib", `tracked${i}.txt`),
          `tracked content ${i}`
        );
      }

      // Commit the directory so it's tracked.
      await git("add lib", dir);
      await git("commit -m 'add lib'", dir);

      // Modify a tracked file and add an untracked file inside lib/.
      await writeFile(join(dir, "lib", "tracked0.txt"), "modified tracked");
      await writeFile(join(dir, "lib", "new-untracked.txt"), "untracked");

      const cp = await createCheckpoint(
        root,
        "tracked-dir-untracked-file-test",
        0,
        "session-1"
      );

      // lib/ contains many files, but only 1 is untracked, so it must NOT be skipped.
      assert(
        !(cp.skippedLargeDirs ?? []).includes("lib"),
        "lib should not be treated as a large untracked directory when it mainly contains tracked files"
      );

      // Mess up state
      await git("checkout -- lib/tracked0.txt", dir);
      await rm(join(dir, "lib", "new-untracked.txt"));

      // Restore
      await restoreCheckpoint(root, cp);

      assert(
        (await readFile(join(dir, "lib", "tracked0.txt"), "utf-8")) ===
          "modified tracked",
        "Tracked modification inside lib/ should be restored"
      );
      assert(
        existsSync(join(dir, "lib", "new-untracked.txt")),
        "Untracked file inside lib/ should be restored"
      );
    })
);

test("restore: preserves large files on restore", () =>
  withTestRepo(async (dir, root) => {
    // Create a large file (> 10 MiB)
    const largeContent = Buffer.alloc(MAX_UNTRACKED_FILE_SIZE + 1024, "x");
    await writeFile(join(dir, "large-file.bin"), largeContent);
    
    // Create a regular file
    await writeFile(join(dir, "regular.txt"), "regular content");

    const cp = await createCheckpoint(root, "preserve-large-file-test", 0, "session-1");

    // Add a new file after checkpoint (should be removed on restore)
    await writeFile(join(dir, "new-after.txt"), "new file");

    // Restore
    await restoreCheckpoint(root, cp);

    // Verify large file still exists (preserved)
    const files = listFiles(dir);
    assert(
      files.includes("large-file.bin"),
      "Large file should be preserved after restore"
    );
    
    // Verify regular file exists (restored from snapshot)
    assert(
      files.includes("regular.txt"),
      "Regular file should exist after restore"
    );

    // New file should be removed
    assert(
      !files.includes("new-after.txt"),
      "New file should be removed after restore"
    );
  }));

test("restore: preserves large directories on restore", () =>
  withTestRepo(async (dir, root) => {
    // Create a large directory (> 200 files)
    await mkdir(join(dir, "large-dir"));
    for (let i = 0; i < MAX_UNTRACKED_DIR_FILES + 10; i++) {
      await writeFile(join(dir, "large-dir", `file${i}.txt`), `content ${i}`);
    }
    
    // Create a regular file
    await writeFile(join(dir, "regular.txt"), "regular content");

    const cp = await createCheckpoint(root, "preserve-large-dir-test", 0, "session-1");

    // Add a new file after checkpoint (should be removed on restore)
    await writeFile(join(dir, "new-after.txt"), "new file");

    // Restore
    await restoreCheckpoint(root, cp);

    // Verify large directory still exists (preserved)
    const files = listFiles(dir);
    assert(
      files.includes("large-dir"),
      "Large directory should be preserved after restore"
    );
    
    // Verify regular file exists (restored from snapshot)
    assert(
      files.includes("regular.txt"),
      "Regular file should exist after restore"
    );

    // New file should be removed
    assert(
      !files.includes("new-after.txt"),
      "New file should be removed after restore"
    );
  }));

test("restore: does not delete files added to large directory after checkpoint", () =>
  withTestRepo(async (dir, root) => {
    // Create a large directory (> 200 files)
    await mkdir(join(dir, "large-dir"));
    for (let i = 0; i < MAX_UNTRACKED_DIR_FILES + 10; i++) {
      await writeFile(join(dir, "large-dir", `file${i}.txt`), `content ${i}`);
    }

    const cp = await createCheckpoint(root, "large-dir-new-files-test", 0, "session-1");

    // Add a new file inside the large directory after checkpoint
    await writeFile(join(dir, "large-dir", "new-file.txt"), "new content");

    // Restore
    await restoreCheckpoint(root, cp);

    // Verify the new file in the large directory still exists (directory is preserved wholesale)
    assert(
      readdirSync(join(dir, "large-dir")).includes("new-file.txt"),
      "New file in large directory should be preserved"
    );
  }));

// ============================================================================
// Run tests
// ============================================================================

async function run() {
  console.log("Running checkpoint tests...\n");

  const results: TestResult[] = [];

  for (const { name, fn } of tests) {
    process.stdout.write(`  ${name}... `);
    try {
      await fn();
      console.log("✓");
      results.push({ name, passed: true });
    } catch (error) {
      console.log("✗");
      results.push({
        name,
        passed: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log("");

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  if (failed > 0) {
    console.log("Failures:\n");
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`  ${r.name}:`);
      console.log(`    ${r.error}\n`);
    }
  }

  console.log(`${passed} passed, ${failed} failed`);

  process.exit(failed > 0 ? 1 : 0);
}

run();
