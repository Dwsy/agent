import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { WebServerHandlers } from "../runtime/web-server.ts";

export interface SemanticRouteMatch {
  appendSystemPrompt?: string;
}

export interface ExtensionPluginModule {
  id: string;
  matchPrompt?: (prompt: string) => SemanticRouteMatch | null;
  register?: (pi: ExtensionAPI, shared: PluginSharedContext) => void;
}

export interface PluginSharedContext {
  web: WebServerHandlers;
  queueUserPrompt: (prompt: string) => void;
}
