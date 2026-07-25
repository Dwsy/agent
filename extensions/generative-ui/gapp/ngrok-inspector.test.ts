import { Buffer } from "node:buffer";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, test } from "bun:test";
import { NgrokInspectorHost, normalizeNgrokBaseUrl } from "./ngrok-inspector.js";

const context = {
  appId: "ngrok-native-inspector",
  cwd: import.meta.dir,
  sessionId: "test-session",
};

function frame(flags: number, data: Uint8Array): Buffer {
  const output = Buffer.alloc(data.byteLength + 5);
  output[0] = flags;
  output.writeUInt32BE(data.byteLength, 1);
  Buffer.from(data).copy(output, 5);
  return output;
}

function decodeFrameText(value: unknown): string[] {
  const frames = (value as { frames: Array<{ dataBase64: string }> }).frames;
  return frames.map((item) => Buffer.from(item.dataBase64, "base64").toString("utf8"));
}

describe("ngrok inspector validation", () => {
  test("allows loopback HTTP only", () => {
    expect(normalizeNgrokBaseUrl("http://localhost:4040")).toBe("http://localhost:4040");
    expect(normalizeNgrokBaseUrl("https://127.0.0.1:4443/")).toBe("https://127.0.0.1:4443");
    expect(() => normalizeNgrokBaseUrl("http://example.com:4040")).toThrow("loopback");
    expect(() => normalizeNgrokBaseUrl("file:///tmp/ngrok")).toThrow("http or https");
    expect(() => normalizeNgrokBaseUrl("http://localhost:4040/status")).toThrow("path");
  });
});

describe("ngrok inspector host transport", () => {
  test("proxies unary frames and preserves a pending stream read across poll timeout", async () => {
    const server = createServer(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      expect(Buffer.concat(chunks)).toEqual(Buffer.from([0, 0, 0, 0, 0]));
      response.writeHead(200, { "Content-Type": "application/grpc-web+proto" });
      response.flushHeaders();

      if (request.url?.endsWith("/Preloaded")) {
        response.end(Buffer.concat([
          frame(0, Buffer.from("snapshot")),
          frame(0x80, Buffer.from("grpc-status: 0\r\n")),
        ]));
        return;
      }
      if (request.url?.endsWith("/State")) {
        setTimeout(() => response.write(frame(0, Buffer.from("first"))), 100);
        setTimeout(() => response.end(frame(0, Buffer.from("second"))), 180);
        return;
      }
      response.writeHead(404).end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    const host = new NgrokInspectorHost();
    try {
      const unary = await host.handle("ngrok.unary", {
        baseUrl: `http://127.0.0.1:${port}`,
        method: "Preloaded",
        payloadBase64: "",
      }, context);
      expect(decodeFrameText(unary)).toEqual(["snapshot", "grpc-status: 0\r\n"]);

      await host.handle("ngrok.stream.open", { baseUrl: `http://127.0.0.1:${port}` }, context);
      const timeout = await host.handle("ngrok.stream.next", { timeoutMs: 10 }, context) as { frames: unknown[]; ended: boolean };
      expect(timeout).toEqual({ frames: [], ended: false });

      const first = await host.handle("ngrok.stream.next", { timeoutMs: 250 }, context);
      expect(decodeFrameText(first)).toEqual(["first"]);
      const second = await host.handle("ngrok.stream.next", { timeoutMs: 250 }, context);
      expect(decodeFrameText(second)).toEqual(["second"]);
    } finally {
      await host.closeAll();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
