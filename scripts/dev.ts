/**
 * scripts/dev.ts
 *
 * 一键前后端联启脚本 (npm run dev)
 * 同时启动后端 Express 服务 (3125) 与前端 Vite 开发服务器 (5173)，
 * 统一进程生命周期管理，支持 Ctrl+C 优雅退出与残留进程自动清理。
 */

import { spawn, ChildProcess } from 'node:child_process';
import process from 'node:process';

const isWindows = process.platform === 'win32';
const npxCmd = isWindows ? 'npx.cmd' : 'npx';

const children: ChildProcess[] = [];

function killChild(child: ChildProcess) {
  if (!child || !child.pid) return;
  try {
    if (isWindows) {
      spawn('taskkill', ['/F', '/T', '/PID', child.pid.toString()], { stdio: 'ignore' });
    } else {
      process.kill(-child.pid, 'SIGTERM');
    }
  } catch {}
}

function cleanupAndExit() {
  for (const child of children) {
    killChild(child);
  }
  process.exit(0);
}

process.on('SIGINT', cleanupAndExit);
process.on('SIGTERM', cleanupAndExit);
process.on('exit', () => {
  for (const child of children) {
    killChild(child);
  }
});

console.info('\x1b[36m%s\x1b[0m', '================================================');
console.info('\x1b[36m%s\x1b[0m', '  🚀 TypeSense 全栈开发环境一键启动中...');
console.info('\x1b[36m%s\x1b[0m', '  - 后端 API 服务: tsx watch server/server.ts (Port: 3125)');
console.info('\x1b[36m%s\x1b[0m', '  - 前端开发页面: vite (Port: 5173)');
console.info('\x1b[36m%s\x1b[0m', '================================================\n');

// 1. 启动后端
const backend = spawn(npxCmd, ['tsx', 'watch', 'server/server.ts'], {
  stdio: 'inherit',
  shell: true,
  env: process.env,
});
children.push(backend);

// 2. 启动前端 Vite
const frontend = spawn(npxCmd, ['vite'], {
  stdio: 'inherit',
  shell: true,
  env: process.env,
});
children.push(frontend);

backend.on('exit', (code) => {
  if (code && code !== 0) {
    console.warn(`[Dev Runner] 后端服务已退出 (code: ${code})`);
  }
});

frontend.on('exit', (code) => {
  if (code && code !== 0) {
    console.warn(`[Dev Runner] 前端服务已退出 (code: ${code})`);
  }
});
