import { getSelectListTheme, getSettingsListTheme, type ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
  Container,
  fuzzyFilter,
  getKeybindings,
  Input,
  SelectList,
  SettingsList,
  Spacer,
  Text,
  truncateToWidth,
  type Component,
  type SettingItem,
} from "@earendil-works/pi-tui";
import type { AvailableModel, CompactionAlgorithm, CustomCompactionConfig } from "./types.js";

export interface SettingsController {
  getConfig(): CustomCompactionConfig;
  getModels(): AvailableModel[];
  save(next: CustomCompactionConfig, ctx: ExtensionCommandContext): boolean;
  getConfigPath(): string;
}

function modelKey(model: AvailableModel): string {
  return `${model.provider}/${model.id}`;
}

function modelLabel(model: AvailableModel): string {
  return `${model.name} (${modelKey(model)})`;
}

function formatOutputPrice(model: AvailableModel): string {
  const precision = model.outputCost < 0.01 ? 4 : 2;
  return `Output $${model.outputCost.toFixed(precision)}/M tokens`;
}

function parseModelKey(value: string, models: AvailableModel[]): AvailableModel | undefined {
  return models.find((model) => modelKey(model) === value);
}

function toOnOff(value: boolean): string {
  return value ? "on" : "off";
}

function parseOnOff(value: string): boolean {
  return value === "on";
}

function createModelSelector(models: AvailableModel[], done: (value?: string) => void): Component {
  const searchInput = new Input();
  let list: SelectList;

  const rebuildList = () => {
    const query = searchInput.getValue().trim();
    const matched = query
      ? fuzzyFilter(models, query, (model) => `${model.name} ${model.provider} ${model.id}`)
      : models;
    const items = matched.map((model) => ({
      value: modelKey(model),
      label: modelLabel(model),
      description: formatOutputPrice(model),
    }));
    list = new SelectList(items, Math.min(Math.max(items.length, 1), 12), getSelectListTheme());
    list.onSelect = (item) => done(item.value);
    list.onCancel = () => done();
  };

  rebuildList();

  return {
    render(width) {
      return [
        "Search model:",
        ...searchInput.render(width),
        "",
        ...list.render(width),
      ];
    },
    invalidate() {
      searchInput.invalidate();
      list.invalidate();
    },
    handleInput(data) {
      const keybindings = getKeybindings();
      if (
        keybindings.matches(data, "tui.select.up") ||
        keybindings.matches(data, "tui.select.down") ||
        keybindings.matches(data, "tui.select.pageUp") ||
        keybindings.matches(data, "tui.select.pageDown") ||
        keybindings.matches(data, "tui.select.confirm") ||
        keybindings.matches(data, "tui.select.cancel")
      ) {
        list.handleInput(data);
        return;
      }
      searchInput.handleInput(data);
      rebuildList();
    },
  };
}

function buildItems(config: CustomCompactionConfig, models: AvailableModel[]): SettingItem[] {
  const selectedModel = config.model
    ? models.find((model) => model.provider === config.model?.provider && model.id === config.model?.id)
    : undefined;

  return [
    {
      id: "enabled",
      label: "Custom compaction",
      description: "Use the configured Pi model and algorithm for the saved context checkpoint.",
      currentValue: toOnOff(config.enabled),
      values: ["on", "off"],
    },
    {
      id: "model",
      label: "Compaction model",
      description: "Only Pi models with configured authentication are shown. Type to fuzzy-search by model, provider, or ID.",
      currentValue: selectedModel ? modelKey(selectedModel) : "not selected",
      submenu: (_currentValue, done) => createModelSelector(models, done),
    },
    {
      id: "algorithm",
      label: "Algorithm",
      description: "pi-default preserves Pi's built-in strategy; structured creates a coding-focused checkpoint.",
      currentValue: config.algorithm,
      values: ["pi-default", "structured"],
    },
    {
      id: "maxSummaryTokens",
      label: "Structured budget",
      description: "Maximum output tokens for the structured algorithm only.",
      currentValue: String(config.maxSummaryTokens),
      values: ["2048", "4096", "8192", "12000", "16384"],
    },
    {
      id: "showStatusWidget",
      label: "Status widget",
      description: "Show the active compaction profile below the editor.",
      currentValue: toOnOff(config.showStatusWidget),
      values: ["on", "off"],
    },
  ];
}

function applySetting(
  config: CustomCompactionConfig,
  id: string,
  value: string,
  models: AvailableModel[],
): CustomCompactionConfig | undefined {
  switch (id) {
    case "enabled":
      return { ...config, enabled: parseOnOff(value) };
    case "model": {
      const model = parseModelKey(value, models);
      return model ? { ...config, model: { provider: model.provider, id: model.id } } : undefined;
    }
    case "algorithm":
      return { ...config, algorithm: value as CompactionAlgorithm };
    case "maxSummaryTokens":
      return { ...config, maxSummaryTokens: Number.parseInt(value, 10) };
    case "showStatusWidget":
      return { ...config, showStatusWidget: parseOnOff(value) };
    default:
      return undefined;
  }
}

function framePanel(lines: string[], width: number, theme: { fg(color: string, text: string): string }): string[] {
  const innerWidth = Math.max(1, width - 2);
  const border = theme.fg("accent", "─".repeat(innerWidth));
  return [
    theme.fg("accent", `╭${border}╮`),
    ...lines.map((line) => `${theme.fg("accent", "│")}${truncateToWidth(line, innerWidth, "", true)}${theme.fg("accent", "│")}`),
    theme.fg("accent", `╰${border}╯`),
  ];
}

export async function openSettingsPanel(ctx: ExtensionCommandContext, controller: SettingsController): Promise<void> {
  if (!ctx.hasUI) {
    return;
  }

  const models = controller.getModels();
  if (models.length === 0) {
    ctx.ui.notify("No Pi model with configured authentication is available.", "warning");
  }

  await ctx.ui.custom<void>((tui, theme, _keybindings, done) => {
    let config = controller.getConfig();
    const container = new Container();
    container.addChild(new Text(theme.fg("accent", theme.bold("Custom Context Compaction")), 1, 0));
    container.addChild(new Text(theme.fg("muted", "Pi model + algorithm · changes save immediately"), 1, 0));
    container.addChild(new Spacer(1));

    const settings = new SettingsList(
      buildItems(config, models),
      8,
      getSettingsListTheme(),
      (id, value) => {
        const next = applySetting(config, id, value, models);
        if (!next || !controller.save(next, ctx)) {
          return;
        }
        config = next;
        settings.updateValue(id, value);
        tui.requestRender();
      },
      () => done(undefined),
      { enableSearch: true },
    );
    container.addChild(settings);
    container.addChild(new Spacer(1));
    container.addChild(new Text(theme.fg("dim", `Config: ${controller.getConfigPath()} · Esc closes`), 1, 0));
    container.addChild(new Text(theme.fg("dim", "Role-persona auto-memory may independently extract memories before compaction."), 1, 0));

    return {
      render: (width) => framePanel(container.render(Math.max(1, width - 2)), width, theme),
      invalidate: () => container.invalidate(),
      handleInput: (data) => {
        settings.handleInput(data);
        tui.requestRender();
      },
    };
  }, { overlay: true });
}
