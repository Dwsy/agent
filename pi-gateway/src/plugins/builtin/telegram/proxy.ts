/**
 * Bun/undici fetch does not provide a stable per-request proxy agent API here.
 * We keep a pragmatic compatibility layer by setting process-level proxy envs.
 */
export function applyProxyEnv(proxy?: string): void {
  if (!proxy?.trim()) return;
  process.env.HTTP_PROXY = proxy;
  process.env.HTTPS_PROXY = proxy;
  process.env.http_proxy = proxy;
  process.env.https_proxy = proxy;
}
