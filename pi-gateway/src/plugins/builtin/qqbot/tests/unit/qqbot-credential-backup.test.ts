import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { saveCredentialBackup, loadCredentialBackup, clearCredentialBackup } from "../../credential-backup.ts";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";

const backupPath = `${homedir()}/.pi/gateway/qqbot-credentials/credentials.json`;

describe("credential backup", () => {
  beforeEach(() => {
    clearCredentialBackup();
  });
  afterEach(() => {
    clearCredentialBackup();
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
