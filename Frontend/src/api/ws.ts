import { getAccessToken } from './client';

const WS_BASE = import.meta.env.VITE_WS_URL || `${location.protocol.replace('http', 'ws')}//${location.host}/ws`;

export interface WsProgressMessage {
  type: 'progress';
  done: number;
  total: number;
  current_file: string;
}

export interface WsFileCompleteMessage {
  type: 'file_complete';
  filename: string;
  document_id: string;
  analysis: any;
  source_content?: string;
}

export interface WsFileErrorMessage {
  type: 'file_error';
  filename: string;
  error: string;
}

export interface WsBatchCompleteMessage {
  type: 'batch_complete';
}

export type WsAnalysisMessage =
  | WsProgressMessage
  | WsFileCompleteMessage
  | WsFileErrorMessage
  | WsBatchCompleteMessage;

export interface AnalysisSocketCallbacks {
  onProgress?: (done: number, total: number, currentFile: string) => void;
  onFileComplete?: (msg: WsFileCompleteMessage) => void;
  onFileError?: (filename: string, error: string) => void;
  onBatchComplete?: () => void;
  onError?: (error: string) => void;
  onClose?: () => void;
}

export function createAnalysisSocket(
  batchId: string,
  callbacks: AnalysisSocketCallbacks
): WebSocket {
  const token = getAccessToken();
  const url = `${WS_BASE}/analysis/${batchId}/?token=${encodeURIComponent(token)}`;
  const ws = new WebSocket(url);

  ws.onmessage = (event: MessageEvent) => {
    try {
      const msg: WsAnalysisMessage = JSON.parse(event.data);
      switch (msg.type) {
        case 'progress':
          callbacks.onProgress?.(msg.done, msg.total, msg.current_file);
          break;
        case 'file_complete':
          callbacks.onFileComplete?.(msg);
          break;
        case 'file_error':
          callbacks.onFileError?.(msg.filename, msg.error);
          break;
        case 'batch_complete':
          callbacks.onBatchComplete?.();
          break;
      }
    } catch {
      callbacks.onError?.('Failed to parse WebSocket message');
    }
  };

  ws.onerror = () => callbacks.onError?.('WebSocket connection error');
  ws.onclose = () => callbacks.onClose?.();

  return ws;
}
