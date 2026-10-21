import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
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
