import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { STATUS_WIDGET_ID } from "./constants.js";
import type { CustomCompactionConfig } from "./types.js";

function describeModel(config: CustomCompactionConfig): string {
  return config.model ? `${config.model.provider}/${config.model.id}` : "not selected";
}

export function refreshStatusWidget(ctx: ExtensionContext, config: CustomCompactionConfig): void {
  if (!ctx.hasUI) {
    return;
  }

  if (!config.showStatusWidget) {
    ctx.ui.setWidget(STATUS_WIDGET_ID, undefined);
    return;
  }

  const state = config.enabled ? "active" : "disabled";
  ctx.ui.setWidget(STATUS_WIDGET_ID, [
    ctx.ui.theme.fg("accent", `Compaction ${state}`),
    ctx.ui.theme.fg("dim", `${config.algorithm} · ${describeModel(config)}`),
  ], { placement: "belowEditor" });
}

export function clearStatusWidget(ctx: ExtensionContext): void {
  if (ctx.hasUI) {
    ctx.ui.setWidget(STATUS_WIDGET_ID, undefined);
  }
}

export function describeConfig(config: CustomCompactionConfig): string {
  return [
    `enabled=${config.enabled}`,
    `model=${describeModel(config)}`,
    `algorithm=${config.algorithm}`,
    `maxSummaryTokens=${config.maxSummaryTokens}`,
    `widget=${config.showStatusWidget}`,
  ].join(", ");
}
