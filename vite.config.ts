import { resolve } from 'path';
import fs from 'fs';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// 动态读取后端服务实际启动的端口（实现后端自动更换端口时无缝转发，彻底解决端口冲突）
function getBackendTarget(): string {
  try {
    const portFilePath = resolve(__dirname, 'data/server-port.json');
    if (fs.existsSync(portFilePath)) {
      const raw = fs.readFileSync(portFilePath, 'utf-8');
      const data = JSON.parse(raw);
      if (typeof data.port === 'number' && data.port > 0) {
        return `http://127.0.0.1:${data.port}`;
      }
    }
  } catch {
    // 容错读取
  }
  const defaultPort = Number(process.env.PORT) || 3001;
  return `http://127.0.0.1:${defaultPort}`;
}

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
        target: 'http://127.0.0.1:3001',
        router: () => getBackendTarget(),
        changeOrigin: true,
        timeout: 120000,
        proxyTimeout: 120000,
        configure: (proxy) => {
          proxy.on('error', (err, _req, res) => {
            const currentTarget = getBackendTarget();
            console.warn(`[Vite Proxy] 代理转发失败 (${currentTarget}):`, err.message);
            if (res && 'writeHead' in res && !(res as any).headersSent) {
              (res as any).writeHead(502, { 'Content-Type': 'application/json' });
              (res as any).end(
                JSON.stringify({
                  error: `后端服务连接失败 (目标: ${currentTarget})，请确认已启动 npm run server`,
                })
              );
            }
          });
        },
      },
      '^/s/': {
        target: 'http://127.0.0.1:3001',
        router: () => getBackendTarget(),
        changeOrigin: true,
      },
    },
  },
});

