import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/analyzer': {
        target: 'http://localhost:8004',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/analyzer/, '/analyzer'),
      },
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/rag': {
        target: 'http://localhost:8004',
        changeOrigin: true,
      },
    },
  },
})
