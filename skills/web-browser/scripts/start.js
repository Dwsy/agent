#!/usr/bin/env node

import { spawn, execSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { randomInt } from "node:crypto";
import puppeteer from "puppeteer-core";

const useProfile = process.argv[2] === "--profile";

if (process.argv[2] && process.argv[2] !== "--profile") {
  console.log("Usage: start.ts [--profile]");
  console.log("\nOptions:");
  console.log(
    "  --profile  Copy your default Chrome profile (cookies, logins)",
  );
  console.log("\nExamples:");
  console.log("  start.ts            # Start with fresh profile");
  console.log("  start.ts --profile  # Start with your Chrome profile");
  process.exit(1);
}

// Setup profile directory - use a unique directory name to avoid conflicts
const profileDir = `${process.env["HOME"]}/.cache/scraping-web-browser`;
const portFile = `${profileDir}/port.txt`;

execSync(`mkdir -p "${profileDir}"`, { stdio: "ignore" });

// Generate or read port
let port;
if (existsSync(portFile)) {
  port = parseInt(readFileSync(portFile, "utf-8").trim());
  console.log(`📖 Using saved port: ${port}`);
} else {
  // Generate random port between 9222 and 9999
  port = randomInt(9222, 10000);
  writeFileSync(portFile, port.toString());
  console.log(`🎲 Generated random port: ${port}`);
}

// Check if Chrome is already running on this port
let existingBrowser = false;
try {
  const browser = await puppeteer.connect({
    browserURL: `http://localhost:${port}`,
    defaultViewport: null,
    timeout: 2000,
  });
  await browser.disconnect();
  existingBrowser = true;
  console.log(`✓ Chrome already running on :${port}`);
  process.exit(0);
} catch {
  // Chrome not running, continue
}

if (useProfile) {
  // Sync profile with rsync (much faster on subsequent runs)
  execSync(
    `rsync -a --delete "${process.env["HOME"]}/Library/Application Support/Google/Chrome/" "${profileDir}/"`,
    { stdio: "pipe" },
  );
}

// Start Chrome in background with unique profile directory
// Using a separate profile ensures it doesn't interfere with your main Chrome
const chromeProcess = spawn(
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    "--profile-directory=Default",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-features=TranslateUI,BlinkGenPropertyTrees",
    "--disable-web-security",
    "--disable-features=VizDisplayCompositor",
    "--proxy-server='direct://'",
    "--no-proxy-server",
  ],
  { detached: true, stdio: "ignore" },
);
chromeProcess.unref();

// Wait for Chrome to be ready by attempting to connect
let connected = false;
for (let i = 0; i < 30; i++) {
  try {
    const browser = await puppeteer.connect({
      browserURL: `http://localhost:${port}`,
      defaultViewport: null,
    });
    await browser.disconnect();
    connected = true;
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 500));
  }
}

if (!connected) {
  console.error("✗ Failed to connect to Chrome");
  process.exit(1);
}

console.log(
  `✓ Chrome started on :${port}${useProfile ? " with your profile" : ""}`,
);
