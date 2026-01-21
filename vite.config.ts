import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['sql.js/dist/sql-wasm.js']
  },
  build: {
    target: 'esnext'
  },
  base: "/LLMAnki/"
})
