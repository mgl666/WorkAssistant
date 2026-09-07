import { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Coffee,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  Timer as TimerIcon,
  Trash2,
} from 'lucide-react';
import { cn, prepareTimerSound, requestNotifyPermission } from '@/lib/utils';
import { stopGlobalTimerAlarm } from '@/components/PomodoroRuntime';
import { formatClock, formatCountdown, formatMinutes, startOfWeek, todayKey, toKey } from '@/lib/date';
import { useStore, type PomodoroMode, type PomodoroSession, type Settings } from '@/store/useStore';
import { useDeletable } from '@/hooks/useDeletable';
import { SectionTitle } from '@/components/ui';

const MODE_META: Record<PomodoroMode, { label: string; ring: string; text: string }> = {
  focus: { label: '专注', ring: 'stroke-indigo-600', text: 'text-indigo-600 dark:text-indigo-400' },
  short: { label: '短休息', ring: 'stroke-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
  long: { label: '长休息', ring: 'stroke-sky-500', text: 'text-sky-600 dark:text-sky-400' },
};

const R = 88;
const C = 2 * Math.PI * R;
type StatisticsRange = 'week' | 'month' | 'year' | 'custom';

export default function Pomodoro() {
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const sessions = useStore((s) => s.sessions);
  const tombstones = useStore((s) => s.tombstones);
  const clearSessions = useStore((s) => s.clearSessions);
  const todos = useStore((s) => s.todos);
  const timer = useStore((s) => s.timer);
  const updateTimer = useStore((s) => s.updateTimer);
  const deletable = useDeletable();

  const durations = useMemo(
    () => ({ focus: settings.focusMin, short: settings.shortMin, long: settings.longMin }),
    [settings.focusMin, settings.shortMin, settings.longMin],
  );

  const { mode, endAt, round, task } = timer;
  const longBreakEnabled = settings.longBreakEnabled !== false;
  const availableModes: PomodoroMode[] = longBreakEnabled ? ['focus', 'short', 'long'] : ['focus', 'short'];
  const [remaining, setRemaining] = useState(() => endAt === null ? timer.remaining : Math.max(0, (endAt - Date.now()) / 1000));

  const running = endAt !== null;
  const total = Math.max(1, durations[mode] * 60);
  const progress = Math.min(1, Math.max(0, 1 - remaining / total));

  /* 倒计时：基于结束时间戳，切到后台再回来依然准确 */
  useEffect(() => {
    if (endAt === null) return;
    setRemaining(Math.max(0, (endAt - Date.now()) / 1000));
    const id = window.setInterval(() => {
      setRemaining(Math.max(0, (endAt - Date.now()) / 1000));
    }, 250);
    return () => window.clearInterval(id);
  }, [endAt]);

  /* 全局运行器完成阶段后，把页面显示同步到下一阶段的持久化时长。 */
  useEffect(() => {
    if (endAt === null) setRemaining(timer.remaining);
  }, [endAt, timer.remaining]);

  /* 标签页标题显示剩余时间 */
  useEffect(() => {
    document.title = running ? `${formatCountdown(remaining)} · ${MODE_META[mode].label}` : '工作助手 · Work Assistant';
    return () => {
      document.title = '工作助手 · Work Assistant';
    };
  }, [running, remaining, mode]);

  const stopAlarm = () => {
    stopGlobalTimerAlarm();
  };

  const switchMode = (next: PomodoroMode) => {
    stopAlarm();
    const nextSec = durations[next] * 60;
    setRemaining(nextSec);
    updateTimer({ mode: next, endAt: null, completedEndAt: undefined, remaining: nextSec });
  };

  const start = () => {
    stopAlarm();
    requestNotifyPermission();
    if (settings.sound) prepareTimerSound();
    const nextRemaining = remaining <= 0 ? durations[mode] * 60 : remaining;
    setRemaining(nextRemaining);
    updateTimer({ remaining: nextRemaining, completedEndAt: undefined, endAt: Date.now() + Math.max(nextRemaining, 0.5) * 1000 });
  };

  const pause = () => updateTimer({ endAt: null, remaining });

  const reset = () => {
    stopAlarm();
    const nextSec = durations[mode] * 60;
    setRemaining(nextSec);
    updateTimer({ endAt: null, completedEndAt: undefined, remaining: nextSec });
  };

  const skip = () => {
    const next: PomodoroMode = mode === 'focus' ? 'short' : 'focus';
    switchMode(next);
  };

  const changeDuration = (key: 'focusMin' | 'shortMin' | 'longMin', value: number) => {
    const v = Math.min(180, Math.max(1, value || 1));
    updateSettings({ [key]: v } as Partial<Settings>);
    const m: PomodoroMode = key === 'focusMin' ? 'focus' : key === 'shortMin' ? 'short' : 'long';
    if (m === mode && !running) { setRemaining(v * 60); updateTimer({ remaining: v * 60 }); }
  };

  // 所有统计只基于当前仍存在的记录；待同步删除和旧备份中的 deleted 记录都不参与。
  const activeSessions = useMemo(() => {
    const deletedIds = new Set(tombstones.filter((item) => item.table === 'sessions').map((item) => item.id));
    return sessions.filter((session) => !deletedIds.has(session.id) && (session as PomodoroSession & { deleted?: boolean }).deleted !== true);
  }, [sessions, tombstones]);
  const focusSessions = useMemo(() => activeSessions.filter((session) => session.mode === 'focus'), [activeSessions]);
  const today = todayKey();
  const todaySessions = useMemo(
    () =>
      activeSessions
        .filter((s) => {
          const d = new Date(s.endedAt);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          return key === today;
        })
        .sort((a, b) => b.endedAt - a.endedAt),
    [activeSessions, today],
  );

  const openTodos = todos.filter((t) => !t.done).slice(0, 5);

  return (
    <div className="grid items-stretch gap-3 sm:gap-4 lg:grid-cols-5">
      {/* -------------------------------- 计时器 ------------------------------- */}
      <div className="h-full lg:col-span-3">
        <div className="card flex h-full flex-col items-center p-4 sm:p-6">
          <div className={cn('mb-5 grid w-full max-w-sm gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800', longBreakEnabled ? 'grid-cols-3' : 'grid-cols-2')}>
            {availableModes.map((m) => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                className={cn(
                  'rounded-lg px-2 py-1.5 text-sm font-medium transition sm:px-4',
                  mode === m
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white'
                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400',
                )}
              >
                {MODE_META[m].label}
              </button>
            ))}
          </div>

          <div className="relative">
            <svg viewBox="0 0 200 200" className="h-64 w-64 -rotate-90 sm:h-72 sm:w-72">
              <circle
                cx="100"
                cy="100"
                r={R}
                fill="none"
                strokeWidth="10"
                className="stroke-slate-200 dark:stroke-slate-800"
              />
              <circle
                cx="100"
                cy="100"
                r={R}
                fill="none"
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={C * (1 - progress)}
                className={cn(MODE_META[mode].ring, 'transition-[stroke-dashoffset] duration-300')}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="font-mono text-4xl font-semibold tabular-nums sm:text-5xl">
                {formatCountdown(remaining)}
              </div>
              <div className={cn('mt-1 text-sm', MODE_META[mode].text)}>
                {MODE_META[mode].label}
                {task.trim() && <span className="ml-1 text-slate-400">· {task.trim()}</span>}
              </div>
              <div className="mt-2 text-xs text-slate-400">{longBreakEnabled
                ? `距离长休息 ${round % Math.max(1, settings.longEvery)} / ${settings.longEvery}`
                : `累计专注 ${focusSessions.length} 次`}</div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {running ? (
              <button className="btn-primary px-6 py-2" onClick={pause}>
                <Pause size={18} />
                暂停
              </button>
            ) : (
              <button className="btn-primary px-6 py-2" onClick={start}>
                <Play size={18} />
                {remaining < durations[mode] * 60 ? '继续' : '开始'}
              </button>
            )}
            <button className="btn-outline py-2" onClick={reset} title="重置本段">
              <RotateCcw size={16} />
              重置
            </button>
            <button className="btn-outline py-2" onClick={skip} title="跳到下一段">
              <SkipForward size={16} />
              跳过
            </button>
          </div>

          <div className="mt-6 w-full space-y-2">
            <div className="flex items-center gap-2">
              <input
                className="input"
                placeholder="这一轮在做什么？（可选，会记入统计与周报）"
                aria-label="本轮专注任务"
                value={task}
                onChange={(e) => updateTimer({ task: e.target.value })}
              />
            </div>
            {openTodos.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-slate-400">快速选择：</span>
                {openTodos.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => updateTimer({ task: t.title })}
                    className={cn(
                      'chip border border-slate-200 dark:border-slate-700',
                      task === t.title
                        ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300'
                        : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800',
                    )}
                  >
                    {t.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* -------------------------------- 侧栏 -------------------------------- */}
      <div className="flex flex-col gap-4 lg:col-span-2 lg:h-full">
        <div className="card flex min-h-[140px] flex-1 flex-col p-4">
          <SectionTitle
            extra={
              todaySessions.length > 0 && (
                <button
                  className="btn-danger px-1.5 py-0.5 text-xs"
                  onClick={() => deletable(`已清除今日 ${todaySessions.length} 条记录`, () => clearSessions(today))}
                  title="只清除今天的番茄记录，历史数据不受影响，可在提示里撤销"
                >
                  清除今日记录
                </button>
              )
            }
          >
            今日记录
          </SectionTitle>
          {todaySessions.length === 0 ? (
            <p className="flex min-h-0 flex-1 flex-col items-center justify-center py-4 text-center text-sm text-slate-400">
              <TimerIcon size={22} className="mb-1 text-slate-300 dark:text-slate-600" />
              <span>还没有记录，开始一个番茄吧</span>
            </p>
          ) : (
            <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto">
              {todaySessions.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/60"
                >
                  <span
                    className={cn(
                      'h-2 w-2 shrink-0 rounded-full',
                      s.mode === 'focus' ? 'bg-indigo-500' : 'bg-emerald-500',
                    )}
                  />
                  <span className="font-mono text-xs text-slate-400">{formatClock(s.endedAt)}</span>
                  <span className="truncate">{s.task || MODE_META[s.mode].label}</span>
                  <span className="ml-auto shrink-0 text-xs text-slate-400">{s.minutes}m</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card space-y-3 p-4">
          <SectionTitle>时长设置（分钟）</SectionTitle>
          <label className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/60">
            <span>启用长休息</span>
            <input
              type="checkbox"
              className="h-4 w-4 accent-indigo-600"
              checked={longBreakEnabled}
              onChange={(e) => {
                const enabled = e.target.checked;
                updateSettings({ longBreakEnabled: enabled });
                if (!enabled && mode === 'long') switchMode('short');
              }}
            />
          </label>
          <div className={cn('grid gap-2', longBreakEnabled ? 'grid-cols-3' : 'grid-cols-2')}>
            <label className="block">
              <span className="mb-1 block text-xs text-slate-500">专注</span>
              <input
                type="number"
                min={1}
                max={180}
                className="input"
                value={settings.focusMin}
                onChange={(e) => changeDuration('focusMin', Number(e.target.value))}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-slate-500">短休息</span>
              <input
                type="number"
                min={1}
                max={180}
                className="input"
                value={settings.shortMin}
                onChange={(e) => changeDuration('shortMin', Number(e.target.value))}
              />
            </label>
            {longBreakEnabled && <label className="block">
              <span className="mb-1 block text-xs text-slate-500">长休息</span>
              <input
                type="number"
                min={1}
                max={180}
                className="input"
                value={settings.longMin}
                onChange={(e) => changeDuration('longMin', Number(e.target.value))}
              />
            </label>}
          </div>
          {longBreakEnabled && <label className="flex items-center justify-between text-sm">
            <span>每几个专注后长休息</span>
            <input
              type="number"
              min={2}
              max={12}
              className="input w-20"
              value={settings.longEvery}
              onChange={(e) => updateSettings({ longEvery: Math.min(12, Math.max(2, Number(e.target.value) || 4)) })}
            />
          </label>}
          <label className="flex items-center justify-between text-sm">
            <span>自动开始下一段</span>
            <input
              type="checkbox"
              className="h-4 w-4 accent-indigo-600"
              checked={settings.autoNext}
              onChange={(e) => updateSettings({ autoNext: e.target.checked })}
            />
          </label>
          <label className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5">
              <Coffee size={14} />
              结束提示音
            </span>
            <input
              type="checkbox"
              className="h-4 w-4 accent-indigo-600"
              checked={settings.sound}
              onChange={(e) => { updateSettings({ sound: e.target.checked }); if (!e.target.checked) stopAlarm(); }}
            />
          </label>
        </div>
      </div>

      <FocusStatistics sessions={focusSessions} />
      <SessionHistory sessions={activeSessions} />
    </div>
  );
}

function dateFromKey(key: string) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function nextDateKey(key: string) {
  const date = dateFromKey(key);
  date.setDate(date.getDate() + 1);
  return toKey(date);
}

function shiftDateKey(key: string, amount: number) {
  const date = dateFromKey(key);
  date.setDate(date.getDate() + amount);
  return toKey(date);
}

function FocusStatistics({ sessions }: { sessions: PomodoroSession[] }) {
  const today = todayKey();
  const now = new Date();
  const weekStart = toKey(startOfWeek(now));
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const yearStart = `${now.getFullYear()}-01-01`;
  const [range, setRange] = useState<StatisticsRange>('week');
  const [customStart, setCustomStart] = useState(weekStart);
  const [customEnd, setCustomEnd] = useState(today);

  const { start, end } = useMemo(() => {
    if (range === 'week') return { start: weekStart, end: today };
    if (range === 'month') return { start: monthStart, end: today };
    if (range === 'year') return { start: yearStart, end: today };
    return customStart <= customEnd
      ? { start: customStart, end: customEnd }
      : { start: customEnd, end: customStart };
  }, [range, weekStart, monthStart, yearStart, today, customStart, customEnd]);

  const selected = useMemo(() => sessions.filter((session) => {
    const key = toKey(new Date(session.endedAt));
    return key >= start && key <= end;
  }), [sessions, start, end]);

  const daySpan = Math.max(1, Math.round((dateFromKey(end).getTime() - dateFromKey(start).getTime()) / 86400000) + 1);
  const groupByMonth = range === 'year' || (range === 'custom' && daySpan > 90);
  const rows = useMemo(() => {
    const buckets = new Map<string, PomodoroSession[]>();
    for (const session of selected) {
      const dateKey = toKey(new Date(session.endedAt));
      const key = groupByMonth ? dateKey.slice(0, 7) : dateKey;
      buckets.set(key, [...(buckets.get(key) ?? []), session]);
    }

    const keys: string[] = [];
    if (groupByMonth) {
      let cursor = dateFromKey(`${start.slice(0, 7)}-01`);
      const last = dateFromKey(`${end.slice(0, 7)}-01`);
      while (cursor <= last) {
        keys.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
        cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      }
    } else {
      let cursor = start;
      while (cursor <= end) {
        keys.push(cursor);
        cursor = nextDateKey(cursor);
      }
    }

    return keys.map((key) => {
      const records = buckets.get(key) ?? [];
      const minutes = records.reduce((sum, session) => sum + session.minutes, 0);
      return { key, count: records.length, minutes, average: records.length ? Math.round(minutes / records.length) : 0 };
    });
  }, [selected, start, end, groupByMonth]);

  const totalMinutes = selected.reduce((sum, session) => sum + session.minutes, 0);
  const activeDays = new Set(selected.map((session) => toKey(new Date(session.endedAt)))).size;
  const rangeOptions: Array<{ value: StatisticsRange; label: string }> = [
    { value: 'week', label: '本周' },
    { value: 'month', label: '本月' },
    { value: 'year', label: '本年' },
    { value: 'custom', label: '自定义' },
  ];

  return (
    <section className="card min-w-0 p-4 sm:p-5 lg:col-span-5">
      <SectionTitle extra={<span className="text-xs font-normal text-slate-400">已删除记录不参与统计</span>}>专注统计表</SectionTitle>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
          {rangeOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => setRange(option.value)}
              className={cn('rounded-lg px-3 py-1.5 text-sm transition', range === option.value ? 'bg-white font-medium text-indigo-600 shadow-sm dark:bg-slate-950 dark:text-indigo-400' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400')}
            >
              {option.label}
            </button>
          ))}
        </div>
        {range === 'custom' && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <input type="date" className="input w-auto" max={today} value={customStart} onChange={(event) => setCustomStart(event.target.value || today)} aria-label="统计开始日期" />
            <span className="text-slate-400">至</span>
            <input type="date" className="input w-auto" max={today} value={customEnd} onChange={(event) => setCustomEnd(event.target.value || today)} aria-label="统计结束日期" />
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
        <div className="rounded-xl bg-indigo-50 p-3 text-center dark:bg-indigo-500/10">
          <div className="text-lg font-semibold text-indigo-700 dark:text-indigo-300 sm:text-xl">{selected.length}</div>
          <div className="text-xs text-slate-500">专注次数</div>
        </div>
        <div className="rounded-xl bg-slate-50 p-3 text-center dark:bg-slate-800/60">
          <div className="text-lg font-semibold sm:text-xl">{formatMinutes(totalMinutes)}</div>
          <div className="text-xs text-slate-500">专注时长</div>
        </div>
        <div className="rounded-xl bg-slate-50 p-3 text-center dark:bg-slate-800/60">
          <div className="text-lg font-semibold sm:text-xl">{activeDays}</div>
          <div className="text-xs text-slate-500">专注天数</div>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-800/70 dark:text-slate-400">
            <tr>
              <th className="px-4 py-2.5 font-medium">{groupByMonth ? '月份' : '日期'}</th>
              <th className="px-4 py-2.5 text-right font-medium">专注次数</th>
              <th className="px-4 py-2.5 text-right font-medium">专注时长</th>
              <th className="px-4 py-2.5 text-right font-medium">平均每次</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((row) => (
              <tr key={row.key} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                <td className="px-4 py-2.5 font-medium">{groupByMonth ? `${row.key.slice(0, 4)} 年 ${Number(row.key.slice(5))} 月` : row.key}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{row.count}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatMinutes(row.minutes)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">{row.count ? formatMinutes(row.average) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {groupByMonth && range === 'custom' && <p className="mt-2 text-xs text-slate-400">自定义时间超过 90 天，统计表将按月汇总。</p>}
    </section>
  );
}

function SessionHistory({ sessions }: { sessions: PomodoroSession[] }) {
  const today = todayKey();
  const [date, setDate] = useState(today);
  const removeSession = useStore((state) => state.removeSession);
  const deletable = useDeletable();
  const records = useMemo(() => sessions
    .filter((session) => toKey(new Date(session.endedAt)) === date)
    .sort((a, b) => b.endedAt - a.endedAt), [sessions, date]);
  const focusMinutes = records.filter((session) => session.mode === 'focus').reduce((sum, session) => sum + session.minutes, 0);

  return (
    <section className="card min-w-0 p-4 sm:p-5 lg:col-span-5">
      <SectionTitle extra={<span className="text-xs font-normal text-slate-400">{records.length} 条 · 专注 {formatMinutes(focusMinutes)}</span>}>历史记录</SectionTitle>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button className="btn-outline px-2" onClick={() => setDate((current) => shiftDateKey(current, -1))} aria-label="查看前一天"><ChevronLeft size={16} /></button>
        <input type="date" className="input w-auto" max={today} value={date} onChange={(event) => setDate(event.target.value || today)} aria-label="历史记录日期" />
        <button className="btn-outline px-2" disabled={date >= today} onClick={() => setDate((current) => shiftDateKey(current, 1))} aria-label="查看后一天"><ChevronRight size={16} /></button>
        {date !== today && <button className="btn-outline text-xs" onClick={() => setDate(today)}>回到今天</button>}
      </div>

      {records.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400 dark:border-slate-700">
          <TimerIcon size={22} className="mx-auto mb-1 text-slate-300 dark:text-slate-600" />
          这一天没有番茄记录
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {records.map((session) => (
            <SessionHistoryRow
              key={session.id}
              session={session}
              onDelete={() => deletable(`已删除 ${formatClock(session.endedAt)} 的${MODE_META[session.mode].label}记录`, () => removeSession(session.id))}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function SessionHistoryRow({ session, onDelete }: { session: PomodoroSession; onDelete: () => void }) {
  const updateSession = useStore((state) => state.updateSession);
  const [note, setNote] = useState(session.task);

  useEffect(() => setNote(session.task), [session.task]);

  const save = () => {
    const next = note.trim();
    if (next !== session.task) updateSession(session.id, next);
    if (next !== note) setNote(next);
  };

  return (
    <li className="grid items-center gap-2 p-3 sm:grid-cols-[88px_72px_64px_minmax(0,1fr)_auto]">
      <span className="font-mono text-xs text-slate-500">{formatClock(session.endedAt)}</span>
      <span className={cn('chip w-fit text-[11px]', session.mode === 'focus' ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300' : session.mode === 'short' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300')}>{MODE_META[session.mode].label}</span>
      <span className="text-xs tabular-nums text-slate-400">{session.minutes} 分钟</span>
      <textarea
        className="input min-h-10 resize-y py-2 text-sm"
        rows={1}
        placeholder="添加这一轮做了什么的备注"
        aria-label={`${formatClock(session.endedAt)} ${MODE_META[session.mode].label}记录备注`}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        onBlur={save}
      />
      <button className="btn-danger justify-self-end px-2" onClick={onDelete} title="删除这条记录" aria-label={`删除 ${formatClock(session.endedAt)} 的记录`}><Trash2 size={15} /></button>
    </li>
  );
}
