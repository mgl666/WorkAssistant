import { useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, ClipboardList, NotebookPen, Timer } from 'lucide-react';
import { cn } from '@/lib/utils';
import { addDays, formatDateCN, startOfWeek, toKey, todayKey } from '@/lib/date';
import { useStore } from '@/store/useStore';
import { expandEventOccurrences } from '@/lib/recurrence';
import { Empty, SectionTitle, Stat } from '@/components/ui';
import { useNavigate } from 'react-router-dom';

type Period = 'day' | 'week' | 'month' | 'year';
const PERIODS: Array<{ key: Period; label: string }> = [{ key: 'day', label: '本日' }, { key: 'week', label: '本周' }, { key: 'month', label: '本月' }, { key: 'year', label: '本年' }];

export default function Dashboard() {
  const store = useStore();
  const navigate = useNavigate();
  const [period, setPeriod] = useState<Period>('day');
  const today = todayKey();
  const range = useMemo(() => {
    const now = new Date();
    if (period === 'week') { const start = startOfWeek(now); return { start: toKey(start), end: toKey(addDays(start, 6)), label: '本周' }; }
    if (period === 'month') { const start = new Date(now.getFullYear(), now.getMonth(), 1), end = new Date(now.getFullYear(), now.getMonth() + 1, 0); return { start: toKey(start), end: toKey(end), label: '本月' }; }
    if (period === 'year') { return { start: `${now.getFullYear()}-01-01`, end: `${now.getFullYear()}-12-31`, label: '本年' }; }
    return { start: today, end: today, label: '本日' };
  }, [period, today]);
  const inRange = (key: string) => key >= range.start && key <= range.end;
  const events = useMemo(() => expandEventOccurrences(store.events, range.start, range.end).sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? ''))), [store.events, range]);
  const todos = useMemo(() => store.todos.filter((t) => t.due && inRange(t.due)), [store.todos, range]);
  const focus = useMemo(() => store.sessions.filter((s) => s.mode === 'focus' && inRange(toKey(new Date(s.endedAt)))), [store.sessions, range]);
  const notes = useMemo(() => store.notes.filter((n) => inRange(toKey(new Date(n.updatedAt)))).sort((a, b) => b.updatedAt - a.updatedAt), [store.notes, range]);
  const minutes = focus.reduce((sum, s) => sum + s.minutes, 0), done = todos.filter((t) => t.done).length;

  return <div className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="text-xl font-semibold">工作概览</h2><p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{formatDateCN(today)} · 集中查看{range.label}进展</p></div>
      <div className="grid w-full grid-cols-4 rounded-xl bg-slate-100 p-1 sm:w-auto dark:bg-slate-800">{PERIODS.map((p) => <button key={p.key} onClick={() => setPeriod(p.key)} aria-pressed={period === p.key} className={cn('rounded-lg px-2 py-1.5 text-sm transition sm:px-4', period === p.key ? 'bg-white font-medium text-indigo-700 shadow-sm dark:bg-slate-950 dark:text-indigo-300' : 'text-slate-500')}>{p.label}</button>)}</div>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Stat icon={CheckCircle2} tone="emerald" label={`${range.label}待办`} value={`${done} / ${todos.length}`} hint={`${todos.length - done} 项未完成`} />
      <Stat icon={Timer} tone="indigo" label={`${range.label}番茄`} value={focus.length} hint={`专注 ${minutes} 分钟`} />
      <Stat icon={CalendarDays} tone="sky" label={`${range.label}日程`} value={events.length} hint={events[0]?.title ?? '暂无安排'} />
      <Stat icon={NotebookPen} tone="amber" label={`${range.label}备忘录`} value={notes.length} hint="按更新时间统计" />
    </div>
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="card flex h-[300px] flex-col overflow-hidden p-4 sm:h-[340px]"><SectionTitle>{range.label}日程</SectionTitle><div className="min-h-0 flex-1 overflow-y-auto pr-1">{events.length === 0 ? <Empty icon={CalendarDays} text="该时段没有日程" action={<button className="btn-primary mt-2" onClick={() => navigate('/calendar')}>添加日程</button>} /> : <ul className="space-y-2">{events.map((e) => <li key={`${e.id}:${e.date}`} className="flex gap-3 text-sm"><span className="w-24 shrink-0 font-mono text-xs text-slate-400">{e.date.slice(5)} {e.time ?? '全天'}</span><span className={cn('truncate', e.done && 'text-slate-400 line-through')}>{e.title}</span></li>)}</ul>}</div></div>
      <div className="card flex h-[300px] flex-col overflow-hidden p-4 sm:h-[340px]"><SectionTitle>{range.label}待办</SectionTitle><div className="min-h-0 flex-1 overflow-y-auto pr-1">{todos.length === 0 ? <Empty icon={ClipboardList} text="该时段没有待办" action={<button className="btn-primary mt-2" onClick={() => navigate('/todos')}>添加待办</button>} /> : <ul className="space-y-1.5">{todos.sort((a, b) => a.due.localeCompare(b.due)).map((t) => <li key={t.id} className="flex items-center gap-2"><input type="checkbox" aria-label={`${t.done ? '取消完成' : '完成'}任务 ${t.title}`} checked={t.done} onChange={() => store.toggleTodo(t.id)} className="h-4 w-4 accent-indigo-600" /><span className={cn('min-w-0 flex-1 truncate text-sm', t.done && 'text-slate-400 line-through')}>{t.title}</span><span className="shrink-0 text-xs text-slate-400">{t.due.slice(5)}{t.dueTime ? ` ${t.dueTime}` : ''}</span><span className="chip shrink-0 bg-slate-100 text-[10px] text-slate-500 dark:bg-slate-800">P{t.priority}</span></li>)}</ul>}</div></div>
    </div>
    <div className="card h-[230px] overflow-hidden p-4"><SectionTitle>最近更新的备忘录</SectionTitle><div className="h-[165px] overflow-y-auto">{notes.length === 0 ? <Empty icon={NotebookPen} text="该时段没有更新备忘录" action={<button className="btn-primary mt-2" onClick={() => navigate('/notes')}>新建备忘录</button>} /> : <ul className="grid gap-2 sm:grid-cols-3">{notes.map((n) => <li key={n.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"><div className="truncate text-sm font-medium">{n.title.trim() || n.content.slice(0, 18) || '无标题备忘录'}</div><div className="mt-1 line-clamp-2 text-xs text-slate-400">{n.content.slice(0, 70) || '空白内容'}</div></li>)}</ul>}</div></div>
  </div>;
}
