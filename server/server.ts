/**
 * server/server.ts
 *
 * TypeSense standalone backend HTTP server entry.
 * Responsibilities:
 * - Bootstrapping middleware and static configurations
 * - Assembling modular domain routers (surveys, responses, documents, templates, ai, auth)
 * - Conflict port detection and graceful process management
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import express from 'express';
import cors from 'cors';

import { SurveyService } from './survey-service';
import { AuthService } from './auth-service';

import { surveysRouter } from './routes/surveys';
import { responsesRouter } from './routes/responses';
import { authRouter } from './routes/auth';
import { documentsRouter } from './routes/documents';
import { templatesRouter } from './routes/templates';
import { aiRouter } from './routes/ai';
import { aiEditorRouter } from './questionnaire-ai-editor/routes';

process.removeAllListeners('warning');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT_FILE = path.resolve(__dirname, '../data/runtime/server-port.json');
const DEFAULT_PORT = Number(process.env.PORT) || 3125;

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Initialize seed surveys and default admin accounts
SurveyService.initSeedSurveys();
AuthService.initAdminAccounts();

// Mount domain route modules
app.use(surveysRouter);
app.use(responsesRouter);
app.use(authRouter);
app.use(documentsRouter);
app.use(templatesRouter);
app.use(aiRouter);
app.use('/api/ai-editor', aiEditorRouter);

function saveServerPort(port: number): void {
  try {
    const dir = path.dirname(PORT_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      PORT_FILE,
      JSON.stringify({ port, updatedAt: new Date().toISOString() }, null, 2)
    );
  } catch (err) {
    console.warn('[TypeSense Backend] save server-port.json error:', err);
  }
}

/**
 * Terminate process occupying the target port if any
 */
async function killPortProcess(port: number): Promise<boolean> {
  const isWindows = process.platform === 'win32';
  let killed = false;

  try {
    if (isWindows) {
      const output = execSync('netstat -ano -p tcp', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      const lines = output.split('\n');
      const pids = new Set<number>();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const parts = trimmed.split(/\s+/);
        if (parts.length >= 5 && parts[3]?.toUpperCase() === 'LISTENING') {
          const localAddr = parts[1] || '';
          if (localAddr.endsWith(`:${port}`)) {
            const pid = parseInt(parts[parts.length - 1], 10);
            if (pid && pid > 0 && pid !== process.pid) {
              pids.add(pid);
            }
          }
        }
      }

      for (const pid of pids) {
        try {
          console.warn(`[TypeSense Backend] Port ${port} occupied by PID ${pid}, terminating...`);
          execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
          killed = true;
          console.info(`[TypeSense Backend] Successfully terminated PID ${pid}`);
        } catch (e) {
          console.warn(`[TypeSense Backend] Failed to kill PID ${pid}:`, e);
        }
      }
    } else {
      const output = execSync(`lsof -ti tcp:${port}`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
      }).trim();
      if (output) {
        const pids = output
          .split('\n')
          .map((p) => parseInt(p.trim(), 10))
          .filter((p) => p && p !== process.pid);
        for (const pid of pids) {
          try {
            console.warn(`[TypeSense Backend] Port ${port} occupied by PID ${pid}, terminating...`);
            process.kill(pid, 'SIGKILL');
            killed = true;
            console.info(`[TypeSense Backend] Successfully terminated PID ${pid}`);
          } catch (e) {
            console.warn(`[TypeSense Backend] Failed to kill PID ${pid}:`, e);
          }
        }
      }
    }
  } catch {
    // Ignore inspection command failures
  }

  if (killed) {
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  return killed;
}

const server = http.createServer(app);

async function startServer() {
  try {
    const targetPort = DEFAULT_PORT;
    await killPortProcess(targetPort);

    server.once('error', async (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`[TypeSense Backend] Port ${targetPort} conflict (EADDRINUSE), retrying after termination...`);
        await killPortProcess(targetPort);
        setTimeout(() => {
          server.listen(targetPort, '127.0.0.1');
        }, 300);
      } else {
        console.error('[TypeSense Backend] Server startup error:', err);
        process.exit(1);
      }
    });

    server.listen(targetPort, '127.0.0.1', () => {
      saveServerPort(targetPort);
      console.info(`[TypeSense Backend] Server listening on http://127.0.0.1:${targetPort}`);
    });
  } catch (err) {
    console.error('[TypeSense Backend] Server startup failure:', err);
    process.exit(1);
  }
}

startServer();
