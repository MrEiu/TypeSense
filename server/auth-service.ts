/**
 * server/auth-service.ts
 *
 * 账户体系与权限控制服务
 * 职责：
 * 1. 原生安全密码哈希（采用 node:crypto scrypt 加盐加密）；
 * 2. 预设并自动初始化 3 个默认系统管理员账号；
 * 3. 普通成员自主注册与登录；
 * 4. 会话令牌生成与校验。
 */

import crypto from 'node:crypto';
import { db } from './db';
import { generateUserId } from './id-generator';

export type UserRole = 'admin' | 'user';

export interface UserAccount {
  id: string;
  username: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export interface DefaultAdminConfig {
  username: string;
  defaultPassword: string;
  role: 'admin';
  description: string;
}

export const DEFAULT_ADMINS: DefaultAdminConfig[] = [
  {
    username: 'admin',
    defaultPassword: 'admin888',
    role: 'admin',
    description: '核心主管理员',
  },
  {
    username: 'superadmin',
    defaultPassword: 'super2026',
    role: 'admin',
    description: '超级技术管理员',
  },
  {
    username: 'manager',
    defaultPassword: 'manage2026',
    role: 'admin',
    description: '问卷运营经理',
  },
];

export class AuthService {
  /**
   * 使用 scrypt 进行原生加盐密码哈希 (salt:hash)
   */
  public static hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
  }

  /**
   * 校验密码与存储的哈希串
   */
  public static verifyPassword(password: string, storedHash: string): boolean {
    if (!storedHash || typeof storedHash !== 'string') return false;

    // 兼容明文兜底
    if (!storedHash.includes(':')) {
      return password === storedHash;
    }

    const [salt, hash] = storedHash.split(':');
    if (!salt || !hash) return false;

    try {
      const derivedHash = crypto.scryptSync(password, salt, 64).toString('hex');
      return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(derivedHash, 'hex'));
    } catch {
      return false;
    }
  }

  /**
   * 开机自动初始化 3 个默认管理员账号
   */
  public static initAdminAccounts(): void {
    const now = new Date().toISOString();

    for (const adm of DEFAULT_ADMINS) {
      const existing = db
        .prepare(`SELECT id FROM users WHERE username = ? LIMIT 1`)
        .get(adm.username) as { id: string } | undefined;

      if (!existing) {
        const id = generateUserId();
        const passwordHash = this.hashPassword(adm.defaultPassword);
        db.prepare(`
          INSERT INTO users (id, username, password_hash, role, created_at, updated_at)
          VALUES (?, ?, ?, 'admin', ?, ?)
        `).run(id, adm.username, passwordHash, now, now);
      }
    }
  }

  /**
   * 用户登录鉴权
   */
  public static login(
    usernameRaw: string,
    passwordRaw: string
  ): { success: boolean; user?: UserAccount; token?: string; error?: string } {
    const username = (usernameRaw || '').trim();
    const password = (passwordRaw || '').trim();

    if (!username || !password) {
      return { success: false, error: '请输入账号和密码' };
    }

    const row = db
      .prepare(`SELECT id, username, password_hash, role, created_at, updated_at FROM users WHERE username = ? LIMIT 1`)
      .get(username) as
      | { id: string; username: string; password_hash: string; role: UserRole; created_at: string; updated_at: string }
      | undefined;

    if (!row) {
      return { success: false, error: '账号不存在或密码错误' };
    }

    const isMatch = this.verifyPassword(password, row.password_hash);
    if (!isMatch) {
      return { success: false, error: '账号不存在或密码错误' };
    }

    const user: UserAccount = {
      id: row.id,
      username: row.username,
      role: row.role,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    const token = this.generateSessionToken(user);

    return {
      success: true,
      user,
      token,
    };
  }

  /**
   * 普通成员自主注册
   */
  public static register(
    usernameRaw: string,
    passwordRaw: string
  ): { success: boolean; user?: UserAccount; token?: string; error?: string } {
    const username = (usernameRaw || '').trim();
    const password = (passwordRaw || '').trim();

    if (!username || !password) {
      return { success: false, error: '账号和密码不能为空' };
    }

    if (username.length < 2 || username.length > 32) {
      return { success: false, error: '账号长度需在 2 到 32 个字符之间' };
    }

    if (password.length < 4) {
      return { success: false, error: '密码长度至少需 4 个字符' };
    }

    // 检查用户名是否已存在
    const existing = db
      .prepare(`SELECT id FROM users WHERE username = ? LIMIT 1`)
      .get(username);

    if (existing) {
      return { success: false, error: '该账号名称已被注册，请尝试其他账号' };
    }

    const id = generateUserId();
    const passwordHash = this.hashPassword(password);
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO users (id, username, password_hash, role, created_at, updated_at)
      VALUES (?, ?, ?, 'user', ?, ?)
    `).run(id, username, passwordHash, now, now);

    const user: UserAccount = {
      id,
      username,
      role: 'user',
      createdAt: now,
      updatedAt: now,
    };

    const token = this.generateSessionToken(user);

    return {
      success: true,
      user,
      token,
    };
  }

  /**
   * 依据 ID 查询用户信息
   */
  public static getUserById(id: string): UserAccount | null {
    const row = db
      .prepare(`SELECT id, username, role, created_at, updated_at FROM users WHERE id = ? LIMIT 1`)
      .get(id) as
      | { id: string; username: string; role: UserRole; created_at: string; updated_at: string }
      | undefined;

    if (!row) return null;

    return {
      id: row.id,
      username: row.username,
      role: row.role,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * 生成轻量防篡改会话令牌
   */
  private static generateSessionToken(user: UserAccount): string {
    const payload = JSON.stringify({
      uid: user.id,
      uname: user.username,
      role: user.role,
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 天有效
    });
    const base64 = Buffer.from(payload).toString('base64url');
    const secret = process.env.AUTH_SECRET || 'typesense_secure_secret_2026';
    const sig = crypto.createHmac('sha256', secret).update(base64).digest('hex');
    return `${base64}.${sig}`;
  }

  /**
   * 解析并验证令牌
   */
  public static verifyToken(token: string): UserAccount | null {
    if (!token || !token.includes('.')) return null;
    const [base64, sig] = token.split('.');
    if (!base64 || !sig) return null;

    const secret = process.env.AUTH_SECRET || 'typesense_secure_secret_2026';
    const expectedSig = crypto.createHmac('sha256', secret).update(base64).digest('hex');
    if (sig !== expectedSig) return null;

    try {
      const payload = JSON.parse(Buffer.from(base64, 'base64url').toString('utf8'));
      if (payload.exp && Date.now() > payload.exp) return null;

      return this.getUserById(payload.uid);
    } catch {
      return null;
    }
  }
}
