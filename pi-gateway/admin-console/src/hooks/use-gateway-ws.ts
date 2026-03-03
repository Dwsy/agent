import { useEffect, useState } from 'react';
import { gatewayWsClient } from '../lib/ws-client';

export function useGatewayWs() {
  const [connected, setConnected] = useState(gatewayWsClient.isConnected());

  useEffect(() => {
    const token = localStorage.getItem('gateway_api_token');
    gatewayWsClient.setToken(token);
    gatewayWsClient.connect();

    const off = gatewayWsClient.on<{ connected: boolean }>('connection', (payload) => {
      setConnected(Boolean(payload?.connected));
    });

    return () => {
      off();
    };
  }, []);

  return {
    connected,
    request: gatewayWsClient.request.bind(gatewayWsClient),
    on: gatewayWsClient.on.bind(gatewayWsClient),
  };
}
