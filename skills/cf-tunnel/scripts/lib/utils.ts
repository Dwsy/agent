// 通用工具函数
import { execSync, spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export const CONFIG_DIR = path.join(os.homedir(), ".cf-tunnel");
export const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

export interface Config {
  tunnelId: string;
  tunnelName: string;
  hostname: string;
  localPort: number;
  webDir: string;
  tmux: {
    webSession: string;
    tunnelSession: string;
  };
}

export const DEFAULT_CONFIG: Config = {
  tunnelId: "",
  tunnelName: "my-website",
  hostname: "",
  localPort: 8080,
  webDir: path.join(os.homedir(), "my-website"),
  tmux: {
    webSession: "cf-web",
    tunnelSession: "cf-tunnel",
  },
};

export function loadConfig(): Config | null {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return null;
    const content = fs.readFileSync(CONFIG_FILE, "utf-8");
    return { ...DEFAULT_CONFIG, ...JSON.parse(content) };
  } catch {
    return null;
  }
}

export function saveConfig(config: Config): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function exec(cmd: string, silent = false): string {
  try {
    return execSync(cmd, { encoding: "utf-8", stdio: silent ? "pipe" : "inherit" });
  } catch (e: any) {
    if (silent) return "";
    throw e;
  }
}

export function execSilent(cmd: string): string {
  return exec(cmd, true).trim();
}

export function tmuxSessionExists(name: string): boolean {
  try {
    execSync(`tmux has-session -t ${name}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function killTmuxSession(name: string): void {
  try {
    execSync(`tmux kill-session -t ${name} 2>/dev/null`, { stdio: "ignore" });
  } catch {
    // ignore
  }
}

export function getTmuxSessionPid(name: string): number | null {
  try {
    const pid = execSync(`tmux list-panes -t ${name} -F "#{pane_pid}" 2>/dev/null`, {
      encoding: "utf-8",
    }).trim();
    return pid ? parseInt(pid, 10) : null;
  } catch {
    return null;
  }
}

export function isPortInUse(port: number): boolean {
  try {
    execSync(`lsof -Pi :${port} -sTCP:LISTEN -t >/dev/null 2>&1`);
    return true;
  } catch {
    return false;
  }
}

export function getPortPid(port: number): number | null {
  try {
    const pid = execSync(`lsof -Pi :${port} -sTCP:LISTEN -t 2>/dev/null`, {
      encoding: "utf-8",
    }).trim().split("\n")[0];
    return pid ? parseInt(pid, 10) : null;
  } catch {
    return null;
  }
}

export function getProcessInfo(pid: number): { command: string; user: string } | null {
  try {
    const cmd = execSync(`ps -p ${pid} -o comm= 2>/dev/null`, { encoding: "utf-8" }).trim();
    const user = execSync(`ps -p ${pid} -o user= 2>/dev/null`, { encoding: "utf-8" }).trim();
    return { command: cmd, user };
  } catch {
    return null;
  }
}

export function killProcess(pid: number, signal: "SIGTERM" | "SIGKILL" = "SIGTERM"): boolean {
  try {
    process.kill(pid, signal);
    return true;
  } catch {
    return false;
  }
}

// 获取一个随机高端口（10000-65000），避免常见端口冲突
export function getRandomPort(): number {
  return Math.floor(Math.random() * (65000 - 10000) + 10000);
}

// 查找可用端口，优先使用随机高端口
export function findAvailablePort(startPort?: number, maxTry = 20): number | null {
  // 如果没有指定起始端口，使用随机高端口
  let port = startPort ?? getRandomPort();
  
  for (let i = 0; i < maxTry; i++) {
    if (!isPortInUse(port)) return port;
    // 端口被占用，尝试下一个随机端口
    port = getRandomPort();
  }
  return null;
}

// 获取并自动分配一个可用端口
export function assignAvailablePort(): number {
  const port = findAvailablePort();
  if (!port) {
    throw new Error("无法找到可用端口");
  }
  return port;
}

export function printStatus(status: "running" | "stopped" | "error", message: string): void {
  const icons = { running: "🟢", stopped: "🔴", error: "🟡" };
  console.log(`${icons[status]} ${message}`);
}

export function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function createSampleHtml(dir: string): void {
  const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Cloudflare Tunnel Site</title>
    <style>
        body { 
            font-family: system-ui, -apple-system, sans-serif; 
            max-width: 800px; 
            margin: 50px auto; 
            padding: 20px;
            line-height: 1.6;
        }
        h1 { color: #f48120; }
        .meta { color: #666; font-size: 0.9em; }
    </style>
</head>
<body>
    <h1>🚀 网站已上线</h1>
    <p>通过 Cloudflare Tunnel 成功暴露到公网！</p>
    <p class="meta">启动时间: <span id="time"></span></p>
    <script>document.getElementById('time').textContent = new Date().toLocaleString()</script>
</body>
</html>`;
  fs.writeFileSync(path.join(dir, "index.html"), html);
}

export async function prompt(question: string): Promise<string> {
  process.stdout.write(question);
  return new Promise((resolve) => {
    const stdin = process.stdin;
    stdin.resume();
    stdin.setEncoding("utf-8");
    stdin.once("data", (data) => {
      stdin.pause();
      resolve(data.toString().trim());
    });
  });
}

export async function confirm(question: string): Promise<boolean> {
  const answer = await prompt(`${question} [y/N]: `);
  return answer.toLowerCase() === "y" || answer.toLowerCase() === "yes";
}
