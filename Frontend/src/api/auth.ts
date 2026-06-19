import { apiClient } from './client';
import type {
  RegisterRequest,
  RegisterResponse,
  LoginRequest,
  LoginResponse,
  MFAVerifyLoginRequest,
  MFAVerifyLoginResponse,
  MFASetupResponse,
  MFAActivateRequest,
  MFAActivateResponse,
  User,
} from './types';

export const authAPI = {
  register: async (data: RegisterRequest): Promise<RegisterResponse> => {
    const response = await apiClient.post('/api/auth/register/', data);
    return response.data;
  },

  login: async (data: LoginRequest): Promise<LoginResponse> => {
    const response = await apiClient.post('/api/auth/token/', data);
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

  setupMFA: async (preAuthToken?: string): Promise<MFASetupResponse> => {
    const response = await apiClient.post('/api/auth/mfa/setup/', null, {
      headers: preAuthToken ? { Authorization: `Bearer ${preAuthToken}` } : undefined,
    });
    return response.data;
  },

  activateMFA: async (data: MFAActivateRequest, preAuthToken?: string): Promise<MFAActivateResponse> => {
    const response = await apiClient.post('/api/auth/mfa/activate/', data, {
      headers: preAuthToken ? { Authorization: `Bearer ${preAuthToken}` } : undefined,
    });
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
};
