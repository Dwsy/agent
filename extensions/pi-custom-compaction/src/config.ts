import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { CONFIG_PATH } from "./constants.js";
import {
  COMPACTION_ALGORITHMS,
  DEFAULT_CONFIG,
  type ConfigLoadResult,
  type ConfigSaveResult,
  type CustomCompactionConfig,
  type ModelReference,
} from "./types.js";

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asModelReference(value: unknown): ModelReference | null {
  const source = asRecord(value);
  const provider = typeof source.provider === "string" ? source.provider.trim() : "";
  const id = typeof source.id === "string" ? source.id.trim() : "";
  return provider && id ? { provider, id } : null;
}

function asAlgorithm(value: unknown): CustomCompactionConfig["algorithm"] {
  return COMPACTION_ALGORITHMS.includes(value as CustomCompactionConfig["algorithm"])
    ? (value as CustomCompactionConfig["algorithm"])
    : DEFAULT_CONFIG.algorithm;
}

function asSummaryTokens(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_CONFIG.maxSummaryTokens;
  }
  const rounded = Math.round(value);
  return rounded >= 512 && rounded <= 32768 ? rounded : DEFAULT_CONFIG.maxSummaryTokens;
}

export function normalizeConfig(raw: unknown): CustomCompactionConfig {
  const source = asRecord(raw);
  return {
    enabled: asBoolean(source.enabled, DEFAULT_CONFIG.enabled),
    model: asModelReference(source.model),
    algorithm: asAlgorithm(source.algorithm),
    maxSummaryTokens: asSummaryTokens(source.maxSummaryTokens),
    showStatusWidget: asBoolean(source.showStatusWidget, DEFAULT_CONFIG.showStatusWidget),
  };
}

export function ensureConfigExists(configPath = CONFIG_PATH): string | undefined {
  if (existsSync(configPath)) {
    return undefined;
  }

  try {
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`, "utf8");
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export function loadConfig(configPath = CONFIG_PATH): ConfigLoadResult {
  const ensureError = ensureConfigExists(configPath);
  if (ensureError) {
    return { config: DEFAULT_CONFIG, warning: `Could not create ${configPath}: ${ensureError}` };
  }

  try {
    return { config: normalizeConfig(JSON.parse(readFileSync(configPath, "utf8"))) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { config: DEFAULT_CONFIG, warning: `Could not read ${configPath}: ${message}` };
  }
}

export function saveConfig(config: CustomCompactionConfig, configPath = CONFIG_PATH): ConfigSaveResult {
  const normalized = normalizeConfig(config);
  const tempPath = `${configPath}.${randomUUID()}.tmp`;

  try {
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(tempPath, `${JSON.stringify(normalized, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    renameSync(tempPath, configPath);
    return { success: true };
  } catch (error) {
    try {
      unlinkSync(tempPath);
    } catch {
      // A failed best-effort cleanup must not mask the original save error.
    }
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Could not save ${configPath}: ${message}` };
  }
}
