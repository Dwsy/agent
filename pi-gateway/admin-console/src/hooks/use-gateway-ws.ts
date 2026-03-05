import { useEffect, useState } from 'react';
import { gatewayWsClient } from '../lib/ws-client';

const TOKEN_KEY = 'gateway_api_token';
const TOKEN_UPDATED_EVENT = 'gateway-token-updated';

export function useGatewayWs() {
  const [connected, setConnected] = useState(gatewayWsClient.isConnected());

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    gatewayWsClient.setToken(token);
    gatewayWsClient.connect();

    const off = gatewayWsClient.on<{ connected: boolean }>('connection', (payload) => {
      setConnected(Boolean(payload?.connected));
    });

    const refreshTokenAndReconnect = () => {
      const nextToken = localStorage.getItem(TOKEN_KEY);
      gatewayWsClient.setToken(nextToken);
      gatewayWsClient.reconnect();
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === TOKEN_KEY) {
        refreshTokenAndReconnect();
      }
    };

    const onTokenUpdated = () => {
      refreshTokenAndReconnect();
    };

    window.addEventListener('storage', onStorage);
    window.addEventListener(TOKEN_UPDATED_EVENT, onTokenUpdated as EventListener);

    return () => {
      off();
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(TOKEN_UPDATED_EVENT, onTokenUpdated as EventListener);
    };
  }, []);

  return {
    connected,
    request: gatewayWsClient.request.bind(gatewayWsClient),
    on: gatewayWsClient.on.bind(gatewayWsClient),
  };
}
