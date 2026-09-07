import { useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Flame,
  Pause,
  Play,
  Plus,
  Repeat2,
  Trash2,
} from 'lucide-react';
import { addDays, monthGrid, startOfWeek, toKey, todayKey } from '@/lib/date';
import { cn } from '@/lib/utils';
import { useStore } from '@/store/useStore';
import { useDeletable } from '@/hooks/useDeletable';
import { Empty, SectionTitle } from '@/components/ui';

const DAYS = ['日', '一', '二', '三', '四', '五', '六'];
const WEEK_HEADS = ['一', '二', '三', '四', '五', '六', '日'];
const PRESETS = [
  { label: '每天', days: [0, 1, 2, 3, 4, 5, 6] },
  { label: '工作日', days: [1, 2, 3, 4, 5] },
  { label: '周末', days: [0, 6] },
];

/** 未来日期使用预打卡状态，不与过去/今天的实际完成状态混用。 */
type DayStatus = 'none' | 'miss' | 'partial' | 'done' | 'future' | 'planned';

const STATUS_CLS: Record<DayStatus, string> = {
  none: 'text-slate-400 dark:text-slate-600',
  miss: 'bg-rose-50 text-rose-500 dark:bg-rose-500/10',
  partial: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
  done: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
  future: 'bg-slate-50 text-slate-400 dark:bg-slate-800/40',
  planned: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400',
};

export default function Daily() {
  const tasks = useStore((s) => s.daily_tasks);
  const addTask = useStore((s) => s.addDailyTask);
  const updateTask = useStore((s) => s.updateDailyTask);
  const removeTask = useStore((s) => s.removeDailyTask);
  const toggleDate = useStore((s) => s.toggleDailyTaskDate);
  const deletable = useDeletable();

  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const titleRef = useRef<HTMLInputElement>(null);
  const today = todayKey();
  /** 当前正在查看哪一天，支持回看历史并补打卡 */
  const [viewDate, setViewDate] = useState(today);
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const weekdayOf = (key: string) => new Date(`${key}T12:00:00`).getDay();
  const tasksDueOn = (key: string) => tasks.filter((t) => t.enabled && t.daysOfWeek.includes(weekdayOf(key)));
  const doneOf = (key: string) => tasksDueOn(key).filter((t) => t.completedDates.includes(key)).length;
  const statusOf = (key: string): DayStatus => {
    const due = tasksDueOn(key);
    if (due.length === 0) return 'none';
    const done = due.filter((t) => t.completedDates.includes(key)).length;
    if (key > today) return done > 0 ? 'planned' : 'future';
    return done === due.length ? 'done' : done > 0 ? 'partial' : 'miss';
  };

  /* ------------------------------- 统计 ------------------------------- */

  /** 连续完成天数：从今天往前数，全部完成的天才算；今天没做完不打断；没有安排的日子跳过 */
  const streak = useMemo(() => {
    let count = 0;
    for (let i = 0; i < 400; i++) {
      const key = toKey(addDays(new Date(), -i));
      const due = tasksDueOn(key);
      if (due.length === 0) continue;
      const done = due.filter((t) => t.completedDates.includes(key)).length;
      if (done === due.length) {
        count += 1;
        continue;
      }
      if (key === today) continue;
      break;
    }
    return count;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, today]);

  /** 本周（周一起）与本月完成率，未来日期不计入分母 */
  const rangeStats = useMemo(() => {
    const calc = (from: Date, days: number) => {
      let expected = 0;
      let done = 0;
      for (let i = 0; i < days; i++) {
        const key = toKey(addDays(from, i));
        if (key > today) break;
        const due = tasksDueOn(key);
        expected += due.length;
        done += due.filter((t) => t.completedDates.includes(key)).length;
      }
      return { expected, done, rate: expected ? Math.round((done / expected) * 100) : 0 };
    };
    return {
      week: calc(startOfWeek(new Date()), 7),
      month: calc(new Date(cursor.getFullYear(), cursor.getMonth(), 1), new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, today, cursor]);

  const grid = useMemo(() => monthGrid(cursor.getFullYear(), cursor.getMonth()), [cursor]);
  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  /* ------------------------------ 交互 ------------------------------ */

  const submit = () => {
    if (!title.trim() || !days.length) return;
    addTask({ title: title.trim(), note: note.trim(), daysOfWeek: [...days].sort() });
    setTitle('');
    setNote('');
  };

  const viewDue = tasksDueOn(viewDate);
  const viewDone = viewDue.filter((t) => t.completedDates.includes(viewDate)).length;
  const isToday = viewDate === today;
  const isFutureView = viewDate > today;

  return (
    <div className="space-y-4">
      {/* ------------------------------ 统计 ------------------------------ */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
            <Flame size={20} />
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">连续完成天数</div>
            <div className="text-xl font-semibold">{streak} 天</div>
          </div>
        </div>
        <div className="card flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400">
            <Repeat2 size={20} />
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">本周完成率</div>
            <div className="text-xl font-semibold">
              {rangeStats.week.rate}% <span className="text-xs font-normal text-slate-400">{rangeStats.week.done}/{rangeStats.week.expected}</span>
            </div>
          </div>
        </div>
        <div className="card flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
            <CheckCircle2 size={20} />
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">本月完成率</div>
            <div className="text-xl font-semibold">
              {rangeStats.month.rate}% <span className="text-xs font-normal text-slate-400">{rangeStats.month.done}/{rangeStats.month.expected}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ---------------------------- 打卡日历 ---------------------------- */}
      <div className="card p-3 sm:p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <SectionTitle>
            <span className="flex items-center gap-1.5">打卡日历 · {year} 年 {month + 1} 月</span>
          </SectionTitle>
          <div className="flex items-center gap-1">
            <button className="btn-ghost px-1.5" onClick={() => setCursor(new Date(year, month - 1, 1))} aria-label="上个月">
              <ChevronLeft size={18} />
            </button>
            <button className="btn-outline px-2 py-1 text-xs" onClick={() => { const d = new Date(); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)); setViewDate(today); }}>
              本月
            </button>
            <button className="btn-ghost px-1.5" onClick={() => setCursor(new Date(year, month + 1, 1))} aria-label="下个月">
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center">
          {WEEK_HEADS.map((w) => (
            <div key={w} className="pb-1 text-[11px] font-medium text-slate-400">周{w}</div>
          ))}
          {grid.map((d) => {
            const key = toKey(d);
            const inMonth = d.getMonth() === month;
            const status = statusOf(key);
            const isViewing = key === viewDate;
            const isFuture = key > today;
            return (
              <button
                key={key}
                onClick={() => setViewDate(key)}
                aria-label={`${key}，${status === 'done' ? '全部完成' : status === 'partial' ? '部分完成' : status === 'miss' ? '未完成' : status === 'planned' ? '已预打卡' : status === 'future' ? '待预打卡' : '无安排'}`}
                aria-pressed={isViewing}
                className={cn(
                  'flex h-11 flex-col items-center justify-center rounded-lg text-xs outline-none transition sm:h-14',
                  !inMonth && 'opacity-40',
                  STATUS_CLS[status],
                  isViewing && 'ring-2 ring-indigo-500 ring-offset-1 dark:ring-offset-slate-900',
                  !isViewing && 'hover:ring-1 hover:ring-slate-300 dark:hover:ring-slate-700',
                )}
              >
                <span className={cn('font-medium', isFuture && 'opacity-50')}>{d.getDate()}</span>
                <span className="mt-0.5 text-[9px] opacity-80">
                  {status === 'none' ? '·' : `${doneOf(key)}/${tasksDueOn(key).length}`}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-emerald-100 dark:bg-emerald-500/20" />全部完成</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-amber-100 dark:bg-amber-500/20" />部分完成</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-rose-100 dark:bg-rose-500/20" />未完成</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-sky-100 dark:bg-sky-500/20" />未来预打卡</span>
          <span>过去可补打卡，未来可预打卡</span>
        </div>
      </div>

      {/* --------------------------- 当天完成情况 --------------------------- */}
      <div className="card flex h-[300px] flex-col overflow-hidden p-3 sm:h-[330px] sm:p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="font-semibold">{isToday ? '今天的必做' : `${viewDate} 的必做`}</h2>
            <p className="text-xs text-slate-400">
              {isFutureView ? '已预打卡' : '已完成'} {viewDone}/{viewDue.length}
              {!isToday && <button className="ml-2 text-indigo-600 hover:underline dark:text-indigo-400" onClick={() => setViewDate(today)}>回到今天</button>}
            </p>
          </div>
          <span className="chip bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"><Repeat2 size={13} /> 周期任务</span>
        </div>
        {viewDue.length === 0 ? <Empty icon={Repeat2} text={isToday ? '今天没有周期任务' : '这一天没有安排周期任务'} action={<button className="btn-primary mt-2" onClick={() => titleRef.current?.focus()}><Plus size={15} />新增周期任务</button>} /> : (
          <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
            {viewDue.map((task) => {
              const done = task.completedDates.includes(viewDate);
              return <li key={task.id}>
                <button onClick={() => toggleDate(task.id, viewDate)} className={cn('flex w-full items-center gap-3 rounded-lg border p-3 text-left transition', done && isFutureView ? 'border-sky-200 bg-sky-50/70 dark:border-sky-500/30 dark:bg-sky-500/10' : done ? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-500/30 dark:bg-emerald-500/10' : 'border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60')}>
                  {done ? <CheckCircle2 className={isFutureView ? 'text-sky-600' : 'text-emerald-600'} size={20} /> : <Circle className="text-slate-400" size={20} />}
                  <span className={cn('min-w-0 flex-1', done && !isFutureView && 'text-slate-400 line-through')}><span className="block truncate text-sm font-medium">{task.title}</span>{task.note && <span className="block truncate text-xs text-slate-400">{task.note}</span>}</span>
                  {!isToday && <span className={cn('chip text-[10px]', isFutureView ? 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800')}>{isFutureView ? done ? '已预打卡' : '预打卡' : '补打卡'}</span>}
                </button>
              </li>;
            })}
          </ul>
        )}
      </div>

      {/* ---------------------------- 新增与列表 ---------------------------- */}
      <div className="card p-3 sm:p-4">
        <SectionTitle>新增周期任务</SectionTitle>
        <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
          <input ref={titleRef} className="input" placeholder="例如：阅读 30 分钟" aria-label="任务名称" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input className="input" placeholder="备注（可选）" aria-label="任务备注" value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn-primary" disabled={!title.trim() || !days.length} onClick={submit}><Plus size={15} />添加</button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {PRESETS.map((p) => <button key={p.label} className="btn-outline py-1 text-xs" onClick={() => setDays(p.days)}>{p.label}</button>)}
          <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />
          {DAYS.map((d, i) => <button key={d} aria-label={`星期${d}`} aria-pressed={days.includes(i)} onClick={() => setDays((v) => v.includes(i) ? v.filter((x) => x !== i) : [...v, i])} className={cn('h-8 w-8 rounded-full text-xs font-medium', days.includes(i) ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800')}>{d}</button>)}
        </div>
      </div>

      <div className="card p-4">
        <SectionTitle>全部周期任务 · {tasks.length}</SectionTitle>
        {tasks.length === 0 ? <Empty icon={Repeat2} text="还没有每日必做任务" action={<button className="btn-primary mt-2" onClick={() => titleRef.current?.focus()}><Plus size={15} />新增周期任务</button>} /> : (
          <ul className="max-h-[310px] overflow-y-auto divide-y divide-slate-100 pr-1 dark:divide-slate-800">
            {tasks.map((task) => <li key={task.id} className="flex items-center gap-3 py-3">
              <span className={cn('min-w-0 flex-1', !task.enabled && 'opacity-50')}>
                <span className="block truncate text-sm font-medium">{task.title}</span>
                <span className="text-xs text-slate-400">{task.daysOfWeek.length === 7 ? '每天' : task.daysOfWeek.map((d) => `周${DAYS[d]}`).join('、')}</span>
              </span>
              <button className="btn-ghost px-2" title={task.enabled ? '暂停' : '启用'} onClick={() => updateTask(task.id, { enabled: !task.enabled })}>{task.enabled ? <Pause size={15} /> : <Play size={15} />}</button>
              <button className="btn-danger px-2" title="删除" onClick={() => deletable(`已删除「${task.title || '周期任务'}」`, () => removeTask(task.id))}><Trash2 size={15} /></button>
            </li>)}
          </ul>
        )}
      </div>
    </div>
  );
}
