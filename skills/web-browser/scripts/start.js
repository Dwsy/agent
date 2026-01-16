#!/usr/bin/env node

import { spawn, execSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { randomInt } from "node:crypto";
import puppeteer from "puppeteer-core";

const useChromium = !process.argv.includes("--chrome"); // Default to Chromium

if (process.argv[2] && process.argv[2] !== "--chrome") {
  console.log("Usage: start.js [--chrome]");
  console.log("\nOptions:");
  console.log("  --chrome    Use Google Chrome instead of Chromium");
  console.log("\nExamples:");
  console.log("  start.js              # Start Chromium with persistent storage");
  console.log("  start.js --chrome     # Start Google Chrome");
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
  console.log(`✓ ${browserName} already running on :${port}`);
  process.exit(0);
} catch {
  // Browser not running, continue
}

// Determine which browser executable to use
const chromiumPath = "/Applications/Chromium.app/Contents/MacOS/Chromium";
const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const chromiumInstalled = existsSync(chromiumPath);
const chromeInstalled = existsSync(chromePath);

// Use Chromium by default, fallback to Chrome if Chromium not found
let browserPath;
if (useChromium && chromiumInstalled) {
  browserPath = chromiumPath;
} else if (!useChromium && chromeInstalled) {
  browserPath = chromePath;
} else if (chromiumInstalled) {
  console.log("⚠️  Google Chrome not found, using Chromium instead");
  browserPath = chromiumPath;
} else if (chromeInstalled) {
  console.log("⚠️  Chromium not found, using Google Chrome instead");
  browserPath = chromePath;
} else {
  console.error("❌ No browser found!");
  console.log("   Please install either Chromium or Google Chrome");
  console.log("   Install Chromium: brew install --cask chromium");
  process.exit(1);
}

const browserName = browserPath.includes("Chromium") ? "Chromium" : "Chrome";
console.log(`🚀 Starting: ${browserName} (${browserPath})`);

// Start browser in background with unique profile directory
// Using a separate profile ensures it doesn't interfere with your main browser
const browserArgs = [
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
];

console.log(`📂 Profile: ${profileDir}`);
console.log(`🔌 Port: ${port}`);
console.log(`📝 Args: ${browserArgs.slice(0, 3).join(" ")} ...`);

const browserProcess = spawn(
  browserPath,
  browserArgs,
  { detached: true, stdio: "ignore" },
);
browserProcess.unref();

console.log(`🎯 Process ID: ${browserProcess.pid}`);

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

console.log(`✓ ${browserName} started on :${port}`);