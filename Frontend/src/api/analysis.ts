import { apiClient } from './client';
import type {
  AnalysisRequest,
  AnalysisResponse,
  AnalysisStatusResponse,
  AnalysisResult,
  FileNode,
  GitManifest,
  GitFileContents,
} from './types';

const RAG_BASE = import.meta.env.VITE_RAG_API_URL || '/rag';

async function getAuthToken(): Promise<string> {
  const raw = localStorage.getItem('auth-storage');
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw);
    return parsed?.state?.token || '';
  } catch {
    return '';
  }
}

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
  startAnalysis: async (formData: FormData): Promise<AnalysisResponse> => {
    const response = await apiClient.post('/api/analysis/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
  },

  getAnalysisStatus: async (analysisId: string): Promise<AnalysisStatusResponse> => {
    const response = await apiClient.get(`/api/analysis/${analysisId}/status/`);
    return response.data;
  },

  getAnalysisResults: async (analysisId: string): Promise<AnalysisResult> => {
    const response = await apiClient.get(`/api/analysis/${analysisId}/results/`);
    return response.data;
  },

  getFileTree: async (analysisId: string): Promise<FileNode[]> => {
    const response = await apiClient.get(`/api/analysis/${analysisId}/files/`);
    return response.data;
  },

  getFileContent: async (analysisId: string, filePath: string): Promise<string> => {
    const response = await apiClient.get(`/api/analysis/${analysisId}/files/content/`, {
      params: { path: filePath }
    });
    return response.data;
  },

  getAnalysisHistory: async (limit: number = 10): Promise<AnalysisResponse[]> => {
    const response = await apiClient.get(`/api/analysis/`, {
      params: { limit }
    });
    return response.data;
  },

  deleteAnalysis: async (analysisId: string): Promise<void> => {
    await apiClient.delete(`/api/analysis/${analysisId}/`);
  },

  // Unified analysis: sends file to RAG service which runs Groq analysis + stores in vector DB
  analyzeFile: async (file: File): Promise<{
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
  }> => {
    const token = await getAuthToken();
    const formData = new FormData();
    formData.append('file', file);
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
    };
  },

  // RAG: Upload file to vector store + auto-analyze with Grok
  ragAnalyze: async (file: File): Promise<{
    document_id: string;
    chunk_count: number;
    filename: string;
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
  }> => {
    const token = await getAuthToken();
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch(`${RAG_BASE}/analyze`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (response.status === 401) {
      throw new Error('Your session is invalid or expired. Please sign in again and complete MFA before analyzing files.');
    }
    if (response.status === 403) {
      throw new Error('MFA verification is required before using RAG analysis.');
    }
    if (!response.ok) {
      const detail = await readErrorDetail(response, `RAG analyze failed (HTTP ${response.status})`);
      console.error('RAG analyze failed:', { status: response.status, detail });
      throw new Error(detail);
    }
    return response.json();
  },

  // RAG: List stored documents
  ragListDocuments: async (): Promise<Array<{
    id: string;
    filename: string;
    language: string;
    created_at: string;
    chunk_count: number;
  }>> => {
    const token = await getAuthToken();
    const response = await fetch(`${RAG_BASE}/documents`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.status === 401) {
      throw new Error('Your session is invalid or expired. Please sign in again and complete MFA before analyzing files.');
    }
    if (response.status === 403) {
      throw new Error('MFA verification is required before using RAG.');
    }
    if (!response.ok) {
      const detail = await readErrorDetail(response, `Failed to list documents (HTTP ${response.status})`);
      throw new Error(detail);
    }
    return response.json();
  },

  // RAG: Paginated history
  ragHistory: async (limit: number = 20, offset: number = 0): Promise<{
    items: Array<{
      analysis_id: string;
      filename: string;
      language: string;
      health_score: number;
      total_issues: number;
      created_at: string;
    }>;
    total: number;
  }> => {
    const token = await getAuthToken();
    const response = await fetch(`${RAG_BASE}/history?limit=${limit}&offset=${offset}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      const detail = await readErrorDetail(response, `Failed to fetch history (HTTP ${response.status})`);
      throw new Error(detail);
    }
    return response.json();
  },

  // RAG: Get single analysis by ID
  ragGetAnalysis: async (analysisId: string): Promise<{
    analysis_id: string;
    filename: string;
    language: string;
    analysis: any;
    cached: boolean;
  }> => {
    const token = await getAuthToken();
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

  // RAG: Delete analysis
  ragDeleteAnalysis: async (analysisId: string): Promise<boolean> => {
    const token = await getAuthToken();
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

  // RAG: Chat with streaming response (original)
  ragChat: async function* (
    document_id: string,
    question: string,
    history: { role: string; content: string }[] = []
  ): AsyncGenerator<string> {
    const token = await getAuthToken();
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

  // Git: clone a repo and return file manifest
  gitClone: async (repoUrl: string, branch: string, token?: string): Promise<GitManifest> => {
    const token_ = await getAuthToken();
    const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/git/clone/`, {
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

  // Git: fetch file contents for a subset of paths
  gitFetchFiles: async (sessionId: string, paths: string[]): Promise<GitFileContents> => {
    const token_ = await getAuthToken();
    const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/git/files/`, {
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

  // RAG: Non-streaming JSON chat (cross-analysis search)
  ragChatJson: async (
    message: string,
    analysis_id?: string | null,
  ): Promise<{
    answer: string;
    sources: Array<{
      chunk_text: string;
      filename: string;
      analysis_id: string;
      score: number;
    }>;
  }> => {
    const token = await getAuthToken();
    const response = await fetch(`${RAG_BASE}/chat-json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ message, analysis_id }),
    });
    if (!response.ok) {
      const detail = await readErrorDetail(response, `RAG chat-json failed (HTTP ${response.status})`);
      throw new Error(detail);
    }
    return response.json();
  },
};
