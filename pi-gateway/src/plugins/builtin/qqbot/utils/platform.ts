/**
 * 跨平台兼容工具
 * 统一 Mac/Linux/Windows 的路径、日志目录、进程检测等基础能力。
 */
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";

export function isWindows(): boolean {
  return process.platform === "win32";
}

export function getHomeDir(): string {
  try {
    const home = os.homedir();
    if (home && fs.existsSync(home)) return home;
  } catch {}
  const envHome = process.env.HOME || process.env.USERPROFILE;
  if (envHome && fs.existsSync(envHome)) return envHome;
  return os.tmpdir();
}

export function getPiDataDir(...subPaths: string[]): string {
  const dir = path.join(getHomeDir(), ".pi", "agent", ...subPaths);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function getQqbotDataDir(...subPaths: string[]): string {
  return getPiDataDir("qqbot-credentials", ...subPaths);
}
