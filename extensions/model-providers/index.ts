import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getBuiltinAdapters, type ProviderAdapter } from "./providers.ts";

async function buildEnabledProviders(adapters: ProviderAdapter[]) {
  const providers: Array<{ name: string; config: any }> = [];

  for (const adapter of adapters) {
    const ok = (await adapter.enabled?.()) ?? true;
    if (!ok) continue;
    providers.push({ name: adapter.name, config: await adapter.build() });
  }

  return providers;
}

export default async function (pi: ExtensionAPI) {
  const adapters = getBuiltinAdapters();
  const providers = await buildEnabledProviders(adapters);
  const registered = providers.map((p) => p.name);

  // Path A: register during extension load (used by startup model discovery)
  for (const p of providers) {
    pi.registerProvider(p.name, p.config);
  }

  // Path B: re-apply on session start as a safety net (some pi versions miss pending queue)
  pi.on("session_start", async (_event, ctx) => {
    for (const p of providers) {
      ctx.modelRegistry.registerProvider(p.name, p.config);
    }
  });

  // Hard guard for OAuth compatibility:
  // These providers reject role=developer, so coerce to system before request.
  const oauthProviders = ["qwen-oauth"];

  pi.on("context", async (event, ctx) => {
    const model = ctx.model;
    if (!model || !oauthProviders.includes(model.provider)) return;

    const rewritten = event.messages.map((m) => {
      if ((m as any).role !== "developer") return m;
      return { ...(m as any), role: "system" };
    });

    return { messages: rewritten as any };
  });

  // Register providers command
  pi.registerCommand("providers", {
    description: "Show dynamically injected model providers",
    handler: async (_args, ctx) => {
      const all = ctx.modelRegistry.getAll();
      const lines: string[] = ["# Injected Providers", ""];

      if (registered.length === 0) {
        lines.push("(none)");
      } else {
        for (const provider of registered) {
          const models = all.filter((m) => m.provider === provider).map((m) => m.id);
          lines.push(`- ${provider}: ${models.length ? models.join(", ") : "(no models)"}`);
        }
      }

      const text = lines.join("\n");
      if (ctx.hasUI && ctx.ui.setEditorText) {
        ctx.ui.setEditorText(text);
        ctx.ui.notify("Providers loaded", "info");
      } else {
        console.log(text);
      }
    },
  });

  // Silent auto-refresh on startup is disabled here to keep extension loading stable.
  // Token resolver in providers.ts still reads existing tokens on every request.
  // If you need proactive refresh, run: bun ~/.pi/agent/extensions/model-providers/token-refresh.ts qwen
}
