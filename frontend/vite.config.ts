import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 开发服务器：端口 5173；/api 代理到 FastAPI 后端 8000。
// manifests/ 目录位于项目根，通过 alias 映射进前端。
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@node-defs': fileURLToPath(new URL('../node-defs.json', import.meta.url)),
      '@manifests': fileURLToPath(new URL('../manifests', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    fs: { allow: ['..'] },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/assets': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
});