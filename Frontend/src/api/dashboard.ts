import { apiClient } from './client';
import type { DashboardStats } from './types';

// Dashboard endpoints
export const dashboardAPI = {
  getStats: async (): Promise<DashboardStats> => {
    const response = await apiClient.get('/api/dashboard/stats/');
    return response.data;
  },

  getBreakdown: async (): Promise<{
    unused_functions: number;
    dead_imports: number;
    unreachable_classes: number;
    stale_variables: number;
  }> => {
    const response = await apiClient.get('/api/dashboard/breakdown/');
    return response.data;
  },

  getRecentAnalyses: async (limit: number = 10): Promise<any[]> => {
    const response = await apiClient.get('/api/dashboard/recent/', {
      params: { limit }
    });
    return response.data;
  }
};