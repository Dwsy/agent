import type { GatewayApi } from "./types.ts";
import { registerModelCommands } from "./commands.ts";
import { registerModelRpcMethods } from "./rpc-methods.ts";
import { registerLifecycleHooks } from "./hooks.ts";
import { createHeartbeatService } from "./services.ts";

export default function register(api: GatewayApi): void {
  registerLifecycleHooks(api);
  registerModelCommands(api);
  registerModelRpcMethods(api);
  api.registerService(createHeartbeatService());

  api.logger.info("[__PLUGIN_NAME__] plugin registered");
}
