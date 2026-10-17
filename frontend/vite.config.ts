import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // The Retell web call SDK is a lazy chunk of about 550 kB, loaded only when a live call starts.
  build: { chunkSizeWarningLimit: 600 },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
})
