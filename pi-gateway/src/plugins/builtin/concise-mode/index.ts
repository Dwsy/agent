import type { GatewayPluginApi } from "../../types.ts";

interface ConciseModeConfig {
  enabled?: boolean;
  channels?: string[];
}

const DEFAULT_CHANNELS = ["telegram"];
const SILENT_TOKEN = "[NO_REPLY]";
const PROMPT_SUFFIX = `

[Concise Output Mode]
- Communicate to user only via send_message tool.
- Keep messages short and actionable.
- If no user-facing message is needed, output exactly [NO_REPLY].`;

function toConfig(raw: Record<string, unknown> | undefined): Required<ConciseModeConfig> {
  const enabled = typeof raw?.enabled === "boolean" ? raw.enabled : false;
  const channelsRaw = Array.isArray(raw?.channels) ? raw.channels : DEFAULT_CHANNELS;
  const channels = channelsRaw.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
  return {
    enabled,
    channels: channels.length > 0 ? channels : [...DEFAULT_CHANNELS],
  };
}

function makeRouteKey(channel: string, target: string): string {
  return `${channel}::${target}`;
}

export default function register(api: GatewayPluginApi) {
  const cfg = toConfig(api.pluginConfig);
  if (!cfg.enabled) {
    api.logger.info("concise-mode disabled");
    return;
  }

  const enabledChannels = new Set(cfg.channels);
  const channelEnabledSessions = new Set<string>();
  const suppressRoutes = new Set<string>();

  api.on("message_received", ({ message }) => {
    if (!enabledChannels.has(message.source.channel)) {
      channelEnabledSessions.delete(message.sessionKey);
      return;
    }
    channelEnabledSessions.add(message.sessionKey);
    message.text = `${message.text}${PROMPT_SUFFIX}`;
  });

  api.on("after_tool_call", ({ sessionKey, toolName, isError }) => {
    if (!channelEnabledSessions.has(sessionKey)) return;
    if (isError || toolName !== "send_message") return;

    const session = api.getSessionState(sessionKey);
    const channel = session?.lastChannel;
    const target = session?.lastChatId;
    if (!channel || !target || !enabledChannels.has(channel)) return;

    suppressRoutes.add(makeRouteKey(channel, target));
  });

  api.on("message_sending", ({ message }) => {
    if (!enabledChannels.has(message.channel)) return;
    const key = makeRouteKey(message.channel, message.target);
    if (!suppressRoutes.has(key)) return;

    message.text = SILENT_TOKEN;
    suppressRoutes.delete(key);
  });

  api.logger.info(`concise-mode enabled for channels: ${cfg.channels.join(", ")}`);
}
