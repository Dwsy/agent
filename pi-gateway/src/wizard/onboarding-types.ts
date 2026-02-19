/**
 * Onboarding wizard types — aligned with OpenClaw onboarding patterns.
 */

import type { Config } from "../core/config.ts";

export type WizardFlow = "quickstart" | "advanced";

export type OnboardMode = "local" | "remote";

export type GatewayBind = "loopback" | "lan" | "auto" | "custom";

export type AuthMode = "token" | "password" | "off";

export interface OnboardOptions {
  /** Non-interactive mode — all values from CLI args */
  nonInteractive?: boolean;

  /** Accept security risk without prompt */
  acceptRisk?: boolean;

  /** Wizard flow mode */
  flow?: WizardFlow;

  /** Local or remote gateway */
  mode?: OnboardMode;

  /** Workspace directory path */
  workspace?: string;

  /** Gateway port */
  port?: number;

  /** Gateway bind mode */
  bind?: GatewayBind;

  /** Custom bind host (when bind=custom) */
  customHost?: string;

  /** Authentication mode */
  auth?: AuthMode;

  /** Auth token (when auth=token) */
  token?: string;

  /** Auth password (when auth=password) */
  password?: string;

  /** Telegram bot token */
  telegramToken?: string;

  /** Pi CLI path */
  piCliPath?: string;

  /** Default model */
  model?: string;

  /** Pool min size */
  poolMin?: number;

  /** Pool max size */
  poolMax?: number;

  /** Install daemon after configuration */
  installDaemon?: boolean;

  /** Config file path to write */
  configPath?: string;

  /** Skip interactive prompts */
  yes?: boolean;
}

export interface QuickstartDefaults {
  hasExisting: boolean;
  port: number;
  bind: GatewayBind;
  customHost?: string;
  authMode: AuthMode;
  token?: string;
  password?: string;
}

export interface OnboardingResult {
  success: boolean;
  config: Config;
  configPath: string;
  message: string;
}
