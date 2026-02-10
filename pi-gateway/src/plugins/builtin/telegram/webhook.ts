import { createServer } from "node:http";
import type { Bot } from "grammy";
import { webhookCallback } from "grammy";

export async function startTelegramWebhook(params: {
  bot: Bot;
  webhookUrl: string;
  webhookPath?: string;
  webhookSecret?: string;
  logger: { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void };
}): Promise<{ stop: () => Promise<void> }> {
  const path = params.webhookPath ?? "/telegram-webhook";
  const webhook = webhookCallback(params.bot, "http", {
    secretToken: params.webhookSecret,
  });

  const url = new URL(params.webhookUrl);
  const port = Number(url.port || 8787);
  const host = "0.0.0.0";

  await params.bot.api.setWebhook(params.webhookUrl, {
    secret_token: params.webhookSecret,
  });

  const server = createServer((req, res) => {
    if (req.url === "/healthz") {
      res.writeHead(200);
      res.end("ok");
      return;
    }
    if (req.method !== "POST" || req.url !== path) {
      res.writeHead(404);
      res.end();
      return;
    }
    const handled = webhook(req, res);
    if (handled && typeof (handled as Promise<unknown>).catch === "function") {
      void (handled as Promise<unknown>).catch((err) => {
        params.logger.warn(`Telegram webhook handler error: ${String(err)}`);
        if (!res.headersSent) res.writeHead(500);
        res.end();
      });
    }
  });

  await new Promise<void>((resolve) => server.listen(port, host, resolve));
  params.logger.info(`Telegram webhook server listening on ${host}:${port}${path}`);

  return {
    stop: async () => {
      await params.bot.api.deleteWebhook().catch(() => {});
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
