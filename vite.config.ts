import { resolve } from 'path';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        survey: resolve(__dirname, 'survey.html'),
        admin: resolve(__dirname, 'admin.html'),
      },
    },
  },
  server: {
    port: 5173,
    open: false,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '^/s/': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
