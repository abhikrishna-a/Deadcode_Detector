import { useEffect, useRef, useCallback } from 'react';
import { createAnalysisSocket, AnalysisSocketCallbacks, ReconnectingWebSocket } from '../api/ws';

export function useAnalysisSocket() {
  const wsRef = useRef<ReconnectingWebSocket | null>(null);

  const connect = useCallback((batchId: string, callbacks: AnalysisSocketCallbacks) => {
    wsRef.current?.disconnect();
    const result = createAnalysisSocket(batchId, {
      ...callbacks,
      onClose: () => {
        wsRef.current = null;
        callbacks.onClose?.();
      },
    });
    wsRef.current = result;
  }, []);

  const disconnect = useCallback(() => {
    wsRef.current?.disconnect();
    wsRef.current = null;
  }, []);

  useEffect(() => {
    return () => disconnect();
  }, [disconnect]);

  return { connect, disconnect };
}
