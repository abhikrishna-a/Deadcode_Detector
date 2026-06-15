import { useEffect, useRef, useCallback } from 'react';
import { createAnalysisSocket, AnalysisSocketCallbacks } from '../api/ws';

export function useAnalysisSocket() {
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback((batchId: string, callbacks: AnalysisSocketCallbacks) => {
    wsRef.current?.close();
    wsRef.current = createAnalysisSocket(batchId, {
      ...callbacks,
      onClose: () => {
        wsRef.current = null;
        callbacks.onClose?.();
      },
    });
  }, []);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
  }, []);

  useEffect(() => {
    return () => disconnect();
  }, [disconnect]);

  return { connect, disconnect };
}
