import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
 
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['lucide-react'],
    force: true,
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          // Split vendor libs into separate cached chunks
          'react-vendor':  ['react', 'react-dom', 'react-router-dom'],
          'ui-vendor':     ['lucide-react', 'react-hot-toast'],
          'chart-vendor':  ['recharts'],
          'util-vendor':   ['axios', 'zustand'],
        },
      },
    },
    // Minify aggressively
    minify: 'esbuild',
    target: 'es2015',
    // Generate source maps only in dev
    sourcemap: false,
  },
})