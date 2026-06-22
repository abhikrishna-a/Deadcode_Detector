import { useRef, useCallback, useEffect } from 'react';
import { getAccessToken } from '../api/client';

const MAX_RETRIES = 10;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30000;

export function useNotificationSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const isConnectingRef = useRef(false);
  const intentionalCloseRef = useRef(false);
  const retryCountRef = useRef(0);
  const onMsgRef = useRef<((msg: any) => void) | null>(null);

  const disconnect = useCallback(() => {
    intentionalCloseRef.current = true;
    wsRef.current?.close();
    wsRef.current = null;
    retryCountRef.current = 0;
  }, []);

  const connect = useCallback((onMsg: (msg: any) => void) => {
    onMsgRef.current = onMsg;
    intentionalCloseRef.current = false;
    retryCountRef.current = 0;
    const doConnect = () => {
      if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) return;
      if (isConnectingRef.current) return;
      isConnectingRef.current = true;

      const token = getAccessToken();
      if (!token) {
        isConnectingRef.current = false;
        return;
      }

      const WS_BASE = import.meta.env.VITE_WS_URL
        || `${location.protocol.replace('http', 'ws')}//${location.host}/ws`;
      const ws = new WebSocket(`${WS_BASE}/notifications/?token=${encodeURIComponent(token)}`);

      ws.onopen = () => {
        wsRef.current = ws;
        isConnectingRef.current = false;
        retryCountRef.current = 0;
      };

      ws.onmessage = ev => {
        try { onMsgRef.current?.(JSON.parse(ev.data)); } catch { /* ignore */ }
      };

      ws.onclose = () => {
        wsRef.current = null;
        isConnectingRef.current = false;
        if (intentionalCloseRef.current) return;
        if (retryCountRef.current >= MAX_RETRIES) return;
        retryCountRef.current++;
        const delay = Math.min(
          BASE_DELAY_MS * Math.pow(2, retryCountRef.current - 1) + Math.random() * 1000,
          MAX_DELAY_MS,
        );
        setTimeout(doConnect, delay);
      };

      ws.onerror = () => { ws.close(); };
    };
    doConnect();
  }, []);

  useEffect(() => {
    return () => {
      intentionalCloseRef.current = true;
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);

  return { connect, disconnect };
}
