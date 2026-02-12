/**
 * CardKit v1 streaming card — native typewriter effect for Feishu.
 *
 * Flow:
 *   1. create()       → POST /cardkit/v1/cards (streaming_mode: true)
 *   2. appendText()   → PUT  /cardkit/v1/cards/:id/elements/:eid/content
 *   3. addElement()   → POST /cardkit/v1/cards/:id/elements (insert_before main md)
 *   4. finalize()     → PATCH /cardkit/v1/cards/:id/settings (streaming_mode: false)
 *
 * Falls back via onFallback callback if any CardKit call fails.
 */
import type * as Lark from "@larksuiteoapi/node-sdk";

const MAIN_ELEMENT_ID = "streaming_md";
const MIN_INTERVAL_MS = 200;

export interface CardStreamConfig {
  client: Lark.Client;
  /** Called once when CardKit fails — caller should switch to patch mode. */
  onFallback?: () => void;
}

export class FeishuCardStream {
  private cardId: string | null = null;
  private seq = 0;
  private lastUpdateAt = 0;
  private pending: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private failed = false;
  private client: Lark.Client;
  private onFallback?: () => void;

  constructor(cfg: CardStreamConfig) {
    this.client = cfg.client;
    this.onFallback = cfg.onFallback;
  }

  /** Create a streaming card entity. Returns card_id or null on failure. */
  async create(): Promise<string | null> {
    try {
      const resp = await this.client.cardkit.v1.card.create({
        data: {
          type: "card_json",
          data: JSON.stringify({
            schema: "2.0",
            config: {
              wide_screen_mode: true,
              streaming_mode: true,
              summary: { content: "[生成中]" },
              streaming_config: {
                print_frequency_ms: { default: 30 },
                print_step: { default: 2 },
                print_strategy: "fast",
              },
            },
            body: {
              elements: [
                { tag: "markdown", content: "", element_id: MAIN_ELEMENT_ID },
              ],
            },
          }),
        },
      });
      if (resp.code !== 0 || !resp.data?.card_id) {
        this.markFailed();
        return null;
      }
      this.cardId = resp.data.card_id;
      return this.cardId;
    } catch {
      this.markFailed();
      return null;
    }
  }

  /** Stream text into the main markdown element (throttled). */
  async appendText(content: string): Promise<void> {
    if (!this.cardId || this.failed) return;

    const elapsed = Date.now() - this.lastUpdateAt;
    if (elapsed < MIN_INTERVAL_MS) {
      this.pending = content;
      if (!this.timer) {
        this.timer = setTimeout(() => {
          this.timer = null;
          if (this.pending !== null) {
            const p = this.pending;
            this.pending = null;
            void this.appendText(p);
          }
        }, MIN_INTERVAL_MS - elapsed);
      }
      return;
    }

    this.pending = null;
    this.lastUpdateAt = Date.now();

    try {
      const resp = await this.client.cardkit.v1.cardElement.content({
        data: { content, sequence: ++this.seq },
        path: { card_id: this.cardId, element_id: MAIN_ELEMENT_ID },
      });
      if (resp.code !== 0) this.markFailed();
    } catch {
      this.markFailed();
    }
  }

  /** Insert a markdown element before the main streaming element. */
  async addElement(content: string, elementId: string): Promise<void> {
    if (!this.cardId || this.failed) return;

    try {
      const resp = await this.client.cardkit.v1.cardElement.create({
        data: {
          type: "insert_before",
          target_element_id: MAIN_ELEMENT_ID,
          sequence: ++this.seq,
          elements: JSON.stringify([
            { tag: "markdown", content, element_id: elementId },
          ]),
        },
        path: { card_id: this.cardId },
      });
      if (resp.code !== 0) this.markFailed();
    } catch {
      this.markFailed();
    }
  }

  /** Turn off streaming mode. Flushes any pending text first. */
  async finalize(finalContent?: string): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.cardId || this.failed) return;

    if (finalContent) {
      this.lastUpdateAt = 0; // bypass throttle
      await this.appendText(finalContent);
    }

    try {
      await this.client.cardkit.v1.card.settings({
        data: {
          settings: JSON.stringify({ config: { streaming_mode: false } }),
          sequence: ++this.seq,
        },
        path: { card_id: this.cardId },
      });
    } catch {
      // Non-critical: card will stop streaming on its own eventually
    }
  }

  get isActive(): boolean {
    return this.cardId !== null && !this.failed;
  }

  get isFailed(): boolean {
    return this.failed;
  }

  private markFailed(): void {
    if (this.failed) return;
    this.failed = true;
    this.onFallback?.();
  }
}
