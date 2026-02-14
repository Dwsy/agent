#!/usr/bin/env bun
// 重启 Cloudflare Tunnel

import { execSync } from "child_process";
import * as path from "path";

const SCRIPT_DIR = path.dirname(import.meta.url.replace("file://", ""));

console.log("🔄 重启 Cloudflare Tunnel\n");

// 先停止
try {
  execSync(`bun "${path.join(SCRIPT_DIR, "stop.ts")}"`, { stdio: "inherit" });
} catch {
  // ignore
}

console.log("\n---\n");

// 再启动
try {
  execSync(`bun "${path.join(SCRIPT_DIR, "start.ts")}" ${process.argv.slice(2).join(" ")}`, { stdio: "inherit" });
} catch {
  process.exit(1);
}
