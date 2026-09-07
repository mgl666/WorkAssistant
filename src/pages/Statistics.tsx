import { useMemo, useState } from 'react';
import { BarChart3, CheckCircle2, Clock3, Flame, Repeat2 } from 'lucide-react';
import { formatMinutes, startOfWeek, todayKey, toKey } from '@/lib/date';
import { dateKeysBetween, PERIODIC_FREQUENCY_LABELS, periodicFrequencyOf, periodicTaskDueOn } from '@/lib/periodic';
import { cn } from '@/lib/utils';
import { useStore, type PomodoroSession } from '@/store/useStore';
import { Empty, SectionTitle } from '@/components/ui';

type StatisticsRange = 'week' | 'month' | 'year' | 'custom';

const RANGE_LABELS: Record<StatisticsRange, string> = {
  week: '本周',
  month: '本月',
  year: '本年',
  custom: '自定义',
};

export default function Statistics() {
  const tasks = useStore((state) => state.daily_tasks);
  const sessions = useStore((state) => state.sessions);
  const tombstones = useStore((state) => state.tombstones);
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
    return customStart <= customEnd ? { start: customStart, end: customEnd } : { start: customEnd, end: customStart };
  }, [range, weekStart, monthStart, yearStart, today, customStart, customEnd]);

  const keys = useMemo(() => dateKeysBetween(start, end), [start, end]);
  const rangeLabel = RANGE_LABELS[range];
  const activeSessions = useMemo(() => {
    const deletedIds = new Set(tombstones.filter((item) => item.table === 'sessions').map((item) => item.id));
    return sessions.filter((session) => !deletedIds.has(session.id) && (session as PomodoroSession & { deleted?: boolean }).deleted !== true);
  }, [sessions, tombstones]);
  const focusSessions = useMemo(() => activeSessions.filter((session) => {
    const key = toKey(new Date(session.endedAt));
    return session.mode === 'focus' && key >= start && key <= end;
  }), [activeSessions, start, end]);

  const taskRows = useMemo(() => [...tasks].sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt)).map((task) => {
    const expectedKeys = keys.filter((key) => periodicTaskDueOn(task, key));
    const done = expectedKeys.filter((key) => task.completedDates.includes(key)).length;
    return { task, expected: expectedKeys.length, done, rate: expectedKeys.length ? Math.round(done / expectedKeys.length * 100) : 0 };
  }).filter((row) => row.expected > 0 || row.done > 0), [tasks, keys]);
  const expectedTotal = taskRows.reduce((sum, row) => sum + row.expected, 0);
  const completedTotal = taskRows.reduce((sum, row) => sum + row.done, 0);
  const completionRate = expectedTotal ? Math.round(completedTotal / expectedTotal * 100) : 0;
  const allDoneDays = keys.filter((key) => {
    const due = tasks.filter((task) => periodicTaskDueOn(task, key));
    return due.length > 0 && due.every((task) => task.completedDates.includes(key));
  }).length;

  const focusMinutes = focusSessions.reduce((sum, session) => sum + session.minutes, 0);
  const focusDays = new Set(focusSessions.map((session) => toKey(new Date(session.endedAt)))).size;
  const averageFocus = focusSessions.length ? Math.round(focusMinutes / focusSessions.length) : 0;
  const contentRows = useMemo(() => {
    const groups = new Map<string, { count: number; minutes: number }>();
    for (const session of focusSessions) {
      const name = session.task.trim() || '未填写内容';
      const current = groups.get(name) ?? { count: 0, minutes: 0 };
      groups.set(name, { count: current.count + 1, minutes: current.minutes + session.minutes });
    }
    return [...groups.entries()].map(([name, value]) => ({ name, ...value })).sort((a, b) => b.minutes - a.minutes || b.count - a.count);
  }, [focusSessions]);

  const trendRows = useMemo(() => keys.map((key) => {
    const due = tasks.filter((task) => periodicTaskDueOn(task, key));
    const done = due.filter((task) => task.completedDates.includes(key)).length;
    const daySessions = focusSessions.filter((session) => toKey(new Date(session.endedAt)) === key);
    return { key, expected: due.length, done, focusCount: daySessions.length, focusMinutes: daySessions.reduce((sum, session) => sum + session.minutes, 0) };
  }).reverse(), [keys, tasks, focusSessions]);

  const rangeOptions: Array<{ value: StatisticsRange; label: string }> = [
    { value: 'week', label: '本周' },
    { value: 'month', label: '本月' },
    { value: 'year', label: '本年' },
    { value: 'custom', label: '自定义' },
  ];

  return <div className="space-y-4">
    <section className="card flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
      <div><h2 className="flex items-center gap-2 font-semibold"><BarChart3 size={18} className="text-indigo-600" />数据统计</h2><p className="mt-0.5 text-xs text-slate-400">周期任务与番茄专注的多维度汇总，已删除记录不会参与统计。</p></div>
      <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
        {rangeOptions.map((option) => <button key={option.value} onClick={() => setRange(option.value)} aria-pressed={range === option.value} className={cn('rounded-lg px-3 py-1.5 text-sm transition', range === option.value ? 'bg-white font-medium text-indigo-600 shadow-sm dark:bg-slate-950 dark:text-indigo-400' : 'text-slate-500')}>{option.label}</button>)}
      </div>
      {range === 'custom' && <div className="flex flex-wrap items-center gap-2 text-sm"><input type="date" className="input w-auto" max={today} value={customStart} onChange={(event) => setCustomStart(event.target.value || today)} aria-label="统计开始日期" /><span className="text-slate-400">至</span><input type="date" className="input w-auto" max={today} value={customEnd} onChange={(event) => setCustomEnd(event.target.value || today)} aria-label="统计结束日期" /></div>}
    </section>

    <p className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-xs leading-5 text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300">
      当前统计：{rangeLabel}（{start} 至 {end}）。周期任务只从各自的开始日期起计入应完成次数，因此最近新建的任务在本周、本月和本年中可能显示相同结果。
    </p>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric icon={CheckCircle2} label={`${rangeLabel}周期任务完成率`} value={`${completionRate}%`} detail={`${completedTotal}/${expectedTotal} 次 · ${start.slice(5)}–${end.slice(5)}`} color="emerald" />
      <Metric icon={Repeat2} label="全部完成天数" value={`${allDoneDays} 天`} detail={`统计 ${keys.length} 天`} color="sky" />
      <Metric icon={Flame} label="专注次数" value={`${focusSessions.length} 次`} detail={`${focusDays} 个专注日`} color="amber" />
      <Metric icon={Clock3} label="专注总时长" value={formatMinutes(focusMinutes)} detail={`平均 ${formatMinutes(averageFocus)}/次`} color="indigo" />
    </section>

    <div className="grid items-stretch gap-4 xl:grid-cols-2">
      <section className="card min-h-[360px] p-4"><SectionTitle extra={<span className="text-xs font-normal text-slate-400">{rangeLabel} · {start} 至 {end}</span>}>周期任务完成明细</SectionTitle>{taskRows.length === 0 ? <Empty icon={Repeat2} text="所选时间内没有周期任务" /> : <div className="max-h-[420px] overflow-auto"><table className="w-full min-w-[500px] text-sm"><thead className="sticky top-0 bg-white text-xs text-slate-400 dark:bg-slate-900"><tr><th className="py-2 text-left font-medium">任务</th><th className="px-2 text-left font-medium">周期</th><th className="px-2 text-right font-medium">完成</th><th className="py-2 text-right font-medium">完成率</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{taskRows.map((row) => <tr key={row.task.id}><td className="max-w-56 truncate py-2.5 font-medium">{row.task.title}</td><td className="px-2 text-xs text-slate-400">{PERIODIC_FREQUENCY_LABELS[periodicFrequencyOf(row.task)]}</td><td className="px-2 text-right tabular-nums">{row.done}/{row.expected}</td><td className="py-2 text-right"><Rate value={row.rate} /></td></tr>)}</tbody></table></div>}</section>
      <section className="card min-h-[360px] p-4"><SectionTitle>专注内容排行</SectionTitle>{contentRows.length === 0 ? <Empty icon={Flame} text="所选时间内没有专注记录" /> : <div className="max-h-[420px] overflow-auto"><table className="w-full min-w-[440px] text-sm"><thead className="sticky top-0 bg-white text-xs text-slate-400 dark:bg-slate-900"><tr><th className="py-2 text-left font-medium">本轮内容或备注</th><th className="px-2 text-right font-medium">次数</th><th className="py-2 text-right font-medium">时长</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{contentRows.map((row) => <tr key={row.name}><td className="max-w-72 truncate py-2.5 font-medium">{row.name}</td><td className="px-2 text-right tabular-nums">{row.count}</td><td className="py-2 text-right tabular-nums">{formatMinutes(row.minutes)}</td></tr>)}</tbody></table></div>}</section>
    </div>

    <section className="card p-4"><SectionTitle>每日趋势明细</SectionTitle><div className="max-h-[460px] overflow-auto rounded-xl border border-slate-200 dark:border-slate-800"><table className="w-full min-w-[620px] text-sm"><thead className="sticky top-0 bg-slate-50 text-xs text-slate-400 dark:bg-slate-800"><tr><th className="px-4 py-2.5 text-left font-medium">日期</th><th className="px-4 text-right font-medium">周期任务</th><th className="px-4 text-right font-medium">完成率</th><th className="px-4 text-right font-medium">专注次数</th><th className="px-4 text-right font-medium">专注时长</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{trendRows.map((row) => <tr key={row.key}><td className="px-4 py-2.5 font-medium">{row.key}</td><td className="px-4 text-right tabular-nums">{row.done}/{row.expected}</td><td className="px-4 text-right tabular-nums">{row.expected ? Math.round(row.done / row.expected * 100) : 0}%</td><td className="px-4 text-right tabular-nums">{row.focusCount}</td><td className="px-4 text-right tabular-nums">{formatMinutes(row.focusMinutes)}</td></tr>)}</tbody></table></div></section>
  </div>;
}

const COLOR_CLASSES = {
  emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
  sky: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400',
  indigo: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400',
};

function Metric({ icon: Icon, label, value, detail, color }: { icon: typeof Flame; label: string; value: string; detail: string; color: keyof typeof COLOR_CLASSES }) {
  return <div className="card flex items-center gap-3 p-4"><span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', COLOR_CLASSES[color])}><Icon size={21} /></span><span className="min-w-0"><span className="block text-xs text-slate-500">{label}</span><span className="block truncate text-xl font-semibold">{value}</span><span className="block text-xs text-slate-400">{detail}</span></span></div>;
}

function Rate({ value }: { value: number }) {
  return <span className="inline-flex w-24 items-center gap-2"><span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"><span className="block h-full rounded-full bg-emerald-500" style={{ width: `${value}%` }} /></span><span className="w-8 text-right text-xs tabular-nums">{value}%</span></span>;
}
