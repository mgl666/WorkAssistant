import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { uid } from '@/lib/utils';
import { toKey } from '@/lib/date';

export type EventColor = 'indigo' | 'emerald' | 'amber' | 'rose' | 'sky' | 'violet';
export const SYNC_TABLES = ['events', 'todos', 'lists', 'notes', 'sessions', 'daily_tasks', 'goals'] as const;
export type SyncTable = (typeof SYNC_TABLES)[number];
export type SyncStatus = 'disabled' | 'idle' | 'syncing' | 'error' | 'offline';
export interface SyncState { status: SyncStatus; lastPulledAt: number; lastSyncAt: number; lastError: string; email: string | null; userId: string | null }
export interface Tombstone { table: SyncTable; id: string; deletedAt: number; updatedAt: number; snapshot: Record<string, unknown> }
export type EventRecurrence = 'none' | 'weekly' | 'monthly' | 'yearly';
export interface CalEvent { id: string; date: string; title: string; time?: string; endTime?: string; note?: string; color: EventColor; done: boolean; recurrence?: EventRecurrence; recurrenceUntil?: string; createdAt: number; updatedAt: number }
export type TodoPriority = 1 | 2 | 3 | 4 | 5;
export interface Todo { id: string; title: string; note: string; due: string; dueTime?: string; listId: string; parentId?: string; done: boolean; starred: boolean; priority: TodoPriority; completedAt?: number; createdAt: number; updatedAt: number }
export interface TodoList { id: string; name: string; updatedAt: number }
export interface Note { id: string; title: string; content: string; pinned: boolean; createdAt: number; updatedAt: number }
export type PomodoroMode = 'focus' | 'short' | 'long';
export interface PomodoroSession { id: string; mode: PomodoroMode; minutes: number; task: string; endedAt: number; updatedAt: number }
export interface PomodoroTimer { mode: PomodoroMode; remaining: number; endAt: number | null; completedEndAt?: number; round: number; task: string }
export interface PomodoroCompletion { mode: PomodoroMode; task: string; nextMode: PomodoroMode; nextSeconds: number; sound: boolean }
export interface DailyTask { id: string; title: string; note: string; daysOfWeek: number[]; completedDates: string[]; enabled: boolean; createdAt: number; updatedAt: number }
export interface GoalTask { id: string; title: string; parentId?: string; done: boolean; completedAt?: number; order: number; createdAt: number }
export interface LongTermGoal { id: string; title: string; tasks: GoalTask[]; order: number; createdAt: number; updatedAt: number }
export interface Settings {
  theme: 'light' | 'dark'; focusMin: number; shortMin: number; longMin: number; longEvery: number; longBreakEnabled: boolean; autoNext: boolean; sound: boolean;
  aiEndpoint: string; aiModel: string; /** 仅保存在当前设备 */ aiApiKey: string;
}
export type SyncRecord = CalEvent | Todo | TodoList | Note | PomodoroSession | DailyTask | LongTermGoal;
export const DEFAULT_LIST_ID = 'inbox';
export const GUEST_WORKSPACE = 'guest';

interface WorkspaceSnapshot {
  events: CalEvent[]; todos: Todo[]; lists: TodoList[]; notes: Note[]; sessions: PomodoroSession[]; daily_tasks: DailyTask[]; goals: LongTermGoal[];
  settings: Settings; timer: PomodoroTimer; dirty: Record<string, 1>; tombstones: Tombstone[]; lastPulledAt: number; lastSyncAt: number;
}
interface State extends Omit<WorkspaceSnapshot, 'lastPulledAt' | 'lastSyncAt'> {
  workspaceKey: string; workspaces: Record<string, WorkspaceSnapshot>; sync: SyncState;
  addEvent: (e: Omit<CalEvent, 'id' | 'createdAt' | 'updatedAt'>) => string; updateEvent: (id: string, patch: Partial<CalEvent>) => void; removeEvent: (id: string) => void; toggleEvent: (id: string) => void;
  addTodo: (t: Partial<Todo>) => string; updateTodo: (id: string, patch: Partial<Todo>) => void; removeTodo: (id: string) => void; toggleTodo: (id: string) => void; clearCompletedTodos: (listId?: string) => void;
  addList: (name: string) => string; renameList: (id: string, name: string) => void; removeList: (id: string) => void;
  addNote: () => string; updateNote: (id: string, patch: Partial<Note>) => void; removeNote: (id: string) => void;
  addSession: (s: Omit<PomodoroSession, 'id' | 'updatedAt'>) => void; clearSessions: (dateKey?: string) => void;
  updateTimer: (patch: Partial<PomodoroTimer>) => void; completeTimer: (expectedEndAt: number) => PomodoroCompletion | null;
  addDailyTask: (t: Pick<DailyTask, 'title' | 'note' | 'daysOfWeek'>) => string; updateDailyTask: (id: string, patch: Partial<DailyTask>) => void; removeDailyTask: (id: string) => void; toggleDailyTaskDate: (id: string, date: string) => void;
  addGoal: (title: string) => string; renameGoal: (id: string, title: string) => void; removeGoal: (id: string) => void; moveGoal: (id: string, toIndex: number) => void;
  addGoalTask: (goalId: string, title: string, parentId?: string) => string; updateGoalTask: (goalId: string, taskId: string, title: string) => void; removeGoalTask: (goalId: string, taskId: string) => void; toggleGoalTask: (goalId: string, taskId: string) => void; moveGoalTask: (goalId: string, taskId: string, targetId: string) => void;
  updateSettings: (patch: Partial<Settings>) => void; applyRemote: (table: SyncTable, rows: SyncRecord[]) => number; removeRemote: (table: SyncTable, ids: string[]) => void;
  takeTombstones: () => Tombstone[]; clearDirty: (keys: string[]) => void; markAllDirty: () => void; setSync: (patch: Partial<SyncState>) => void; switchWorkspace: (key: string, adoptCurrent?: boolean) => void;
  /** 从墓碑快照恢复记录，用于删除后的撤销；恢复的记录会重新标记为待推送 */
  restore: (items: Tombstone[]) => void;
  importData: (raw: string, mode?: 'replace' | 'merge') => boolean; resetAll: () => void;
}

export const syncKey = (table: SyncTable, id: string) => `${table}:${id}`;
const withDirty = (dirty: Record<string, 1>, table: SyncTable, id: string) => ({ ...dirty, [syncKey(table, id)]: 1 as const });
function dropDirty(dirty: Record<string, 1>, table: SyncTable, id: string) { const next = { ...dirty }; delete next[syncKey(table, id)]; return next; }
function dropDirtyMany(dirty: Record<string, 1>, table: SyncTable, ids: string[]) { const next = { ...dirty }; ids.forEach((id) => delete next[syncKey(table, id)]); return next; }
function tombstoneOf(table: SyncTable, record: unknown, at: number): Tombstone { return { table, id: (record as { id: string }).id, deletedAt: at, updatedAt: at, snapshot: record as Record<string, unknown> }; }
function pushTombstone(list: Tombstone[], t: Tombstone) { return [...list.filter((x) => !(x.table === t.table && x.id === t.id)), t]; }

export const defaultSettings: Settings = {
  theme: 'light', focusMin: 25, shortMin: 5, longMin: 15, longEvery: 4, longBreakEnabled: true, autoNext: false, sound: true,
  aiEndpoint: 'https://api.openai.com/v1', aiModel: 'gpt-4.1-mini', aiApiKey: '',
};
const defaultSync: SyncState = { status: 'disabled', lastPulledAt: 0, lastSyncAt: 0, lastError: '', email: null, userId: null };
const defaultTimer = (): PomodoroTimer => ({ mode: 'focus', remaining: 25 * 60, endAt: null, round: 0, task: '' });
function blankWorkspace(theme: Settings['theme'] = 'light'): WorkspaceSnapshot {
  return { events: [], todos: [], lists: [{ id: DEFAULT_LIST_ID, name: '我的任务', updatedAt: 1 }], notes: [], sessions: [], daily_tasks: [], goals: [], settings: { ...defaultSettings, theme }, timer: defaultTimer(), dirty: {}, tombstones: [], lastPulledAt: 0, lastSyncAt: 0 };
}
function snapshot(s: State): WorkspaceSnapshot { return { events: s.events, todos: s.todos, lists: s.lists, notes: s.notes, sessions: s.sessions, daily_tasks: s.daily_tasks, goals: s.goals, settings: s.settings, timer: s.timer, dirty: s.dirty, tombstones: s.tombstones, lastPulledAt: s.sync.lastPulledAt, lastSyncAt: s.sync.lastSyncAt }; }
const initial = blankWorkspace();

export const useStore = create<State>()(persist((set, get) => ({
  ...initial, workspaceKey: GUEST_WORKSPACE, workspaces: {}, sync: defaultSync,
  addEvent: (e) => { const id = uid(), now = Date.now(); set((s) => ({ events: [...s.events, { ...e, id, done: e.done ?? false, createdAt: now, updatedAt: now }], dirty: withDirty(s.dirty, 'events', id) })); return id; },
  updateEvent: (id, patch) => set((s) => ({ events: s.events.map((e) => e.id === id ? { ...e, ...patch, updatedAt: Date.now() } : e), dirty: withDirty(s.dirty, 'events', id) })),
  removeEvent: (id) => set((s) => { const target = s.events.find((e) => e.id === id); if (!target) return s; return { events: s.events.filter((e) => e.id !== id), tombstones: pushTombstone(s.tombstones, tombstoneOf('events', target, Date.now())), dirty: dropDirty(s.dirty, 'events', id) }; }),
  toggleEvent: (id) => set((s) => ({ events: s.events.map((e) => e.id === id ? { ...e, done: !e.done, updatedAt: Date.now() } : e), dirty: withDirty(s.dirty, 'events', id) })),

  addTodo: (t) => { const id = uid(), now = Date.now(); set((s) => ({ todos: [...s.todos, { id, title: t.title ?? '', note: t.note ?? '', due: t.due ?? '', dueTime: t.dueTime, listId: t.listId ?? DEFAULT_LIST_ID, parentId: t.parentId, done: false, starred: t.starred ?? false, priority: t.priority ?? 3, createdAt: now, updatedAt: now }], dirty: withDirty(s.dirty, 'todos', id) })); return id; },
  updateTodo: (id, patch) => set((s) => ({ todos: s.todos.map((t) => t.id === id ? { ...t, ...patch, updatedAt: Date.now() } : t), dirty: withDirty(s.dirty, 'todos', id) })),
  removeTodo: (id) => set((s) => { const targets = s.todos.filter((t) => t.id === id || t.parentId === id); if (!targets.length) return s; const now = Date.now(); return { todos: s.todos.filter((t) => !targets.some((target) => target.id === t.id)), tombstones: targets.reduce((list, target) => pushTombstone(list, tombstoneOf('todos', target, now)), s.tombstones), dirty: dropDirtyMany(s.dirty, 'todos', targets.map((target) => target.id)) }; }),
  toggleTodo: (id) => set((s) => {
    const target = s.todos.find((t) => t.id === id);
    if (!target) return s;
    const done = !target.done, now = Date.now();
    // 完成主任务时级联完成所有子任务，避免出现“父已完成、子仍在做”的半成品状态，
    // 也让「清除已完成」能整组删除，不会留下孤儿子任务
    const ids = done ? [id, ...s.todos.filter((t) => t.parentId === id).map((t) => t.id)] : [id];
    return { todos: s.todos.map((t) => ids.includes(t.id) ? { ...t, done, completedAt: done ? now : undefined, updatedAt: now } : t), dirty: ids.reduce((acc, childId) => withDirty(acc, 'todos', childId), s.dirty) };
  }),
  // 只清除「整组都已完成」的任务：主任务完成但仍有未完成子任务时保留整组，
  // 否则删掉主任务会让子任务失去父级，变成悬空的孤立任务
  clearCompletedTodos: (listId) => set((s) => {
    const inScope = (t: Todo) => !listId || t.listId === listId;
    const childrenOf = new Map<string, Todo[]>();
    for (const t of s.todos) if (t.parentId) childrenOf.set(t.parentId, [...(childrenOf.get(t.parentId) ?? []), t]);
    const targets: Todo[] = [];
    for (const root of s.todos) {
      if (!inScope(root)) continue;
      const parentMissing = root.parentId && !s.todos.some((p) => p.id === root.parentId);
      if (root.parentId && !parentMissing) continue; // 有父级且父级存在，由父级整组处理
      const children = childrenOf.get(root.id) ?? [];
      if (root.done && children.every((child) => child.done)) targets.push(root, ...children);
    }
    if (!targets.length) return s;
    const now = Date.now();
    return { todos: s.todos.filter((t) => !targets.some((x) => x.id === t.id)), tombstones: targets.reduce((a, t) => pushTombstone(a, tombstoneOf('todos', t, now)), s.tombstones), dirty: dropDirtyMany(s.dirty, 'todos', targets.map((t) => t.id)) };
  }),

  addList: (name) => { const id = uid(); set((s) => ({ lists: [...s.lists, { id, name: name.trim() || '新清单', updatedAt: Date.now() }], dirty: withDirty(s.dirty, 'lists', id) })); return id; },
  renameList: (id, name) => set((s) => ({ lists: s.lists.map((l) => l.id === id ? { ...l, name, updatedAt: Date.now() } : l), dirty: withDirty(s.dirty, 'lists', id) })),
  removeList: (id) => set((s) => { if (id === DEFAULT_LIST_ID) return s; const list = s.lists.find((l) => l.id === id); if (!list) return s; const now = Date.now(), children = s.todos.filter((t) => t.listId === id); return { lists: s.lists.filter((l) => l.id !== id), todos: s.todos.filter((t) => t.listId !== id), tombstones: children.reduce((a, t) => pushTombstone(a, tombstoneOf('todos', t, now)), pushTombstone(s.tombstones, tombstoneOf('lists', list, now))), dirty: dropDirty(dropDirtyMany(s.dirty, 'todos', children.map((t) => t.id)), 'lists', id) }; }),

  addNote: () => { const id = uid(), now = Date.now(); set((s) => ({ notes: [{ id, title: '', content: '', pinned: false, createdAt: now, updatedAt: now }, ...s.notes], dirty: withDirty(s.dirty, 'notes', id) })); return id; },
  updateNote: (id, patch) => set((s) => ({ notes: s.notes.map((n) => n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n), dirty: withDirty(s.dirty, 'notes', id) })),
  removeNote: (id) => set((s) => { const target = s.notes.find((n) => n.id === id); if (!target) return s; return { notes: s.notes.filter((n) => n.id !== id), tombstones: pushTombstone(s.tombstones, tombstoneOf('notes', target, Date.now())), dirty: dropDirty(s.dirty, 'notes', id) }; }),
  addSession: (sess) => set((s) => { const id = uid(); return { sessions: [...s.sessions, { ...sess, id, updatedAt: Date.now() }], dirty: withDirty(s.dirty, 'sessions', id) }; }),
  // 传入日期键时只清除那一天的番茄记录，不传则清除全部历史
  clearSessions: (dateKey) => set((s) => {
    const now = Date.now();
    const targets = dateKey ? s.sessions.filter((x) => toKey(new Date(x.endedAt)) === dateKey) : s.sessions;
    if (!targets.length) return s;
    return { sessions: s.sessions.filter((x) => !targets.some((t) => t.id === x.id)), tombstones: targets.reduce((a, x) => pushTombstone(a, tombstoneOf('sessions', x, now)), s.tombstones), dirty: dropDirtyMany(s.dirty, 'sessions', targets.map((x) => x.id)) };
  }),
  updateTimer: (patch) => set((s) => ({ timer: { ...s.timer, ...patch } })),
  completeTimer: (expectedEndAt) => {
    let completion: PomodoroCompletion | null = null;
    set((s) => {
      const timer = s.timer;
      // 比较并交换：只有仍持有这个结束时间的调用可以完成本段。
      // completedEndAt 会持久化，可阻止组件重挂载或页面刷新后重复记账。
      if (timer.endAt !== expectedEndAt || timer.completedEndAt === expectedEndAt || expectedEndAt > Date.now() + 500) return s;

      const safeMinutes = (value: number, fallback: number) => Number.isFinite(value) && value > 0 ? Math.min(180, value) : fallback;
      const durations = {
        focus: safeMinutes(s.settings.focusMin, 25),
        short: safeMinutes(s.settings.shortMin, 5),
        long: safeMinutes(s.settings.longMin, 15),
      };
      const longBreakEnabled = s.settings.longBreakEnabled !== false;
      const nextMode: PomodoroMode = timer.mode === 'focus'
        ? longBreakEnabled && (timer.round + 1) % Math.max(1, s.settings.longEvery || 4) === 0 ? 'long' : 'short'
        : 'focus';
      const nextSeconds = durations[nextMode] * 60;
      const now = Date.now();
      // 相同结束时间在多个浏览器页面触发时使用相同 ID，服务端同步后也不会形成重复记录。
      const sessionId = `timer-${Math.trunc(expectedEndAt).toString(36)}-${timer.mode}`;
      const alreadyRecorded = s.sessions.some((session) => session.id === sessionId);
      const session: PomodoroSession = {
        id: sessionId,
        mode: timer.mode,
        minutes: durations[timer.mode],
        task: timer.task.trim(),
        endedAt: expectedEndAt,
        updatedAt: now,
      };
      completion = { mode: timer.mode, task: timer.task.trim(), nextMode, nextSeconds, sound: s.settings.sound };

      return {
        sessions: alreadyRecorded ? s.sessions : [...s.sessions, session],
        dirty: alreadyRecorded ? s.dirty : withDirty(s.dirty, 'sessions', sessionId),
        timer: {
          ...timer,
          mode: nextMode,
          remaining: nextSeconds,
          endAt: s.settings.autoNext ? now + nextSeconds * 1000 : null,
          completedEndAt: expectedEndAt,
          round: timer.mode === 'focus' ? timer.round + 1 : timer.round,
        },
      };
    });
    return completion;
  },

  addDailyTask: (t) => { const id = uid(), now = Date.now(); set((s) => ({ daily_tasks: [...s.daily_tasks, { ...t, id, enabled: true, completedDates: [], createdAt: now, updatedAt: now }], dirty: withDirty(s.dirty, 'daily_tasks', id) })); return id; },
  updateDailyTask: (id, patch) => set((s) => ({ daily_tasks: s.daily_tasks.map((t) => t.id === id ? { ...t, ...patch, updatedAt: Date.now() } : t), dirty: withDirty(s.dirty, 'daily_tasks', id) })),
  removeDailyTask: (id) => set((s) => { const target = s.daily_tasks.find((t) => t.id === id); if (!target) return s; return { daily_tasks: s.daily_tasks.filter((t) => t.id !== id), tombstones: pushTombstone(s.tombstones, tombstoneOf('daily_tasks', target, Date.now())), dirty: dropDirty(s.dirty, 'daily_tasks', id) }; }),
  toggleDailyTaskDate: (id, date) => set((s) => ({ daily_tasks: s.daily_tasks.map((t) => t.id === id ? { ...t, completedDates: t.completedDates.includes(date) ? t.completedDates.filter((d) => d !== date) : [...t.completedDates, date], updatedAt: Date.now() } : t), dirty: withDirty(s.dirty, 'daily_tasks', id) })),

  addGoal: (title) => { const id = uid(), now = Date.now(); set((s) => ({ goals: [...s.goals, { id, title: title.trim() || '新目标', tasks: [], order: Math.max(-1, ...s.goals.map((goal) => goal.order ?? goal.createdAt)) + 1, createdAt: now, updatedAt: now }], dirty: withDirty(s.dirty, 'goals', id) })); return id; },
  renameGoal: (id, title) => set((s) => ({ goals: s.goals.map((g) => g.id === id ? { ...g, title: title.trim() || g.title, updatedAt: Date.now() } : g), dirty: withDirty(s.dirty, 'goals', id) })),
  removeGoal: (id) => set((s) => { const target = s.goals.find((g) => g.id === id); if (!target) return s; return { goals: s.goals.filter((g) => g.id !== id), tombstones: pushTombstone(s.tombstones, tombstoneOf('goals', target, Date.now())), dirty: dropDirty(s.dirty, 'goals', id) }; }),
  moveGoal: (id, toIndex) => set((s) => {
    const ordered = [...s.goals].sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt));
    const fromIndex = ordered.findIndex((goal) => goal.id === id);
    const targetIndex = Math.max(0, Math.min(ordered.length - 1, toIndex));
    if (fromIndex < 0 || fromIndex === targetIndex) return s;
    const [moved] = ordered.splice(fromIndex, 1);
    ordered.splice(targetIndex, 0, moved);
    const now = Date.now();
    let dirty = s.dirty;
    const goals = ordered.map((goal, index) => {
      if (goal.order === index) return goal;
      dirty = withDirty(dirty, 'goals', goal.id);
      return { ...goal, order: index, updatedAt: now };
    });
    return { goals, dirty };
  }),
  addGoalTask: (goalId, title, parentId) => { const id = uid(), now = Date.now(); set((s) => ({ goals: s.goals.map((g) => {
    if (g.id !== goalId) return g;
    const siblings = g.tasks.filter((task) => (task.parentId ?? null) === (parentId ?? null));
    const order = Math.max(-1, ...siblings.map((task) => task.order ?? task.createdAt)) + 1;
    return { ...g, tasks: [...g.tasks, { id, title: title.trim(), parentId, done: false, order, createdAt: now }], updatedAt: now };
  }), dirty: withDirty(s.dirty, 'goals', goalId) })); return id; },
  updateGoalTask: (goalId, taskId, title) => set((s) => ({ goals: s.goals.map((g) => g.id === goalId ? { ...g, tasks: g.tasks.map((t) => t.id === taskId ? { ...t, title } : t), updatedAt: Date.now() } : g), dirty: withDirty(s.dirty, 'goals', goalId) })),
  removeGoalTask: (goalId, taskId) => set((s) => ({ goals: s.goals.map((g) => g.id === goalId ? { ...g, tasks: g.tasks.filter((t) => t.id !== taskId && t.parentId !== taskId), updatedAt: Date.now() } : g), dirty: withDirty(s.dirty, 'goals', goalId) })),
  toggleGoalTask: (goalId, taskId) => set((s) => {
    const now = Date.now();
    return { goals: s.goals.map((g) => {
      if (g.id !== goalId) return g;
      const target = g.tasks.find((t) => t.id === taskId);
      if (!target) return g;
      const done = !target.done;
      const affected = new Set([taskId, ...(done ? g.tasks.filter((t) => t.parentId === taskId).map((t) => t.id) : [])]);
      return { ...g, tasks: g.tasks.map((t) => affected.has(t.id) ? { ...t, done, completedAt: done ? now : undefined } : t), updatedAt: now };
    }), dirty: withDirty(s.dirty, 'goals', goalId) };
  }),
  moveGoalTask: (goalId, taskId, targetId) => set((s) => {
    const now = Date.now();
    let changed = false;
    const goals = s.goals.map((goal) => {
      if (goal.id !== goalId) return goal;
      const task = goal.tasks.find((item) => item.id === taskId);
      const target = goal.tasks.find((item) => item.id === targetId);
      if (!task || !target || (task.parentId ?? null) !== (target.parentId ?? null)) return goal;
      const taskOrder = task.order ?? task.createdAt;
      const targetOrder = target.order ?? target.createdAt;
      changed = true;
      return {
        ...goal,
        tasks: goal.tasks.map((item) => item.id === taskId ? { ...item, order: targetOrder } : item.id === targetId ? { ...item, order: taskOrder } : item),
        updatedAt: now,
      };
    });
    return changed ? { goals, dirty: withDirty(s.dirty, 'goals', goalId) } : s;
  }),
  updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

  applyRemote: (table, rows) => { let changed = 0; set((s) => { const local = s[table] as Array<{ id: string; updatedAt: number }>, next = [...local]; let dirty = s.dirty; for (const incoming of rows as Array<{ id: string; updatedAt: number }>) { const tomb = s.tombstones.find((t) => t.table === table && t.id === incoming.id); if (tomb && tomb.updatedAt >= incoming.updatedAt) continue; const idx = next.findIndex((r) => r.id === incoming.id); if (idx === -1) { next.push(incoming); changed++; } else if ((next[idx].updatedAt ?? 0) < incoming.updatedAt) { next[idx] = incoming; dirty = dropDirty(dirty, table, incoming.id); changed++; } } return changed ? ({ [table]: next, dirty } as Partial<State>) : s; }); return changed; },
  removeRemote: (table, ids) => set((s) => { const setIds = new Set(ids), local = s[table] as Array<{ id: string }>; return { [table]: local.filter((r) => !setIds.has(r.id)), tombstones: s.tombstones.filter((t) => !(t.table === table && setIds.has(t.id))), dirty: dropDirtyMany(s.dirty, table, ids) } as Partial<State>; }),
  takeTombstones: () => { const list = get().tombstones; if (list.length) set({ tombstones: [] }); return list; },
  restore: (items) => set((s) => {
    if (!items.length) return s;
    const next: Record<string, unknown> = {};
    let dirty = s.dirty;
    for (const item of items) {
      const record = item.snapshot as { id?: string } | undefined;
      if (!record?.id) continue;
      const current = (next[item.table] as Array<{ id: string }> | undefined) ?? [...(s[item.table] as Array<{ id: string }>)];
      if (!current.some((r) => r.id === record.id)) current.push(record as never);
      next[item.table] = current;
      // VPS 中可能已被标记 deleted=true，恢复后必须重新推送
      dirty = withDirty(dirty, item.table, record.id);
    }
    if (!Object.keys(next).length) return s;
    return { ...next, dirty, tombstones: s.tombstones.filter((t) => !items.some((i) => i.table === t.table && i.id === t.id)) } as Partial<State>;
  }),
  clearDirty: (keys) => set((s) => { const next = { ...s.dirty }; keys.forEach((k) => delete next[k]); return { dirty: next }; }),
  markAllDirty: () => set((s) => { const dirty = { ...s.dirty }; SYNC_TABLES.forEach((table) => (s[table] as Array<{ id: string }>).forEach((r) => { dirty[syncKey(table, r.id)] = 1; })); return { dirty }; }),
  setSync: (patch) => set((s) => ({ sync: { ...s.sync, ...patch } })),
  switchWorkspace: (key, adoptCurrent = false) => set((s) => {
    if (!key) return s;
    if (key === s.workspaceKey && !adoptCurrent) return s;
    const current = snapshot(s);
    const guestToAdopt = s.workspaces[GUEST_WORKSPACE];
    const source = adoptCurrent && guestToAdopt ? guestToAdopt : current;
    const candidate = adoptCurrent ? { ...source, lastPulledAt: 0, lastSyncAt: 0 } : (s.workspaces[key] ?? blankWorkspace(s.settings.theme));
    const target = { ...candidate, goals: candidate.goals ?? [], timer: candidate.timer ?? defaultTimer() };
    return { ...target, workspaceKey: key, workspaces: { ...s.workspaces, [s.workspaceKey]: current }, sync: { ...s.sync, lastPulledAt: target.lastPulledAt, lastSyncAt: target.lastSyncAt, lastError: '' } };
  }),

  importData: (raw, mode = 'replace') => {
    try {
      const data = JSON.parse(raw) as Partial<State>;
      if (!data || typeof data !== 'object') return false;
      const now = Date.now();
      const stamp = <T,>(arr: unknown, offset = 0) => (Array.isArray(arr) ? arr : []).map((r: unknown, i) => ({ ...(r as object), updatedAt: (r as { updatedAt?: number }).updatedAt ?? now + offset + i })) as T[];
      const incoming = {
        events: stamp<CalEvent>(data.events),
        todos: stamp<Todo>(data.todos, 1000).map((t) => ({ ...t, priority: t.priority ?? 3 })),
        lists: Array.isArray(data.lists) && data.lists.length ? stamp<TodoList>(data.lists, 2000) : blankWorkspace().lists,
        notes: stamp<Note>(data.notes, 3000),
        sessions: stamp<PomodoroSession>(data.sessions, 4000),
        daily_tasks: stamp<DailyTask>(data.daily_tasks, 5000),
        goals: stamp<LongTermGoal>(data.goals, 6000).map((g, index) => ({ ...g, tasks: Array.isArray(g.tasks) ? g.tasks.map((task, taskIndex) => ({ ...task, order: Number.isFinite(task.order) ? task.order : taskIndex })) : [], order: Number.isFinite(g.order) ? g.order : index })),
      };
      // Key 永远留在本机，不随备份文件迁移
      const settings = { ...defaultSettings, ...(data.settings ?? {}), aiApiKey: get().settings.aiApiKey };
      const dirty: Record<string, 1> = {};
      const markAll = (table: SyncTable, rows: Array<{ id: string }>) => rows.forEach((r) => { dirty[syncKey(table, r.id)] = 1; });

      if (mode === 'merge') {
        // 合并：同一条记录按 updatedAt 取较新的一方，缺失的补上；
        // 本地有墓碑（待同步的删除）时跳过对应记录，避免刚删的内容被备份复活
        const current = get();
        const next: Record<string, unknown> = {};
        SYNC_TABLES.forEach((table) => {
          const existing = [...(current[table] as Array<{ id: string; updatedAt: number }>)];
          for (const row of incoming[table] as Array<{ id: string; updatedAt: number }>) {
            const tomb = current.tombstones.find((t) => t.table === table && t.id === row.id);
            if (tomb && tomb.updatedAt >= row.updatedAt) continue;
            const idx = existing.findIndex((r) => r.id === row.id);
            if (idx === -1) existing.push(row);
            else if ((existing[idx].updatedAt ?? 0) < row.updatedAt) existing[idx] = row;
          }
          next[table] = existing;
          markAll(table, existing);
        });
        set({ ...next, settings: { ...current.settings, ...settings, theme: current.settings.theme }, dirty } as Partial<State>);
        return true;
      }

      const next = { ...incoming, settings };
      SYNC_TABLES.forEach((table) => markAll(table, next[table] as Array<{ id: string }>));
      set({ ...next, dirty, tombstones: [] });
      return true;
    } catch { return false; }
  },
  resetAll: () => set((s) => {
    const now = Date.now(); let tombstones = s.tombstones;
    SYNC_TABLES.forEach((table) => {
      const rows = (s[table] as Array<{ id: string }>).filter((r) => !(table === 'lists' && r.id === DEFAULT_LIST_ID));
      tombstones = rows.reduce((a, r) => pushTombstone(a, tombstoneOf(table, r, now)), tombstones);
    });
    const blank = blankWorkspace(s.settings.theme);
    blank.lists = [{ id: DEFAULT_LIST_ID, name: '我的任务', updatedAt: now }];
    blank.dirty = { [syncKey('lists', DEFAULT_LIST_ID)]: 1 };
    return { ...blank, settings: { ...blank.settings, theme: s.settings.theme, aiEndpoint: s.settings.aiEndpoint, aiModel: s.settings.aiModel, aiApiKey: s.settings.aiApiKey }, tombstones, sync: { ...s.sync } };
  }),
}), {
  name: 'work-assistant-v1', version: 7,
  migrate: (persisted) => {
    const s = (persisted ?? {}) as Partial<State>, now = Date.now();
    const stamp = <T extends { updatedAt?: number }>(arr: T[] | undefined, offset = 0) => (Array.isArray(arr) ? arr : []).map((r, i) => ({ ...r, updatedAt: r.updatedAt ?? now + offset + i }));
    const events = stamp(s.events) as CalEvent[], todos = stamp(s.todos, 1000).map((t) => ({ ...t, priority: t.priority ?? 3 })) as Todo[], lists = stamp(s.lists, 2000) as TodoList[], notes = stamp(s.notes, 3000) as Note[], sessions = stamp(s.sessions, 4000) as PomodoroSession[], daily_tasks = stamp(s.daily_tasks, 5000).map((t) => ({ ...t, daysOfWeek: t.daysOfWeek ?? [0,1,2,3,4,5,6], completedDates: t.completedDates ?? [], enabled: t.enabled ?? true })) as DailyTask[], goals = stamp(s.goals, 6000).map((g, index) => ({ ...g, tasks: Array.isArray(g.tasks) ? g.tasks.map((task, taskIndex) => ({ ...task, order: Number.isFinite(task.order) ? task.order : taskIndex })) : [], order: Number.isFinite((g as LongTermGoal).order) ? (g as LongTermGoal).order : index })) as LongTermGoal[];
    const dirty: Record<string, 1> = { ...(s.dirty ?? {}) }, collections: Record<SyncTable, Array<{ id: string }>> = { events, todos, lists, notes, sessions, daily_tasks, goals };
    SYNC_TABLES.forEach((table) => collections[table].forEach((r) => { dirty[syncKey(table, r.id)] = 1; }));
    const workspaces = Object.fromEntries(Object.entries(s.workspaces ?? {}).map(([key, workspace]) => [key, { ...workspace, goals: (workspace.goals ?? []).map((goal, index) => ({ ...goal, order: Number.isFinite(goal.order) ? goal.order : index, tasks: (goal.tasks ?? []).map((task, taskIndex) => ({ ...task, order: Number.isFinite(task.order) ? task.order : taskIndex })) })), timer: workspace.timer ?? defaultTimer() }]));
    return { ...s, events, todos, lists: lists.length ? lists : blankWorkspace().lists, notes, sessions, daily_tasks, goals, timer: s.timer ?? defaultTimer(), dirty, tombstones: Array.isArray(s.tombstones) ? s.tombstones : [], settings: { ...defaultSettings, ...(s.settings ?? {}) }, workspaceKey: s.workspaceKey ?? GUEST_WORKSPACE, workspaces, sync: { ...defaultSync, ...(s.sync ?? {}) } } as State;
  },
}));
