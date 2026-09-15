/**
 * server/routes/auth.ts
 *
 * Authentication and authorization route handlers.
 */

import { Router, Request, Response } from 'express';
import { AuthService, DEFAULT_ADMINS } from '../auth-service';

export const authRouter = Router();

/**
 * User login with username and password
 */
authRouter.post('/api/auth/login', (req: Request, res: Response) => {
  try {
    const { username, password } = req.body || {};
    const result = AuthService.login(username, password);
    if (!result.success) {
      res.status(401).json({ success: false, error: result.error });
      return;
    }
    res.json({ success: true, user: result.user, token: result.token });
  } catch (err: any) {
    console.error('[API] login error:', err);
    res.status(500).json({ success: false, error: '登录处理异常' });
  }
});

/**
 * User registration
 */
authRouter.post('/api/auth/register', (req: Request, res: Response) => {
  try {
    const { username, password } = req.body || {};
    const result = AuthService.register(username, password);
    if (!result.success) {
      res.status(400).json({ success: false, error: result.error });
      return;
    }
    res.json({ success: true, user: result.user, token: result.token });
  } catch (err: any) {
    console.error('[API] register error:', err);
    res.status(500).json({ success: false, error: '注册处理异常' });
  }
});

/**
 * Get current authenticated user session
 */
authRouter.get('/api/auth/me', (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : (req.query.token as string);

    if (!token) {
      res.status(401).json({ success: false, error: '未登录' });
      return;
    }

    const user = AuthService.verifyToken(token);
    if (!user) {
      res.status(401).json({ success: false, error: '会话已过期或无效' });
      return;
    }

    res.json({ success: true, user });
  } catch (err: any) {
    console.error('[API] auth/me error:', err);
    res.status(500).json({ success: false, error: '会话校验失败' });
  }
});

/**
 * Get default admin account hints
 */
authRouter.get('/api/auth/default-admins', (_req: Request, res: Response) => {
  res.json({
    success: true,
    admins: DEFAULT_ADMINS.map((a) => ({
      username: a.username,
      defaultPassword: a.defaultPassword,
      description: a.description,
    })),
  });
});
