import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "bun:test";
import assert from "node:assert/strict";

import { writeCommittedMemoryFile } from "./memory-git.ts";

function git(repo: string, args: string[]): string {
  return execFileSync("git", ["-C", repo, ...args], { encoding: "utf-8" }).trim();
}

test("memory Git commit isolates staged files and rolls back failed commits", () => {
  const repo = mkdtempSync(join(tmpdir(), "role-memory-git-"));
  try {
    git(repo, ["init", "-q"]);
    git(repo, ["config", "user.name", "Test"]);
    git(repo, ["config", "user.email", "test@example.invalid"]);
    writeFileSync(join(repo, ".gitkeep"), "\n");
    git(repo, ["add", ".gitkeep"]);
    git(repo, ["commit", "-qm", "init"]);

    const rolePath = join(repo, "zero");
    const memoryPath = join(rolePath, "memory", "consolidated.md");
    mkdirSync(join(rolePath, "memory"), { recursive: true });

    const options = { rolesDir: repo };
    writeCommittedMemoryFile(rolePath, memoryPath, "v1\n", "initialize memory", options);
    writeCommittedMemoryFile(rolePath, memoryPath, "v2\n", "edit memory", options);

    writeFileSync(join(repo, "unrelated.md"), "keep staged\n");
    git(repo, ["add", "--", "unrelated.md"]);
    writeCommittedMemoryFile(rolePath, memoryPath, "v3\n", "edit memory again", options);

    assert.equal(readFileSync(memoryPath, "utf-8"), "v3\n");
    assert.equal(git(repo, ["log", "-1", "--format=%s"]), "docs(zero): edit memory again");
    assert.equal(git(repo, ["diff", "--cached", "--name-only"]), "unrelated.md");

    const hooks = join(repo, "hooks");
    mkdirSync(hooks);
    const preCommit = join(hooks, "pre-commit");
    writeFileSync(preCommit, "#!/bin/sh\nexit 1\n");
    chmodSync(preCommit, 0o755);
    git(repo, ["config", "core.hooksPath", hooks]);

    assert.throws(() => writeCommittedMemoryFile(rolePath, memoryPath, "failed\n", "failed edit", options), /git commit failed/);
    assert.equal(readFileSync(memoryPath, "utf-8"), "v3\n");

    writeFileSync(memoryPath, "external change\n");
    assert.throws(
      () => writeCommittedMemoryFile(rolePath, memoryPath, "stale write\n", "stale edit", { ...options, expectedContent: "v3\n" }),
      /memory changed concurrently/,
    );
    assert.equal(readFileSync(memoryPath, "utf-8"), "external change\n");
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("memory Git can initialize an unborn repository", () => {
  const repo = mkdtempSync(join(tmpdir(), "role-memory-git-empty-"));
  try {
    git(repo, ["init", "-q"]);
    git(repo, ["config", "user.name", "Test"]);
    git(repo, ["config", "user.email", "test@example.invalid"]);
    const rolePath = join(repo, "zero");
    const memoryPath = join(rolePath, "memory", "pending.md");
    mkdirSync(join(rolePath, "memory"), { recursive: true });

    writeCommittedMemoryFile(rolePath, memoryPath, "first\n", "initialize memory", { rolesDir: repo });

    assert.equal(readFileSync(memoryPath, "utf-8"), "first\n");
    assert.equal(git(repo, ["log", "-1", "--format=%s"]), "docs(zero): initialize memory");
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
