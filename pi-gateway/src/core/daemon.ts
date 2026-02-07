/**
 * Daemon installer — generates launchd (macOS) or systemd (Linux) service files.
 * Aligned with OpenClaw's `openclaw onboard --install-daemon`.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createLogger } from "./types.ts";

const log = createLogger("daemon");

interface DaemonConfig {
  port: number;
  configPath?: string;
}

/**
 * Install the gateway as a system daemon.
 */
export function installDaemon(config: DaemonConfig): void {
  const platform = process.platform;

  if (platform === "darwin") {
    installLaunchd(config);
  } else if (platform === "linux") {
    installSystemd(config);
  } else {
    console.error(`Unsupported platform: ${platform}. Use macOS or Linux.`);
    process.exit(1);
  }
}

/**
 * Uninstall the daemon.
 */
export function uninstallDaemon(): void {
  const platform = process.platform;

  if (platform === "darwin") {
    uninstallLaunchd();
  } else if (platform === "linux") {
    uninstallSystemd();
  } else {
    console.error(`Unsupported platform: ${platform}`);
  }
}

// ============================================================================
// macOS launchd
// ============================================================================

const LAUNCHD_LABEL = "com.pi-gateway";
const LAUNCHD_DIR = join(homedir(), "Library", "LaunchAgents");
const LAUNCHD_PLIST = join(LAUNCHD_DIR, `${LAUNCHD_LABEL}.plist`);

function installLaunchd(config: DaemonConfig): void {
  const bunPath = process.execPath || join(homedir(), ".bun", "bin", "bun");
  const cliPath = join(import.meta.dir, "..", "cli.ts");
  const logDir = join(homedir(), ".pi", "gateway", "logs");

  if (!existsSync(LAUNCHD_DIR)) mkdirSync(LAUNCHD_DIR, { recursive: true });
  if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });

  const args = ["run", cliPath, "gateway", "--port", String(config.port)];
  if (config.configPath) args.push("--config", config.configPath);

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCHD_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${bunPath}</string>
${args.map((a) => `    <string>${a}</string>`).join("\n")}
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${join(logDir, "daemon-stdout.log")}</string>
  <key>StandardErrorPath</key>
  <string>${join(logDir, "daemon-stderr.log")}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/bin:${join(homedir(), ".bun", "bin")}:${join(homedir(), ".local", "bin")}</string>
  </dict>
</dict>
</plist>`;

  writeFileSync(LAUNCHD_PLIST, plist, "utf-8");
  console.log(`Installed: ${LAUNCHD_PLIST}`);
  console.log(`\nTo start now:\n  launchctl load ${LAUNCHD_PLIST}`);
  console.log(`\nTo stop:\n  launchctl unload ${LAUNCHD_PLIST}`);
  console.log(`\nLogs: ${logDir}`);
}

function uninstallLaunchd(): void {
  if (!existsSync(LAUNCHD_PLIST)) {
    console.log("No daemon installed.");
    return;
  }
  console.log(`Unloading and removing: ${LAUNCHD_PLIST}`);
  Bun.spawnSync(["launchctl", "unload", LAUNCHD_PLIST]);
  const { unlinkSync } = require("node:fs");
  unlinkSync(LAUNCHD_PLIST);
  console.log("Daemon removed.");
}

// ============================================================================
// Linux systemd
// ============================================================================

const SYSTEMD_DIR = join(homedir(), ".config", "systemd", "user");
const SYSTEMD_SERVICE = join(SYSTEMD_DIR, "pi-gateway.service");

function installSystemd(config: DaemonConfig): void {
  const bunPath = process.execPath || join(homedir(), ".bun", "bin", "bun");
  const cliPath = join(import.meta.dir, "..", "cli.ts");
  const logDir = join(homedir(), ".pi", "gateway", "logs");

  if (!existsSync(SYSTEMD_DIR)) mkdirSync(SYSTEMD_DIR, { recursive: true });
  if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });

  let execStart = `${bunPath} run ${cliPath} gateway --port ${config.port}`;
  if (config.configPath) execStart += ` --config ${config.configPath}`;

  const unit = `[Unit]
Description=pi-gateway — Local AI Gateway
After=network.target

[Service]
Type=simple
ExecStart=${execStart}
Restart=on-failure
RestartSec=5
Environment=PATH=/usr/local/bin:/usr/bin:/bin:${join(homedir(), ".bun", "bin")}:${join(homedir(), ".local", "bin")}

[Install]
WantedBy=default.target
`;

  writeFileSync(SYSTEMD_SERVICE, unit, "utf-8");
  console.log(`Installed: ${SYSTEMD_SERVICE}`);
  console.log(`\nTo enable and start:\n  systemctl --user daemon-reload`);
  console.log(`  systemctl --user enable pi-gateway`);
  console.log(`  systemctl --user start pi-gateway`);
  console.log(`\nTo check status:\n  systemctl --user status pi-gateway`);
  console.log(`\nLogs:\n  journalctl --user -u pi-gateway -f`);
}

function uninstallSystemd(): void {
  if (!existsSync(SYSTEMD_SERVICE)) {
    console.log("No daemon installed.");
    return;
  }
  Bun.spawnSync(["systemctl", "--user", "stop", "pi-gateway"]);
  Bun.spawnSync(["systemctl", "--user", "disable", "pi-gateway"]);
  const { unlinkSync } = require("node:fs");
  unlinkSync(SYSTEMD_SERVICE);
  Bun.spawnSync(["systemctl", "--user", "daemon-reload"]);
  console.log("Daemon removed.");
}
