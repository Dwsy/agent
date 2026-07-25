import { Buffer } from "node:buffer";
import type { GappHostRpcContext } from "./host-rpc.js";

const ALLOWED_METHODS = new Set(["Preloaded", "State", "Clear", "Play"]);
const MAX_PAYLOAD_BYTES = 16 * 1024 * 1024;
const MAX_FRAME_BYTES = 64 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_POLL_MS = 25_000;
const MAX_POLL_FRAMES = 128;

interface GrpcWebFrame {
  flags: number;
  dataBase64: string;
}

interface StreamSession {
  controller: AbortController;
  reader: ReadableStreamDefaultReader<Uint8Array>;
  buffer: Uint8Array;
  ended: boolean;
  error?: string;
  reading: boolean;
  pendingRead?: Promise<ReadableStreamReadResult<Uint8Array>>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function validateTimeout(value: unknown, fallback: number, maximum = 120_000): number {
  if (value === undefined) return fallback;
  const timeout = Number(value);
  if (!Number.isFinite(timeout) || timeout < 1 || timeout > maximum) {
    throw new Error(`timeoutMs must be between 1 and ${maximum}`);
  }
  return Math.floor(timeout);
}

export function normalizeNgrokBaseUrl(value: unknown): string {
  const url = new URL(String(value || "").trim());
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("ngrok baseUrl must use http or https");
  }
  const hostname = url.hostname.toLowerCase();
  if (hostname !== "localhost" && hostname !== "127.0.0.1" && hostname !== "[::1]") {
    throw new Error("ngrok baseUrl must use a loopback host");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("ngrok baseUrl cannot include credentials, query, or fragment");
  }
  if (url.pathname !== "/") throw new Error("ngrok baseUrl cannot include a path");
  return url.origin;
}

function validateMethod(value: unknown, allowState: boolean): string {
  const method = String(value || "");
  if (!ALLOWED_METHODS.has(method) || (!allowState && method === "State")) {
    throw new Error(`Unsupported ngrok method: ${method}`);
  }
  return method;
}

function decodePayload(value: unknown): Uint8Array {
  if (value === undefined || value === "") return new Uint8Array();
  if (typeof value !== "string") throw new Error("payloadBase64 must be a string");
  if (value.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw new Error("payloadBase64 is invalid");
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.byteLength > MAX_PAYLOAD_BYTES) throw new Error("ngrok payload limit exceeded");
  return bytes;
}

function grpcHeaders(): Record<string, string> {
  return {
    Accept: "application/grpc-web+proto",
    "Content-Type": "application/grpc-web+proto",
    "X-Grpc-Web": "1",
    "X-User-Agent": "ngrok-native-inspector/1",
  };
}

function grpcRequestBody(payload: Uint8Array): Uint8Array {
  const body = new Uint8Array(payload.byteLength + 5);
  new DataView(body.buffer).setUint32(1, payload.byteLength, false);
  body.set(payload, 5);
  return body;
}

function appendBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  if (left.byteLength === 0) return right.slice();
  if (right.byteLength === 0) return left;
  const combined = new Uint8Array(left.byteLength + right.byteLength);
  combined.set(left);
  combined.set(right, left.byteLength);
  return combined;
}

function takeFrames(session: StreamSession, limit: number): GrpcWebFrame[] {
  const frames: GrpcWebFrame[] = [];
  let offset = 0;
  while (frames.length < limit && session.buffer.byteLength - offset >= 5) {
    const view = new DataView(
      session.buffer.buffer,
      session.buffer.byteOffset + offset + 1,
      4,
    );
    const length = view.getUint32(0, false);
    if (length > MAX_FRAME_BYTES) throw new Error("ngrok gRPC-Web frame limit exceeded");
    if (session.buffer.byteLength - offset - 5 < length) break;
    const flags = session.buffer[offset];
    const data = session.buffer.subarray(offset + 5, offset + 5 + length);
    frames.push({ flags, dataBase64: Buffer.from(data).toString("base64") });
    offset += 5 + length;
  }
  if (offset > 0) session.buffer = session.buffer.slice(offset);
  return frames;
}

function assertGrpcResponse(response: Response): void {
  if (!response.ok) throw new Error(`ngrok returned HTTP ${response.status} ${response.statusText}`);
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/grpc-web")) {
    throw new Error(`ngrok returned unexpected content-type: ${contentType || "missing"}`);
  }
}

export class NgrokInspectorHost {
  private readonly streams = new Map<string, StreamSession>();

  async handle(
    method: string,
    args: Record<string, unknown>,
    context: GappHostRpcContext,
  ): Promise<unknown> {
    if (!isPlainObject(args)) throw new Error("RPC arguments must be an object");
    switch (method) {
      case "ngrok.unary":
        return this.unary(args);
      case "ngrok.stream.open":
        return this.openStream(context.appId, args);
      case "ngrok.stream.next":
        return this.nextFrames(context.appId, args);
      case "ngrok.stream.close":
        await this.closeApp(context.appId);
        return { ok: true };
      default:
        throw new Error(`Unsupported ngrok inspector RPC: ${method}`);
    }
  }

  private async unary(args: Record<string, unknown>): Promise<{ frames: GrpcWebFrame[] }> {
    const baseUrl = normalizeNgrokBaseUrl(args.baseUrl);
    const method = validateMethod(args.method, false);
    const payload = decodePayload(args.payloadBase64);
    const timeoutMs = validateTimeout(args.timeoutMs, DEFAULT_TIMEOUT_MS);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error("ngrok request timed out")), timeoutMs);
    let bytes: Uint8Array;
    try {
      const response = await fetch(`${baseUrl}/grpc/agent.Web/${method}`, {
        method: "POST",
        headers: grpcHeaders(),
        body: grpcRequestBody(payload),
        signal: controller.signal,
        cache: "no-store",
      });
      assertGrpcResponse(response);
      bytes = new Uint8Array(await response.arrayBuffer());
    } finally {
      clearTimeout(timer);
    }
    const session: StreamSession = {
      controller: new AbortController(),
      reader: null as unknown as ReadableStreamDefaultReader<Uint8Array>,
      buffer: bytes,
      ended: true,
      reading: false,
    };
    const frames = takeFrames(session, MAX_POLL_FRAMES);
    if (session.buffer.byteLength !== 0) throw new Error("ngrok unary response ended mid-frame");
    return { frames };
  }

  private async openStream(appId: string, args: Record<string, unknown>): Promise<{ ok: true }> {
    await this.closeApp(appId);
    const baseUrl = normalizeNgrokBaseUrl(args.baseUrl);
    validateMethod("State", true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error("ngrok stream connection timed out")), DEFAULT_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/grpc/agent.Web/State`, {
        method: "POST",
        headers: grpcHeaders(),
        body: grpcRequestBody(new Uint8Array()),
        signal: controller.signal,
        cache: "no-store",
      });
    } finally {
      clearTimeout(timer);
    }
    try {
      assertGrpcResponse(response);
      if (!response.body) throw new Error("ngrok State response has no body");
      this.streams.set(appId, {
        controller,
        reader: response.body.getReader(),
        buffer: new Uint8Array(),
        ended: false,
        reading: false,
      });
      return { ok: true };
    } catch (error) {
      controller.abort();
      throw error;
    }
  }

  private async nextFrames(
    appId: string,
    args: Record<string, unknown>,
  ): Promise<{ frames: GrpcWebFrame[]; ended: boolean }> {
    const session = this.streams.get(appId);
    if (!session) throw new Error("ngrok State stream is not open");
    if (session.reading) throw new Error("ngrok State stream already has a pending read");
    const timeoutMs = validateTimeout(args.timeoutMs, DEFAULT_POLL_MS, 60_000);
    const rawLimit = args.maxFrames === undefined ? 32 : Number(args.maxFrames);
    if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > MAX_POLL_FRAMES) {
      throw new Error(`maxFrames must be between 1 and ${MAX_POLL_FRAMES}`);
    }

    session.reading = true;
    try {
      for (;;) {
        const frames = takeFrames(session, rawLimit);
        if (frames.length > 0) return { frames, ended: session.ended };
        if (session.ended) {
          if (session.buffer.byteLength !== 0) throw new Error("ngrok State stream ended mid-frame");
          if (session.error) throw new Error(session.error);
          return { frames: [], ended: true };
        }

        session.pendingRead ??= session.reader.read();
        let timeout: ReturnType<typeof setTimeout> | undefined;
        const result = await Promise.race([
          session.pendingRead.then((value) => ({ kind: "read" as const, value })),
          new Promise<{ kind: "timeout" }>((resolve) => {
            timeout = setTimeout(() => resolve({ kind: "timeout" }), timeoutMs);
          }),
        ]);
        if (timeout) clearTimeout(timeout);
        if (result.kind === "timeout") return { frames: [], ended: false };
        session.pendingRead = undefined;
        if (result.value.done) {
          session.ended = true;
          continue;
        }
        if (result.value.value?.byteLength) {
          session.buffer = appendBytes(session.buffer, result.value.value);
        }
      }
    } catch (error) {
      session.error = error instanceof Error ? error.message : String(error);
      session.ended = true;
      throw error;
    } finally {
      session.reading = false;
    }
  }

  async closeApp(appId: string): Promise<void> {
    const session = this.streams.get(appId);
    if (!session) return;
    this.streams.delete(appId);
    session.controller.abort();
    await session.reader.cancel().catch(() => {});
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.streams.keys()].map((appId) => this.closeApp(appId)));
  }
}
