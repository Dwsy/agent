import { run } from "@grammyjs/runner";
import type { Bot } from "grammy";
import { isGetUpdatesConflict, isRecoverableTelegramNetworkError } from "./network-errors.ts";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function startPollingWithRetry(params: {
  bot: Bot;
  logger: { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void };
  onStop?: () => void;
}): Promise<() => Promise<void>> {
  let stopped = false;
  let runner: ReturnType<typeof run> | null = null;

  const loop = async () => {
    let attempt = 0;
    while (!stopped) {
      try {
        runner = run(params.bot, {
          runner: {
            fetch: { timeout: 30 },
            silent: true,
            maxRetryTime: 5 * 60 * 1000,
            retryInterval: "exponential",
          },
        });
        params.logger.info("Telegram polling runner started");
        await runner.task();
        if (!stopped) {
          params.logger.warn("Telegram polling runner stopped unexpectedly; restarting");
          attempt = 0;
        }
      } catch (err: any) {
        const recoverable = isGetUpdatesConflict(err) || isRecoverableTelegramNetworkError(err);
        if (!recoverable) {
          params.logger.error(`Telegram polling fatal: ${err?.message ?? String(err)}`);
          break;
        }
        attempt += 1;
        const delay = Math.min(30_000, Math.round(2000 * Math.pow(1.8, attempt)));
        params.logger.warn(`Telegram polling recoverable error; retry in ${delay}ms`);
        await wait(delay);
      }
    }
  };

  void loop();

  return async () => {
    stopped = true;
    if (runner) {
      await runner.stop();
    }
    params.onStop?.();
  };
}
