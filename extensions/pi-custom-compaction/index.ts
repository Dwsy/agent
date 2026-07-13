import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
  SessionBeforeCompactEvent,
} from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem } from "@earendil-works/pi-tui";
import { CONFIG_PATH } from "./src/constants.js";
import { compactWithConfiguredAlgorithm } from "./src/algorithms.js";
import { loadConfig, saveConfig } from "./src/config.js";
import { clearStatusWidget, describeConfig, refreshStatusWidget } from "./src/status.js";
import type { AvailableModel, CustomCompactionConfig } from "./src/types.js";
import { openSettingsPanel } from "./src/ui.js";

function availableModels(ctx: ExtensionContext): AvailableModel[] {
  return ctx.modelRegistry.getAvailable()
    .filter((model) => model.input.includes("text"))
    .map((model) => ({
      provider: model.provider,
      id: model.id,
      name: model.name,
      outputCost: model.cost.output,
    }))
    .sort((left, right) => `${left.provider}/${left.id}`.localeCompare(`${right.provider}/${right.id}`));
}

function configuredModel(ctx: ExtensionContext, config: CustomCompactionConfig) {
  if (!config.model) {
    return { error: "No compaction model selected. Run /compaction to select an authenticated Pi model." };
  }

  const model = ctx.modelRegistry.find(config.model.provider, config.model.id);
  if (!model || !ctx.modelRegistry.hasConfiguredAuth(model)) {
    return { error: `Configured compaction model is unavailable: ${config.model.provider}/${config.model.id}` };
  }

  return { model };
}

function notify(ctx: ExtensionContext, message: string, level: "info" | "warning" | "error"): void {
  if (ctx.hasUI) {
    ctx.ui.notify(message, level);
  }
}

function commandCompletions(prefix: string): AutocompleteItem[] | null {
  const options: AutocompleteItem[] = [
    { value: "show", label: "show", description: "Show active compaction profile" },
    { value: "path", label: "path", description: "Show config path" },
    { value: "on", label: "on", description: "Enable custom compaction" },
    { value: "off", label: "off", description: "Disable custom compaction" },
  ];
  const matches = options.filter((option) => option.value.startsWith(prefix));
  return matches.length > 0 ? matches : null;
}

const COMPACTION_OWNER_SYMBOL = Symbol.for("pi-custom-compaction.owner");
const ROLE_COMPACTION_MEMORY_HANDOFF_SYMBOL = Symbol.for("role-persona-old.compaction-memory-handoff");

interface RoleCompactionMemoryHandoff {
  createInstructions(ctx: ExtensionContext): string | undefined;
  consumeSummary(summary: string, ctx: ExtensionContext): Promise<string>;
}

function roleCompactionMemoryHandoff(): RoleCompactionMemoryHandoff | undefined {
  const candidate = (globalThis as Record<symbol, unknown>)[ROLE_COMPACTION_MEMORY_HANDOFF_SYMBOL] as Partial<RoleCompactionMemoryHandoff> | undefined;
  return typeof candidate?.createInstructions === "function" && typeof candidate.consumeSummary === "function"
    ? candidate as RoleCompactionMemoryHandoff
    : undefined;
}

export default function customCompactionExtension(pi: ExtensionAPI): void {
  const loaded = loadConfig();
  let config = loaded.config;
  let pendingWarning = loaded.warning;

  const ownerRegistration = {
    shouldOwn(candidate: unknown): boolean {
      try {
        const resolved = configuredModel(candidate as ExtensionContext, config);
        return config.enabled && "model" in resolved;
      } catch {
        return false;
      }
    },
  };
  (globalThis as Record<symbol, unknown>)[COMPACTION_OWNER_SYMBOL] = ownerRegistration;

  const publishOwner = (): void => {
    (globalThis as Record<symbol, unknown>)[COMPACTION_OWNER_SYMBOL] = ownerRegistration;
  };

  const save = (next: CustomCompactionConfig, ctx: ExtensionContext): boolean => {
    const result = saveConfig(next);
    if (!result.success) {
      notify(ctx, result.error ?? "Could not save compaction configuration.", "error");
      return false;
    }
    config = next;
    refreshStatusWidget(ctx, config);
    return true;
  };

  const handleCompaction = async (event: SessionBeforeCompactEvent, ctx: ExtensionContext) => {
    if (!config.enabled) {
      return;
    }

    const resolved = configuredModel(ctx, config);
    if (!("model" in resolved)) {
      if (!event.signal.aborted) {
        notify(ctx, `${resolved.error}; using Pi default compaction.`, "warning");
      }
      return;
    }

    const auth = await ctx.modelRegistry.getApiKeyAndHeaders(resolved.model);
    if (!auth.ok) {
      if (!event.signal.aborted) {
        notify(ctx, `Compaction authentication failed: ${auth.error}; using Pi default compaction.`, "warning");
      }
      return;
    }

    try {
      notify(ctx, `Compacting with ${resolved.model.provider}/${resolved.model.id} (${config.algorithm})…`, "info");
      const memoryHandoff = roleCompactionMemoryHandoff();
      const memoryInstructions = memoryHandoff?.createInstructions(ctx);
      const result = await compactWithConfiguredAlgorithm(event, resolved.model, auth, config, memoryInstructions);
      const summary = memoryInstructions && memoryHandoff
        ? await memoryHandoff.consumeSummary(result.summary, ctx)
        : result.summary;
      return { compaction: { ...result, summary } };
    } catch (error) {
      if (!event.signal.aborted) {
        const message = error instanceof Error ? error.message : String(error);
        notify(ctx, `Custom compaction failed: ${message}; using Pi default compaction.`, "warning");
      }
      return;
    }
  };

  pi.on("session_start", async (_event, ctx) => {
    publishOwner();
    if (pendingWarning) {
      notify(ctx, pendingWarning, "warning");
      pendingWarning = undefined;
    }
    refreshStatusWidget(ctx, config);
  });

  pi.on("session_shutdown", async (event, ctx) => {
    clearStatusWidget(ctx);
    if (event.reason !== "reload" && event.reason !== "quit") {
      return;
    }
    const globals = globalThis as Record<symbol, unknown>;
    if (globals[COMPACTION_OWNER_SYMBOL] === ownerRegistration) {
      delete globals[COMPACTION_OWNER_SYMBOL];
    }
  });

  pi.on("session_before_compact", handleCompaction);

  pi.registerCommand("compaction", {
    description: "Configure custom context compaction model and algorithm",
    getArgumentCompletions: commandCompletions,
    handler: async (args, ctx: ExtensionCommandContext) => {
      const action = args.trim();
      if (!action) {
        await openSettingsPanel(ctx, {
          getConfig: () => config,
          getModels: () => availableModels(ctx),
          save,
          getConfigPath: () => CONFIG_PATH,
        });
        return;
      }

      if (action === "show") {
        notify(ctx, `Custom compaction: ${describeConfig(config)}`, "info");
        return;
      }
      if (action === "path") {
        notify(ctx, CONFIG_PATH, "info");
        return;
      }
      if (action === "on" || action === "off") {
        const enabled = action === "on";
        if (save({ ...config, enabled }, ctx)) {
          notify(ctx, `Custom compaction ${enabled ? "enabled" : "disabled"}.`, "info");
        }
        return;
      }

      notify(ctx, "Usage: /compaction [show|path|on|off] (or no arguments to open settings)", "info");
    },
  });
}
