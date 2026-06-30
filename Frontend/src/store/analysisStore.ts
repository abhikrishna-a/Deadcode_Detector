import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AnalysisResult } from '../types';

interface AnalysisState {
  history: AnalysisResult[];
  viewTarget: { analysisId: string; filename: string; scanFolder?: string } | null;
  chatTarget: { docId: string; filename: string } | null;
  batchReportsList: AnalysisResult[];
  selectedFile: AnalysisResult | null;
  selectedFolder: string | null;
  expandedFolders: Record<string, boolean>;
  currentFolderName: string;
  issueFilter: 'all' | 'high' | 'medium' | 'low';
  expandedIssueId: string | null;
  view: 'upload' | 'batch_progress' | 'workspace';
  historyMode: boolean;

  addHistoryReport: (report: AnalysisResult) => void;
  setHistory: (history: AnalysisResult[]) => void;
  setViewTarget: (target: { analysisId: string; filename: string; scanFolder?: string } | null) => void;
  setChatTarget: (target: { docId: string; filename: string } | null) => void;
  setBatchReportsList: (list: AnalysisResult[] | ((prev: AnalysisResult[]) => AnalysisResult[])) => void;
  setSelectedFile: (file: AnalysisResult | null) => void;
  setSelectedFolder: (folder: string | null) => void;
  setExpandedFolders: (folders: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => void;
  setCurrentFolderName: (name: string) => void;
  setIssueFilter: (filter: 'all' | 'high' | 'medium' | 'low') => void;
  setExpandedIssueId: (id: string | null | ((prev: string | null) => string | null)) => void;
  setView: (view: 'upload' | 'batch_progress' | 'workspace') => void;
  setHistoryMode: (mode: boolean) => void;
  toggleFolder: (path: string) => void;
  resetWorkspace: () => void;
  resetAll: () => void;
}

const storageKey = 'analysis-storage';

export const useAnalysisStore = create<AnalysisState>()(
  persist(
    (set, get) => ({
      history: [],
      viewTarget: null,
      chatTarget: null,
      batchReportsList: [],
      selectedFile: null,
      selectedFolder: null,
      expandedFolders: {},
      currentFolderName: '',
      issueFilter: 'all' as const,
      expandedIssueId: null,
      view: 'upload' as const,
      historyMode: false,

      addHistoryReport: (report) => set(state => {
        const idx = state.history.findIndex(r => r.document_id === report.document_id);
        if (idx >= 0) {
          const next = [...state.history];
          next[idx] = report;
          return { history: next };
        }
        return { history: [report, ...state.history] };
      }),

      setHistory: (history) => set({ history }),

      setViewTarget: (viewTarget) => set({ viewTarget }),

      setChatTarget: (chatTarget) => set({ chatTarget }),

      setBatchReportsList: (listOrFn) => set(state => ({
        batchReportsList: typeof listOrFn === 'function'
          ? (listOrFn as (prev: AnalysisResult[]) => AnalysisResult[])(state.batchReportsList)
          : listOrFn,
      })),

      setSelectedFile: (selectedFile) => set({ selectedFile }),

      setSelectedFolder: (selectedFolder) => set({ selectedFolder }),

      setExpandedFolders: (foldersOrFn) => set(state => ({
        expandedFolders: typeof foldersOrFn === 'function'
          ? (foldersOrFn as (prev: Record<string, boolean>) => Record<string, boolean>)(state.expandedFolders)
          : foldersOrFn,
      })),

      setCurrentFolderName: (currentFolderName) => set({ currentFolderName }),

      setIssueFilter: (issueFilter) => set({ issueFilter }),

      setExpandedIssueId: (expandedIssueId) => set({ expandedIssueId }),

      setView: (view) => set({ view }),

      setHistoryMode: (historyMode) => set({ historyMode }),

      toggleFolder: (path) => set(state => ({
        expandedFolders: {
          ...state.expandedFolders,
          [path]: state.expandedFolders[path] === undefined ? true : !state.expandedFolders[path],
        },
      })),

      resetWorkspace: () => set({
        batchReportsList: [],
        selectedFile: null,
        selectedFolder: null,
        expandedFolders: {},
        currentFolderName: '',
        issueFilter: 'all',
        expandedIssueId: null,
        view: 'upload',
        historyMode: false,
      }),

      resetAll: () => set({
        history: [],
        viewTarget: null,
        chatTarget: null,
        batchReportsList: [],
        selectedFile: null,
        selectedFolder: null,
        expandedFolders: {},
        currentFolderName: '',
        issueFilter: 'all',
        expandedIssueId: null,
        view: 'upload',
        historyMode: false,
      }),
    }),
    {
      name: storageKey,
      version: 2,
      migrate: () => ({
        history: [],
        viewTarget: null,
        chatTarget: null,
        batchReportsList: [],
        selectedFile: null,
        selectedFolder: null,
        expandedFolders: {},
        currentFolderName: '',
        issueFilter: 'all' as const,
        expandedIssueId: null,
        view: 'upload' as const,
        historyMode: false,
      }),
      partialize: (state) => ({
        history: state.history,
        currentFolderName: state.currentFolderName,
      }),
    }
  )
);
