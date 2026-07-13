import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  const socketPath = process.env.MUXY_SOCKET_PATH;
  const paneID = process.env.MUXY_PANE_ID;
  if (!socketPath || !paneID) return;

  async function send(payload: string) {
    try {
      const { createConnection } = await import("node:net");
      const conn = createConnection({ path: socketPath });
      conn.on("error", (err: any) => {
        process.stderr.write(`[muxy-pi] socket error: ${err?.message ?? err}\n`);
      });
      conn.write(`${payload}\n`, () => conn.end());
      await new Promise((resolve) => {
        conn.on("close", resolve);
        setTimeout(resolve, 3000);
      });
    } catch (err: any) {
      process.stderr.write(`[muxy-pi] connection error: ${err?.message ?? err}\n`);
    }
  }

  const sendStatus = (status: string) => send(`agent_status|pi|${paneID}|${status}`);

  pi.on("agent_start", () => sendStatus("working"));

  pi.on("agent_end", async (event, _ctx) => {
    await sendStatus("idle");

    let body = "Session completed";

    try {
      const messages = event.messages ?? [];
      const lastAssistant = [...messages]
        .reverse()
        .find((m: any) => m.role === "assistant");
      if (lastAssistant) {
        const content = lastAssistant.content;
        const text =
          typeof content === "string"
            ? content
            : (Array.isArray(content)
                ? content
                    .filter((p: any) => p.type === "text")
                    .map((p: any) => p.text ?? "")
                    .join("")
                : "");
        if (text) {
          body = text.replace(/[\n\r|]+/g, " ").slice(0, 200);
        }
      }
    } catch {}

    await send(`pi|${paneID}|Pi|${body}`);
  });
}
