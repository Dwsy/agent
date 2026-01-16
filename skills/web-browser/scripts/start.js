#!/usr/bin/env node

import { spawn, execSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { randomInt } from "node:crypto";
import puppeteer from "puppeteer-core";

const useProfile = process.argv.includes("--profile");
const useChromium = process.argv.includes("--chromium");

if (process.argv[2] && process.argv[2] !== "--profile" && process.argv[2] !== "--chromium") {
  console.log("Usage: start.js [--profile] [--chromium]");
  console.log("\nOptions:");
  console.log("  --profile   Copy your default Chrome profile (cookies, logins)");
  console.log("  --chromium  Use Chromium instead of Google Chrome");
  console.log("\nExamples:");
  console.log("  start.js              # Start with fresh Chrome profile");
  console.log("  start.js --profile    # Start with your Chrome profile");
  console.log("  start.js --chromium   # Start with Chromium");
  console.log("  start.js --chromium --profile  # Start with Chromium and your profile");
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

// Check if browser is already running on this port
let existingBrowser = false;
try {
  const browser = await puppeteer.connect({
    browserURL: `http://localhost:${port}`,
    defaultViewport: null,
    timeout: 2000,
  });
  await browser.disconnect();
  existingBrowser = true;
  const browserName = useChromium ? "Chromium" : "Chrome";
  console.log(`✓ ${browserName} already running on :${port}`);
  process.exit(0);
} catch {
  // Browser not running, continue
}

// Determine which browser executable to use
const chromePath = useChromium
  ? "/Applications/Chromium.app/Contents/MacOS/Chromium"
  : "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const chromiumInstalled = existsSync("/Applications/Chromium.app/Contents/MacOS/Chromium");

if (useChromium && !chromiumInstalled) {
  console.error("❌ Chromium not found at /Applications/Chromium.app/");
  console.log("   Please install Chromium first, or remove --chromium flag");
  process.exit(1);
}

if (useProfile) {
  // Sync profile with rsync (much faster on subsequent runs)
  // Use Chrome profile (Chromium uses the same format)
  execSync(
    `rsync -a --delete "${process.env["HOME"]}/Library/Application Support/Google/Chrome/" "${profileDir}/"`,
    { stdio: "pipe" },
  );
}

// Start browser in background with unique profile directory
// Using a separate profile ensures it doesn't interfere with your main browser
const browserName = useChromium ? "Chromium" : "Chrome";
const browserProcess = spawn(
  chromePath,
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
browserProcess.unref();

// Wait for browser to be ready by attempting to connect
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
  console.error(`✗ Failed to connect to ${browserName}`);
  process.exit(1);
}

let message = `✓ ${browserName} started on :${port}`;
if (useProfile) {
  message += " with your profile";
}
console.log(message);