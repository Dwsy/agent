/**
 * Model Providers Extension
 * 
 * Dynamically loads and registers AI model providers with OAuth support.
 * Each provider is a separate plugin in the providers/ directory.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getBuiltinAdapters, type ProviderAdapter } from "./providers.ts";
import { loginQwen } from "./providers/qwen-oauth/index.ts";

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

  // Path B: re-apply on session start as a safety net
  pi.on("session_start", async (_event, ctx) => {
    for (const p of providers) {
      ctx.modelRegistry.registerProvider(p.name, p.config);
    }
  });

  // OAuth compatibility: coerce developer role to system
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

  // Register Qwen login command
  pi.registerCommand("login-qwen", {
    description: "Login to Qwen OAuth",
    handler: async (_args, ctx) => {
      try {
        const credentials = await loginQwen({
          onProgress: (msg) => {
            console.log(`[Qwen] ${msg}`);
            ctx.ui?.notify?.(msg, "info");
          },
          onAuth: (info) => {
            console.log(`\n🔐 Open: ${info.url}`);
            console.log(`📝 Code: ${info.instructions}`);
            ctx.ui?.openUrl?.(info.url);
            ctx.ui?.notify?.(`Enter code: ${info.instructions}`, "info");
          },
        });
        console.log(`✓ Login successful! Expires: ${new Date(credentials.expires).toISOString()}`);
        return { success: true, expires: credentials.expires };
      } catch (e: any) {
        console.error(`✗ Login failed: ${e.message}`);
        ctx.ui?.notify?.(e.message, "error");
        return { success: false, error: e.message };
      }
    },
  });
}
