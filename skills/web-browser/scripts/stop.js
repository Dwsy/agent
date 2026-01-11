#!/usr/bin/env node

import { execSync } from "node:child_process";

console.log("🛑 Stopping web-browser...");

try {
  execSync("pkill -f 'scraping-web-browser'", { stdio: "pipe" });
  console.log("✓ Browser stopped");
  console.log("💡 Tip: Port info is preserved, next start will use the same port");
  console.log("   To reset port, remove ~/.cache/scraping-web-browser/port.txt");
} catch (error) {
  console.log("✓ Browser was not running");
}