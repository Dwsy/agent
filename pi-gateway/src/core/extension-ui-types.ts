/**
 * Extension UI WS Protocol Types
 *
 * Defines the WebSocket message schema for forwarding pi extension UI requests
 * (select, confirm, text input, etc.) to WebChat frontends in headless/gateway mode.
 *
 * Design rationale (DarkFalcon, OpenClaw review):
 * 1. TTL 60s per request — prevents agent hang when frontend is unresponsive
 * 2. First-win competition — multiple frontends: first response wins, others ignored
 * 3. Dismissed notification — late clients receive extension_ui_dismissed to close stale prompts
 * 4. Union type mapping — covers both pi rpc-client types and OpenClaw WizardPrompter types
 *
 * Flow:
 *   pi agent (rpc) → extension_ui_request → gateway → WS → frontend
 *   frontend → extension_ui_response → gateway → rpc stdin → pi agent
 *   gateway → extension_ui_dismissed → late frontends (after first-win resolve)
 */

// ============================================================================
// Gateway → Frontend
// ============================================================================

export interface ExtensionUIRequestBase {
  type: "extension_ui_request";
  id: string;
  method: ExtensionUIMethod;
  title?: string;
  ttlMs: number; // default 60000
}

export type ExtensionUIMethod = "select" | "multiselect" | "text" | "confirm" | "progress" | "editor";

export interface SelectOption {
  value: string;
  label: string;
  hint?: string;
}

export interface ExtensionUISelectRequest extends ExtensionUIRequestBase {
  method: "select" | "multiselect";
  options: SelectOption[];
  initialValue?: string;       // select: pre-selected value
  initialValues?: string[];    // multiselect: pre-selected values
}

export interface ExtensionUITextRequest extends ExtensionUIRequestBase {
  method: "text" | "editor";
  placeholder?: string;
  defaultValue?: string;
}

export interface ExtensionUIConfirmRequest extends ExtensionUIRequestBase {
  method: "confirm";
  message?: string;
  initialValue?: boolean;  // default selection: true=Yes, false=No
}

export interface ExtensionUIProgressRequest extends ExtensionUIRequestBase {
  method: "progress";
  current?: number;
  total?: number;
  label?: string;
}

export type ExtensionUIRequest =
  | ExtensionUISelectRequest
  | ExtensionUITextRequest
  | ExtensionUIConfirmRequest
  | ExtensionUIProgressRequest;

// ============================================================================
// Frontend → Gateway
// ============================================================================

export interface ExtensionUIResponse {
  type: "extension_ui_response";
  id: string;
  value?: string | string[];
  confirmed?: boolean;
  cancelled?: boolean;
  timestamp: number; // Date.now() for debugging
}

// ============================================================================
// Gateway → Frontend (dismissed notification)
// ============================================================================

export interface ExtensionUIDismissed {
  type: "extension_ui_dismissed";
  id: string;
}

// ============================================================================
// Pending Request Tracking (gateway internal)
// ============================================================================

export interface PendingUIRequest {
  id: string;
  request: ExtensionUIRequest;
  resolved: boolean;
  createdAt: number;
  ttlTimer: ReturnType<typeof setTimeout>;
  /** Callback to write response back to rpc stdin */
  respond: (response: ExtensionUIResponse) => void;
  /** Callback on TTL expiry — auto-cancels */
  onTimeout: () => void;
}
