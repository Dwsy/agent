import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { buildPortalHtml } from "./web-portal-html.ts";

export interface WebServerHandlers {
  listExisting: () => Promise<{ indexPath: string | null; entries: Array<Record<string, any>> }>;
  renderExisting: (payload: { path?: string; id?: string }) => Promise<{ html: string; title: string; sourcePath?: string }>;
  openWindow: (payload: { path?: string; id?: string }) => Promise<{ title: string; sourcePath?: string }>;
  generateRequest: (payload: { query: string; roots?: string[]; path?: string; id?: string }) => Promise<{ queuedPrompt: string }>;
  analyzeLocation: (payload: { location: Record<string, any> }) => Promise<{ queuedPrompt: string }>;
  refineTrace: (payload: { location: Record<string, any>; sourcePath?: string; historyId?: string }) => Promise<{ queuedPrompt: string }>;
}

export interface WebHistoryItem {
  id: string;
  title: string;
  html: string;
  sourcePath?: string;
  createdAt: string;
}

type WsPayload = Record<string, any>;

export class CodemapWebServer {
  private port: number;
  private handlers: WebServerHandlers;
  private server: ReturnType<typeof createServer> | null = null;
  private wsServer: WebSocketServer | null = null;
  private clients = new Set<WebSocket>();
  private history: WebHistoryItem[] = [];

  constructor(port: number, handlers: WebServerHandlers) {
    this.port = port;
    this.handlers = handlers;
  }

  getPort() {
    return this.port;
  }

  isRunning() {
    return Boolean(this.server);
  }

  async start() {
    if (this.server) {
      return;
    }

    this.server = createServer((req, res) => this.handleHttp(req, res));
    this.wsServer = new WebSocketServer({ noServer: true });

    this.server.on("upgrade", (req, socket, head) => {
      if (!this.wsServer) {
        socket.destroy();
        return;
      }
      if (req.url !== "/ws") {
        socket.destroy();
        return;
      }
      this.wsServer.handleUpgrade(req, socket, head, (ws) => {
        this.wsServer?.emit("connection", ws, req);
      });
    });

    this.wsServer.on("connection", (ws) => {
      this.clients.add(ws);
      ws.send(JSON.stringify({ type: "status", status: "connected", message: `已连接到 CodeMap portal :${this.port}`, kind: "success" }));
      ws.send(JSON.stringify({ type: "history_update", items: this.history }));
      ws.on("message", (buffer) => void this.handleWsMessage(ws, buffer.toString()));
      ws.on("close", () => this.clients.delete(ws));
      ws.on("error", () => this.clients.delete(ws));
    });

    await new Promise<void>((resolve, reject) => {
      this.server?.once("error", reject);
      this.server?.listen(this.port, "127.0.0.1", () => resolve());
    });
  }

  async stop() {
    const closeServer = this.server;
    const closeWs = this.wsServer;
    this.server = null;
    this.wsServer = null;

    for (const client of this.clients) {
      try {
        client.close();
      } catch {
      }
    }
    this.clients.clear();

    await new Promise<void>((resolve) => {
      if (!closeWs) {
        resolve();
        return;
      }
      closeWs.close(() => resolve());
    });

    await new Promise<void>((resolve) => {
      if (!closeServer) {
        resolve();
        return;
      }
      closeServer.close(() => resolve());
    });
  }

  broadcast(payload: WsPayload) {
    const json = JSON.stringify(payload);
    for (const client of this.clients) {
      if (client.readyState === client.OPEN) {
        client.send(json);
      }
    }
  }

  recordHistory(item: Omit<WebHistoryItem, "id" | "createdAt"> & { id?: string; createdAt?: string }) {
    const entry: WebHistoryItem = {
      id: item.id ?? `history-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: item.title,
      html: item.html,
      sourcePath: item.sourcePath,
      createdAt: item.createdAt ?? new Date().toISOString(),
    };
    this.history.unshift(entry);
    this.history = this.history.slice(0, 20);
    this.broadcast({ type: "history_update", items: this.history });
    return entry;
  }

  getHistory() {
    return [...this.history];
  }

  private handleHttp(req: IncomingMessage, res: ServerResponse) {
    const url = req.url ?? "/";
    if (url === "/" || url === "/index.html") {
      const html = buildPortalHtml(this.port);
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }
    if (url === "/health") {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true, port: this.port }));
      return;
    }
    res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: false, error: "Not found" }));
  }

  private async handleWsMessage(ws: WebSocket, raw: string) {
    let payload: WsPayload;
    try {
      payload = JSON.parse(raw);
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "Invalid JSON message" }));
      return;
    }

    try {
      switch (payload.type) {
        case "ping": {
          ws.send(JSON.stringify({ type: "pong" }));
          return;
        }
        case "list_existing": {
          const result = await this.handlers.listExisting();
          ws.send(JSON.stringify({ type: "existing_list", ...result }));
          return;
        }
        case "render_existing": {
          const result = await this.handlers.renderExisting(payload);
          const history = this.recordHistory({ title: result.title, html: result.html, sourcePath: result.sourcePath });
          ws.send(JSON.stringify({ type: "render_result", historyId: history.id, ...result }));
          return;
        }
        case "open_window": {
          const result = await this.handlers.openWindow(payload);
          ws.send(JSON.stringify({ type: "status", status: "window_opened", message: `已打开原生窗口：${result.title}`, kind: "success" }));
          return;
        }
        case "generate_request": {
          const result = await this.handlers.generateRequest(payload);
          ws.send(JSON.stringify({ type: "status", status: "queued", message: "已向当前 agent 会话注入生成请求", kind: "success", prompt: result.queuedPrompt }));
          return;
        }
        case "analyze_location": {
          const result = await this.handlers.analyzeLocation(payload);
          ws.send(JSON.stringify({ type: "status", status: "location_queued", message: "已把定位点分析请求注入 agent", kind: "success", prompt: result.queuedPrompt }));
          return;
        }
        case "refine_trace": {
          const result = await this.handlers.refineTrace(payload);
          ws.send(JSON.stringify({ type: "status", status: "trace_refine_queued", message: "已把 trace 增量修正请求注入 agent", kind: "success", prompt: result.queuedPrompt }));
          return;
        }
        case "history_render": {
          const item = this.history.find((entry) => entry.id === payload.id);
          if (!item) {
            ws.send(JSON.stringify({ type: "error", message: `History item not found: ${payload.id}` }));
            return;
          }
          ws.send(JSON.stringify({ type: "render_result", html: item.html, title: item.title, sourcePath: item.sourcePath, historyId: item.id }));
          return;
        }
        case "history_open": {
          const item = this.history.find((entry) => entry.id === payload.id);
          if (!item) {
            ws.send(JSON.stringify({ type: "error", message: `History item not found: ${payload.id}` }));
            return;
          }
          if (!item.sourcePath) {
            ws.send(JSON.stringify({ type: "error", message: "该历史记录没有 sourcePath，无法直接打开原生窗口" }));
            return;
          }
          const result = await this.handlers.openWindow({ path: item.sourcePath });
          ws.send(JSON.stringify({ type: "status", status: "window_opened", message: `已从历史打开原生窗口：${result.title}`, kind: "success" }));
          return;
        }
        default:
          ws.send(JSON.stringify({ type: "error", message: `Unknown message type: ${payload.type}` }));
      }
    } catch (error: any) {
      ws.send(JSON.stringify({ type: "error", message: error.message ?? String(error) }));
    }
  }
}
