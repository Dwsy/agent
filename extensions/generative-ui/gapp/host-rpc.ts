export interface GappHostRpcContext {
  appId: string;
  cwd: string;
  sessionId: string;
}

export type GappHostRpcHandler = (
  method: string,
  args: Record<string, unknown>,
  context: GappHostRpcContext,
) => unknown | Promise<unknown>;

interface HandlerEntry {
  handle: GappHostRpcHandler;
  close?: (context: GappHostRpcContext) => void | Promise<void>;
}

const handlers = new Map<string, HandlerEntry>();

export function registerHostRpcHandler(
  appId: string,
  handle: GappHostRpcHandler,
  close?: HandlerEntry["close"],
): () => void {
  if (!appId.trim()) throw new Error("appId required");
  if (handlers.has(appId)) throw new Error(`Host RPC handler already registered: ${appId}`);
  handlers.set(appId, { handle, close });
  return () => handlers.delete(appId);
}

export async function dispatchHostRpc(
  method: string,
  args: Record<string, unknown>,
  context: GappHostRpcContext,
): Promise<unknown> {
  const entry = handlers.get(context.appId);
  if (!entry) throw new Error(`No host RPC handler registered for ${context.appId}`);
  if (!method.trim()) throw new Error("RPC method required");
  return entry.handle(method, args, context);
}

export async function notifyHostRpcWindowClosed(context: GappHostRpcContext): Promise<void> {
  const entry = handlers.get(context.appId);
  if (!entry?.close) return;
  await entry.close(context);
}
