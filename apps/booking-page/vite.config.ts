import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  base: '/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3002,
    open: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    // P3.5: Bundle optimization
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false, // Temporarily keep console for debugging
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info']
      },
      mangle: {
        safari10: true
      }
    },
    rollupOptions: {
      output: {
        // Manual chunk splitting for optimal caching
        manualChunks: {
          // Firebase in separate chunk (larger, changes less often)
          firebase: ['firebase/app', 'firebase/firestore', 'firebase/functions'],
          // React in separate chunk
          react: ['react', 'react-dom']
        },
        // Optimize chunk names
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    },
    // Target modern browsers for smaller bundle
    target: 'es2020',
    // Report compressed size
    reportCompressedSize: true,
    // Chunk size warning threshold
    chunkSizeWarningLimit: 500
  },
  // Optimize deps
  optimizeDeps: {
    include: ['react', 'react-dom', 'firebase/app', 'firebase/firestore', 'firebase/functions']
  }
})
