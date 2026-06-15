// Auth types
export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
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

// Git / batch types
export interface GitFileEntry {
  path: string;
  size_bytes: number;
  language: string;
}

export interface GitManifest {
  session_id: string;
  repo_name: string;
  branch: string;
  total_files: number;
  total_bytes: number;
  files: GitFileEntry[];
}

export interface GitFileContents {
  files: Array<{ path: string; content: string; size_bytes: number }>;
}