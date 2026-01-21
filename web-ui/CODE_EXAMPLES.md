# Web UI 扩展 - 代码示例

本文档提供了 Web UI 扩展的核心代码示例，供开发参考。

---

## 目录

- [后端代码示例](#后端代码示例)
- [前端代码示例](#前端代码示例)
- [配置文件示例](#配置文件示例)
- [测试代码示例](#测试代码示例)

---

## 后端代码示例

### 1. WebServer 主类

```typescript
// packages/coding-agent/src/modes/web/server.ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import type { AgentSession } from "../../core/agent-session.js";
import { sessionsRouter } from "./routes/sessions.js";
import { messagesRouter } from "./routes/messages.js";
import { toolsRouter } from "./routes/tools.js";
import { filesRouter } from "./routes/files.js";

export interface WebServerOptions {
  port?: number;
  host?: string;
  session: AgentSession;
  cors?: {
    origin?: string | string[];
    credentials?: boolean;
  };
}

export class WebServer {
  private app: Hono;
  private server?: Deno.HttpServer | ReturnType<typeof import("node:http").createServer>;
  private subscribers: Set<(event: ServerEvent) => void> = new Set();

  constructor(private options: WebServerOptions) {
    this.app = new Hono();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware() {
    // CORS
    const corsOrigin = this.options.cors?.origin || "http://localhost:5173";
    this.app.use("*", cors({
      origin: corsOrigin,
      credentials: this.options.cors?.credentials ?? true,
    }));

    // Request logging
    this.app.use("*", async (c, next) => {
      const start = Date.now();
      await next();
      const duration = Date.now() - start;
      console.log(`${c.req.method} ${c.req.path} - ${c.req.status} (${duration}ms)`);
    });

    // Error handling
    this.app.onError((err, c) => {
      console.error("Server error:", err);
      return c.json({ error: err.message }, 500);
    });

    // 404 handling
    this.app.notFound((c) => {
      return c.json({ error: "Not found" }, 404);
    });
  }

  private setupRoutes() {
    // Global endpoints
    this.app.get("/global/health", (c) => {
      return c.json({
        status: "ok",
        version: "0.45.0",
      });
    });

    // SSE event stream
    this.app.get("/global/event", (c) => {
      return streamSSE(c, async (stream) => {
        // Send initial connection event
        await stream.writeSSE({
          event: "server.connected",
          data: JSON.stringify({ version: "0.45.0" }),
        });

        // Subscribe to agent events
        const unsubscribe = this.options.session.subscribe((agentEvent) => {
          const serverEvent = this.agentEventToServerEvent(agentEvent);
          stream.writeSSE({
            event: serverEvent.type,
            data: JSON.stringify(serverEvent),
          });
        });

        // Keep connection alive
        const keepAlive = setInterval(async () => {
          await stream.writeSSE({ event: "ping", data: "" });
        }, 30000);

        // Cleanup on disconnect
        c.req.raw.signal.addEventListener("abort", () => {
          clearInterval(keepAlive);
          unsubscribe();
        });

        // Wait for connection to close
        await new Promise((resolve) => {
          c.req.raw.signal.addEventListener("abort", resolve);
        });
      });
    });

    // API routes
    this.app.route("/sessions", sessionsRouter);
    this.app.route("/tools", toolsRouter);
    this.app.route("/file", filesRouter);

    // Messages route with session parameter
    this.app.route("/sessions/:sessionId/messages", messagesRouter);
  }

  private agentEventToServerEvent(event: AgentEvent): ServerEvent {
    switch (event.type) {
      case "state-update":
        return {
          type: "state.update",
          state: event.state,
        };

      case "message-start":
        return {
          type: "message.created",
          message: event.message,
        };

      case "message-update":
        return {
          type: "message.updated",
          message: event.message,
          delta: event.delta,
        };

      case "message-end":
        return {
          type: "message.updated",
          message: event.message,
        };

      case "tool-start":
        return {
          type: "tool.start",
          toolCall: event.toolCall,
        };

      case "tool-end":
        return {
          type: "tool.end",
          toolCall: event.toolCall,
          result: event.result,
        };

      default:
        return {
          type: event.type,
          data: event,
        };
    }
  }

  async start(): Promise<void> {
    const port = this.options.port ?? 3721;
    const host = this.options.host ?? "127.0.0.1";

    // Check if running in Deno or Node.js
    if (typeof Deno !== "undefined") {
      this.server = Deno.serve({ hostname: host, port }, this.app.fetch);
      console.log(`Web server started: http://${host}:${port}`);
    } else {
      const { createServer } = await import("node:http");
      const { createNodeServer } = await import("@hono/node-server");

      this.server = createNodeServer({
        fetch: this.app.fetch,
        hostname: host,
        port,
      });

      console.log(`Web server started: http://${host}:${port}`);
    }
  }

  async stop(): Promise<void> {
    if (this.server) {
      if (typeof Deno !== "undefined") {
        (this.server as Deno.HttpServer).shutdown();
      } else {
        (this.server as ReturnType<typeof import("node:http").createServer>).close();
      }
      this.server = undefined;
      console.log("Web server stopped");
    }
  }
}

// Type definitions
type ServerEvent =
  | { type: "server.connected"; data: { version: string } }
  | { type: "ping"; data: string }
  | { type: "state.update"; state: AgentState }
  | { type: "message.created"; message: AgentMessage }
  | { type: "message.updated"; message: AgentMessage; delta?: string }
  | { type: "tool.start"; toolCall: ToolCall }
  | { type: "tool.end"; toolCall: ToolCall; result: ToolResult };
```

### 2. 会话路由

```typescript
// packages/coding-agent/src/modes/web/routes/sessions.ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

const router = new Hono<{ Variables: { session: AgentSession } }>();

// Middleware to inject session
router.use("*", async (c, next) => {
  const session = c.get("session");
  if (!session) {
    return c.json({ error: "No session available" }, 500);
  }
  await next();
});

// List all sessions (metadata only)
router.get("/", (c) => {
  const session = c.get("session");
  // Note: In a real implementation, you'd have a SessionManager
  // This is a simplified example
  return c.json({
    sessions: [
      {
        id: session.id,
        title: "Current Session",
        createdAt: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        messageCount: session.state.messages.length,
        model: session.state.model,
      },
    ],
  });
});

// Get current session
router.get("/current", (c) => {
  const session = c.get("session");
  return c.json({
    id: session.id,
    state: session.state,
  });
});

// Create new session
const createSessionSchema = z.object({
  model: z.object({
    provider: z.string(),
    id: z.string(),
    name: z.string().optional(),
  }).optional(),
  systemPrompt: z.string().optional(),
  thinkingLevel: z.enum(["off", "minimal", "low", "medium", "high"]).optional(),
});

router.post("/", zValidator("json", createSessionSchema), async (c) => {
  const session = c.get("session");
  const data = c.req.valid("json");

  // Fork current session
  const newSession = session.fork();

  // Apply new settings if provided
  if (data.model) {
    // Load model from pi-ai
    const { getModel } = await import("@mariozechner/pi-ai");
    const model = getModel(data.model.provider, data.model.id);
    newSession.setModel(model);
  }

  if (data.systemPrompt) {
    newSession.setSystemPrompt(data.systemPrompt);
  }

  if (data.thinkingLevel) {
    newSession.setThinkingLevel(data.thinkingLevel);
  }

  return c.json({
    id: newSession.id,
    state: newSession.state,
  });
});

// Fork session
router.post("/:sessionId/fork", (c) => {
  const session = c.get("session");
  const forked = session.fork();

  return c.json({
    id: forked.id,
    parentId: session.id,
    state: forked.state,
  });
});

// Update session
const updateSessionSchema = z.object({
  title: z.string().optional(),
  model: z.object({
    provider: z.string(),
    id: z.string(),
  }).optional(),
  thinkingLevel: z.enum(["off", "minimal", "low", "medium", "high"]).optional(),
});

router.patch("/:sessionId", zValidator("json", updateSessionSchema), async (c) => {
  const session = c.get("session");
  const data = c.req.valid("json");

  if (data.model) {
    const { getModel } = await import("@mariozechner/pi-ai");
    const model = getModel(data.model.provider, data.model.id);
    session.setModel(model);
  }

  if (data.thinkingLevel) {
    session.setThinkingLevel(data.thinkingLevel);
  }

  return c.json({
    id: session.id,
    state: session.state,
  });
});

// Delete session
router.delete("/:sessionId", (c) => {
  // Note: In a real implementation, you'd have a SessionManager
  // to handle session deletion
  return c.json({ success: true });
});

export { router as sessionsRouter };
```

### 3. 消息路由

```typescript
// packages/coding-agent/src/modes/web/routes/messages.ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

const router = new Hono<{ Variables: { session: AgentSession } }>();

// Middleware to inject session
router.use("*", async (c, next) => {
  const session = c.get("session");
  if (!session) {
    return c.json({ error: "No session available" }, 500);
  }
  await next();
});

// Send message
const sendMessageSchema = z.object({
  message: z.string(),
  attachments: z.array(z.object({
    id: z.string(),
    type: z.enum(["image", "document"]),
    fileName: z.string(),
    mimeType: z.string(),
    size: z.number(),
    content: z.string(), // base64
    extractedText: z.string().optional(),
  })).optional(),
});

router.post("/", zValidator("json", sendMessageSchema), async (c) => {
  const session = c.get("session");
  const { message, attachments } = c.req.valid("json");

  if (session.state.isStreaming) {
    return c.json({ error: "Agent is currently streaming" }, 400);
  }

  try {
    if (attachments && attachments.length > 0) {
      await session.prompt({
        role: "user-with-attachments",
        content: message,
        attachments,
        timestamp: Date.now(),
      });
    } else {
      await session.prompt(message);
    }

    return c.json({
      success: true,
      messageId: `msg-${Date.now()}`,
    });
  } catch (error) {
    return c.json({ error: (error as Error).message }, 500);
  }
});

// Execute bash command
const bashSchema = z.object({
  command: z.string(),
  timeout: z.number().optional(),
});

router.post("/bash", zValidator("json", bashSchema), async (c) => {
  const session = c.get("session");
  const { command, timeout } = c.req.valid("json");

  try {
    const result = await session.executeTool("bash", {
      command,
      timeout: timeout ?? 30000,
    });

    return c.json({
      success: true,
      result,
    });
  } catch (error) {
    return c.json({ error: (error as Error).message }, 500);
  }
});

// Abort current operation
router.post("/abort", (c) => {
  const session = c.get("session");
  session.abort();

  return c.json({ success: true });
});

// Set model
const setModelSchema = z.object({
  provider: z.string(),
  id: z.string(),
});

router.post("/model", zValidator("json", setModelSchema), async (c) => {
  const session = c.get("session");
  const { provider, id } = c.req.valid("json");

  try {
    const { getModel } = await import("@mariozechner/pi-ai");
    const model = getModel(provider, id);
    session.setModel(model);

    return c.json({
      success: true,
      model,
    });
  } catch (error) {
    return c.json({ error: (error as Error).message }, 500);
  }
});

// Set thinking level
const setThinkingSchema = z.object({
  level: z.enum(["off", "minimal", "low", "medium", "high"]),
});

router.post("/thinking", zValidator("json", setThinkingSchema), (c) => {
  const session = c.get("session");
  const { level } = c.req.valid("json");

  session.setThinkingLevel(level);

  return c.json({
    success: true,
    thinkingLevel: level,
  });
});

export { router as messagesRouter };
```

### 4. 文件路由

```typescript
// packages/coding-agent/src/modes/web/routes/files.ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { read, write } from "@mariozechner/pi-agent-core";

const router = new Hono();

// List files
router.get("/", zValidator("query", z.object({
  path: z.string().default("./"),
})), async (c) => {
  const { path } = c.req.valid("query");

  try {
    const files = await read({ path });
    return c.json({
      files: files,
    });
  } catch (error) {
    return c.json({ error: (error as Error).message }, 500);
  }
});

// Read file content
router.get("/content", zValidator("query", z.object({
  path: z.string(),
})), async (c) => {
  const { path } = c.req.valid("query");

  try {
    const content = await read({ path, content: true });
    return c.json({
      content: content,
      encoding: "utf-8",
    });
  } catch (error) {
    return c.json({ error: (error as Error).message }, 500);
  }
});

// Write file
router.put("/content", zValidator("json", z.object({
  path: z.string(),
  content: z.string(),
})), async (c) => {
  const { path, content } = c.req.valid("json");

  try {
    await write({ path, content });
    return c.json({ success: true });
  } catch (error) {
    return c.json({ error: (error as Error).message }, 500);
  }
});

// Get git status
router.get("/status", async (c) => {
  try {
    // Execute git status command
    const { exec } = await import("child_process");
    const result = await new Promise<string>((resolve, reject) => {
      exec("git status --porcelain", (error, stdout) => {
        if (error) reject(error);
        else resolve(stdout);
      });
    });

    const lines = result.trim().split("\n");
    const modified: string[] = [];
    const added: string[] = [];
    const deleted: string[] = [];
    const untracked: string[] = [];

    for (const line of lines) {
      const status = line.substring(0, 2);
      const file = line.substring(3);

      if (status.startsWith("M")) modified.push(file);
      else if (status.startsWith("A")) added.push(file);
      else if (status.startsWith("D")) deleted.push(file);
      else if (status.startsWith("??")) untracked.push(file);
    }

    // Get current branch
    const branchResult = await new Promise<string>((resolve, reject) => {
      exec("git branch --show-current", (error, stdout) => {
        if (error) reject(error);
        else resolve(stdout.trim());
      });
    });

    return c.json({
      branch: branchResult,
      modified,
      added,
      deleted,
      untracked,
    });
  } catch (error) {
    return c.json({
      branch: "unknown",
      modified: [],
      added: [],
      deleted: [],
      untracked: [],
    });
  }
});

export { router as filesRouter };
```

### 5. Web 模式入口

```typescript
// packages/coding-agent/src/modes/web/index.ts
import { WebServer } from "./server.js";
import type { AgentSession } from "../../core/agent-session.js";

export interface WebModeOptions {
  port?: number;
  host?: string;
  session: AgentSession;
  cors?: {
    origin?: string | string[];
    credentials?: boolean;
  };
}

export async function runWebMode(options: WebModeOptions) {
  const server = new WebServer(options);

  // Start server
  await server.start();

  // Handle graceful shutdown
  const shutdown = async () => {
    console.log("\nShutting down web server...");
    await server.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Keep process alive
  console.log("Press Ctrl+C to stop the server");
}
```

---

## 前端代码示例

### 1. ServerContext

```typescript
// packages/web-ui-app/src/context/server.ts
import {
  createContext,
  useContext,
  createSignal,
  onMount,
  onCleanup,
  Accessor,
  Setter,
} from "solid-js";
import type { ServerEvent } from "../types/index.js";

interface ServerContextValue {
  // Connection state
  connected: Accessor<boolean>;
  connecting: Accessor<boolean>;
  error: Accessor<Error | null>;

  // Event handling
  subscribe: (callback: (event: ServerEvent) => void) => () => void;

  // Send commands
  send: (command: RpcCommand) => Promise<RpcResponse>;

  // Fetch wrapper
  fetch: typeof fetch;
}

const ServerContext = createContext<ServerContextValue>();

export function useServer() {
  const context = useContext(ServerContext);
  if (!context) {
    throw new Error("useServer must be used within a ServerProvider");
  }
  return context;
}

export function ServerProvider(props: { children: JSX.Element }) {
  const baseUrl = () => localStorage.getItem("pi-server-url") || "http://localhost:3721";

  // Connection state
  const [connected, setConnected] = createSignal(false);
  const [connecting, setConnecting] = createSignal(true);
  const [error, setError] = createSignal<Error | null>(null);

  // Event storage
  const [events, setEvents] = createSignal<ServerEvent[]>([]);
  const [subscribers, setSubscribers] = createSignal<Set<(event: ServerEvent) => void>>(new Set());

  let eventSource: EventSource | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  const RECONNECT_DELAY = 3000;
  const MAX_RECONNECT_ATTEMPTS = 10;
  let reconnectAttempts = 0;

  const connect = () => {
    setConnecting(true);
    setError(null);

    try {
      eventSource = new EventSource(`${baseUrl()}/global/event`);

      eventSource.onopen = () => {
        console.log("[Server] Connected");
        setConnected(true);
        setConnecting(false);
        setEvents([]);
        reconnectAttempts = 0;
      };

      eventSource.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data) as ServerEvent;
          setEvents((prev) => [...prev, event]);

          // Notify all subscribers
          subscribers().forEach((callback) => callback(event));
        } catch (err) {
          console.error("[Server] Failed to parse event:", err);
        }
      };

      eventSource.onerror = () => {
        console.error("[Server] Connection error");
        setConnected(false);
        eventSource?.close();

        // Attempt to reconnect
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts++;
          console.log(`[Server] Reconnecting... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
          reconnectTimer = setTimeout(connect, RECONNECT_DELAY);
        } else {
          setError(new Error("Failed to connect to server after multiple attempts"));
          setConnecting(false);
        }
      };
    } catch (err) {
      setError(err as Error);
      setConnecting(false);
    }
  };

  const disconnect = () => {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    setConnected(false);
  };

  const subscribe = (callback: (event: ServerEvent) => void): (() => void) => {
    const newSubscribers = new Set(subscribers());
    newSubscribers.add(callback);
    setSubscribers(newSubscribers);

    // Return unsubscribe function
    return () => {
      const updated = new Set(subscribers());
      updated.delete(callback);
      setSubscribers(updated);
    };
  };

  const send = async (command: RpcCommand): Promise<RpcResponse> => {
    const response = await fetch(`${baseUrl()}/sessions/current/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(command),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  };

  const fetchWrapper: typeof fetch = async (url, options) => {
    return fetch(`${baseUrl()}${url}`, options);
  };

  // Lifecycle
  onMount(() => {
    connect();

    return () => {
      disconnect();
    };
  });

  const value: ServerContextValue = {
    connected,
    connecting,
    error,
    subscribe,
    send,
    fetch: fetchWrapper,
  };

  return (
    <ServerContext.Provider value={value}>
      {props.children}
    </ServerContext.Provider>
  );
}

// Type definitions
type RpcCommand =
  | { type: "prompt"; message: string; attachments?: any[] }
  | { type: "abort" }
  | { type: "setModel"; provider: string; model: string }
  | { type: "setThinkingLevel"; level: "off" | "minimal" | "low" | "medium" | "high" };

type RpcResponse =
  | { success: true; data?: any }
  | { success: false; error: string };
```

### 2. AppShell 组件

```typescript
// packages/web-ui-app/src/components/Layout/AppShell.tsx
import { Component, JSX } from "solid-js";
import { Sidebar } from "./Sidebar";
import { MainArea } from "../MainArea/ChatArea";

export const AppShell: Component<{ children?: JSX.Element }> = (props) => {
  return (
    <div class="flex h-screen w-full bg-background text-foreground overflow-hidden">
      {/* Sidebar */}
      <Sidebar class="w-64 shrink-0 border-r border-border" />

      {/* Main Content */}
      <div class="flex-1 flex flex-col min-w-0">
        {props.children || <MainArea />}
      </div>
    </div>
  );
};
```

### 3. Sidebar 组件

```typescript
// packages/web-ui-app/src/components/Layout/Sidebar.tsx
import { Component, JSX } from "solid-js";
import { SidebarHeader } from "./SidebarHeader";
import { SidebarItem } from "./SidebarItem";
import { History, Plus, Settings, FileText } from "lucide-solid";

export const Sidebar: Component<{ class?: string }> = (props) => {
  return (
    <div class={`flex flex-col h-full bg-muted/30 ${props.class || ""}`}>
      {/* Header */}
      <SidebarHeader title="Pi Agent" />

      {/* New Session Button */}
      <div class="p-2">
        <button
          class="w-full flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          onClick={() => {
            // TODO: Implement new session
            console.log("New session");
          }}
        >
          <Plus size={16} />
          <span class="text-sm font-medium">New Session</span>
        </button>
      </div>

      {/* Session List */}
      <div class="flex-1 overflow-y-auto px-2 py-2">
        <div class="text-xs font-medium text-muted-foreground mb-2 px-2">
          Recent Sessions
        </div>
        <div class="space-y-1">
          <SidebarItem
            icon={FileText}
            label="Project Setup"
            onClick={() => console.log("Load session: Project Setup")}
          />
          <SidebarItem
            icon={FileText}
            label="Code Review"
            onClick={() => console.log("Load session: Code Review")}
          />
          <SidebarItem
            icon={FileText}
            label="Debugging"
            onClick={() => console.log("Load session: Debugging")}
          />
        </div>
      </div>

      {/* Bottom Actions */}
      <div class="p-2 border-t border-border">
        <SidebarItem
          icon={Settings}
          label="Settings"
          onClick={() => console.log("Open settings")}
        />
      </div>
    </div>
  );
};
```

### 4. MainArea 组件

```typescript
// packages/web-ui-app/src/components/MainArea/ChatArea.tsx
import { Component, onMount, onCleanup } from "solid-js";
import { useServer } from "../../context/server";
import { AgentInterface } from "@mariozechner/pi-web-ui";
import type { ServerEvent } from "../../types/index.js";

export const ChatArea: Component = () => {
  const server = useServer();
  let agentInterfaceRef: AgentInterface;

  // Subscribe to server events
  onMount(() => {
    const unsubscribe = server.subscribe((event: ServerEvent) => {
      console.log("[ChatArea] Event:", event.type);

      // Adapt server events to AgentInterface
      if (event.type === "message.updated" && agentInterfaceRef) {
        // Update streaming message
        // Note: AgentInterface expects specific event format
        // You may need to adapt events
      }
    });

    onCleanup(() => {
      unsubscribe();
    });
  });

  return (
    <div class="flex-1 flex flex-col h-full overflow-hidden">
      {/* AgentInterface -复用现有组件 */}
      <agent-interface
        ref={(el: any) => agentInterfaceRef = el}
        enableAttachments={true}
        enableModelSelector={true}
        enableThinkingSelector={true}
        showThemeToggle={true}
      />
    </div>
  );
};
```

### 5. FileTree 组件

```typescript
// packages/web-ui-app/src/components/MainArea/FileTree.tsx
import { Component, createSignal, onMount } from "solid-js";
import { useServer } from "../../context/server";
import { ChevronRight, ChevronDown, File, Folder, FolderOpen } from "lucide-solid";

interface FileNode {
  name: string;
  type: "file" | "directory";
  path: string;
  size?: number;
  children?: FileNode[];
}

export const FileTree: Component<{ class?: string }> = (props) => {
  const server = useServer();
  const [files, setFiles] = createSignal<FileNode[]>([]);
  const [expanded, setExpanded] = createSignal<Set<string>>(new Set());
  const [loading, setLoading] = createSignal(false);

  const loadFiles = async (path: string = "./") => {
    setLoading(true);
    try {
      const response = await server.fetch(`/file?path=${encodeURIComponent(path)}`);
      const data = await response.json();
      setFiles(data.files || []);
    } catch (error) {
      console.error("[FileTree] Failed to load files:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (path: string) => {
    const current = expanded();
    const newSet = new Set(current);

    if (newSet.has(path)) {
      newSet.delete(path);
    } else {
      newSet.add(path);
    }

    setExpanded(newSet);
  };

  const renderNode = (node: FileNode, level: number = 0): JSX.Element => {
    const isExpanded = expanded().has(node.path);
    const isDir = node.type === "directory";

    return (
      <div key={node.path}>
        <div
          class="flex items-center gap-2 px-2 py-1 hover:bg-muted/50 cursor-pointer text-sm"
          style={{ "padding-left": `${level * 16 + 8}px` }}
          onClick={() => isDir && toggleExpand(node.path)}
        >
          {isDir ? (
            isExpanded ? (
              <ChevronDown size={14} class="text-muted-foreground" />
            ) : (
              <ChevronRight size={14} class="text-muted-foreground" />
            )
          ) : null}

          {isDir ? (
            isExpanded ? (
              <FolderOpen size={16} class="text-blue-500" />
            ) : (
              <Folder size={16} class="text-blue-500" />
            )
          ) : (
            <File size={16} class="text-muted-foreground" />
          )}

          <span class={isDir ? "font-medium" : ""}>{node.name}</span>
        </div>

        {isDir && isExpanded && node.children && (
          <div>
            {node.children.map((child) => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  onMount(() => {
    loadFiles();
  });

  return (
    <div class={`h-full overflow-y-auto bg-background border-t border-border ${props.class || ""}`}>
      <div class="px-3 py-2 border-b border-border bg-muted/30">
        <div class="text-xs font-medium text-muted-foreground">
          File Explorer
        </div>
      </div>

      {loading() ? (
        <div class="p-4 text-center text-muted-foreground text-sm">
          Loading files...
        </div>
      ) : (
        <div class="py-1">
          {files().map((file) => renderNode(file))}
        </div>
      )}
    </div>
  );
};
```

### 6. Terminal 组件

```typescript
// packages/web-ui-app/src/components/MainArea/Terminal.tsx
import { Component, createSignal, onMount, onCleanup } from "solid-js";
import { useServer } from "../../context/server";
import { Terminal as TerminalIcon } from "lucide-solid";

interface TerminalLine {
  type: "input" | "output" | "error";
  content: string;
  timestamp: number;
}

export const Terminal: Component<{ class?: string }> = (props) => {
  const server = useServer();
  const [lines, setLines] = createSignal<TerminalLine[]>([]);
  const [autoScroll, setAutoScroll] = createSignal(true);
  let containerRef: HTMLDivElement;

  const addLine = (type: TerminalLine["type"], content: string) => {
    setLines((prev) => [...prev, { type, content, timestamp: Date.now() }]);
  };

  const executeCommand = async (command: string) => {
    addLine("input", `$ ${command}`);

    try {
      const response = await server.fetch("/sessions/current/bash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command }),
      });

      const data = await response.json();

      if (data.success && data.result) {
        if (data.result.stdout) {
          addLine("output", data.result.stdout);
        }
        if (data.result.stderr) {
          addLine("error", data.result.stderr);
        }
      }
    } catch (error) {
      addLine("error", (error as Error).message);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      const input = e.currentTarget as HTMLTextAreaElement;
      const command = input.value.trim();

      if (command) {
        executeCommand(command);
        input.value = "";
      }
    }
  };

  // Auto-scroll to bottom
  onMount(() => {
    const observer = new MutationObserver(() => {
      if (autoScroll() && containerRef) {
        containerRef.scrollTop = containerRef.scrollHeight;
      }
    });

    if (containerRef) {
      observer.observe(containerRef, { childList: true });
    }

    onCleanup(() => {
      observer.disconnect();
    });
  });

  return (
    <div class={`h-full flex flex-col bg-black text-green-400 font-mono text-sm ${props.class || ""}`}>
      {/* Header */}
      <div class="px-3 py-2 bg-gray-900 border-b border-gray-700 flex items-center gap-2">
        <TerminalIcon size={14} />
        <span class="text-xs text-gray-400">Terminal</span>
      </div>

      {/* Output */}
      <div
        ref={(el) => containerRef = el}
        class="flex-1 overflow-y-auto p-2 space-y-1"
      >
        {lines().map((line) => (
          <div
            class={`whitespace-pre-wrap break-all ${
              line.type === "input"
                ? "text-white"
                : line.type === "error"
                  ? "text-red-400"
                  : "text-green-400"
            }`}
          >
            {line.content}
          </div>
        ))}
      </div>

      {/* Input */}
      <div class="p-2 border-t border-gray-700">
        <textarea
          class="w-full bg-transparent border-none outline-none text-white resize-none"
          placeholder="Type a command..."
          rows={1}
          onKeyDown={handleKeyDown}
        />
      </div>
    </div>
  );
};
```

---

## 配置文件示例

### 1. package.json (web-ui-app)

```json
{
  "name": "@mariozechner/pi-web-ui-app",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "lint": "eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0",
    "format": "prettier --write \"src/**/*.{ts,tsx,css}\""
  },
  "dependencies": {
    "@mariozechner/pi-web-ui": "workspace:*",
    "solid-js": "^1.8.0",
    "@solidjs/router": "^0.10.0",
    "@solid-primitives/event-source": "^1.3.0",
    "lucide-solid": "^0.300.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.7.0",
    "vite": "^5.0.0",
    "vite-plugin-solid": "^2.10.0",
    "eslint": "^8.0.0",
    "prettier": "^3.0.0",
    "tailwindcss": "^3.4.0",
    "autoprefixer": "^10.0.0",
    "postcss": "^8.0.0"
  }
}
```

### 2. vite.config.ts

```typescript
import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";

export default defineConfig({
  plugins: [solidPlugin()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3721",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  build: {
    target: "esnext",
    polyfillDynamicImport: false,
  },
  resolve: {
    alias: {
      "@mariozechner/pi-web-ui": "/packages/web-ui/src",
    },
  },
});
```

### 3. tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "preserve",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "jsxImportSource": "solid-js"
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

### 4. tailwind.config.js

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "../../web-ui/src/**/*.{js,ts}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
      },
    },
  },
  plugins: [],
};
```

---

## 测试代码示例

### 1. 后端测试

```typescript
// packages/coding-agent/src/modes/web/server.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { WebServer } from "./server";
import { AgentSession } from "../../core/agent-session.js";

describe("WebServer", () => {
  let server: WebServer;
  let session: AgentSession;

  beforeEach(() => {
    session = new AgentSession({});
    server = new WebServer({
      port: 0, // Use random port for testing
      session,
    });
  });

  afterEach(async () => {
    await server.stop();
  });

  it("should start successfully", async () => {
    await server.start();
    expect(server).toBeDefined();
  });

  it("should respond to health check", async () => {
    await server.start();

    const response = await fetch("http://localhost:3721/global/health");
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.status).toBe("ok");
    expect(data.version).toBe("0.45.0");
  });

  it("should establish SSE connection", async () => {
    await server.start();

    const eventSource = new EventSource("http://localhost:3721/global/event");

    await new Promise<void>((resolve, reject) => {
      eventSource.onopen = () => resolve();
      eventSource.onerror = reject;

      setTimeout(() => {
        eventSource.close();
        reject(new Error("Connection timeout"));
      }, 5000);
    });

    eventSource.close();
  });
});
```

### 2. 前端测试

```typescript
// packages/web-ui-app/src/context/server.test.ts
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@solidjs/testing-library";
import { ServerProvider, useServer } from "./server";

describe("useServer", () => {
  it("should provide server context", () => {
    const wrapper = (props: { children: JSX.Element }) => (
      <ServerProvider>{props.children}</ServerProvider>
    );

    const { result } = renderHook(() => useServer(), { wrapper });
    expect(result).toBeDefined();
  });

  it("should track connection state", () => {
    const wrapper = (props: { children: JSX.Element }) => (
      <ServerProvider>{props.children}</ServerProvider>
    );

    const { result } = renderHook(() => useServer(), { wrapper });
    expect(result.connected()).toBe(false); // Initially not connected
  });

  it("should allow subscribing to events", () => {
    const wrapper = (props: { children: JSX.Element }) => (
      <ServerProvider>{props.children}</ServerProvider>
    );

    const { result } = renderHook(() => useServer(), { wrapper });
    const callback = vi.fn();

    const unsubscribe = result.subscribe(callback);
    expect(typeof unsubscribe).toBe("function");

    unsubscribe();
  });
});
```

---

**文档版本**: v1.0.0
**最后更新**: 2025-01-17