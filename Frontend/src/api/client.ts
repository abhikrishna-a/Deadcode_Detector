import axios from 'axios';

export function getAccessToken(): string {
  return document.cookie
    .split('; ')
    .find(r => r.startsWith('ghostcode_access='))
    ?.split('=')[1] || '';
}

const BASE_URL = import.meta.env.VITE_API_URL || '';

export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

apiClient.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
