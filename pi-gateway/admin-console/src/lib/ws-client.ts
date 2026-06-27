type WsReqFrame = {
  type: 'req';
  id: string;
  method: string;
  params?: Record<string, unknown>;
};

type WsResFrame = {
  type: 'res';
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: string;
};

type WsEventFrame = {
  type: 'event';
  event: string;
  payload: unknown;
};

type WsFrame = WsResFrame | WsEventFrame;

type PendingRequest = {
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  timer: number;
};

export type EventHandler<T = unknown> = (payload: T) => void;

class GatewayWsClient {
  private ws: WebSocket | null = null;
  private reqId = 0;
  private pending = new Map<string, PendingRequest>();
  private listeners = new Map<string, Set<EventHandler>>();
  private reconnectTimer: number | null = null;
  private reconnectDelay = 3000;
  private manualClose = false;
  private token: string | null = null;
  private connected = false;

  private notify(event: string, payload: unknown) {
    const handlers = this.listeners.get(event);
    if (!handlers) return;
    handlers.forEach((handler) => handler(payload));
  }

  setToken(token: string | null) {
    this.token = token;
  }

  isConnected() {
    return this.connected;
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.manualClose = false;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const tokenParam = this.token ? `?token=${encodeURIComponent(this.token)}` : '';
    const wsUrl = `${protocol}//${window.location.host}${tokenParam}`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.connected = true;
      this.notify('connection', { connected: true });
      if (this.token) {
        this.request('connect', { token: this.token }).catch(() => {
          // silent: ui handles permission failure via normal ws close/errors
        });
      } else {
        this.request('connect', {}).catch(() => {
          // gateway may require auth token
        });
      }
    };

    this.ws.onmessage = (message) => {
      try {
        const frame = JSON.parse(message.data as string) as WsFrame;
        if (frame.type === 'res') {
          const entry = this.pending.get(frame.id);
          if (!entry) return;
          window.clearTimeout(entry.timer);
          this.pending.delete(frame.id);
          if (frame.ok) {
            entry.resolve(frame.payload);
          } else {
            entry.reject(new Error(frame.error ?? 'Unknown WS error'));
          }
          return;
        }

        if (frame.type === 'event') {
          this.notify(frame.event, frame.payload);
        }
      } catch {
        // ignore invalid payload
      }
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.notify('connection', { connected: false });
      this.ws = null;
      if (!this.manualClose) {
        if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
        this.reconnectTimer = window.setTimeout(() => this.connect(), this.reconnectDelay);
      }
    };

    this.ws.onerror = () => {
      // onclose will handle reconnect path
    };
  }

  disconnect() {
    this.manualClose = true;
    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.pending.forEach((entry) => {
      window.clearTimeout(entry.timer);
      entry.reject(new Error('WS disconnected'));
    });
    this.pending.clear();
    this.ws?.close();
    this.ws = null;
    this.connected = false;
  }

  reconnect() {
    this.disconnect();
    this.connect();
  }

  request<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }
      const id = `admin-${++this.reqId}`;
      const frame: WsReqFrame = { type: 'req', id, method, params };
      const timer = window.setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`WS request timeout: ${method}`));
      }, 30_000);

      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify(frame));
    });
  }

  on<T = unknown>(event: string, handler: EventHandler<T>) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    const handlers = this.listeners.get(event)!;
    handlers.add(handler as EventHandler);
    return () => {
      handlers.delete(handler as EventHandler);
      if (!handlers.size) this.listeners.delete(event);
    };
  }
}

export const gatewayWsClient = new GatewayWsClient();
