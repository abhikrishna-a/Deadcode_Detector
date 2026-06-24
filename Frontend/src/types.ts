export interface User {
  id: number;
  username: string;
  email: string;
  role: 'senior' | 'junior';
  is_mfa_enabled: boolean;
}

export interface CodeReviewFeedback {
  id: number;
  submission_id: number;
  filename: string;
  file_content: string;
  reviewer: number;
  reviewer_username: string;
  line_start: number;
  line_end: number | null;
  comment: string;
  created_at: string;
  resolved: boolean;
}

export interface JuniorSubmission {
  id: number;
  user: number;
  username?: string;
  filename: string;
  file_content: string;
  scan_folder: string;
  status: 'pending_review' | 'analysing' | 'done' | 'failed';
  result: any;
  error?: string;
  scheduled_at: string | null;
  timeout_seconds: number;
  created_at: string;
}

export interface Issue {
  id: string;
  type: string; // e.g., 'unused_import', 'unused_function', 'dead_branch', 'unused_variable', 'unreachable_code'
  name: string | null;
  file: string;
  line: number;
  line_start?: number;
  line_end?: number;
  description: string;
  code_snippet: string;
  suggestion: string;
  severity: string;
  confidence: number; // 0-100 or 0.0-1.0
  safe_to_remove?: boolean;
}

export interface FileMetrics {
  total_lines: number;
  code_lines?: number;
  comment_lines?: number;
  blank_lines?: number;
  dead_lines_estimate: number;
  dead_code_percentage: number;
  complexity_hint?: 'low' | 'medium' | 'high';
}

export interface AnalysisSummary {
  total_issues: number;
  severity_counts: Record<'high' | 'medium' | 'low', number>;
  categories: Record<string, number>;
  overall_health: 'clean' | 'good' | 'needs_attention' | 'poor' | 'unknown';
  health_score: number;
}

export interface AnalysisResult {
  document_id: string;
  filename: string;
  summary: AnalysisSummary;
  issues: Issue[];
  metrics: FileMetrics;
  refactor_hints?: string[];
  _source_content?: string;
  llm_refining?: boolean;
  cached?: boolean;
  scan_folder?: string;
  scan_type?: 'single' | 'folder' | 'repo';
  scan_id?: string;
  error?: string;
}

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
  issue_count: number;
  health_score: number;
  has_dead_code: boolean;
  is_clean: boolean;
  analysis_id?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface DocItemProps {
  id: string;
  filename: string;
  language: string;
  created_at: string;
  chunk_count: number;
}

export interface IssueThread {
  id: number;
  document_id: string;
  title: string;
  created_at: string;
  resolved: boolean;
  messages: ThreadMessage[];
}

export interface ThreadMessage {
  id: number;
  thread_id: number;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}
