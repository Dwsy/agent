import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { saveCredentialBackup, loadCredentialBackup, clearCredentialBackup } from "../../credential-backup.ts";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let previousBackupDir: string | undefined;
let backupDir: string;
let backupPath: string;

describe("credential backup", () => {
  beforeEach(() => {
    previousBackupDir = process.env.PI_QQBOT_CREDENTIAL_BACKUP_DIR;
    backupDir = mkdtempSync(join(tmpdir(), "qqbot-credentials-"));
    backupPath = join(backupDir, "credentials.json");
    process.env.PI_QQBOT_CREDENTIAL_BACKUP_DIR = backupDir;
    clearCredentialBackup();
  });
  afterEach(() => {
    clearCredentialBackup();
    if (previousBackupDir === undefined) {
      delete process.env.PI_QQBOT_CREDENTIAL_BACKUP_DIR;
    } else {
      process.env.PI_QQBOT_CREDENTIAL_BACKUP_DIR = previousBackupDir;
    }
    rmSync(backupDir, { recursive: true, force: true });
  });

  test("save and load credentials", () => {
    saveCredentialBackup("default", "app-123", "secret-456");
    const restored = loadCredentialBackup();
    expect(restored).not.toBeNull();
    expect(restored!.appId).toBe("app-123");
    expect(restored!.clientSecret).toBe("secret-456");
  });

  test("load returns null when no backup exists", () => {
    clearCredentialBackup();
    const restored = loadCredentialBackup();
    expect(restored).toBeNull();
  });

  test("save skips empty credentials", () => {
    saveCredentialBackup("default", "", "secret");
    const restored = loadCredentialBackup();
    expect(restored).toBeNull();
  });

  test("clearCredentialBackup removes backup file", () => {
    saveCredentialBackup("default", "app-123", "secret-456");
    expect(existsSync(backupPath)).toBeTrue();
    clearCredentialBackup();
    expect(existsSync(backupPath)).toBeFalse();
  });
});
