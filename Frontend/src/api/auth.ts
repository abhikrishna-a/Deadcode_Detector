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
  User
} from './types';

// Auth endpoints
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
      {
        headers: { Authorization: `Bearer ${preAuthToken}` }
      }
    );
    return response.data;
  },

  setupMFA: async (): Promise<MFASetupResponse> => {
    const response = await apiClient.post('/api/auth/mfa/setup/');
    return response.data;
  },

  activateMFA: async (
    data: MFAActivateRequest
  ): Promise<MFAActivateResponse> => {
    const response = await apiClient.post('/api/auth/mfa/activate/', data);
    return response.data;
  },

  // Get current user info (using the user endpoint from auth)
  getCurrentUser: async (): Promise<User> => {
    const response = await apiClient.get('/api/auth/user/'); // Assuming this exists
    return response.data;
  }
};

// Note: The backend doesn't seem to have a /user/ endpoint, but we can extract user from login response
// For now, we'll store user in auth store from login responses