/**
 * 版本检查器
 * 从 npm registry 查询最新版本，支持多 registry fallback。
 */
import https from "node:https";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";

const PKG_NAME = "pi-gateway";
const ENCODED_PKG = encodeURIComponent(PKG_NAME);

const REGISTRIES = [
  `https://registry.npmjs.org/${ENCODED_PKG}`,
  `https://registry.npmmirror.com/${ENCODED_PKG}`,
];

function getCurrentVersion(): string {
  try {
    const pkgPath = resolve(__dirname, "../../../../package.json");
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      return pkg.version ?? "unknown";
    }
  } catch {}
  return "unknown";
}

const CURRENT_VERSION = getCurrentVersion();

export interface UpdateInfo {
  current: string;
  latest: string | null;
  hasUpdate: boolean;
  checkedAt: number;
  error?: string;
}

let _log: { info: (msg: string) => void; error: (msg: string) => void } | undefined;

function fetchJson(url: string, timeoutMs: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: timeoutMs, headers: { Accept: "application/json" } }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      let data = "";
      res.on("data", (chunk: string) => { data += chunk; });
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
  });
}

export function triggerUpdateCheck(log?: { info: (msg: string) => void; error: (msg: string) => void }): void {
  if (log) _log = log;
  getUpdateInfo().then((info) => {
    if (info.hasUpdate) {
      _log?.info?.(`[qqbot:update-checker] new version: ${info.latest} (current: ${CURRENT_VERSION})`);
    }
  }).catch(() => {});
}

export async function getUpdateInfo(): Promise<UpdateInfo> {
  for (const url of REGISTRIES) {
    try {
      const json = (await fetchJson(url, 10_000)) as { "dist-tags"?: Record<string, string> };
      const tags = json["dist-tags"];
      const latest = tags?.latest || null;
      const hasUpdate = Boolean(latest && latest !== CURRENT_VERSION && compareVersions(latest, CURRENT_VERSION) > 0);
      return { current: CURRENT_VERSION, latest, hasUpdate, checkedAt: Date.now() };
    } catch {}
  }
  return { current: CURRENT_VERSION, latest: null, hasUpdate: false, checkedAt: Date.now(), error: "all registries failed" };
}

function compareVersions(a: string, b: string): number {
  const parse = (v: string) => v.replace(/^v/, "").split(".").map(Number);
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
