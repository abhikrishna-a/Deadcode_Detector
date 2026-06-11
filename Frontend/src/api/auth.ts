import { apiClient } from './client';
import type {
  RegisterRequest,
  RegisterResponse,
  LoginRequest,
  LoginResponse,
  RefreshTokenRequest,
  RefreshTokenResponse,
  MFAVerifyLoginRequest,
  MFAVerifyLoginResponse,
  MFASetupResponse,
  MFAActivateRequest,
  MFAActivateResponse,
  User,
} from './types';

interface SessionCheckResponse {
  isAuthenticated: boolean;
  user?: User;
  access?: string;
}

export const authAPI = {
  register: async (data: RegisterRequest): Promise<RegisterResponse> => {
    const response = await apiClient.post('/api/auth/register/', data);
    return response.data;
  },

  login: async (data: LoginRequest): Promise<LoginResponse> => {
    const response = await apiClient.post('/api/auth/token/', data);
    return response.data;
  },

  refreshToken: async (data: RefreshTokenRequest): Promise<RefreshTokenResponse> => {
    const response = await apiClient.post('/api/auth/token/refresh/', data);
    return response.data;
  },

  verifyMFALogin: async (
    data: MFAVerifyLoginRequest,
    preAuthToken: string
  ): Promise<MFAVerifyLoginResponse> => {
    const response = await apiClient.post(
      '/api/auth/mfa/verify-login/',
      data,
      { headers: { Authorization: `Bearer ${preAuthToken}` } }
    );
    return response.data;
  },

  setupMFA: async (): Promise<MFASetupResponse> => {
    const response = await apiClient.post('/api/auth/mfa/setup/');
    return response.data;
  },

  activateMFA: async (data: MFAActivateRequest): Promise<MFAActivateResponse> => {
    const response = await apiClient.post('/api/auth/mfa/activate/', data);
    return response.data;
  },

  getCurrentUser: async (): Promise<User> => {
    const response = await apiClient.get('/api/auth/user/');
    return response.data;
  },

  getAdminUsers: async (): Promise<User[]> => {
    const response = await apiClient.get('/api/auth/admin/users/');
    return response.data;
  },

  updateUserRole: async (userId: number, role: 'admin' | 'viewer'): Promise<User> => {
    const response = await apiClient.patch(`/api/auth/admin/users/${userId}/role/`, { role });
    return response.data;
  },

  requestPasswordReset: async (email: string): Promise<{ message: string }> => {
    const response = await apiClient.post('/api/auth/password-reset/', { email });
    return response.data;
  },

  confirmPasswordReset: async (token: string, new_password: string): Promise<{ message: string }> => {
    const response = await apiClient.post('/api/auth/password-reset/confirm/', { token, new_password });
    return response.data;
  },

  checkSession: async (): Promise<SessionCheckResponse> => {
    const response = await apiClient.get('/api/auth/session/');
    return response.data;
  },

  logout: async (): Promise<void> => {
    await apiClient.post('/api/auth/logout/');
  },
};
