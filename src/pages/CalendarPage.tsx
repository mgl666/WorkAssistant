import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarPlus, CheckSquare2, ChevronLeft, ChevronRight, CircleDot, Pencil, RefreshCw, Repeat2, StickyNote, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WEEK_LABELS, addMonths, formatDateCN, formatShort, fromKey, isSameMonth, monthGrid, relativeDay, toKey, todayKey } from '@/lib/date';
import { fetchChinaHolidays, type ChinaHoliday } from '@/lib/holidays';
import { eventOccursOn, planSeriesDelete, planSeriesUpdate, type RecurrenceScope, type SeriesOperation } from '@/lib/recurrence';
import { useStore, type CalEvent, type EventColor, type EventRecurrence, type TodoPriority } from '@/store/useStore';
import { useDeletable } from '@/hooks/useDeletable';
import { Empty, Modal, SectionTitle } from '@/components/ui';

const SCOPE_OPTIONS: Array<{ value: RecurrenceScope; label: string; desc: string }> = [
  { value: 'once', label: '仅本次', desc: '只改动选中的这一天，其他日期保持原样' },
  { value: 'future', label: '本次及以后', desc: '从这一天起往后的日程都会改变，更早的保持原样' },
  { value: 'all', label: '整个系列', desc: '过去和将来全部日程一起改变' },
];

const DOT: Record<EventColor, string> = { indigo: 'bg-indigo-500', emerald: 'bg-emerald-500', amber: 'bg-amber-500', rose: 'bg-rose-500', sky: 'bg-sky-500', violet: 'bg-violet-500' };
const CHIP: Record<EventColor, string> = {
  indigo: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300', emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  amber: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300', rose: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  sky: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300', violet: 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
};
const TODO_CHIP: Record<TodoPriority, string> = {
  1: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  2: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  3: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
  4: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  5: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
};
const COLORS = Object.keys(DOT) as EventColor[];
/** 小屏日历格子太窄放不下文字，用圆点区分来源与优先级 */
const TODO_DOT: Record<TodoPriority, string> = {
  1: 'bg-slate-400', 2: 'bg-sky-500', 3: 'bg-indigo-500', 4: 'bg-amber-500', 5: 'bg-rose-500',
};
const RECURRENCE: Array<{ value: EventRecurrence; label: string }> = [
  { value: 'none', label: '不循环' }, { value: 'weekly', label: '每周同一天' }, { value: 'monthly', label: '每月同一天' }, { value: 'yearly', label: '每年同一天' },
];
interface EventForm { id: string | null; title: string; time: string; endTime: string; note: string; color: EventColor; recurrence: EventRecurrence; recurrenceUntil: string }
const blankForm = (): EventForm => ({ id: null, title: '', time: '', endTime: '', note: '', color: 'indigo', recurrence: 'none', recurrenceUntil: '' });

function lunarText(date: Date): string {
  const text = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { month: 'long', day: 'numeric' }).format(date);
  const match = text.match(/(.+月)(\d+)日/);
  if (!match) return text;
  const dayNames = ['', '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十', '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'];
  const day = Number(match[2]);
  return day === 1 ? match[1] : (dayNames[day] ?? match[2]);
}

export default function CalendarPage() {
  const store = useStore(); const today = todayKey();
  const deletable = useDeletable();
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [selected, setSelected] = useState(today), [form, setForm] = useState<EventForm>(blankForm);
  const [scopeRequest, setScopeRequest] = useState<{ kind: 'edit' | 'delete' | 'toggle'; event: CalEvent; date: string; patch?: Partial<CalEvent> } | null>(null);
  /** 小屏上详情面板在日历下方，点选日期后自动滚过去 */
  const detailRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const [holidays, setHolidays] = useState<Map<string, ChinaHoliday>>(new Map()), [holidayLoading, setHolidayLoading] = useState(false), [holidayError, setHolidayError] = useState(false);
  const year = cursor.getFullYear(), month = cursor.getMonth();
  const grid = useMemo(() => monthGrid(year, month), [year, month]);
  useEffect(() => { let active = true; setHolidayLoading(true); setHolidayError(false); void fetchChinaHolidays(year).then((v) => { if (active) setHolidays(v); }).catch(() => { if (active) setHolidayError(true); }).finally(() => { if (active) setHolidayLoading(false); }); return () => { active = false; }; }, [year, month]);
  const eventsFor = (key: string) => store.events.filter((e) => eventOccursOn(e, key)).sort((a, b) => (a.time ?? '99:99').localeCompare(b.time ?? '99:99'));
  const todosFor = (key: string) => store.todos.filter((t) => t.due === key).sort((a, b) => {
    if (!!a.dueTime !== !!b.dueTime) return a.dueTime ? -1 : 1;
    return (a.dueTime ?? '').localeCompare(b.dueTime ?? '') || b.priority - a.priority;
  });
  const dayEvents = eventsFor(selected), dayTodos = todosFor(selected);

  const applySeries = (ops: SeriesOperation[]) => {
    for (const op of ops) {
      if (op.kind === 'update' && op.id) store.updateEvent(op.id, op.patch ?? {});
      else if (op.kind === 'delete' && op.id) store.removeEvent(op.id);
      else if (op.kind === 'create' && op.draft) store.addEvent(op.draft);
    }
  };
  const isRecurring = (e: CalEvent) => (e.recurrence ?? 'none') !== 'none';
  const confirmScope = (scope: RecurrenceScope) => {
    const request = scopeRequest;
    if (!request) return;
    const patch = request.kind === 'edit' ? (request.patch ?? {}) : { done: !request.event.done };
    if (request.kind === 'delete') {
      deletable('已删除日程', () => applySeries(planSeriesDelete(request.event, request.date, scope)));
    } else {
      applySeries(planSeriesUpdate(request.event, request.date, scope, patch));
    }
    setScopeRequest(null);
    if (request.kind === 'edit') setForm(blankForm());
  };
  const askScope = (kind: 'delete' | 'toggle', event: CalEvent) => {
    if (isRecurring(event)) setScopeRequest({ kind, event, date: selected });
    else if (kind === 'delete') deletable('已删除日程', () => store.removeEvent(event.id));
    else store.toggleEvent(event.id);
  };
  const submit = () => {
    if (!form.title.trim()) return;
    const payload = { title: form.title.trim(), time: form.time || undefined, endTime: form.endTime || undefined, note: form.note.trim() || undefined, color: form.color, recurrence: form.recurrence, recurrenceUntil: form.recurrence === 'none' ? undefined : (form.recurrenceUntil || undefined) };
    if (!form.id) { store.addEvent({ ...payload, date: selected, done: false }); setForm(blankForm()); return; }
    const original = store.events.find((e) => e.id === form.id);
    if (!original) { setForm(blankForm()); return; }
    // 循环日程的修改会波及很多天，必须先让用户选择影响范围
    if (isRecurring(original)) { setScopeRequest({ kind: 'edit', event: original, date: selected, patch: payload }); return; }
    store.updateEvent(form.id, payload);
    setForm(blankForm());
  };
  const edit = (e: CalEvent) => setForm({ id: e.id, title: e.title, time: e.time ?? '', endTime: e.endTime ?? '', note: e.note ?? '', color: e.color, recurrence: e.recurrence ?? 'none', recurrenceUntil: e.recurrenceUntil ?? '' });
  const goToday = () => { const d = new Date(); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)); setSelected(today); };
  const moveMonth = (offset: number) => { const next = addMonths(cursor, offset); setCursor(next); setSelected(toKey(next)); setForm(blankForm()); };

  return <div className="grid items-stretch gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
    <div className="card h-full overflow-hidden border-0 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-gradient-to-r from-indigo-600 to-violet-600 px-3 py-3 text-white sm:gap-3 sm:px-5">
        <div><p className="text-xs text-indigo-100">月度计划</p><h2 className="text-xl font-semibold tracking-tight">{year} 年 {month + 1} 月</h2></div>
        <div className="flex items-center gap-2"><button className="rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-xs font-medium outline-none transition hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/70" onClick={goToday}>今天</button><div className="flex items-center rounded-xl bg-white/15 p-1 backdrop-blur"><button className="rounded-lg p-2 outline-none hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white/70" onClick={() => moveMonth(-1)} aria-label="上个月"><ChevronLeft size={18} /></button><button className="rounded-lg p-2 outline-none hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white/70" onClick={() => moveMonth(1)} aria-label="下个月"><ChevronRight size={18} /></button></div></div>
      </div>
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/70">{WEEK_LABELS.map((w, i) => <div key={w} className={cn('py-2 text-center text-xs font-semibold', i >= 5 ? 'text-rose-400' : 'text-slate-500 dark:text-slate-400')}>周{w}</div>)}</div>
      <div className="grid grid-cols-7 bg-slate-200 gap-px dark:bg-slate-800">{grid.map((date) => {
        const key = toKey(date), inMonth = isSameMonth(date, year, month);
        const events = eventsFor(key), todos = todosFor(key), items = [
          ...events.map((e) => ({ id: `e:${e.id}`, title: e.title, time: e.time, cls: CHIP[e.color], dot: DOT[e.color], done: e.done, repeat: (e.recurrence ?? 'none') !== 'none' })),
          ...todos.map((t) => ({ id: `t:${t.id}`, title: t.title, time: t.dueTime, cls: TODO_CHIP[t.priority], dot: TODO_DOT[t.priority], done: t.done, repeat: false })),
        ];
        const holiday = holidays.get(key), lunar = lunarText(date), isToday = key === today, isSelected = key === selected;
        const isRestDay = holiday ? holiday.isOffDay : date.getDay() === 0 || date.getDay() === 6;
        return <button key={key} aria-label={`${formatDateCN(key)}，农历${lunar}，${items.length}项安排`} aria-pressed={isSelected} onClick={() => { setSelected(key); setForm(blankForm()); if (!inMonth) setCursor(new Date(date.getFullYear(), date.getMonth(), 1)); if (window.innerWidth < 1280) setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60); }} className={cn('flex h-[84px] flex-col overflow-hidden p-1.5 text-left outline-none transition sm:h-[120px] sm:p-2', inMonth ? 'bg-white dark:bg-slate-900' : 'bg-slate-50/80 dark:bg-slate-950/50', isSelected ? 'relative z-10 ring-2 ring-inset ring-indigo-500' : 'hover:bg-indigo-50/50 dark:hover:bg-indigo-500/5')}>
          <div className="mb-1 min-h-[32px] shrink-0 text-center">
            <div className={cn('text-[15px] font-normal tracking-normal', isRestDay ? 'text-rose-500' : inMonth ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-600', isToday && 'text-indigo-600 dark:text-indigo-400')}>
              <span className={cn(isToday && 'rounded-full bg-indigo-50 px-1.5 py-0.5 dark:bg-indigo-500/15')}>{date.getDate()}<span className="ml-0.5 hidden text-xs font-normal opacity-75 sm:inline">（{lunar}）</span></span>
            </div>
            {holiday && <div className={cn('truncate text-[10px]', holiday.isOffDay ? 'text-rose-500' : 'text-amber-600')}>{holiday.isOffDay ? '休' : '班'}<span className="hidden sm:inline"> · {holiday.name}</span></div>}
          </div>
          <div className={cn('min-h-0 flex-1 space-y-1', !inMonth && 'opacity-55')}>
            {items.slice(0, 3).map((item) => <div key={item.id} className={cn('hidden h-5 items-center gap-1 truncate rounded px-1.5 text-[10px] sm:flex', item.cls, item.done && 'opacity-45 line-through')}><span className="font-mono">{item.time ?? '•'}</span>{item.repeat && <Repeat2 size={9} />}<span className="truncate">{item.title}</span></div>)}
            {items.length > 3 && <div className="hidden px-1 text-[10px] text-slate-400 sm:block">+{items.length - 3} 项</div>}
            {items.length > 0 && <div className="flex flex-wrap gap-0.5 px-0.5 sm:hidden">{items.slice(0, 5).map((item) => <span key={item.id} className={cn('h-1.5 w-1.5 rounded-full', item.dot, item.done && 'opacity-40')} />)}{items.length > 5 && <span className="text-[9px] leading-3 text-slate-400">+{items.length - 5}</span>}</div>}
          </div>
        </button>;
      })}</div>
      <div className="flex justify-end border-t border-slate-200 px-4 py-2 text-[11px] text-slate-400 dark:border-slate-800"><span className={cn('flex items-center gap-1', holidayError && 'text-amber-600')}>{holidayLoading && <RefreshCw size={11} className="animate-spin" />}{holidayError ? '节假日数据暂时不可用' : '中国节假日每月联网更新'}</span></div>
    </div>

    <aside className="flex h-full flex-col gap-4">
      <div ref={detailRef} className="card h-[300px] scroll-mt-20 overflow-hidden p-4"><div className="mb-3"><div className="text-sm font-semibold">{formatDateCN(selected)}<span className="ml-1.5 text-xs font-normal text-slate-400">农历{lunarText(fromKey(selected))}</span></div><div className="text-xs text-slate-400">{selected === today ? '今天' : relativeDay(selected)} · {dayEvents.length} 项日程 · {dayTodos.length} 项待办</div></div>
        <div className="h-[225px] overflow-y-auto pr-1">{dayEvents.length + dayTodos.length === 0 ? <Empty icon={CircleDot} text="这一天还没有安排" action={<button className="btn-primary mt-2" onClick={() => titleRef.current?.focus()}><CalendarPlus size={15} />添加日程</button>} /> : <ul className="space-y-2">
          {dayEvents.map((e) => <li key={e.id} className="group flex items-start gap-2 rounded-xl border border-slate-200 p-2.5 dark:border-slate-800"><input type="checkbox" aria-label={`${e.done ? '取消完成' : '完成'}日程 ${e.title}`} checked={e.done} onChange={() => askScope('toggle', e)} className="mt-1 h-4 w-4 accent-indigo-600" /><div className="min-w-0 flex-1"><div className={cn('text-sm font-medium', e.done && 'text-slate-400 line-through')}>{e.time && <span className="mr-1.5 font-mono text-xs text-indigo-500">{e.time}</span>}{e.title}{(e.recurrence ?? 'none') !== 'none' && <Repeat2 size={11} className="ml-1 inline text-slate-400" />}</div>{e.note && <div className="mt-1 flex gap-1 text-xs text-slate-400"><StickyNote size={12} />{e.note}</div>}</div><button className="btn-ghost px-2 opacity-100 sm:px-1 sm:opacity-0 sm:group-hover:opacity-100" onClick={() => edit(e)} aria-label={`编辑日程 ${e.title}`}><Pencil size={13} /></button><button className="btn-danger px-2 opacity-100 sm:px-1 sm:opacity-0 sm:group-hover:opacity-100" onClick={() => askScope('delete', e)} aria-label={`删除日程 ${e.title}`}><Trash2 size={13} /></button></li>)}
          {dayTodos.map((t) => <li key={t.id} className={cn('flex items-center gap-2 rounded-xl p-2.5', TODO_CHIP[t.priority])}><input type="checkbox" aria-label={`${t.done ? '取消完成' : '完成'}待办 ${t.title}`} checked={t.done} onChange={() => store.toggleTodo(t.id)} className="h-4 w-4 accent-indigo-600" /><CheckSquare2 size={14} className="opacity-70" /><span className={cn('min-w-0 flex-1 truncate text-sm', t.done && 'opacity-60 line-through')}>{t.dueTime && <span className="mr-1.5 font-mono text-xs opacity-70">{t.dueTime}</span>}{t.title}</span><span className="text-[10px] opacity-70">P{t.priority}</span></li>)}
        </ul>}</div>
      </div>

      <div className="card flex-1 space-y-3 p-4"><SectionTitle>{form.id ? '编辑日程' : '添加日程'}</SectionTitle>
        <input ref={titleRef} className="input" placeholder="日程标题" aria-label="日程标题" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        <div className="grid grid-cols-2 gap-2"><label><span className="mb-1 block text-xs text-slate-500">开始</span><input type="time" className="input" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /></label><label><span className="mb-1 block text-xs text-slate-500">结束</span><input type="time" className="input" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} /></label></div>
        <textarea className="input min-h-[56px] resize-y" placeholder="备注（可选）" aria-label="日程备注" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        <div className="grid grid-cols-2 gap-2"><label><span className="mb-1 block text-xs text-slate-500">重复</span><select className="input" value={form.recurrence} onChange={(e) => setForm({ ...form, recurrence: e.target.value as EventRecurrence })}>{RECURRENCE.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select></label><label><span className="mb-1 block text-xs text-slate-500">结束日期</span><input type="date" className="input" min={selected} disabled={form.recurrence === 'none'} value={form.recurrenceUntil} onChange={(e) => setForm({ ...form, recurrenceUntil: e.target.value })} /></label></div>
        <div className="flex items-center gap-2"><span className="text-xs text-slate-500">颜色</span>{COLORS.map((color) => <button key={color} onClick={() => setForm({ ...form, color })} className={cn('h-5 w-5 rounded-full transition', DOT[color], form.color === color ? 'ring-2 ring-offset-2 ring-slate-400 dark:ring-offset-slate-900' : 'opacity-50')} aria-label={`颜色 ${color}`} />)}</div>
        <div className="flex gap-2"><button className="btn-primary flex-1" onClick={submit}><CalendarPlus size={16} />{form.id ? '保存修改' : `添加到 ${formatShort(selected)}`}</button>{form.id && <button className="btn-outline" onClick={() => setForm(blankForm())}>取消</button>}</div>
      </div>
    </aside>

    <Modal
      open={scopeRequest !== null}
      title="这是循环日程"
      onClose={() => setScopeRequest(null)}
      width="max-w-md"
      footer={<button className="btn-outline" onClick={() => setScopeRequest(null)}>取消</button>}
    >
      <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
        「{scopeRequest?.event.title}」会在多个日期重复出现，这次操作要影响哪些日程？
      </p>
      <div className="space-y-2">{SCOPE_OPTIONS.map((option) => <button key={option.value} onClick={() => confirmScope(option.value)} className="w-full rounded-lg border border-slate-200 p-3 text-left outline-none transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-800 dark:hover:bg-slate-800"><div className="text-sm font-medium">{option.label}</div><div className="mt-0.5 text-xs text-slate-400">{option.desc}</div></button>)}</div>
    </Modal>
  </div>;
}
