import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 开发服务器：端口 5173；/api 代理到 FastAPI 后端 8000。
// node-defs.json 位于项目根（单一事实来源），通过 alias 映射进前端，
// fs.allow 放开到项目根以允许读取该文件。
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@node-defs': fileURLToPath(new URL('../node-defs.json', import.meta.url)),
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
    },
  },
});
