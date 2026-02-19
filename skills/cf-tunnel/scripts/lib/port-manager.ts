/**
 * 端口暴露管理器 - 内存 + 临时文件存储
 * 管理通过 CF Tunnel 暴露的本地端口
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { isPortInUse, tmuxSessionExists, killTmuxSession, execSilent, findAvailablePort } from "./utils.ts";

const SHARE_DIR = path.join(os.homedir(), ".cf-tunnel");
const PORT_STATE_FILE = path.join(SHARE_DIR, "ports.json");
const TUNNEL_LOG_DIR = path.join(SHARE_DIR, "logs");

export type PortEntry = {
  id: string;           // 唯一标识
  name: string;         // 自定义名称
  localPort: number;    // 本地端口
  publicUrl?: string;   // 公网 URL
  pid?: number;         // tunnel 进程 ID
  sessionName: string;  // tmux session 名
  createdAt: string;
  status: "running" | "stopped" | "error";
  logFile: string;
  metadata?: Record<string, any>;
};

// 内存存储
let _portRegistry = new Map<string, PortEntry>();
let _initialized = false;

function ensureDirs(): void {
  if (!fs.existsSync(SHARE_DIR)) fs.mkdirSync(SHARE_DIR, { recursive: true });
  if (!fs.existsSync(TUNNEL_LOG_DIR)) fs.mkdirSync(TUNNEL_LOG_DIR, { recursive: true });
}

function generateId(): string {
  return `port-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function generateSessionName(port: number): string {
  return `cf-port-${port}`;
}

/**
 * 从临时文件加载状态
 */
export function loadPortState(): void {
  if (_initialized) return;
  ensureDirs();
  
  try {
    if (fs.existsSync(PORT_STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(PORT_STATE_FILE, "utf-8"));
      if (Array.isArray(data)) {
        for (const entry of data) {
          // 验证 session 是否还在运行
          const isRunning = tmuxSessionExists(entry.sessionName);
          entry.status = isRunning ? "running" : "stopped";
          
          // 如果运行中，尝试获取 URL
          if (isRunning && fs.existsSync(entry.logFile)) {
            entry.publicUrl = extractUrlFromLog(entry.logFile);
          }
          
          _portRegistry.set(entry.id, entry);
        }
      }
    }
  } catch (e) {
    console.error("加载端口状态失败:", e);
  }
  _initialized = true;
}

/**
 * 保存到临时文件
 */
export function savePortState(): void {
  ensureDirs();
  const data = Array.from(_portRegistry.values());
  fs.writeFileSync(PORT_STATE_FILE, JSON.stringify(data, null, 2), "utf-8");
}

/**
 * 从日志提取 URL
 */
function extractUrlFromLog(logFile: string): string | undefined {
  try {
    if (!fs.existsSync(logFile)) return undefined;
    const content = fs.readFileSync(logFile, "utf-8");
    const m = content.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
    return m?.[0];
  } catch {
    return undefined;
  }
}

/**
 * 列出所有端口暴露
 */
export function listPorts(): PortEntry[] {
  loadPortState();
  // 刷新状态
  for (const entry of _portRegistry.values()) {
    entry.status = tmuxSessionExists(entry.sessionName) ? "running" : "stopped";
    if (entry.status === "running" && !entry.publicUrl) {
      entry.publicUrl = extractUrlFromLog(entry.logFile);
    }
  }
  return Array.from(_portRegistry.values()).sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/**
 * 获取单个端口信息
 */
export function getPort(id: string): PortEntry | undefined {
  loadPortState();
  const entry = _portRegistry.get(id);
  if (entry) {
    entry.status = tmuxSessionExists(entry.sessionName) ? "running" : "stopped";
  }
  return entry;
}

/**
 * 通过本地端口查找
 */
export function findByLocalPort(port: number): PortEntry | undefined {
  loadPortState();
  for (const entry of _portRegistry.values()) {
    if (entry.localPort === port) {
      entry.status = tmuxSessionExists(entry.sessionName) ? "running" : "stopped";
      return entry;
    }
  }
  return undefined;
}

/**
 * 添加并暴露端口
 */
export async function addPort(
  port: number, 
  name?: string,
  metadata?: Record<string, any>
): Promise<PortEntry> {
  loadPortState();
  
  // 检查 cloudflared
  if (!execSilent("which cloudflared")) {
    throw new Error("未找到 cloudflared，请先安装");
  }
  
  // 检查端口是否监听
  if (!isPortInUse(port)) {
    throw new Error(`端口 ${port} 未监听，请先启动本地服务`);
  }
  
  // 检查是否已存在
  const existing = findByLocalPort(port);
  if (existing && existing.status === "running") {
    throw new Error(`端口 ${port} 已在暴露中 (ID: ${existing.id})`);
  }
  
  const id = generateId();
  const sessionName = generateSessionName(port);
  const logFile = path.join(TUNNEL_LOG_DIR, `${sessionName}.log`);
  
  // 清理旧 session
  if (tmuxSessionExists(sessionName)) {
    killTmuxSession(sessionName);
  }
  
  // 清理旧日志
  if (fs.existsSync(logFile)) {
    fs.unlinkSync(logFile);
  }
  
  // 启动 tunnel
  const cmd = `cloudflared tunnel --no-autoupdate --url http://localhost:${port} > "${logFile}" 2>&1`;
  execSync(`tmux new-session -d -s ${sessionName} "${cmd}"`, { stdio: "pipe" });
  
  const entry: PortEntry = {
    id,
    name: name || `Port ${port}`,
    localPort: port,
    sessionName,
    createdAt: new Date().toISOString(),
    status: "running",
    logFile,
    metadata,
  };
  
  _portRegistry.set(id, entry);
  savePortState();
  
  // 等待 URL
  await waitForUrl(entry, 15000);
  
  return entry;
}

/**
 * 等待 URL 生成
 */
async function waitForUrl(entry: PortEntry, timeoutMs: number): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const url = extractUrlFromLog(entry.logFile);
    if (url) {
      entry.publicUrl = url;
      savePortState();
      return;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

/**
 * 停止端口暴露
 */
export function removePort(id: string): boolean {
  loadPortState();
  const entry = _portRegistry.get(id);
  if (!entry) return false;
  
  if (tmuxSessionExists(entry.sessionName)) {
    killTmuxSession(entry.sessionName);
  }
  
  entry.status = "stopped";
  _portRegistry.delete(id);
  savePortState();
  
  return true;
}

/**
 * 停止指定本地端口的暴露
 */
export function removeByLocalPort(port: number): boolean {
  const entry = findByLocalPort(port);
  if (entry) {
    return removePort(entry.id);
  }
  return false;
}

/**
 * 停止所有端口暴露
 */
export function removeAllPorts(): number {
  loadPortState();
  let count = 0;
  for (const entry of _portRegistry.values()) {
    if (tmuxSessionExists(entry.sessionName)) {
      killTmuxSession(entry.sessionName);
      count++;
    }
  }
  _portRegistry.clear();
  savePortState();
  return count;
}

/**
 * 刷新所有端口状态
 */
export function refreshPorts(): PortEntry[] {
  loadPortState();
  const entries = Array.from(_portRegistry.values());
  
  for (const entry of entries) {
    const wasRunning = entry.status === "running";
    const isRunning = tmuxSessionExists(entry.sessionName);
    
    if (wasRunning && !isRunning) {
      // Tunnel 意外停止
      entry.status = "stopped";
    } else if (isRunning) {
      entry.status = "running";
      entry.publicUrl = extractUrlFromLog(entry.logFile);
    }
  }
  
  savePortState();
  return entries;
}

/**
 * 获取状态摘要
 */
export function getStatus(): { total: number; running: number; stopped: number } {
  const entries = listPorts();
  return {
    total: entries.length,
    running: entries.filter((e) => e.status === "running").length,
    stopped: entries.filter((e) => e.status === "stopped").length,
  };
}

// 初始化
loadPortState();
