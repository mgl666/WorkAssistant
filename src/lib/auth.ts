import { apiFetch, type SessionUser } from './api';
import { runSync } from './sync';
import { useStore } from '@/store/useStore';

function afterSignIn(user: SessionUser, adoptCurrent = false): void {
  const store = useStore.getState();
  store.switchWorkspace(user.id, adoptCurrent);
  store.setSync({ userId: user.id, email: user.email, status: 'idle', lastError: '', lastPulledAt: 0 });
  if (adoptCurrent) store.markAllDirty();
}

export async function signUp(email: string, password: string): Promise<string> {
  const { user } = await apiFetch<{ user: SessionUser }>('/auth/signup', {
    method: 'POST', body: JSON.stringify({ email, password }),
  });
  afterSignIn(user, true);
  await runSync();
  return '注册成功，本地数据已上传到 VPS。';
}

export async function signIn(email: string, password: string): Promise<string> {
  const { user } = await apiFetch<{ user: SessionUser }>('/auth/signin', {
    method: 'POST', body: JSON.stringify({ email, password }),
  });
  afterSignIn(user);
  await runSync();
  return '登录成功，数据已同步。';
}

export async function signOut(): Promise<void> {
  await apiFetch<{ ok: true }>('/auth/signout', { method: 'POST' });
  const store = useStore.getState();
  store.switchWorkspace('guest');
  store.setSync({ userId: null, email: null, status: 'disabled', lastError: '', lastPulledAt: 0, lastSyncAt: 0 });
}

export async function uploadLocalToRemote(): Promise<void> {
  const store = useStore.getState();
  if (!store.sync.userId) throw new Error('尚未登录');
  store.setSync({ lastPulledAt: 0, status: 'syncing' });
  store.markAllDirty();
  await runSync();
}
