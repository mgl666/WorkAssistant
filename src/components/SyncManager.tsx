import { useEffect, useRef } from 'react';
import { getCurrentUser, isApiConfigured } from '@/lib/api';
import { dataSignature, runSync, scheduleSync } from '@/lib/sync';
import { useStore } from '@/store/useStore';

/** 恢复 VPS 登录会话，并通过变更监听与 15 秒轮询保持多页面同步。 */
export default function SyncManager() {
  const lastSignature = useRef<string | null>(null);

  useEffect(() => {
    if (!isApiConfigured) return;
    let disposed = false;
    let stopStore: (() => void) | null = null;

    void getCurrentUser().then((user) => {
      if (disposed) return;
      const store = useStore.getState();
      store.switchWorkspace(user?.id ?? 'guest');
      store.setSync(user
        ? { userId: user.id, email: user.email, status: 'idle' }
        : { userId: null, email: null, status: 'disabled', lastPulledAt: 0, lastSyncAt: 0 });
      if (user) void runSync();

      stopStore = useStore.subscribe((state) => {
        const signature = dataSignature(state);
        if (lastSignature.current === null) { lastSignature.current = signature; return; }
        if (signature !== lastSignature.current) {
          lastSignature.current = signature;
          scheduleSync();
        }
      });
    });

    const syncIfActive = () => { if (useStore.getState().sync.userId) void runSync(); };
    const poll = window.setInterval(() => { if (document.visibilityState === 'visible') syncIfActive(); }, 15_000);
    const onVisible = () => { if (document.visibilityState === 'visible') syncIfActive(); };
    window.addEventListener('online', syncIfActive);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      disposed = true;
      window.clearInterval(poll);
      stopStore?.();
      window.removeEventListener('online', syncIfActive);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return null;
}
