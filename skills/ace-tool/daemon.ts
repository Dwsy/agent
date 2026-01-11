import { spawn } from "bun";
import { join, resolve } from "path";
import { existsSync, readFileSync, mkdirSync } from "fs";
import { homedir } from "os";

/**
 * 解析路径，支持 ~ 扩展
 */
function resolvePath(p: string): string {
  if (p.startsWith('~')) {
    return join(homedir(), p.slice(1));
  }
  return resolve(p);
}

// 加载 .env
const envPath = join(import.meta.dir, ".env");
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, "utf-8");
  envContent.split("\n").forEach(line => {
    const [key, ...value] = line.split("=");
    if (key && value && value.length > 0) {
      let val = value.join("=").trim();
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.substring(1, val.length - 1);
      } else if (val.startsWith("'") && val.endsWith("'")) {
        val = val.substring(1, val.length - 1);
      }
      process.env[key.trim()] = val;
    }
  });
}

// 配置
interface Config {
  apiKey: string;
  baseUrl: string;
  port: number;
  heartbeatTimeoutMinutes: number;
  rpcTimeoutSeconds: number;
}

/**
 * 配置管理器
 */
class ConfigManager {
  private _config: Config;

  constructor() {
    const apiKey = process.env.ACE_API_KEY;
    const baseUrl = process.env.ACE_BASE_URL;
    const port = parseInt(process.env.ACE_PORT || "4231");
    const heartbeatTimeoutMinutes = parseInt(process.env.ACE_HEARTBEAT_TIMEOUT_MINUTES || "120"); // 默认 120 分钟（2 小时）
    const rpcTimeoutSeconds = parseInt(process.env.ACE_RPC_TIMEOUT_SECONDS || "300"); // 默认 5 分钟（300 秒）

    if (!apiKey || !baseUrl) {
      throw new Error("Missing configuration in .env");
    }

    this._config = {
      apiKey,
      baseUrl,
      port,
      heartbeatTimeoutMinutes,
      rpcTimeoutSeconds
    };
  }

  get config(): Config {
    return this._config;
  }

  get heartbeatTimeoutMs(): number {
    return this._config.heartbeatTimeoutMinutes * 60 * 1000;
  }

  get rpcTimeoutMs(): number {
    return this._config.rpcTimeoutSeconds * 1000;
  }
}

/**
 * RPC 客户端
 */
class RpcClient {
  private process: any;
  private pendingRequests: Map<string, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
  }>;
  private messageBuffer = "";
  private rpcTimeoutMs: number;

  constructor(private configManager: ConfigManager) {
    this.process = null;
    this.pendingRequests = new Map();
    this.messageBuffer = "";
    this.rpcTimeoutMs = configManager.config.rpcTimeoutSeconds * 1000;
  }

  /**
   * 启动 ace-tool 进程
   */
  start(): void {
    console.log("Starting ace-tool process...");

    const acePath = process.env.ACE_PATH || "ace-tool";
    const logFile = join(import.meta.dir, ".ace-tool/ace-tool-raw.log");
    const logDir = join(import.meta.dir, ".ace-tool");
    if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });

    this.process = spawn({
      cmd: [acePath, "--base-url", this.configManager.config.baseUrl, "--token", this.configManager.config.apiKey, "--enable-log"],
      stdin: "pipe",
      stdout: "pipe",
      stderr: Bun.file(logFile),
    });

    console.log(`Ace-tool PID: ${this.process.pid}`);

    // 监听进程退出
    this.process.exited.then((code: number) => {
      console.log(`Ace-tool process exited with code: ${code}`);
      this.process = null;
    }).catch((err: Error) => {
      console.error('Ace-tool error:', err);
    });

    // 启动输出读取
    this.startOutputReader();
  }

  /**
   * 启动输出读取器
   */
  private startOutputReader(): void {
    const reader = this.process.stdout.getReader();
    const decoder = new TextDecoder();

    const readLoop = async () => {
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          this.messageBuffer += chunk;

          const lines = this.messageBuffer.split("\n");
          this.messageBuffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const msg = JSON.parse(line);
              if (msg.id && this.pendingRequests.has(msg.id)) {
                const { resolve, reject } = this.pendingRequests.get(msg.id);
                this.pendingRequests.delete(msg.id);
                if (msg.error) {
                  reject(new Error(typeof msg.error === 'string' ? msg.error : JSON.stringify(msg.error)));
                } else {
                  resolve(msg.result);
                }
              }
            } catch (e) {
              console.error("Failed to parse ace-tool output:", line);
            }
          }
        }
      } catch (error) {
        console.error("Output reader error:", error);
      }
    };

    readLoop().catch(console.error);
  }

  /**
   * 发送 JSON-RPC 请求
   */
  async sendRpc(method: string, params: any, id?: string): Promise<any> {
    const requestId = id || Math.floor(Math.random() * 1000000).toString();
    const request = {
      jsonrpc: "2.0",
      id: requestId,
      method,
      params
    };

    if (!this.process || !this.process.stdin) {
      throw new Error("Ace-tool process is not running");
    }

    this.process.stdin.write(new TextEncoder().encode(JSON.stringify(request) + "\n"));
    await this.process.stdin.flush();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error(`Timeout calling ${method}`));
        }
      }, this.rpcTimeoutMs);

      this.pendingRequests.set(requestId, {
        resolve: (res) => { clearTimeout(timeout); resolve(res); },
        reject: (err) => { clearTimeout(timeout); reject(err); }
      });
    });
  }

  /**
   * 发送通知（无响应）
   */
  async sendNotification(method: string, params: any): Promise<void> {
    const notification = {
      jsonrpc: "2.0",
      method,
      params
    };

    if (!this.process || !this.process.stdin) {
      console.error("Cannot send notification: process is not running");
      return;
    }

    this.process.stdin.write(new TextEncoder().encode(JSON.stringify(notification) + "\n"));
    await this.process.stdin.flush();
  }

  /**
   * 初始化 MCP 握手
   */
  async initialize(): Promise<void> {
    try {
      console.log("Initializing MCP handshake...");
      await this.sendRpc("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "pi-ace-bridge", version: "1.0.0" }
      });

      await this.sendNotification("notifications/initialized", {});
      console.log("MCP Initialized successfully.");
    } catch (e) {
      console.error("MCP Initialization failed:", e);
      throw e; // 重投异常以便 daemon 失败
    }
  }

  /**
   * 检查进程是否运行
   */
  isRunning(): boolean {
    return this.process !== null && this.process.pid !== undefined;
  }

  /**
   * 关闭进程
   */
  async shutdown(): Promise<void> {
    if (!this.process) {
      console.log("Ace-tool process already stopped");
      return;
    }

    console.log("Shutting down ace-tool process...");

    // 尝试优雅关闭
    this.process.kill('SIGTERM');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 如果还在运行，强制杀死
    if (this.process && this.process.pid) {
      console.log("Force killing ace-tool process...");
      this.process.kill('SIGKILL');
    }

    this.process = null;
  }
}

/**
 * 心跳管理器
 */
class HeartbeatManager {
  private timer: NodeJS.Timeout | null = null;
  public lastActivityTime: number;
  public timeoutMs: number;
  private onTimeout: () => void;

  constructor(timeoutMinutes: number, onTimeout: () => void) {
    this.timeoutMs = timeoutMinutes * 60 * 1000;
    this.lastActivityTime = Date.now();
    this.onTimeout = onTimeout;
  }

  /**
   * 更新活动时间
   */
  updateActivity(): void {
    this.lastActivityTime = Date.now();
  }

  /**
   * 启动心跳检测
   */
  start(): void {
    if (this.timeoutMs <= 0) {
      console.log("Heartbeat disabled (timeout = 0)");
      return;
    }

    console.log(`Starting heartbeat timer (${this.timeoutMs / 60000} minutes timeout)`);

    this.timer = setInterval(() => {
      const elapsed = Date.now() - this.lastActivityTime;
      
      if (elapsed >= this.timeoutMs) {
        console.log(`[Heartbeat] No activity for ${this.timeoutMs / 60000} minutes, triggering timeout...`);
        this.onTimeout();
      }
    }, 60000); // 每分钟检查一次
  }

  /**
   * 停止心跳
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * 获取剩余时间（分钟）
   */
  getRemainingMinutes(): number {
    const elapsed = Date.now() - this.lastActivityTime;
    const remaining = this.timeoutMs - elapsed;
    return Math.max(0, Math.ceil(remaining / 60000));
  }
}

/**
 * HTTP 服务器
 */
class HttpServer {
  private port: number;
  private rpcClient: RpcClient;
  private heartbeatManager: HeartbeatManager;
  public server: any;

  constructor(port: number, rpcClient: RpcClient, heartbeatManager: HeartbeatManager) {
    this.port = port;
    this.rpcClient = rpcClient;
    this.heartbeatManager = heartbeatManager;
    this.server = null;
  }

  /**
   * 启动 HTTP 服务器
   */
  start(): void {
    console.log(`Starting HTTP server on port ${this.port}`);

    this.server = Bun.serve({
      port: this.port,
      hostname: '0.0.0.0',
      fetch: async (req: Request) => this.handleRequest(req),
    });

    console.log(`HTTP server listening on port ${this.port}`);
  }

  /**
   * 处理 HTTP 请求
   */
  async handleRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);

    // Web UI 页面
    if (url.pathname === "/" || url.pathname === "/web") {
      this.heartbeatManager.updateActivity();
      return this.handleWebUI();
    }

    // 健康检查
    if (url.pathname === "/health") {
      return this.handleHealthCheck();
    }

    // 工具调用接口
    if (url.pathname === "/call" && req.method === "POST") {
      this.heartbeatManager.updateActivity();
      return this.handleToolCall(req);
    }

    // 其他请求返回 404
    return new Response("Not Found", { status: 404 });
  }

  /**
   * 处理 Web UI 页面
   */
  private async handleWebUI(): Promise<Response> {
    try {
      const webUIPath = join(import.meta.dir, "webui.ts");
      const { default: html } = await import(webUIPath);
      if (!html) {
        console.error("Web UI content is empty or undefined");
        return new Response("Web UI content is empty", { status: 500 });
      }
      return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    } catch (error) {
      console.error('Failed to load Web UI:', error);
      return new Response('Failed to load Web UI', { status: 500 });
    }
  }

  /**
   * 处理健康检查
   */
  private async handleHealthCheck(): Promise<Response> {
    const elapsed = Date.now() - this.heartbeatManager.lastActivityTime;
    const remaining = this.heartbeatManager.getRemainingMinutes();
    
    return new Response(JSON.stringify({
      status: this.rpcClient.isRunning() ? 'online' : 'stopped',
      uptime: Math.floor(elapsed / 1000), 
      lastActivity: new Date(this.heartbeatManager.lastActivityTime).toISOString(),
      remainingMinutes: remaining,
      rpcTimeout: this.rpcClient.configManager.config.rpcTimeoutSeconds,
      heartbeatTimeout: this.rpcClient.configManager.config.heartbeatTimeoutMinutes
    }), {
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  /**
   * 处理工具调用
   */
  private async handleToolCall(req: Request): Promise<Response> {
    try {
      const body = await req.json();
      const { method, params } = body;

      // 自动扩展项目路径中的 ~
      if (params && params.arguments && params.arguments.project_root_path) {
        params.arguments.project_root_path = resolvePath(params.arguments.project_root_path);
      }

      const result = await this.rpcClient.sendRpc(method, params);

      return new Response(JSON.stringify({ result }), {
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    } catch (error) {
      console.error("[HTTP] RPC error:", error);
      return new Response(JSON.stringify({ error: (error as Error).message }), {
        status: 500,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }
  }

  /**
   * 关闭服务器
   */
  async shutdown(): Promise<void> {
    if (this.server) {
      this.server.stop();
      this.server = null;
    }
  }
}

/**
 * Daemon Facade（守护进程门面）
 */
class DaemonFacade {
  public config: ConfigManager;
  private rpcClient: RpcClient;
  private heartbeatManager: HeartbeatManager;
  private httpServer: HttpServer;

  constructor(port?: number) {
    this.config = new ConfigManager();
    this.rpcClient = new RpcClient(this.config);
    this.heartbeatManager = new HeartbeatManager(
      this.config.config.heartbeatTimeoutMinutes,
      () => this.shutdown().then(() => process.exit(0))
    );
    this.httpServer = new HttpServer(port || this.config.config.port, this.rpcClient, this.heartbeatManager);
  }

  async initialize(): Promise<void> {
    console.log("Initializing Daemon Facade...");
    this.rpcClient.start();
    await this.rpcClient.initialize();
    this.heartbeatManager.start();
    this.httpServer.start();
    console.log("✅ Daemon Facade initialized successfully");
  }

  async shutdown(): Promise<void> {
    console.log("Shutting down Daemon Facade...");
    this.heartbeatManager.stop();
    await this.rpcClient.shutdown();
    await this.httpServer.shutdown();
    console.log("✅ Daemon Facade shutdown complete");
  }
}

/**
 * 主入口
 */
async function main() {
  try {
    const daemon = new DaemonFacade();
    await daemon.initialize();

    console.log("\n🎉 ACE Tool Daemon is running!");
    console.log(`🌐️ Web UI: http://localhost:${daemon.config.config.port}/`);

    process.on('SIGINT', async () => {
      await daemon.shutdown();
      process.exit(0);
    });

  } catch (error) {
    console.error('Failed to start daemon:', error);
    process.exit(1);
  }
}

main();
