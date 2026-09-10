/**
 * src/services/auth-client-service.ts
 *
 * 前端认证与权限控制客户端服务
 * 职责：管理当前登录用户、令牌存储与读取、角色校验（管理员 / 普通成员）
 */

export interface UserAccount {
  id: string;
  username: string;
  role: 'admin' | 'user';
  createdAt?: string;
}

export type UserProfile = UserAccount;

export interface DefaultAdminHint {
  username: string;
  defaultPassword: string;
  description: string;
}

const STORAGE_USER_KEY = 'typesense_auth_user';
const STORAGE_TOKEN_KEY = 'typesense_auth_token';

export class AuthClientService {
  /**
   * 登录
   */
  public static async login(username: string, password: string): Promise<UserAccount> {
    const resp = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const data = await resp.json();
    if (!resp.ok || !data.success) {
      throw new Error(data.error || '登录失败，请检查账号和密码');
    }

    this.setCurrentSession(data.user, data.token);
    return data.user;
  }

  /**
   * 普通成员自主注册
   */
  public static async register(username: string, password: string): Promise<UserAccount> {
    const resp = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const data = await resp.json();
    if (!resp.ok || !data.success) {
      throw new Error(data.error || '注册失败');
    }

    this.setCurrentSession(data.user, data.token);
    return data.user;
  }

  /**
   * 退出登录
   */
  public static logout(): void {
    localStorage.removeItem(STORAGE_USER_KEY);
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    window.dispatchEvent(new CustomEvent('typesense:auth-changed', { detail: null }));
  }

  /**
   * 获取当前缓存的用户信息
   */
  public static getCurrentUser(): UserAccount | null {
    try {
      const raw = localStorage.getItem(STORAGE_USER_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as UserAccount;
    } catch {
      return null;
    }
  }

  /**
   * 获取当前缓存的用户信息 (别名兼容 getUser)
   */
  public static getUser(): UserAccount | null {
    return this.getCurrentUser();
  }

  /**
   * 获取当前会话令牌
   */
  public static getToken(): string | null {
    return localStorage.getItem(STORAGE_TOKEN_KEY);
  }

  /**
   * 判断是否已登录
   */
  public static isLoggedIn(): boolean {
    return !!this.getCurrentUser();
  }

  /**
   * 判断当前是否为系统管理员
   */
  public static isAdmin(): boolean {
    const u = this.getCurrentUser();
    return u?.role === 'admin';
  }

  /**
   * 获取默认预设管理员提示信息
   */
  public static async getDefaultAdmins(): Promise<DefaultAdminHint[]> {
    try {
      const resp = await fetch('/api/auth/default-admins');
      if (resp.ok) {
        const json = await resp.json();
        return json.admins || [];
      }
    } catch {
      // ignore
    }
    return [
      { username: 'admin', defaultPassword: 'admin888', description: '核心主管理员' },
      { username: 'superadmin', defaultPassword: 'super2026', description: '超级管理员' },
      { username: 'manager', defaultPassword: 'manage2026', description: '问卷运营经理' },
    ];
  }

  /**
   * 写入本地会话存储
   */
  private static setCurrentSession(user: UserAccount, token: string): void {
    localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(user));
    if (token) {
      localStorage.setItem(STORAGE_TOKEN_KEY, token);
    }
    window.dispatchEvent(new CustomEvent('typesense:auth-changed', { detail: user }));
  }
}
