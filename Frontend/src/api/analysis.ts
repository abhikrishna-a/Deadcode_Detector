import { apiClient } from './client';
import type {
  AnalysisRequest,
  AnalysisResponse,
  AnalysisStatusResponse,
  AnalysisResult,
  FileNode
} from './types';

// Analysis endpoints (these will need to be implemented in the backend scanner app)
export const analysisAPI = {
  // Upload files and start analysis
  startAnalysis: async (formData: FormData): Promise<AnalysisResponse> => {
    const response = await apiClient.post('/api/analysis/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
  },

  // Get analysis status (for polling)
  getAnalysisStatus: async (analysisId: string): Promise<AnalysisStatusResponse> => {
    const response = await apiClient.get(`/api/analysis/${analysisId}/status/`);
    return response.data;
  },

  // Get analysis results
  getAnalysisResults: async (analysisId: string): Promise<AnalysisResult> => {
    const response = await apiClient.get(`/api/analysis/${analysisId}/results/`);
    return response.data;
  },

  // Get file tree for analysis
  getFileTree: async (analysisId: string): Promise<FileNode[]> => {
    const response = await apiClient.get(`/api/analysis/${analysisId}/files/`);
    return response.data;
  },

  // Get file content
  getFileContent: async (analysisId: string, filePath: string): Promise<string> => {
    const response = await apiClient.get(`/api/analysis/${analysisId}/files/content/`, {
      params: { path: filePath }
    });
    return response.data;
  },

  // List analysis history
  getAnalysisHistory: async (limit: number = 10): Promise<AnalysisResponse[]> => {
    const response = await apiClient.get(`/api/analysis/`, {
      params: { limit }
    });
    return response.data;
  },

  // Delete analysis
  deleteAnalysis: async (analysisId: string): Promise<void> => {
    await apiClient.delete(`/api/analysis/${analysisId}/`);
  }
};