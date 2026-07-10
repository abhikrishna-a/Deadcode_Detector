import { useRef, useCallback, useEffect, useState } from 'react';

const MAX_RETRIES = 10;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30000;

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

export function useChatSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const isConnectingRef = useRef(false);
  const intentionalCloseRef = useRef(false);
  const retryCountRef = useRef(0);
  const onMsgRef = useRef<((msg: any) => void) | null>(null);
  const currentRoomRef = useRef<string>('');
  const targetRoomRef = useRef<string>('');
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');

  const disconnect = useCallback(() => {
    intentionalCloseRef.current = true;
    wsRef.current?.close();
    wsRef.current = null;
    retryCountRef.current = 0;
    setConnectionStatus('disconnected');
  }, []);

  const connect = useCallback((roomName: string, onMsg: (msg: any) => void) => {
    onMsgRef.current = onMsg;
    targetRoomRef.current = roomName;

    // Close any existing connection for a different room atomically,
    // setting targetRoom first so stale onclose won't reconnect.
    if (currentRoomRef.current !== roomName) {
      intentionalCloseRef.current = true;
      wsRef.current?.close();
      wsRef.current = null;
      retryCountRef.current = 0;
    }

    currentRoomRef.current = roomName;
    intentionalCloseRef.current = false;
    retryCountRef.current = 0;

    const doConnect = () => {
      if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
        setConnectionStatus('connected');
        return;
      }
      if (isConnectingRef.current) return;

      // If room changed since this doConnect was scheduled, abort
      if (currentRoomRef.current !== targetRoomRef.current) return;

      isConnectingRef.current = true;
      setConnectionStatus('connecting');

      const WS_BASE = import.meta.env.VITE_WS_URL
        || `${location.protocol.replace('http', 'ws')}//${location.host}/ws`;
      const safeRoom = roomName.replace(/^\/+|\/+$/g, '');
      const ws = new WebSocket(`${WS_BASE}/chat/${encodeURIComponent(safeRoom)}/`);

      ws.onopen = () => {
        wsRef.current = ws;
        isConnectingRef.current = false;
        retryCountRef.current = 0;
        setConnectionStatus('connected');
      };

      ws.onmessage = ev => {
        try { onMsgRef.current?.(JSON.parse(ev.data)); } catch { /* ignore */ }
      };

      ws.onclose = () => {
        wsRef.current = null;
        isConnectingRef.current = false;
        setConnectionStatus('disconnected');
        if (intentionalCloseRef.current) return;
        if (currentRoomRef.current !== targetRoomRef.current) return;
        if (retryCountRef.current >= MAX_RETRIES) return;
        retryCountRef.current++;
        const delay = Math.min(
          BASE_DELAY_MS * Math.pow(2, retryCountRef.current - 1) + Math.random() * 1000,
          MAX_DELAY_MS,
        );
        setTimeout(() => {
          if (currentRoomRef.current === targetRoomRef.current) {
            setConnectionStatus('connecting');
          }
          doConnect();
        }, delay);
      };

      ws.onerror = () => { ws.close(); };
    };
    doConnect();
  }, []);

  const sendMessage = useCallback((content: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'send_message', content }));
    }
  }, []);

  const sendTyping = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'typing' }));
    }
  }, []);

  const sendStopTyping = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'stop_typing' }));
    }
  }, []);

  useEffect(() => {
    return () => {
      intentionalCloseRef.current = true;
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);

  return { connect, disconnect, sendMessage, sendTyping, sendStopTyping, connectionStatus };
}
