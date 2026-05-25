// Auth types
export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  role?: 'admin' | 'viewer';
}

export interface RegisterResponse {
  id: number;
  username: string;
  email: string;
  role: string;
  is_mfa_enabled: boolean;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  mfa_required: true;
  refresh: string;
  pre_auth_token: string;
  is_mfa_enabled: boolean;
  user: {
    id: number;
    username: string;
    email: string;
    role: string;
    is_mfa_enabled: boolean;
  };
}

export interface RefreshTokenRequest {
  refresh: string;
}

export interface RefreshTokenResponse {
  access: string;
}

export interface MFAVerifyLoginRequest {
  token: string;
}

export interface MFAVerifyLoginResponse {
  refresh: string;
  access: string;
  user: {
    id: number;
    username: string;
    email: string;
    role: string;
    is_mfa_enabled: true;
  };
}

export interface MFASetupResponse {
  qr_code_uri: string;
  qr_code_image: string;
}

export interface MFAActivateRequest {
  token: string;
}

export interface MFAActivateResponse {
  message: string;
  refresh: string;
  access: string;
  user: {
    id: number;
    username: string;
    email: string;
    role: string;
    is_mfa_enabled: true;
  };
}

export interface User {
  id: number;
  username: string;
  email: string;
  role: string;
  is_mfa_enabled: boolean;
}

// Scanner types (placeholders - will be implemented when backend scanner is built)
export interface AnalysisRequest {
  // These will be defined when scanner endpoints are built
  files: File[];
  config: {
    detect_unused_functions: boolean;
    detect_unused_imports: boolean;
    detect_unreachable_classes: boolean;
    detect_dead_variables: boolean;
    include_test_files: boolean;
    strict_mode: boolean;
    min_confidence: number;
  };
}

export interface AnalysisResponse {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  created_at: string;
  // Will add more fields when scanner is implemented
}

export interface AnalysisStatusResponse {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number; // 0-100
  current_file?: string;
  logs?: string[];
}

export interface AnalysisResult {
  id: string;
  filename: string;
  issues: Issue[];
  summary: {
    total_issues: number;
    unused_functions: number;
    dead_imports: number;
    unreachable_classes: number;
    stale_variables: number;
  };
}

export interface Issue {
  type: 'unused_function' | 'dead_import' | 'unreachable_class' | 'stale_variable' | 'unreachable_block';
  name: string;
  file: string;
  line: number;
  column?: number;
  description: string;
  confidence: number; // 0-100
  references: Reference[];
}

export interface Reference {
  file: string;
  line: number;
  column?: number;
}

export interface DashboardStats {
  total_analyses: number;
  dead_code_found: number;
  files_scanned: number;
  lines_saved: number;
  // trend data
  weekly_change?: {
    analyses: number;
    dead_code: number;
    files: number;
    lines: number;
  };
}

// File tree types
export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
  issue_count: number;
  has_dead_code: boolean;
  is_clean: boolean;
  has_warnings: boolean;
}