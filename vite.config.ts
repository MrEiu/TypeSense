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
  const defaultPort = Number(process.env.PORT) || 3125;
  return `http://127.0.0.1:${defaultPort}`;
}

function cleanUrlsPlugin() {
  return {
    name: 'typesense-clean-urls',
    configureServer(server: any) {
      server.printUrls = () => {
        const port = server.config?.server?.port || 5173;
        console.info(`  \x1b[32m➜\x1b[0m  \x1b[1mLocal\x1b[0m:   \x1b[36mhttp://localhost:${port}/\x1b[0m`);
        console.info(`  \x1b[32m➜\x1b[0m  \x1b[1mNetwork\x1b[0m: \x1b[36mhttp://0.0.0.0:${port}/\x1b[0m`);
      };
    },
  };
}

export default defineConfig({
  plugins: [vue(), cleanUrlsPlugin()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        survey: resolve(__dirname, 'survey.html'),
        studio: resolve(__dirname, 'studio.html'),
        admin: resolve(__dirname, 'admin.html'),
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    open: false,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3125',
        router: () => getBackendTarget(),
        changeOrigin: true,
        timeout: 600000,
        proxyTimeout: 600000,
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
        target: 'http://127.0.0.1:3125',
        router: () => getBackendTarget(),
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
});

