/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_WS_URL?: string;
  readonly VITE_RAG_URL?: string;
  readonly VITE_RAG_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
