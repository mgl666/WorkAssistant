const configuredBase = (import.meta.env.VITE_API_URL?.trim() || '/api').replace(/\/$/, '');

export const isApiConfigured = Boolean(configuredBase);

interface ApiErrorBody { error?: string }

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${configuredBase}${path}`, {
      ...init,
      credentials: 'include',
      headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
    });
  } catch {
    throw new Error('无法连接自托管服务，请检查 VPS API 和 Nginx 配置');
  }
  const body = await response.json().catch(() => ({})) as ApiErrorBody;
  if (!response.ok) {
    if (response.status === 401) throw new Error(body.error || '登录已失效，请重新登录');
    if (response.status === 429) throw new Error(body.error || '操作过于频繁，请稍后再试');
    throw new Error(body.error || `服务器请求失败（${response.status}）`);
  }
  return body as T;
}

export interface SessionUser { id: string; email: string }

export async function getCurrentUser(): Promise<SessionUser | null> {
  try {
    const result = await apiFetch<{ user: SessionUser | null }>('/auth/session');
    return result.user;
  } catch {
    return null;
  }
}
