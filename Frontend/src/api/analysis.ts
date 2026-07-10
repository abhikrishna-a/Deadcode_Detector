import { logger } from '../lib/logger';
import { apiClient } from './client';
import type {
  GitManifest,
  GitFileContents,
} from './types';

const RAG_BASE = import.meta.env.VITE_RAG_API_URL || '/api/rag';

const API_BASE = import.meta.env.VITE_API_URL || '';

async function readErrorDetail(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    return body.detail || body.error || body.message || JSON.stringify(body).slice(0, 200) || fallback;
  } catch {
    return fallback;
  }
}

export const analysisAPI = {
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
    const formData = new FormData();
    formData.append('file', file);
    formData.append('scan_type', scanType);
    if (scanFolder) formData.append('scan_folder', scanFolder);
    const response = await fetch(`${RAG_BASE}/analyze`, {
      method: 'POST',
      credentials: 'include',
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
      logger.error('Analysis failed:', { status: response.status, detail });
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

  ragGetAnalysis: async (analysisId: string): Promise<{
    analysis_id: string;
    filename: string;
    language: string;
    analysis: any;
    scan_id?: string;
    cached: boolean;
    _source_content?: string;
  }> => {
    const response = await fetch(`${RAG_BASE}/analysis/${analysisId}`, {
      method: 'GET',
      credentials: 'include',
    });
    if (!response.ok) {
      const detail = await readErrorDetail(response, `Failed to fetch analysis (HTTP ${response.status})`);
      throw new Error(detail);
    }
    const json = await response.json();
    return { ...json, _source_content: json._source_content || json.source_content || '' };
  },

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
    const response = await fetch(`${RAG_BASE}/analyses/by-folder/${encodeURIComponent(scanFolder)}`, {
      method: 'GET',
      credentials: 'include',
    });
    if (!response.ok) {
      const detail = await readErrorDetail(response, `Failed to fetch folder analyses (HTTP ${response.status})`);
      throw new Error(detail);
    }
    return response.json();
  },

  analysisHistory: async (limit: number = 50, offset: number = 0, search: string = ''): Promise<{
    items: Array<{
      analysis_id: string;
      filename: string;
      language: string;
      health_score: number;
      total_issues: number;
      created_at: string;
      scan_folder?: string;
      scan_type?: string;
      source_content?: string;
      analysis_data?: any;
    }>;
    total: number;
  }> => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (search) params.set('search', search);
    const response = await fetch(`${API_BASE}/api/auth/analysis-history/?${params}`, {
      method: 'GET',
      credentials: 'include',
    });
    if (!response.ok) throw new Error('Failed to fetch analysis history');
    return response.json();
  },

  analysisByFolder: async (scanFolder: string): Promise<{
    scan_folder: string;
    items: Array<{
      analysis_id: string;
      filename: string;
      language: string;
      analysis: any;
      health_score: number;
      total_issues: number;
      created_at: string;
      source_content?: string;
    }>;
    count: number;
  }> => {
    const response = await fetch(
      `${API_BASE}/api/auth/analysis-by-folder/${encodeURIComponent(scanFolder)}/`,
      { method: 'GET', credentials: 'include' }
    );
    if (!response.ok) throw new Error('Failed to fetch folder analyses');
    return response.json();
  },

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
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (search) params.set('search', search);
    const response = await fetch(`${RAG_BASE}/history?${params}`, {
      method: 'GET',
      credentials: 'include',
    });
    if (!response.ok) {
      const detail = await readErrorDetail(response, `Failed to fetch history (HTTP ${response.status})`);
      throw new Error(detail);
    }
    return response.json();
  },

  ragDeleteAnalysis: async (analysisId: string): Promise<boolean> => {
    const response = await fetch(`${RAG_BASE}/analysis/${analysisId}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (response.status === 404) return false;
    if (!response.ok) {
      const detail = await readErrorDetail(response, `Failed to delete analysis (HTTP ${response.status})`);
      throw new Error(detail);
    }
    return true;
  },

  submitBatchAnalysis: async (files: File[], scanFolder?: string, scanType: string = 'folder'): Promise<{ batch_id: string }> => {
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
    const response = await fetch(`${API_BASE}/api/analysis/batch/`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    if (!response.ok) {
      const detail = await readErrorDetail(response, `Batch submission failed (HTTP ${response.status})`);
      throw new Error(detail);
    }
    return response.json();
  },

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
    const response = await fetch(`${API_BASE}/api/analysis/batch/${batchId}/results/`, {
      credentials: 'include',
    });
    if (!response.ok) {
      const detail = await readErrorDetail(response, `Poll failed (HTTP ${response.status})`);
      throw new Error(detail);
    }
    return response.json();
  },

  ragChat: async function* (
    document_id: string,
    question: string,
    history: { role: string; content: string }[] = []
  ): AsyncGenerator<string> {
    const response = await fetch(`${RAG_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
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
      logger.error('RAG chat failed:', { status: response.status, detail });
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

  ragFolderChat: async function* (
    scanFolder: string,
    question: string,
    history: { role: string; content: string }[] = []
  ): AsyncGenerator<string> {
    const response = await fetch(`${RAG_BASE}/chat-folder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ scan_folder: scanFolder, question, history, force_sync_llm: true }),
    });
    if (response.status === 401) {
      throw new Error('Your session is invalid or expired. Please sign in again and complete MFA before chatting.');
    }
    if (response.status === 403) {
      throw new Error('MFA verification is required before using RAG chat.');
    }
    if (!response.ok) {
      const detail = await readErrorDetail(response, `Folder chat failed (HTTP ${response.status})`);
      logger.error('Folder chat failed:', { status: response.status, detail });
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

  gitClone: async (repoUrl: string, branch: string, token?: string): Promise<GitManifest> => {
    const response = await fetch(`${API_BASE}/api/git/clone/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ repo_url: repoUrl, branch, token }),
    });
    if (!response.ok) {
      const detail = await readErrorDetail(response, `Git clone failed (HTTP ${response.status})`);
      throw new Error(detail);
    }
    return response.json();
  },

  submitGitClone: async (repoUrl: string, branch: string): Promise<{ task_id: string }> => {
    const response = await fetch(`${API_BASE}/api/git/clone/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ repo_url: repoUrl, branch }),
    });
    if (!response.ok) {
      const detail = await readErrorDetail(response, `Git clone submission failed (HTTP ${response.status})`);
      throw new Error(detail);
    }
    return response.json();
  },

  getGitCloneStatus: async (taskId: string): Promise<{
    status: 'pending' | 'processing' | 'completed' | 'failed';
    result?: GitManifest;
    error?: string;
  }> => {
    const response = await fetch(`${API_BASE}/api/git/clone/${taskId}/status/`, {
      method: 'GET',
      credentials: 'include',
    });
    if (!response.ok) {
      const detail = await readErrorDetail(response, `Git clone status failed (HTTP ${response.status})`);
      throw new Error(detail);
    }
    return response.json();
  },

  gitFetchFiles: async (sessionId: string, paths: string[]): Promise<GitFileContents> => {
    const response = await fetch(`${API_BASE}/api/git/files/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ session_id: sessionId, paths }),
    });
    if (!response.ok) {
      const detail = await readErrorDetail(response, `Git file fetch failed (HTTP ${response.status})`);
      throw new Error(detail);
    }
    return response.json();
  },

  createThread: async (analysisId: string, filename: string, issueId: string): Promise<any> => {
    const response = await fetch(`${API_BASE}/api/chat/threads/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ analysis_id: analysisId, filename, issue_id: issueId }),
    });
    return response.json();
  },

  listThreads: async (documentId?: string): Promise<any[]> => {
    const params = documentId ? `?document_id=${documentId}` : '';
    const response = await fetch(`${API_BASE}/api/chat/threads/${params}`, {
      credentials: 'include',
    });
    return response.json();
  },

  postMessage: async (threadId: string, content: string): Promise<any> => {
    const response = await fetch(`${API_BASE}/api/chat/threads/${threadId}/messages/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ content }),
    });
    return response.json();
  },

  resolveThread: async (threadId: string): Promise<any> => {
    const response = await fetch(`${API_BASE}/api/chat/threads/${threadId}/resolve/`, {
      method: 'PATCH',
      credentials: 'include',
    });
    return response.json();
  },

  listChatRooms: async (): Promise<{ rooms: any[] }> => {
    const r = await fetch(API_BASE + '/api/chat/rooms/', { credentials: 'include' });
    return r.json();
  },

  createChatRoom: async (name: string, scanFolder?: string): Promise<any> => {
    const r = await fetch(API_BASE + '/api/chat/rooms/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name, scan_folder: scanFolder }),
    });
    return r.json();
  },

  getRoomMessages: async (roomName: string, before?: string, limit: number = 50): Promise<{ messages: any[] }> => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (before) params.set('before', before);
    const r = await fetch(`${API_BASE}/api/chat/rooms/${encodeURIComponent(roomName)}/messages/?${params}`, {
      credentials: 'include',
    });
    return r.json();
  },

  sendRoomMessage: async (roomName: string, content: string): Promise<any> => {
    const r = await fetch(`${API_BASE}/api/chat/rooms/${encodeURIComponent(roomName)}/messages/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ content }),
    });
    return r.json();
  },

  juniorUpload: async (files: File[], scanFolder?: string): Promise<any> => {
    const formData = new FormData();
    for (const f of files) {
      const relPath = f.webkitRelativePath || f.name;
      formData.append('paths', relPath);
      formData.append('files', f);
    }
    if (scanFolder) formData.append('scan_folder', scanFolder);
    const response = await fetch(`${API_BASE}/api/auth/junior/batch-upload/`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    if (!response.ok) throw new Error(`Upload failed (HTTP ${response.status})`);
    return response.json();
  },

  listSubmissions: async (): Promise<any[]> => {
    const response = await fetch(`${API_BASE}/api/auth/junior/list/`, {
      credentials: 'include',
    });
    return response.json();
  },

  getSubmissionDetail: async (submissionId: number): Promise<any> => {
    const response = await fetch(`${API_BASE}/api/auth/junior/detail/${submissionId}/`, {
      credentials: 'include',
    });
    return response.json();
  },

  triggerSubmissionAnalysis: async (submissionId: number): Promise<any> => {
    const response = await fetch(`${API_BASE}/api/auth/junior/analyze/${submissionId}/`, {
      method: 'POST',
      credentials: 'include',
    });
    return response.json();
  },

  juniorGitImport: async (repoUrl: string, branch: string, paths: string[]): Promise<any> => {
    const response = await fetch(`${API_BASE}/api/auth/junior/git-import/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ repo_url: repoUrl, branch, paths }),
    });
    return response.json();
  },

  clearAllHistory: async (): Promise<void> => {
    await fetch(`${API_BASE}/api/rag/history`, {
      method: 'DELETE',
      credentials: 'include',
    });
  },

  clearJuniorSubmissions: async (): Promise<void> => {
    await fetch(`${API_BASE}/api/auth/junior/clear/`, {
      method: 'DELETE',
      credentials: 'include',
    });
  },

  seniorListSubmissions: async (status?: string): Promise<any[]> => {
    const params = status ? `?status=${status}` : '';
    const response = await fetch(`${API_BASE}/api/auth/senior/submissions/${params}`, {
      credentials: 'include',
    });
    if (!response.ok) throw new Error('Failed to fetch submissions');
    return response.json();
  },

  juniorScheduleFolder: async (scanFolder: string, scheduledAt: string, timeoutSeconds?: number): Promise<any> => {
    const body: any = { scan_folder: scanFolder, scheduled_at: scheduledAt };
    if (timeoutSeconds) body.timeout_seconds = timeoutSeconds;
    const response = await fetch(`${API_BASE}/api/auth/junior/schedule-folder/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error('Failed to schedule folder');
    return response.json();
  },

  seniorTriggerAnalysis: async (submissionId: number, scheduledAt?: string, timeoutSeconds?: number): Promise<any> => {
    const body: any = {};
    if (scheduledAt) body.scheduled_at = scheduledAt;
    if (timeoutSeconds) body.timeout_seconds = timeoutSeconds;
    const response = await fetch(`${API_BASE}/api/auth/junior/analyze/${submissionId}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error('Failed to trigger analysis');
    return response.json();
  },

  seniorAddFeedback: async (submissionId: number, lineStart: number, comment: string, lineEnd?: number): Promise<any> => {
    const body: any = { line_start: lineStart, comment };
    if (lineEnd !== undefined) body.line_end = lineEnd;
    const response = await fetch(`${API_BASE}/api/auth/senior/feedback/${submissionId}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error('Failed to add feedback');
    return response.json();
  },

  juniorListFeedback: async (): Promise<any[]> => {
    const response = await fetch(`${API_BASE}/api/auth/junior/feedback/`, {
      credentials: 'include',
    });
    if (!response.ok) throw new Error('Failed to fetch feedback');
    return response.json();
  },

  listSubmissionFeedback: async (submissionId: number): Promise<any[]> => {
    const response = await fetch(`${API_BASE}/api/auth/junior/feedback/${submissionId}/`, {
      credentials: 'include',
    });
    if (!response.ok) throw new Error('Failed to fetch submission feedback');
    return response.json();
  },

  lookupSubmissionByAnalysis: async (analysisId: string): Promise<{ submission_id: number; filename: string }> => {
    const response = await fetch(`${API_BASE}/api/auth/submission-by-analysis/${analysisId}/`, {
      credentials: 'include',
    });
    if (!response.ok) throw new Error('Submission not found for this analysis');
    return response.json();
  },

  resolveFeedback: async (feedbackId: number): Promise<any> => {
    const response = await fetch(`${API_BASE}/api/auth/feedback/${feedbackId}/resolve/`, {
      method: 'PATCH',
      credentials: 'include',
    });
    if (!response.ok) throw new Error('Failed to resolve feedback');
    return response.json();
  },

  getGlobalSchedule: async (): Promise<{
    scheduled_at: string | null;
    triggered: boolean;
    updated_at: string | null;
    pending_count: number;
  }> => {
    const response = await fetch(API_BASE + '/api/auth/scheduler/config/', {
      credentials: 'include',
    });
    if (!response.ok) throw new Error('Failed to fetch schedule config');
    return response.json();
  },

  setGlobalSchedule: async (scheduledAt: string): Promise<any> => {
    const response = await fetch(API_BASE + '/api/auth/scheduler/config/', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ scheduled_at: scheduledAt }),
    });
    if (!response.ok) throw new Error('Failed to set global schedule');
    return response.json();
  },

  cancelGlobalSchedule: async (): Promise<any> => {
    const response = await fetch(API_BASE + '/api/auth/scheduler/config/', {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!response.ok) throw new Error('Failed to cancel global schedule');
    return response.json();
  },

  triggerGlobalSchedule: async (): Promise<{ message: string; processed: number }> => {
    const response = await fetch(API_BASE + '/api/auth/scheduler/trigger/', {
      method: 'POST',
      credentials: 'include',
    });
    if (!response.ok) throw new Error('Failed to trigger scheduler');
    return response.json();
  },
};
