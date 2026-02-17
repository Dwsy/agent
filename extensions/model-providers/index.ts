import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getBuiltinAdapters, type ProviderAdapter } from "./providers.js";

async function registerProviders(pi: ExtensionAPI, adapters: ProviderAdapter[]): Promise<string[]> {
  const registered: string[] = [];

  for (const adapter of adapters) {
    const ok = (await adapter.enabled?.()) ?? true;
    if (!ok) continue;

    const config = await adapter.build();
    pi.registerProvider(adapter.name, config);
    registered.push(adapter.name);
  }

  return registered;
}

export default async function (pi: ExtensionAPI) {
  const adapters = getBuiltinAdapters();
  const registered = await registerProviders(pi, adapters);

  // Hard guard for Qwen OAuth compatibility:
  // Qwen rejects role=developer, so coerce to system before request.
  pi.on("context", async (event, ctx) => {
    const model = ctx.model;
    if (!model || model.provider !== "qwen-oauth") return;

    const rewritten = event.messages.map((m) => {
      if ((m as any).role !== "developer") return m;
      return { ...(m as any), role: "system" };
    });

    return { messages: rewritten as any };
  });

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
}
