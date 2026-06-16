import { apiClient, getAccessToken } from './client';
import type {
  GitManifest,
  GitFileContents,
} from './types';

const RAG_BASE = import.meta.env.VITE_RAG_API_URL || '/rag';

async function readErrorDetail(response: Response, fallback: string): Promise<string> {
  const text = await response.text().catch(() => '');
  if (!text) return fallback;
  try {
    const parsed = JSON.parse(text);
    return parsed?.detail || parsed?.error || fallback;
  } catch {
    return text;
  }
}

export const analysisAPI = {
  // Unified analysis: sends file to RAG service which runs Groq analysis + stores in vector DB
  analyzeFile: async (file: File, scanFolder: string = '', scanType: string = 'single'): Promise<{
    filename: string;
    document_id: string;
    chunk_count: number;
    analysis: {
      summary: {
        total_issues: number;
        severity_counts: Record<string, number>;
        categories: Record<string, number>;
        overall_health: string;
        health_score?: number;
      };
      issues: Array<{
        id: string; category: string; severity: string;
        line_start: number; line_end: number; name: string | null;
        description: string; code_snippet: string; suggestion: string;
        safe_to_remove: boolean; confidence?: number;
      }>;
      metrics: {
        total_lines: number; code_lines?: number; comment_lines?: number;
        blank_lines?: number; dead_lines_estimate: number;
        dead_code_percentage: number; complexity_hint?: string;
      };
      refactor_hints?: string[];
    };
    auto_analyzed: boolean;
    cached?: boolean;
    scan_folder?: string;
    scan_type?: string;
  }> => {
    const token = await getAccessToken();
    const formData = new FormData();
    formData.append('file', file);
    formData.append('scan_type', scanType);
    if (scanFolder) formData.append('scan_folder', scanFolder);
    const response = await fetch(`${RAG_BASE}/analyze`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (response.status === 401) {
      throw new Error('Your session is invalid or expired. Please sign in again and complete MFA before analyzing files.');
    }
    if (response.status === 403) {
      throw new Error('MFA verification is required before using the analyzer.');
    }
    if (!response.ok) {
      const detail = await readErrorDetail(response, `Analysis failed (HTTP ${response.status})`);
      console.error('Analysis failed:', { status: response.status, detail });
      throw new Error(detail);
    }
    const result = await response.json();
    return {
      filename: result.filename,
      document_id: result.document_id,
      chunk_count: result.chunk_count,
      analysis: result.analysis,
      auto_analyzed: result.auto_analyzed ?? true,
      cached: result.cached ?? false,
      scan_folder: result.scan_folder || scanFolder,
      scan_type: result.scan_type || '',
    };
  },

  // RAG: Get single analysis by ID
  ragGetAnalysis: async (analysisId: string): Promise<{
    analysis_id: string;
    filename: string;
    language: string;
    analysis: any;
    cached: boolean;
  }> => {
    const token = await getAccessToken();
    const response = await fetch(`${RAG_BASE}/analysis/${analysisId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      const detail = await readErrorDetail(response, `Failed to fetch analysis (HTTP ${response.status})`);
      throw new Error(detail);
    }
    return response.json();
  },

  // RAG: Get all analyses for a scan folder
  ragGetAnalysesByFolder: async (scanFolder: string): Promise<{
    scan_folder: string;
    items: Array<{
      analysis_id: string;
      filename: string;
      language: string;
      analysis: any;
      health_score: number;
      total_issues: number;
      created_at: string;
    }>;
    count: number;
  }> => {
    const token = await getAccessToken();
    const response = await fetch(`${RAG_BASE}/analyses/by-folder/${encodeURIComponent(scanFolder)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      const detail = await readErrorDetail(response, `Failed to fetch folder analyses (HTTP ${response.status})`);
      throw new Error(detail);
    }
    return response.json();
  },

  // RAG: Paginated history
  ragHistory: async (limit: number = 20, offset: number = 0, search: string = ''): Promise<{
    items: Array<{
      analysis_id: string;
      filename: string;
      language: string;
      health_score: number;
      total_issues: number;
      created_at: string;
      scan_folder?: string;
      scan_type?: string;
    }>;
    total: number;
  }> => {
    const token = await getAccessToken();
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (search) params.set('search', search);
    const response = await fetch(`${RAG_BASE}/history?${params}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      const detail = await readErrorDetail(response, `Failed to fetch history (HTTP ${response.status})`);
      throw new Error(detail);
    }
    return response.json();
  },

  // RAG: Delete analysis
  ragDeleteAnalysis: async (analysisId: string): Promise<boolean> => {
    const token = await getAccessToken();
    const response = await fetch(`${RAG_BASE}/analysis/${analysisId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.status === 404) return false;
    if (!response.ok) {
      const detail = await readErrorDetail(response, `Failed to delete analysis (HTTP ${response.status})`);
      throw new Error(detail);
    }
    return true;
  },

  // Async batch analysis: submits files to Django, returns batch_id immediately.
  // Backend processes files in background via Celery and sends results over WebSocket.
  // Falls back to synchronous /rag/analyze if endpoint is unavailable.
  submitBatchAnalysis: async (files: File[], scanFolder?: string, scanType: string = 'folder'): Promise<{ batch_id: string }> => {
    const token = await getAccessToken();
    const formData = new FormData();
    const paths: string[] = [];
    for (const file of files) {
      const relPath = file.webkitRelativePath || file.name;
      paths.push(relPath);
      formData.append('paths', relPath);
      formData.append('files', file);
    }
    if (scanFolder) formData.append('scan_folder', scanFolder);
    formData.append('scan_type', scanType);
    const response = await fetch(`/api/analysis/batch/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!response.ok) {
      const detail = await readErrorDetail(response, `Batch submission failed (HTTP ${response.status})`);
      throw new Error(detail);
    }
    return response.json();
  },

  // Poll batch analysis results (replaces WebSocket for Redis 3.0 compatibility)
  pollBatchResults: async (batchId: string): Promise<{
    total: number;
    done: number;
    files: Array<{
      status: string;
      filename: string;
      document_id?: string;
      analysis?: any;
      source_content?: string;
      error?: string;
    }>;
    is_complete: boolean;
  }> => {
    const token = await getAccessToken();
    const response = await fetch(`/api/analysis/batch/${batchId}/results/`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      const detail = await readErrorDetail(response, `Poll failed (HTTP ${response.status})`);
      throw new Error(detail);
    }
    return response.json();
  },

  // RAG: Chat with streaming response (original)
  ragChat: async function* (
    document_id: string,
    question: string,
    history: { role: string; content: string }[] = []
  ): AsyncGenerator<string> {
    const token = await getAccessToken();
    const response = await fetch(`${RAG_BASE}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ document_id, question, history }),
    });
    if (response.status === 401) {
      throw new Error('Your session is invalid or expired. Please sign in again and complete MFA before chatting.');
    }
    if (response.status === 403) {
      throw new Error('MFA verification is required before using RAG chat.');
    }
    if (!response.ok) {
      const detail = await readErrorDetail(response, `RAG chat failed (HTTP ${response.status})`);
      console.error('RAG chat failed:', { status: response.status, detail });
      throw new Error(detail);
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (trimmed.startsWith('data: ')) {
          try {
            const parsed = JSON.parse(trimmed.slice(6));
            if (parsed.delta) yield parsed.delta;
          } catch {
            // skip malformed
          }
        }
      }
    }
  },

  // Git: clone a repo and return file manifest (synchronous)
  gitClone: async (repoUrl: string, branch: string, token?: string): Promise<GitManifest> => {
    const token_ = await getAccessToken();
    const response = await fetch(`/api/git/clone/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token_}`,
      },
      body: JSON.stringify({ repo_url: repoUrl, branch, token }),
    });
    if (!response.ok) {
      const detail = await readErrorDetail(response, `Git clone failed (HTTP ${response.status})`);
      throw new Error(detail);
    }
    return response.json();
  },

  // Git: submit clone as async Celery task, returns task_id immediately.
  // Frontend can poll /api/git/clone/{task_id}/status/ or receive WebSocket update.
  submitGitClone: async (repoUrl: string, branch: string): Promise<{ task_id: string }> => {
    const token_ = await getAccessToken();
    const response = await fetch(`/api/git/clone/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token_}`,
      },
      body: JSON.stringify({ repo_url: repoUrl, branch }),
    });
    if (!response.ok) {
      const detail = await readErrorDetail(response, `Git clone submission failed (HTTP ${response.status})`);
      throw new Error(detail);
    }
    return response.json();
  },

  // Git: poll Celery task status for async clone
  getGitCloneStatus: async (taskId: string): Promise<{
    status: 'pending' | 'processing' | 'completed' | 'failed';
    result?: GitManifest;
    error?: string;
  }> => {
    const token_ = await getAccessToken();
    const response = await fetch(`/api/git/clone/${taskId}/status/`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token_}` },
    });
    if (!response.ok) {
      const detail = await readErrorDetail(response, `Git clone status failed (HTTP ${response.status})`);
      throw new Error(detail);
    }
    return response.json();
  },

  // Git: fetch file contents for a subset of paths
  gitFetchFiles: async (sessionId: string, paths: string[]): Promise<GitFileContents> => {
    const token_ = await getAccessToken();
    const response = await fetch(`/api/git/files/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token_}`,
      },
      body: JSON.stringify({ session_id: sessionId, paths }),
    });
    if (!response.ok) {
      const detail = await readErrorDetail(response, `Git file fetch failed (HTTP ${response.status})`);
      throw new Error(detail);
    }
    return response.json();
  },

};
