/**
 * Onboarding wizard implementation — aligned with OpenClaw onboarding patterns.
 * Interactive configuration generator for pi-gateway.
 */

import { resolve, join } from "node:path";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import type {
  Config,
  TelegramChannelConfig,
  GatewayConfig,
} from "../core/config";
import { loadConfig, saveConfig, resolveConfigPath, DEFAULT_CONFIG } from "../core/config";
import type { WizardPrompter } from "./prompts";
import { WizardCancelledError } from "./prompts";
import type {
  OnboardOptions,
  OnboardingResult,
  WizardFlow,
  GatewayBind,
  AuthMode,
} from "./onboarding-types";
import { createClackPrompter } from "./clack-prompter";
import { installDaemon } from "../core/daemon";

const DEFAULT_PORT = 52134;
const DEFAULT_POOL_MIN = 1;
const DEFAULT_POOL_MAX = 4;

/**
 * Generate a secure random token for gateway auth.
 */
function generateToken(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Resolve user path (handles ~ expansion).
 */
function resolveUserPath(input: string): string {
  if (input.startsWith("~/")) {
    return join(process.env.HOME ?? "/root", input.slice(2));
  }
  return resolve(input);
}

/**
 * Check if a port is available using TCP socket.
 */
async function isPortAvailable(port: number): Promise<boolean> {
  try {
    const listener = Bun.listen({
      hostname: "127.0.0.1",
      port,
      socket: {
        data() {},
        open() {},
        close() {},
        drain() {},
      },
    });
    await listener.stop();
    return true;
  } catch {
    return false;
  }
}

/**
 * Find next available port starting from given port.
 */
async function findAvailablePort(startPort: number): Promise<number> {
  for (let port = startPort; port < startPort + 100; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  return startPort;
}

/**
 * Validate Telegram bot token format.
 */
function isValidTelegramToken(token: string): boolean {
  return /^\d+:[A-Za-z0-9_-]+$/.test(token);
}

/**
 * Read existing config or return empty object.
 */
async function readExistingConfig(
  configPath?: string,
): Promise<{ exists: boolean; config: Partial<Config>; valid: boolean }> {
  try {
    const path = configPath ?? resolveConfigPath();
    if (!existsSync(path)) {
      return { exists: false, config: {}, valid: true };
    }
    const config = loadConfig(path);
    return { exists: true, config, valid: true };
  } catch {
    return { exists: true, config: {}, valid: false };
  }
}

/**
 * Run the onboarding wizard.
 */
export async function runOnboardingWizard(
  opts: OnboardOptions = {},
  prompter: WizardPrompter = createClackPrompter(),
): Promise<OnboardingResult> {
  const startTime = Date.now();

  // Intro
  await prompter.intro("🚀 pi-gateway onboarding");

  // Security warning
  if (!opts.acceptRisk && !opts.nonInteractive) {
    await prompter.note(
      [
        "Security notice:",
        "",
        "• This gateway can execute commands and access files via tools.",
        "• Default DM policy is 'pairing' — unknown users must be approved.",
        "• Keep your bot tokens secure and rotate them regularly.",
        "• Use 'loopback' bind for local-only access when possible.",
        "",
        "Review security settings in docs/guides/configuration.md",
      ].join("\n"),
      "⚠️  Security",
    );

    const accepted = await prompter.confirm({
      message: "I understand the security implications. Continue?",
      initialValue: false,
    });

    if (!accepted) {
      throw new WizardCancelledError("security warning not accepted");
    }
  }

  // Read existing config
  const { exists: configExists, config: existingConfig, valid: configValid } =
    await readExistingConfig(opts.configPath);

  if (configExists && !configValid) {
    await prompter.note(
      "Existing config is invalid. Please fix it manually or reset.",
      "Config Error",
    );
    throw new WizardCancelledError("invalid existing config");
  }

  // Determine flow mode
  let flow: WizardFlow = opts.flow ?? "quickstart";
  if (!opts.nonInteractive && !opts.flow) {
    const hasExisting = configExists && Object.keys(existingConfig).length > 0;

    if (hasExisting) {
      await prompter.note(
        `Existing config detected at: ${resolveConfigPath()}`,
        "Config Found",
      );

      const action = await prompter.select<"keep" | "modify" | "reset">({
        message: "How would you like to proceed?",
        options: [
          { value: "keep", label: "Keep existing", hint: "Use current config as base" },
          { value: "modify", label: "Modify", hint: "Update specific values" },
          { value: "reset", label: "Reset", hint: "Start fresh" },
        ],
        initialValue: "keep",
      });

      if (action === "reset") {
        flow = "advanced";
      } else if (action === "modify") {
        flow = "advanced";
      }
      // keep uses quickstart with existing values
    }

    if (!opts.flow) {
      flow = await prompter.select<WizardFlow>({
        message: "Choose onboarding mode",
        options: [
          {
            value: "quickstart",
            label: "QuickStart",
            hint: "Minimal setup, smart defaults",
          },
          {
            value: "advanced",
            label: "Advanced",
            hint: "Full control over all options",
          },
        ],
        initialValue: flow,
      });
    }
  }

  // Build config starting from defaults
  let config: Config = { ...DEFAULT_CONFIG };

  // Merge with existing if keeping
  if (existingConfig) {
    config = mergeConfigs(config, existingConfig);
  }

  // Workspace directory (stored in roles.workspaceDirs or agents.defaults.workspace)
  const workspaceDir = opts.workspace
    ? resolveUserPath(opts.workspace)
    : flow === "quickstart"
    ? resolveUserPath("~/.pi/gateway/workspace")
    : resolveUserPath(
        await prompter.text({
          message: "Workspace directory",
          initialValue: "~/.pi/gateway/workspace",
          validate: (v) => {
            if (!v.trim()) return "Workspace path is required";
            return undefined;
          },
        }),
      );

  // Ensure workspace exists
  await mkdir(workspaceDir, { recursive: true });

  // Gateway configuration
  const port = opts.port ??
    (flow === "quickstart"
      ? (existingConfig.gateway?.port ?? DEFAULT_PORT)
      : await promptForPort(prompter, existingConfig.gateway?.port));

  const bind: GatewayBind = opts.bind ??
    (flow === "quickstart"
      ? ((existingConfig.gateway?.bind as GatewayBind) ?? "loopback")
      : await prompter.select<GatewayBind>({
        message: "Gateway bind address",
        options: [
          { value: "loopback", label: "Loopback (127.0.0.1)", hint: "Local access only" },
          { value: "lan", label: "LAN", hint: "Accessible on local network" },
          { value: "auto", label: "Auto", hint: "Bind to all interfaces" },
        ],
        initialValue: (existingConfig.gateway?.bind as GatewayBind) ?? "loopback",
      }));

  // Auth configuration
  const authMode: AuthMode = opts.auth ??
    (flow === "quickstart"
      ? (existingConfig.gateway?.auth?.token ? "token" : "token")
      : await prompter.select<AuthMode>({
        message: "Authentication mode",
        options: [
          { value: "token", label: "Token", hint: "Random secure token (recommended)" },
          { value: "password", label: "Password", hint: "Custom password" },
          { value: "off", label: "Off", hint: "No authentication (not recommended)" },
        ],
        initialValue: existingConfig.gateway?.auth?.token
          ? "token"
          : existingConfig.gateway?.auth?.password
          ? "password"
          : "token",
      }));

  let token: string | undefined;
  let password: string | undefined;

  if (authMode === "token") {
    token = opts.token ??
      (flow === "quickstart" && existingConfig.gateway?.auth?.token
        ? existingConfig.gateway.auth.token
        : generateToken());
  } else if (authMode === "password") {
    password = opts.password ??
      (await prompter.text({
        message: "Set gateway password",
        initialValue: existingConfig.gateway?.auth?.password,
        validate: (v) => {
          if (!v || v.length < 8) return "Password must be at least 8 characters";
          return undefined;
        },
      }));
  }

  // Check port availability
  if (!opts.nonInteractive) {
    const isAvailable = await isPortAvailable(port);
    if (!isAvailable) {
      const newPort = await findAvailablePort(port + 1);
      await prompter.note(
        `Port ${port} is in use. Switching to ${newPort}.`,
        "Port Adjusted",
      );
    }
  }

  // Telegram configuration
  let telegramConfig: TelegramChannelConfig | undefined;
  if (flow === "advanced" || opts.telegramToken) {
    const enableTelegram = opts.telegramToken
      ? true
      : await prompter.confirm({
        message: "Enable Telegram channel?",
        initialValue: !!existingConfig.channels?.telegram?.enabled,
      });

    if (enableTelegram) {
      const botToken = opts.telegramToken ??
        (await prompter.text({
          message: "Telegram bot token (from @BotFather)",
          initialValue: existingConfig.channels?.telegram?.botToken,
          validate: (v) => {
            if (!v) return undefined; // Optional
            if (!isValidTelegramToken(v)) return "Invalid token format (expected: numbers:alphanumeric)";
            return undefined;
          },
        }));

      if (botToken) {
        telegramConfig = {
          enabled: true,
          botToken,
          dmPolicy: existingConfig.channels?.telegram?.dmPolicy ?? "pairing",
        };
      }
    }
  }

  // Agent configuration
  const piCliPath = opts.piCliPath ??
    (flow === "quickstart"
      ? (existingConfig.agent?.piCliPath ?? "pi")
      : await prompter.text({
        message: "Pi CLI path",
        initialValue: existingConfig.agent?.piCliPath ?? "pi",
      }));

  const poolMin = opts.poolMin ??
    (existingConfig.agent?.pool?.min ?? DEFAULT_POOL_MIN);
  const poolMax = opts.poolMax ??
    (existingConfig.agent?.pool?.max ?? DEFAULT_POOL_MAX);

  // Build final config
  config = {
    ...config,
    gateway: {
      ...config.gateway,
      port,
      bind: bind as "loopback" | "lan" | "auto",
      auth: {
        mode: authMode === "off" ? "off" : authMode,
        ...(token && { token }),
        ...(password && { password }),
      },
    },
    agent: {
      ...config.agent,
      piCliPath,
      pool: {
        min: poolMin,
        max: poolMax,
        idleTimeoutMs: config.agent.pool?.idleTimeoutMs ?? 300000,
      },
    },
    channels: {
      ...config.channels,
      ...(telegramConfig && { telegram: telegramConfig }),
    },
    roles: {
      ...config.roles,
      workspaceDirs: {
        ...config.roles?.workspaceDirs,
        default: workspaceDir,
      },
    },
  };

  // Preview config in advanced mode
  if (flow === "advanced" && !opts.nonInteractive) {
    await prompter.note(
      JSON.stringify(
        {
          gateway: {
            port: config.gateway.port,
            bind: config.gateway.bind,
            auth: config.gateway.auth.mode,
          },
          agent: {
            piCliPath: config.agent.piCliPath,
            pool: config.agent.pool,
          },
          channels: {
            telegram: config.channels.telegram?.enabled ? "enabled" : "not configured",
          },
        },
        null,
        2,
      ),
      "Configuration Preview",
    );

    const confirmed = await prompter.confirm({
      message: "Save this configuration?",
      initialValue: true,
    });

    if (!confirmed) {
      throw new WizardCancelledError("user cancelled after preview");
    }
  }

  // Save config
  const configPath = opts.configPath ?? resolveConfigPath();
  saveConfig(config, configPath);

  // Success message
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  await prompter.outro(`Configuration saved to ${configPath} (${duration}s)`);

  // Install daemon if requested
  if (opts.installDaemon) {
    const progress = prompter.progress("Installing system daemon...");
    try {
      installDaemon({ port, configPath });
      progress.stop("Daemon installed successfully");
    } catch (err: unknown) {
      progress.stop("Daemon installation failed");
      throw err;
    }
  }

  return {
    success: true,
    config,
    configPath,
    message: `Configuration complete. Start with: pi-gw gateway${opts.installDaemon ? " (daemon auto-starts)" : ""}`,
  };
}

/**
 * Merge existing config with defaults.
 */
function mergeConfigs(defaults: Config, existing: Partial<Config>): Config {
  return {
    ...defaults,
    ...existing,
    gateway: { ...defaults.gateway, ...existing.gateway },
    agent: {
      ...defaults.agent,
      ...existing.agent,
      pool: { ...defaults.agent?.pool, ...existing.agent?.pool },
    },
    session: { ...defaults.session, ...existing.session },
    channels: { ...defaults.channels, ...existing.channels },
    plugins: { ...defaults.plugins, ...existing.plugins },
    roles: { ...defaults.roles, ...existing.roles },
    hooks: { ...defaults.hooks, ...existing.hooks },
    cron: { ...defaults.cron, ...existing.cron },
    logging: { ...defaults.logging, ...existing.logging },
    queue: { ...defaults.queue, ...existing.queue },
    delegation: { ...defaults.delegation, ...existing.delegation },
  };
}

/**
 * Prompt for port with validation.
 */
async function promptForPort(
  prompter: WizardPrompter,
  existingPort?: number,
): Promise<number> {
  const input = await prompter.text({
    message: "Gateway port",
    initialValue: String(existingPort ?? DEFAULT_PORT),
    validate: (v) => {
      const port = parseInt(v, 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        return "Port must be between 1 and 65535";
      }
      return undefined;
    },
  });

  return parseInt(input, 10);
}
