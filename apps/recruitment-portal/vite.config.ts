import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    open: true,
    fs: {
      allow: [
        // Allow serving files from the project root and packages
        path.resolve(__dirname, '../..'),
      ],
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
