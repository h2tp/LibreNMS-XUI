import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
export default defineConfig({
  plugins: [vue()],
  build: { chunkSizeWarningLimit: 2000 },
  server: { proxy: { '/xui': 'http://localhost:8095' } },
})
