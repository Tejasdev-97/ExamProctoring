import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: process.env.VITE_BASE_URL || (process.env.VITE_ELECTRON === 'true' || process.env.ELECTRON_BUILD === 'true' ? './' : '/'),
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  optimizeDeps: {
    // Exclude runtime-loaded libraries and heavy pre-bundled engines
    exclude: [
      'onnxruntime-web',
      '@tensorflow/tfjs-backend-webgl',
      '@tensorflow-models/coco-ssd',
      '@tensorflow/tfjs',
    ],
  },
})
