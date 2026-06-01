import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/rag': {
        target: 'http://localhost:8004',
        changeOrigin: true,
      },
    },
  },
})
