import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { GatewayContext } from "../gateway/types.ts";
import { DEFAULT_CONFIG, loadConfigFromText, resolveConfigPath, validateConfig } from "../core/config.ts";
import type { ValidationIssue, ValidationResult } from "../core/config-validator.ts";

type ConfigRawSaveBody = {
  text?: unknown;
  expectedMtimeMs?: unknown;
};

type ConfigRawValidateBody = {
  text?: unknown;
};

type ConfigRawRestoreBody = {
  filename?: unknown;
};

function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

function parseBodyText(body: ConfigRawValidateBody | ConfigRawSaveBody): string | Response {
  if (typeof body.text !== "string") {
    return json({ ok: false, error: "text must be a string" }, { status: 400 });
  }
  return body.text;
}

function parseErrorIssue(error: unknown): ValidationIssue {
  return {
    path: "config",
    message: error instanceof Error ? error.message : String(error),
    severity: "error",
    autoFixable: false,
  };
}

async function validateRawConfigText(text: string): Promise<{ config: unknown | null; validation: ValidationResult }> {
  try {
    const config = loadConfigFromText(text);
    const validation = await validateConfig(config, {
      checkPorts: false,
      checkDirectories: false,
      validateTokens: false,
    });
    return { config, validation };
  } catch (error) {
    const issue = parseErrorIssue(error);
    return {
      config: null,
      validation: {
        valid: false,
        issues: [issue],
        stats: { error: 1, warning: 0, info: 0 },
        autoFixableCount: 0,
      },
    };
  }
}

function currentConfigFile(configPath?: string) {
  const path = configPath ?? resolveConfigPath();
  const exists = existsSync(path);
  const stat = exists ? statSync(path) : null;
  return {
    path,
    exists,
    mtimeMs: stat?.mtimeMs ?? null,
    size: stat?.size ?? 0,
  };
}

function defaultConfigText(): string {
  return `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`;
}

function backupName(path: string): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `${basename(path)}.${stamp}.bak`;
}

function createBackup(path: string): string | null {
  if (!existsSync(path)) return null;
  const backupPath = join(dirname(path), backupName(path));
  copyFileSync(path, backupPath);
  return backupPath;
}

function listBackupFiles(path: string) {
  const dir = dirname(path);
  const prefix = `${basename(path)}.`;
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter((name) => name.startsWith(prefix) && name.endsWith(".bak"))
    .map((name) => {
      const fullPath = join(dir, name);
      const stat = statSync(fullPath);
      return {
        filename: name,
        path: fullPath,
        mtimeMs: stat.mtimeMs,
        size: stat.size,
      };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function resolveBackupFile(configPath: string, filename?: unknown): string | Response {
  const backups = listBackupFiles(configPath);
  if (!backups.length) {
    return json({ ok: false, error: "No backups found" }, { status: 404 });
  }

  if (filename == null || filename === "") return backups[0]!.path;
  if (typeof filename !== "string" || filename.includes("/") || filename.includes("\\")) {
    return json({ ok: false, error: "filename must be a backup filename" }, { status: 400 });
  }

  const matched = backups.find((backup) => backup.filename === filename);
  if (!matched) {
    return json({ ok: false, error: "Backup not found" }, { status: 404 });
  }
  return matched.path;
}

export async function handleGatewayConfigRaw(req: Request, url: URL, ctx: GatewayContext): Promise<Response> {
  const file = currentConfigFile(ctx.configPath);
  const method = req.method;
  const pathname = url.pathname;

  if (pathname === "/api/gateway/config/raw" && method === "GET") {
    return json({
      ok: true,
      ...file,
      text: file.exists ? readFileSync(file.path, "utf-8") : defaultConfigText(),
    });
  }

  if (pathname === "/api/gateway/config/raw/validate" && method === "POST") {
    let body: ConfigRawValidateBody;
    try {
      body = await req.json() as ConfigRawValidateBody;
    } catch {
      return json({ ok: false, error: "invalid JSON" }, { status: 400 });
    }

    const text = parseBodyText(body);
    if (text instanceof Response) return text;

    const result = await validateRawConfigText(text);
    return json({ ok: result.validation.valid, validation: result.validation });
  }

  if (pathname === "/api/gateway/config/raw" && method === "PUT") {
    let body: ConfigRawSaveBody;
    try {
      body = await req.json() as ConfigRawSaveBody;
    } catch {
      return json({ ok: false, error: "invalid JSON" }, { status: 400 });
    }

    const text = parseBodyText(body);
    if (text instanceof Response) return text;

    const validationResult = await validateRawConfigText(text);
    if (!validationResult.validation.valid) {
      return json({ ok: false, validation: validationResult.validation, error: "Config validation failed" }, { status: 400 });
    }

    const latest = currentConfigFile(ctx.configPath);
    if (typeof body.expectedMtimeMs === "number" && latest.mtimeMs !== null && Math.abs(latest.mtimeMs - body.expectedMtimeMs) > 1) {
      return json({ ok: false, error: "Config file changed on disk. Reload before saving.", currentMtimeMs: latest.mtimeMs }, { status: 409 });
    }

    const dir = dirname(latest.path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const backupPath = createBackup(latest.path);
    writeFileSync(latest.path, text.endsWith("\n") ? text : `${text}\n`, "utf-8");
    ctx.reloadConfig?.();
    ctx.observability.record("info", "gateway", "config_save", "Raw config saved from Web UI", { path: latest.path, backupPath });

    return json({ ok: true, path: latest.path, backupPath, validation: validationResult.validation, mtimeMs: statSync(latest.path).mtimeMs });
  }

  if (pathname === "/api/gateway/config/raw/backups" && method === "GET") {
    return json({ ok: true, backups: listBackupFiles(file.path) });
  }

  if (pathname === "/api/gateway/config/raw/restore" && method === "POST") {
    let body: ConfigRawRestoreBody = {};
    try {
      body = await req.json() as ConfigRawRestoreBody;
    } catch {
      return json({ ok: false, error: "invalid JSON" }, { status: 400 });
    }

    const backupPath = resolveBackupFile(file.path, body.filename);
    if (backupPath instanceof Response) return backupPath;

    const text = readFileSync(backupPath, "utf-8");
    const validationResult = await validateRawConfigText(text);
    if (!validationResult.validation.valid) {
      return json({ ok: false, validation: validationResult.validation, error: "Backup config validation failed" }, { status: 400 });
    }

    const currentBackup = createBackup(file.path);
    const dir = dirname(file.path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(file.path, text.endsWith("\n") ? text : `${text}\n`, "utf-8");
    ctx.reloadConfig?.();
    ctx.observability.record("info", "gateway", "config_restore", "Raw config restored from backup", { path: file.path, backupPath, currentBackup });

    return json({ ok: true, path: file.path, restoredFrom: backupPath, backupPath: currentBackup, validation: validationResult.validation, mtimeMs: statSync(file.path).mtimeMs });
  }

  return json({ ok: false, error: "Not found" }, { status: 404 });
}
