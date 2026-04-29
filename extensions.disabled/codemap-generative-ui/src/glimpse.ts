import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const GLIMPSE_MODULE_PATH = join(currentDir, "../node_modules/glimpseui/src/glimpse.mjs");

let glimpseModule: any = null;

export async function getGlimpse() {
  if (!glimpseModule) {
    glimpseModule = await import(GLIMPSE_MODULE_PATH);
  }
  return glimpseModule;
}

export function isMacOS() {
  return process.platform === "darwin";
}
