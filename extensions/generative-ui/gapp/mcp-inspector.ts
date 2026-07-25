import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StdioClientTransport,
  getDefaultEnvironment,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { UnauthorizedError, type OAuthClientProvider, type OAuthDiscoveryState } from "@modelcontextprotocol/sdk/client/auth.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import {
  LoggingMessageNotificationSchema,
  PromptListChangedNotificationSchema,
  ResourceListChangedNotificationSchema,
  ToolListChangedNotificationSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { GappHostRpcContext } from "./host-rpc.js";

export type McpInspectorTransport = "stdio" | "sse" | "streamable-http";

export interface McpInspectorConnectConfig {
  transport: McpInspectorTransport;
  url?: string;
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  auth?: {
    type?: "none" | "bearer" | "basic" | "api-key" | "custom" | "oauth";
    token?: string;
    username?: string;
    password?: string;
    headerName?: string;
    apiKey?: string;
    headers?: Record<string, string>;
    clientId?: string;
    clientSecret?: string;
    scope?: string;
  };
  timeoutMs?: number;
}

export interface McpInspectorHistoryEntry {
  id: string;
  timestamp: string;
  kind: "request" | "notification" | "system";
  operation: string;
  durationMs?: number;
  ok: boolean;
  request?: unknown;
  response?: unknown;
  error?: string;
}

interface InspectorSession {
  appId: string;
  client: Client;
  transport: Transport;
  transportType: McpInspectorTransport;
  config: McpInspectorConnectConfig;
  connectedAt?: string;
  connectionState: "connecting" | "authorization_required" | "exchanging" | "connected" | "error";
  history: McpInspectorHistoryEntry[];
  stderr: string[];
  oauth?: {
    provider: LocalOAuthProvider;
    error?: string;
    task?: Promise<void>;
  };
}

const MAX_HISTORY = 200;
const MAX_TEXT = 80_000;
const DEFAULT_TIMEOUT = 300_000;
const FORBIDDEN_HEADERS = new Set([
  "connection",
  "content-length",
  "host",
  "proxy-authorization",
  "transfer-encoding",
  "upgrade",
]);
const ALLOWED_OPERATIONS = new Set([
  "ping",
  "tools/list",
  "tools/call",
  "resources/list",
  "resources/templates/list",
  "resources/read",
  "prompts/list",
  "prompts/get",
  "logging/setLevel",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asStringRecord(value: unknown, label: string): Record<string, string> {
  if (value === undefined) return {};
  if (!isPlainObject(value)) throw new Error(`${label} must be an object`);
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (typeof item !== "string") throw new Error(`${label}.${key} must be a string`);
      if (key.includes("\0") || item.includes("\0")) throw new Error(`${label} contains NUL`);
      return [key, item];
    }),
  );
}

function validateTimeout(value: unknown): number {
  if (value === undefined) return DEFAULT_TIMEOUT;
  const timeout = Number(value);
  if (!Number.isFinite(timeout) || timeout < 1_000 || timeout > 3_600_000) {
    throw new Error("timeoutMs must be between 1000 and 3600000");
  }
  return Math.floor(timeout);
}

function validateHeaderName(name: string): string {
  if (!name.trim()) throw new Error("Header name required");
  if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)) throw new Error(`Invalid header name: ${name}`);
  if (FORBIDDEN_HEADERS.has(name.toLowerCase())) throw new Error(`Forbidden header: ${name}`);
  return name;
}

export function buildHeaders(auth: McpInspectorConnectConfig["auth"]): Record<string, string> {
  const headers = asStringRecord(auth?.headers, "auth.headers");
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) result[validateHeaderName(name)] = value;

  switch (auth?.type ?? "none") {
    case "none":
    case "custom":
    case "oauth":
      break;
    case "bearer": {
      const token = String(auth.token || "").trim();
      if (!token) throw new Error("Bearer token required");
      result.Authorization = `Bearer ${token}`;
      break;
    }
    case "basic": {
      const username = String(auth.username || "");
      const password = String(auth.password || "");
      if (!username) throw new Error("Basic username required");
      result.Authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
      break;
    }
    case "api-key": {
      const name = validateHeaderName(String(auth.headerName || "X-API-Key"));
      const value = String(auth.apiKey || "");
      if (!value) throw new Error("API key required");
      result[name] = value;
      break;
    }
    default:
      throw new Error(`Unsupported auth type: ${(auth as any)?.type}`);
  }
  return result;
}

function validateConnectConfig(value: unknown): McpInspectorConnectConfig {
  if (!isPlainObject(value)) throw new Error("config must be an object");
  const transport = value.transport;
  if (transport !== "stdio" && transport !== "sse" && transport !== "streamable-http") {
    throw new Error("transport must be stdio, sse, or streamable-http");
  }

  const config: McpInspectorConnectConfig = {
    transport,
    timeoutMs: validateTimeout(value.timeoutMs),
  };

  if (transport === "stdio") {
    const command = String(value.command || "").trim();
    if (!command || command.includes("\0")) throw new Error("stdio command required");
    const args = value.args === undefined ? [] : value.args;
    if (!Array.isArray(args) || !args.every((item) => typeof item === "string" && !item.includes("\0"))) {
      throw new Error("stdio args must be a string array");
    }
    if (args.length > 256) throw new Error("stdio args limit exceeded");
    config.command = command;
    config.args = args.slice();
    if (value.cwd !== undefined) {
      const cwd = String(value.cwd).trim();
      if (!cwd || cwd.includes("\0")) throw new Error("Invalid cwd");
      config.cwd = cwd;
    }
    config.env = asStringRecord(value.env, "env");
  } else {
    const rawUrl = String(value.url || "").trim();
    const url = new URL(rawUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Remote MCP URL must use http or https");
    }
    config.url = url.toString();
    config.auth = isPlainObject(value.auth) ? (value.auth as McpInspectorConnectConfig["auth"]) : undefined;
    if (config.auth?.type === "oauth") {
      if (config.auth.clientId !== undefined && !String(config.auth.clientId).trim()) throw new Error("OAuth clientId cannot be empty");
      if (config.auth.clientSecret !== undefined && !String(config.auth.clientSecret)) throw new Error("OAuth clientSecret cannot be empty");
      if (config.auth.scope !== undefined && !String(config.auth.scope).trim()) throw new Error("OAuth scope cannot be empty");
      config.auth = {
        type: "oauth",
        clientId: config.auth.clientId ? String(config.auth.clientId).trim() : undefined,
        clientSecret: config.auth.clientSecret ? String(config.auth.clientSecret) : undefined,
        scope: config.auth.scope ? String(config.auth.scope).trim() : undefined,
      };
    }
    buildHeaders(config.auth);
  }
  return config;
}

function normalizedSensitiveKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function isSensitiveKey(key: string): boolean {
  const normalized = normalizedSensitiveKey(key);
  return [
    "authorization",
    "proxyauthorization",
    "password",
    "passwd",
    "secret",
    "clientsecret",
    "token",
    "accesstoken",
    "refreshtoken",
    "idtoken",
    "apikey",
    "cookie",
    "setcookie",
  ].includes(normalized) || normalized.endsWith("password") || normalized.endsWith("secret") || normalized.endsWith("token");
}

export function redactSensitive(value: unknown, parentKey = "", depth = 0): unknown {
  if (depth > 12) return "[MAX_DEPTH]";
  if (isSensitiveKey(parentKey)) return "[REDACTED]";
  if (typeof value === "string") return value.length > MAX_TEXT ? `${value.slice(0, MAX_TEXT)}…` : value;
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (value === undefined) return undefined;
  if (typeof value === "bigint") return String(value);
  if (Array.isArray(value)) return value.slice(0, 500).map((item) => redactSensitive(item, parentKey, depth + 1));
  if (!isPlainObject(value)) return String(value);

  if (parentKey === "env" || parentKey === "headers") {
    return Object.fromEntries(Object.keys(value).map((key) => [key, "[REDACTED]"]));
  }
  return Object.fromEntries(
    Object.entries(value).slice(0, 500).map(([key, item]) => [key, redactSensitive(item, key, depth + 1)]),
  );
}

export function sanitizeConnectionConfig(config: McpInspectorConnectConfig): Record<string, unknown> {
  if (config.transport === "stdio") {
    return {
      transport: config.transport,
      command: config.command,
      args: config.args ?? [],
      cwd: config.cwd,
      envKeys: Object.keys(config.env ?? {}),
      timeoutMs: config.timeoutMs,
    };
  }
  return {
    transport: config.transport,
    url: config.url,
    auth: {
      type: config.auth?.type ?? "none",
      headerName: config.auth?.headerName,
      customHeaderNames: Object.keys(config.auth?.headers ?? {}),
      clientId: config.auth?.type === "oauth" ? config.auth.clientId : undefined,
      scope: config.auth?.type === "oauth" ? config.auth.scope : undefined,
    },
    timeoutMs: config.timeoutMs,
  };
}

function requestOptions(timeoutMs: number) {
  return {
    timeout: timeoutMs,
    resetTimeoutOnProgress: true,
    maxTotalTimeout: timeoutMs,
  };
}

export class LocalOAuthProvider implements OAuthClientProvider {
  private server: Server | null = null;
  private redirect: URL | undefined;
  private readonly stateValue = randomUUID();
  private readonly authorizationPromise: Promise<string>;
  private resolveAuthorization!: (code: string) => void;
  private rejectAuthorization!: (error: Error) => void;
  private settled = false;
  private clientInfo: OAuthClientInformationMixed | undefined;
  private oauthTokens: OAuthTokens | undefined;
  private verifier: string | undefined;
  private discovery: OAuthDiscoveryState | undefined;
  authorizationUrl: string | undefined;

  private constructor(
    private readonly clientId?: string,
    private readonly clientSecret?: string,
    private readonly requestedScope?: string,
  ) {
    this.clientInfo = clientId ? { client_id: clientId, ...(clientSecret ? { client_secret: clientSecret } : {}) } : undefined;
    this.authorizationPromise = new Promise<string>((resolve, reject) => {
      this.resolveAuthorization = resolve;
      this.rejectAuthorization = reject;
    });
    void this.authorizationPromise.catch(() => {});
  }

  static async create(auth: NonNullable<McpInspectorConnectConfig["auth"]>): Promise<LocalOAuthProvider> {
    const provider = new LocalOAuthProvider(auth.clientId, auth.clientSecret, auth.scope);
    await provider.startCallbackServer();
    return provider;
  }

  private async startCallbackServer(): Promise<void> {
    this.server = createServer((req, res) => this.handleCallback(req, res));
    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(0, "127.0.0.1", () => {
        this.server!.off("error", reject);
        resolve();
      });
    });
    const address = this.server.address() as AddressInfo;
    this.redirect = new URL(`http://127.0.0.1:${address.port}/oauth/callback`);
  }

  private handleCallback(req: IncomingMessage, res: ServerResponse) {
    const requestUrl = new URL(req.url || "/", this.redirect || "http://127.0.0.1");
    if (req.method !== "GET" || requestUrl.pathname !== "/oauth/callback") {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    if (requestUrl.searchParams.get("state") !== this.stateValue) {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Invalid OAuth state");
      return;
    }
    const oauthError = requestUrl.searchParams.get("error");
    const code = requestUrl.searchParams.get("code");
    if (oauthError || !code) {
      const message = requestUrl.searchParams.get("error_description") || oauthError || "Authorization code missing";
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(`OAuth failed: ${message}`);
      this.fail(new Error(message));
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end("<!doctype html><meta charset=utf-8><title>MCP OAuth complete</title><p>Authorization complete. You can close this window.</p>");
    this.succeed(code);
  }

  private succeed(code: string) {
    if (this.settled) return;
    this.settled = true;
    this.resolveAuthorization(code);
    void this.stopServer();
  }

  private fail(error: Error) {
    if (this.settled) return;
    this.settled = true;
    this.rejectAuthorization(error);
    void this.stopServer();
  }

  get redirectUrl(): URL | undefined {
    return this.redirect;
  }

  get clientMetadata(): OAuthClientMetadata {
    if (!this.redirect) throw new Error("OAuth callback server is not ready");
    return {
      redirect_uris: [this.redirect.toString()],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      client_name: "GAPP MCP Inspector",
      token_endpoint_auth_method: this.clientSecret ? "client_secret_post" : "none",
      ...(this.requestedScope ? { scope: this.requestedScope } : {}),
    };
  }

  state(): string {
    return this.stateValue;
  }

  clientInformation(): OAuthClientInformationMixed | undefined {
    return this.clientInfo;
  }

  saveClientInformation(clientInformation: OAuthClientInformationMixed): void {
    this.clientInfo = clientInformation;
  }

  tokens(): OAuthTokens | undefined {
    return this.oauthTokens;
  }

  saveTokens(tokens: OAuthTokens): void {
    this.oauthTokens = tokens;
  }

  redirectToAuthorization(authorizationUrl: URL): void {
    this.authorizationUrl = authorizationUrl.toString();
  }

  saveCodeVerifier(codeVerifier: string): void {
    this.verifier = codeVerifier;
  }

  codeVerifier(): string {
    if (!this.verifier) throw new Error("OAuth PKCE verifier is missing");
    return this.verifier;
  }

  saveDiscoveryState(state: OAuthDiscoveryState): void {
    this.discovery = state;
  }

  discoveryState(): OAuthDiscoveryState | undefined {
    return this.discovery;
  }

  invalidateCredentials(scope: "all" | "client" | "tokens" | "verifier" | "discovery"): void {
    if (scope === "all" || scope === "client") this.clientInfo = this.clientId ? { client_id: this.clientId, ...(this.clientSecret ? { client_secret: this.clientSecret } : {}) } : undefined;
    if (scope === "all" || scope === "tokens") this.oauthTokens = undefined;
    if (scope === "all" || scope === "verifier") this.verifier = undefined;
    if (scope === "all" || scope === "discovery") this.discovery = undefined;
  }

  waitForAuthorization(): Promise<string> {
    return this.authorizationPromise;
  }

  async close(): Promise<void> {
    if (!this.settled) this.fail(new Error("OAuth flow cancelled"));
    await this.stopServer();
    this.oauthTokens = undefined;
    this.verifier = undefined;
    this.discovery = undefined;
  }

  private async stopServer(): Promise<void> {
    const server = this.server;
    this.server = null;
    if (!server?.listening) return;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function createAuthorizedFetch(headers: Record<string, string>): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const merged = new Headers(init?.headers);
    for (const [name, value] of Object.entries(headers)) merged.set(name, value);
    return fetch(input, { ...init, headers: merged });
  };
}

function createTransport(config: McpInspectorConnectConfig, oauthProvider?: OAuthClientProvider): Transport {
  if (config.transport === "stdio") {
    return new StdioClientTransport({
      command: config.command!,
      args: config.args ?? [],
      cwd: config.cwd,
      env: { ...getDefaultEnvironment(), ...(config.env ?? {}) },
      stderr: "pipe",
    });
  }

  const headers = buildHeaders(config.auth);
  const customFetch = createAuthorizedFetch(headers);
  const requestInit: RequestInit | undefined = Object.keys(headers).length ? { headers } : undefined;
  const url = new URL(config.url!);
  if (config.transport === "sse") {
    return new SSEClientTransport(url, { fetch: customFetch, requestInit, authProvider: oauthProvider });
  }
  return new StreamableHTTPClientTransport(url, {
    fetch: customFetch,
    requestInit,
    authProvider: oauthProvider,
    reconnectionOptions: {
      initialReconnectionDelay: 1_000,
      maxReconnectionDelay: 30_000,
      reconnectionDelayGrowFactor: 1.5,
      maxRetries: 2,
    },
  });
}

export class McpInspectorHost {
  private readonly sessions = new Map<string, InspectorSession>();

  async handle(method: string, args: Record<string, unknown>, context: GappHostRpcContext): Promise<unknown> {
    switch (method) {
      case "mcp.connect":
        return this.connect(context.appId, args.config);
      case "mcp.disconnect":
        return this.disconnect(context.appId, args.terminate !== false);
      case "mcp.status":
        return this.status(context.appId);
      case "mcp.request":
        return this.request(context.appId, args.operation, args.params, args.timeoutMs);
      case "mcp.history":
        return { history: this.sessions.get(context.appId)?.history ?? [] };
      case "mcp.clearHistory": {
        const session = this.sessions.get(context.appId);
        if (session) session.history = [];
        return { ok: true };
      }
      default:
        throw new Error(`Unsupported host RPC method: ${method}`);
    }
  }

  private record(session: InspectorSession, entry: Omit<McpInspectorHistoryEntry, "id" | "timestamp">) {
    session.history.unshift({ id: randomUUID(), timestamp: new Date().toISOString(), ...entry });
    session.history = session.history.slice(0, MAX_HISTORY);
  }

  private installNotificationHandlers(session: InspectorSession) {
    const notification = (operation: string) => (payload: unknown) => {
      this.record(session, {
        kind: "notification",
        operation,
        ok: true,
        response: redactSensitive(payload),
      });
    };
    session.client.setNotificationHandler(LoggingMessageNotificationSchema, notification("notifications/message"));
    session.client.setNotificationHandler(ToolListChangedNotificationSchema, notification("notifications/tools/list_changed"));
    session.client.setNotificationHandler(ResourceListChangedNotificationSchema, notification("notifications/resources/list_changed"));
    session.client.setNotificationHandler(PromptListChangedNotificationSchema, notification("notifications/prompts/list_changed"));
  }

  private createClient(): Client {
    return new Client(
      { name: "gapp-mcp-inspector", version: "2.0.0" },
      { capabilities: {} },
    );
  }

  private attachStderr(session: InspectorSession) {
    if (!(session.transport instanceof StdioClientTransport) || !session.transport.stderr) return;
    session.transport.stderr.on("data", (chunk) => {
      const lines = String(chunk).split(/\r?\n/).filter(Boolean);
      session.stderr.push(...lines.map((line) => line.slice(0, 4_000)));
      session.stderr = session.stderr.slice(-200);
    });
  }

  async connect(appId: string, rawConfig: unknown): Promise<unknown> {
    const config = validateConnectConfig(rawConfig);
    await this.disconnect(appId, false);

    const oauthProvider = config.auth?.type === "oauth" ? await LocalOAuthProvider.create(config.auth) : undefined;
    const client = this.createClient();
    const transport = createTransport(config, oauthProvider);
    const session: InspectorSession = {
      appId,
      client,
      transport,
      transportType: config.transport,
      config,
      connectionState: "connecting",
      history: [],
      stderr: [],
      ...(oauthProvider ? { oauth: { provider: oauthProvider } } : {}),
    };
    this.sessions.set(appId, session);
    this.installNotificationHandlers(session);
    this.attachStderr(session);

    const started = Date.now();
    try {
      await client.connect(transport, requestOptions(config.timeoutMs!));
      session.connectionState = "connected";
      session.connectedAt = new Date().toISOString();
      this.record(session, {
        kind: "system",
        operation: "connect",
        durationMs: Date.now() - started,
        ok: true,
        request: sanitizeConnectionConfig(config),
        response: this.snapshot(session),
      });
      return this.snapshot(session);
    } catch (error) {
      if (error instanceof UnauthorizedError && oauthProvider?.authorizationUrl) {
        session.connectionState = "authorization_required";
        this.record(session, {
          kind: "system",
          operation: "oauth/authorize",
          durationMs: Date.now() - started,
          ok: true,
          request: sanitizeConnectionConfig(config),
          response: { authorizationRequired: true, redirectUrl: oauthProvider.redirectUrl?.toString() },
        });
        session.oauth!.task = this.completeOAuth(session);
        return this.snapshot(session);
      }
      const message = error instanceof Error ? error.message : String(error);
      session.connectionState = "error";
      this.record(session, {
        kind: "system",
        operation: "connect",
        durationMs: Date.now() - started,
        ok: false,
        request: sanitizeConnectionConfig(config),
        error: message,
      });
      await client.close().catch(() => {});
      await oauthProvider?.close().catch(() => {});
      this.sessions.delete(appId);
      throw new Error(message);
    }
  }

  private async completeOAuth(session: InspectorSession): Promise<void> {
    const oauth = session.oauth;
    if (!oauth) return;
    try {
      const code = await oauth.provider.waitForAuthorization();
      session.connectionState = "exchanging";
      if (session.transport instanceof SSEClientTransport || session.transport instanceof StreamableHTTPClientTransport) {
        await session.transport.finishAuth(code);
      } else {
        throw new Error("OAuth is only supported for remote transports");
      }
      await session.client.close().catch(() => {});
      const client = this.createClient();
      const transport = createTransport(session.config, oauth.provider);
      session.client = client;
      session.transport = transport;
      this.installNotificationHandlers(session);
      await client.connect(transport, requestOptions(session.config.timeoutMs!));
      session.connectionState = "connected";
      session.connectedAt = new Date().toISOString();
      oauth.error = undefined;
      this.record(session, {
        kind: "system",
        operation: "oauth/complete",
        ok: true,
        response: this.snapshot(session),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      session.connectionState = "error";
      oauth.error = message;
      this.record(session, {
        kind: "system",
        operation: "oauth/complete",
        ok: false,
        error: message,
      });
      await session.client.close().catch(() => {});
    }
  }

  async disconnect(appId: string, terminate = true): Promise<{ ok: true }> {
    const session = this.sessions.get(appId);
    if (!session) return { ok: true };
    this.sessions.delete(appId);
    if (terminate && session.transport instanceof StreamableHTTPClientTransport) {
      await session.transport.terminateSession().catch(() => {});
    }
    await session.client.close().catch(() => session.transport.close().catch(() => {}));
    await session.oauth?.provider.close().catch(() => {});
    return { ok: true };
  }

  status(appId: string): unknown {
    const session = this.sessions.get(appId);
    return session ? this.snapshot(session) : { connected: false, connectionState: "disconnected" };
  }

  private snapshot(session: InspectorSession) {
    const transport = session.transport;
    return {
      connected: session.connectionState === "connected",
      connectionState: session.connectionState,
      connectedAt: session.connectedAt,
      transport: session.transportType,
      config: sanitizeConnectionConfig(session.config),
      serverCapabilities: session.client.getServerCapabilities() ?? {},
      serverImplementation: session.client.getServerVersion() ?? null,
      instructions: session.client.getInstructions() ?? null,
      sessionId: transport instanceof StreamableHTTPClientTransport ? transport.sessionId ?? null : null,
      pid: transport instanceof StdioClientTransport ? transport.pid : null,
      stderr: session.stderr.slice(-100),
      historyCount: session.history.length,
      authorizationRequired: session.connectionState === "authorization_required",
      authorizationUrl: session.connectionState === "authorization_required" ? session.oauth?.provider.authorizationUrl : undefined,
      redirectUrl: session.oauth?.provider.redirectUrl?.toString(),
      oauthError: session.oauth?.error,
    };
  }

  async request(appId: string, rawOperation: unknown, rawParams: unknown, rawTimeout: unknown): Promise<unknown> {
    const session = this.sessions.get(appId);
    if (!session || session.connectionState !== "connected") throw new Error("MCP server is not connected");
    const operation = String(rawOperation || "");
    if (!ALLOWED_OPERATIONS.has(operation)) throw new Error(`Unsupported MCP operation: ${operation}`);
    const params = rawParams === undefined ? {} : rawParams;
    if (!isPlainObject(params)) throw new Error("params must be an object");
    const timeout = rawTimeout === undefined ? session.config.timeoutMs! : validateTimeout(rawTimeout);
    const options = requestOptions(timeout);
    const started = Date.now();

    try {
      let response: unknown;
      switch (operation) {
        case "ping":
          response = await session.client.ping(options);
          break;
        case "tools/list":
          response = await session.client.listTools(params, options);
          break;
        case "tools/call":
          response = await session.client.callTool(params as any, undefined, options);
          break;
        case "resources/list":
          response = await session.client.listResources(params, options);
          break;
        case "resources/templates/list":
          response = await session.client.listResourceTemplates(params, options);
          break;
        case "resources/read":
          response = await session.client.readResource(params as any, options);
          break;
        case "prompts/list":
          response = await session.client.listPrompts(params, options);
          break;
        case "prompts/get":
          response = await session.client.getPrompt(params as any, options);
          break;
        case "logging/setLevel":
          response = await session.client.setLoggingLevel(String(params.level || "info") as any, options);
          break;
        default:
          throw new Error(`Unsupported MCP operation: ${operation}`);
      }
      const safeResponse = redactSensitive(response);
      this.record(session, {
        kind: "request",
        operation,
        durationMs: Date.now() - started,
        ok: true,
        request: redactSensitive(params),
        response: safeResponse,
      });
      return {
        result: response,
        history: session.history,
        status: this.snapshot(session),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.record(session, {
        kind: "request",
        operation,
        durationMs: Date.now() - started,
        ok: false,
        request: redactSensitive(params),
        error: message,
      });
      throw new Error(message);
    }
  }

  async closeApp(appId: string): Promise<void> {
    await this.disconnect(appId, true);
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.sessions.keys()].map((appId) => this.disconnect(appId, true)));
  }
}

export { validateConnectConfig };
