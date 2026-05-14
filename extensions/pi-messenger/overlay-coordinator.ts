import type { OverlayHandle, TUI } from "@mariozechner/pi-tui";

const QUIET_PERIOD_MS = 80;
const RENDER_THROTTLE_MS = 32;
const STDOUT_GUARD_MS = 32;

type StdoutWrite = typeof process.stdout.write;

function hasRenderableOutput(chunk: unknown): boolean {
  if (typeof chunk === "string") return chunk.length > 0;
  if (chunk instanceof Uint8Array) return chunk.length > 0;
  return false;
}

/**
 * Coordinates overlay rendering with main agent stdout to prevent visual collision.
 * 
 * Strategy: Keep overlay visible, but schedule a "repair" render after foreign
 * output settles. Brief visual corruption is acceptable if it self-heals quickly.
 */
export class OverlayRenderCoordinator {
  private tui: TUI | null = null;
  private handle: OverlayHandle | null = null;
  private originalRequestRender: TUI["requestRender"] | null = null;
  private originalStdoutWrite: StdoutWrite | null = null;
  private repairTimer: ReturnType<typeof setTimeout> | null = null;
  private lastRenderAt = 0;
  private stdoutGuardUntil = 0;
  private foreignOutputDetected = false;

  installStdoutInterceptor(): void {
    if (this.originalStdoutWrite) return;

    const original = process.stdout.write.bind(process.stdout) as StdoutWrite;
    this.originalStdoutWrite = original;

    const coordinator = this;
    (process.stdout.write as StdoutWrite) = function writeIntercept(
      chunk: Parameters<StdoutWrite>[0],
      ...args: Parameters<StdoutWrite> extends [unknown, ...infer Rest] ? Rest : never
    ) {
      const result = original(chunk, ...args);
      coordinator.handleStdoutWrite(chunk);
      return result;
    } as StdoutWrite;
  }

  uninstallStdoutInterceptor(): void {
    if (!this.originalStdoutWrite) return;
    (process.stdout.write as StdoutWrite) = this.originalStdoutWrite;
    this.originalStdoutWrite = null;
  }

  attach(tui: TUI): void {
    if (this.tui === tui && this.originalRequestRender) return;

    this.detach();
    this.tui = tui;
    this.originalRequestRender = tui.requestRender.bind(tui);
    tui.requestRender = ((force?: boolean) => {
      this.requestRender(force);
    }) as TUI["requestRender"];
  }

  setHandle(handle: OverlayHandle | null): void {
    this.handle = handle;
  }

  detach(): void {
    if (this.repairTimer) {
      clearTimeout(this.repairTimer);
      this.repairTimer = null;
    }
    if (this.tui && this.originalRequestRender) {
      this.tui.requestRender = this.originalRequestRender;
    }
    this.tui = null;
    this.handle = null;
    this.originalRequestRender = null;
    this.lastRenderAt = 0;
    this.stdoutGuardUntil = 0;
    this.foreignOutputDetected = false;
  }

  dispose(): void {
    this.detach();
    this.uninstallStdoutInterceptor();
  }

  /** Called by hooks when main agent activity is expected */
  noteForegroundActivity(): void {
    if (!this.tui || !this.handle) return;
    if (this.handle.isHidden()) return;

    this.foreignOutputDetected = true;
    this.scheduleRepair();
  }

  private handleStdoutWrite(chunk: unknown): void {
    if (!this.tui || !this.handle) return;
    if (!hasRenderableOutput(chunk)) return;
    if (Date.now() <= this.stdoutGuardUntil) return;
    if (this.handle.isHidden()) return;

    this.foreignOutputDetected = true;
    this.scheduleRepair();
  }

  private scheduleRepair(): void {
    if (this.repairTimer) clearTimeout(this.repairTimer);
    this.repairTimer = setTimeout(() => {
      this.repairTimer = null;
      this.repair();
    }, QUIET_PERIOD_MS);
  }

  private repair(): void {
    if (!this.tui || !this.handle) return;
    if (this.handle.isHidden()) return;
    if (!this.foreignOutputDetected) return;

    this.foreignOutputDetected = false;
    this.flushRender(true);
  }

  requestRender(force = false): void {
    if (!this.originalRequestRender) return;
    if (this.handle?.isHidden()) return;

    const now = Date.now();
    if (!force) {
      const elapsed = now - this.lastRenderAt;
      if (elapsed < RENDER_THROTTLE_MS) {
        // Skip this render, repair timer will catch up
        return;
      }
    }

    this.flushRender(force);
  }

  private flushRender(force: boolean): void {
    if (!this.originalRequestRender) return;
    if (this.handle?.isHidden()) return;

    this.lastRenderAt = Date.now();
    this.stdoutGuardUntil = this.lastRenderAt + STDOUT_GUARD_MS;
    this.originalRequestRender(force);
  }
}
