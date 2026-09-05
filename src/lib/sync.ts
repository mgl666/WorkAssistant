import { apiFetch, isApiConfigured } from './api';
import { SYNC_TABLES, syncKey, useStore, type SyncRecord, type SyncTable, type Tombstone } from '@/store/useStore';

interface SyncChange {
  table: SyncTable;
  id: string;
  data: SyncRecord | Record<string, unknown>;
  updatedAt: number;
  deleted: boolean;
}
interface SyncResponse { cursor: number; changes: SyncChange[] }

let timer: number | null = null;
let running = false;
let rerun = false;

export function scheduleSync(delay = 1500): void {
  if (!isApiConfigured) return;
  if (timer !== null) window.clearTimeout(timer);
  timer = window.setTimeout(() => { timer = null; void runSync(); }, delay);
}

export async function runSync(): Promise<void> {
  if (!isApiConfigured) return;
  if (running) { rerun = true; return; }
  const store = useStore.getState();
  if (!store.sync.userId) return;
  running = true;
  store.setSync({ status: 'syncing', lastError: '' });

  const dirtyKeys: string[] = [];
  const changes: SyncChange[] = [];
  for (const table of SYNC_TABLES) {
    for (const record of store[table] as SyncRecord[]) {
      const key = syncKey(table, record.id);
      if (!store.dirty[key]) continue;
      dirtyKeys.push(key);
      changes.push({ table, id: record.id, data: record, updatedAt: record.updatedAt, deleted: false });
    }
  }
  const tombstones = store.takeTombstones();
  for (const tomb of tombstones) changes.push({ table: tomb.table, id: tomb.id, data: tomb.snapshot, updatedAt: tomb.updatedAt, deleted: true });

  try {
    const result = await apiFetch<SyncResponse>('/sync', {
      method: 'POST', body: JSON.stringify({ since: store.sync.lastPulledAt, changes }),
    });
    for (const table of SYNC_TABLES) {
      const tableChanges = result.changes.filter((change) => change.table === table);
      const alive = tableChanges.filter((change) => !change.deleted).map((change) => change.data as SyncRecord);
      const removed = tableChanges.filter((change) => change.deleted).map((change) => change.id);
      if (alive.length) useStore.getState().applyRemote(table, alive);
      if (removed.length) useStore.getState().removeRemote(table, removed);
    }
    useStore.getState().clearDirty(dirtyKeys);
    useStore.getState().setSync({ status: 'idle', lastPulledAt: result.cursor, lastSyncAt: Date.now(), lastError: '' });
  } catch (err) {
    if (tombstones.length) useStore.setState((state) => ({ tombstones: [...state.tombstones, ...tombstones] }));
    const message = err instanceof Error ? err.message : String(err);
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    useStore.getState().setSync({ status: offline ? 'offline' : 'error', lastError: message });
  } finally {
    running = false;
    if (rerun) { rerun = false; void runSync(); }
  }
}

interface SignatureInput { tombstones: Tombstone[] }
export function dataSignature(state: Record<SyncTable, Array<{ id: string; updatedAt: number }>> & SignatureInput): string {
  let signature = '';
  for (const table of SYNC_TABLES) {
    for (const row of state[table] ?? []) signature += `${row.id}:${row.updatedAt},`;
    signature += '|';
  }
  for (const tombstone of state.tombstones) signature += `T${tombstone.table}:${tombstone.id}:${tombstone.updatedAt},`;
  return signature;
}
