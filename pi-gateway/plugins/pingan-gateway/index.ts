import type { GatewayPluginApi } from "/Users/dengwenyu/.pi/agent/pi-gateway/src/plugins/types.ts";

const MARKER = "[PINGAN-GW-INJECTED]";

const DEFAULT_PROMPT = [
  `${MARKER}`,
  "你运行在 pi-gateway 的 RPC 模式，必须严格避免阻塞式交互。",
  "禁止使用会卡死/等待交互输入的 TUI 或前台阻塞流程。",
  "当任务需要交互或长时运行时，必须同时遵守：",
  "1) 优先使用 interactive skill 处理交互步骤；",
  "2) 使用 tmux 启动后台任务并继续执行，不要阻塞前台；",
  "3) 明确返回 tmux 会话名、启动命令、查看命令、停止命令；",
  "4) 若无法直接执行，先给可执行替代方案，不要等待卡住。",
  "",
].join("\n");

type PluginCfg = {
  enabled?: boolean;
  channels?: string[];
  prepend?: string;
};

function normalizeChannels(v: unknown): Set<string> {
  if (!Array.isArray(v)) return new Set(["telegram"]);
  const channels = v
    .map((x) => String(x || "").trim().toLowerCase())
    .filter(Boolean);
  return new Set(channels.length ? channels : ["telegram"]);
}

export default function register(api: GatewayPluginApi) {
  const cfg = (
    api.pluginConfig
    ?? (api.config as any)?.plugins?.config?.pinganGateway
    ?? (api.config as any)?.plugins?.pinganGateway
    ?? {}
  ) as PluginCfg;
  const enabled = cfg.enabled !== false;
  const channels = normalizeChannels(cfg.channels);
  const prepend = typeof cfg.prepend === "string" && cfg.prepend.trim()
    ? cfg.prepend.trim()
    : DEFAULT_PROMPT;

  if (!enabled) {
    api.logger.info("PingAn gateway injector disabled by config");
    return;
  }

  api.on("message_received", ({ message }) => {
    if (!message?.text?.trim()) return;
    const channel = String(message.source?.channel || "").toLowerCase();
    if (!channels.has(channel)) return;
    const original = message.text.trim();

    // Keep slash-command behavior intact so gateway-side TUI blocking guards still work.
    if (original.startsWith("/")) return;

    // Avoid duplicate prefixing on retries/re-dispatch.
    if (message.text.includes(MARKER)) return;

    message.text = `${message.text}\n\n${prepend}`;
  });

  api.logger.info(
    `PingAn gateway injector active (channels=${Array.from(channels).join(",")})`,
  );
}
