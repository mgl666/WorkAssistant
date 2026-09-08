import { useEffect, useMemo, useState } from 'react';
import { BriefcaseBusiness, CalendarDays, ChevronLeft, ChevronRight, Clock3, Save, Trash2, TrendingUp } from 'lucide-react';
import { addDays, fromKey, monthGrid, startOfWeek, toKey, todayKey } from '@/lib/date';
import { calculateActualMinutes, calculateWorkMinutes, formatWorkHours, minuteClock, timeToMinutes } from '@/lib/workHours';
import { cn } from '@/lib/utils';
import { useStore } from '@/store/useStore';
import { SectionTitle, useToast } from '@/components/ui';
import { useDeletable } from '@/hooks/useDeletable';

const WEEK_HEADS = ['一', '二', '三', '四', '五', '六', '日'];
type TrendRange = 'month' | 'quarter' | 'year';

export default function WorkHours() {
  const logs = useStore((state) => state.work_logs);
  const saveWorkLog = useStore((state) => state.saveWorkLog);
  const removeWorkLog = useStore((state) => state.removeWorkLog);
  const toast = useToast();
  const deletable = useDeletable();
  const today = todayKey();
  const now = new Date();
  const [cursor, setCursor] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(today);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('18:00');
  const [trendRange, setTrendRange] = useState<TrendRange>('month');
  const logByDate = useMemo(() => new Map(logs.map((log) => [log.date, log])), [logs]);
  const selectedLog = logByDate.get(selectedDate);

  useEffect(() => {
    setStartTime(selectedLog?.startTime ?? '09:00');
    setEndTime(selectedLog?.endTime ?? '18:00');
  }, [selectedDate, selectedLog]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const grid = useMemo(() => monthGrid(year, month), [year, month]);
  const selectedMinutes = calculateWorkMinutes(startTime, endTime);
  const selectedActualMinutes = calculateActualMinutes(startTime, endTime);

  const weekStart = toKey(startOfWeek(now));
  const weekEnd = toKey(addDays(startOfWeek(now), 6));
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const monthEnd = toKey(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  const summarize = (start: string, end: string) => {
    const rows = logs.filter((log) => log.date >= start && log.date <= end).map((log) => ({ effective: calculateWorkMinutes(log.startTime, log.endTime), actual: calculateActualMinutes(log.startTime, log.endTime) })).filter((row) => row.actual > 0);
    const total = rows.reduce((sum, row) => sum + row.effective, 0);
    const actualTotal = rows.reduce((sum, row) => sum + row.actual, 0);
    return { total, actualTotal, average: rows.length ? Math.round(total / rows.length) : 0, actualAverage: rows.length ? Math.round(actualTotal / rows.length) : 0, days: rows.length };
  };
  const weekSummary = summarize(weekStart, weekEnd);
  const monthSummary = summarize(monthStart, monthEnd);

  const trend = useMemo(() => {
    const end = today;
    const start = trendRange === 'month'
      ? monthStart
      : trendRange === 'quarter'
        ? toKey(new Date(now.getFullYear(), now.getMonth() - 2, 1))
        : `${now.getFullYear()}-01-01`;
    const grouped = new Map<string, { label: string; minutes: number[]; actualMinutes: number[]; starts: number[]; ends: number[] }>();
    logs.filter((log) => log.date >= start && log.date <= end).sort((a, b) => a.date.localeCompare(b.date)).forEach((log) => {
      const date = fromKey(log.date);
      const weekStartDate = startOfWeek(date);
      const groupKey = trendRange === 'year' ? log.date.slice(0, 7) : toKey(weekStartDate);
      const label = trendRange === 'year' ? `${date.getMonth() + 1}月` : `${weekStartDate.getMonth() + 1}/${weekStartDate.getDate()}周`;
      const group = grouped.get(groupKey) ?? { label, minutes: [], actualMinutes: [], starts: [], ends: [] };
      const minutes = calculateWorkMinutes(log.startTime, log.endTime);
      const actualMinutes = calculateActualMinutes(log.startTime, log.endTime);
      if (actualMinutes > 0) {
        group.minutes.push(minutes);
        group.actualMinutes.push(actualMinutes);
        group.starts.push(timeToMinutes(log.startTime));
        group.ends.push(timeToMinutes(log.endTime));
      }
      grouped.set(groupKey, group);
    });
    return [...grouped.entries()].map(([key, group]) => ({
      key,
      label: group.label,
      average: average(group.minutes),
      actualAverage: average(group.actualMinutes),
      start: average(group.starts),
      end: average(group.ends),
    }));
  }, [logs, monthStart, now, today, trendRange]);

  const save = () => {
    if (!startTime || !endTime || timeToMinutes(endTime) <= timeToMinutes(startTime)) {
      toast('下班时间必须晚于上班时间');
      return;
    }
    saveWorkLog(selectedDate, startTime, endTime);
    toast(`已保存 ${selectedDate} 的工时`);
  };

  return <div className="space-y-4">
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric icon={BriefcaseBusiness} label="本周总有效工时" value={formatWorkHours(weekSummary.total)} hint={`实际 ${formatWorkHours(weekSummary.actualTotal)} · ${weekSummary.days} 天`} tone="indigo" />
      <Metric icon={Clock3} label="本周日均有效工时" value={formatWorkHours(weekSummary.average)} hint={`实际日均 ${formatWorkHours(weekSummary.actualAverage)}`} tone="sky" />
      <Metric icon={CalendarDays} label="本月总有效工时" value={formatWorkHours(monthSummary.total)} hint={`实际 ${formatWorkHours(monthSummary.actualTotal)} · ${monthSummary.days} 天`} tone="emerald" />
      <Metric icon={TrendingUp} label="本月日均有效工时" value={formatWorkHours(monthSummary.average)} hint={`实际日均 ${formatWorkHours(monthSummary.actualAverage)}`} tone="amber" />
    </section>

    <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(280px,.75fr)]">
      <section className="card p-3 sm:p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <SectionTitle>{year} 年 {month + 1} 月</SectionTitle>
          <div className="flex items-center gap-1">
            <button className="btn-ghost px-1.5" aria-label="上个月" onClick={() => setCursor(new Date(year, month - 1, 1))}><ChevronLeft size={18} /></button>
            <button className="btn-outline px-2 py-1 text-xs" onClick={() => { setCursor(new Date(now.getFullYear(), now.getMonth(), 1)); setSelectedDate(today); }}>本月</button>
            <button className="btn-ghost px-1.5" aria-label="下个月" onClick={() => setCursor(new Date(year, month + 1, 1))}><ChevronRight size={18} /></button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {WEEK_HEADS.map((label) => <div key={label} className="pb-1 text-[11px] font-medium text-slate-400">周{label}</div>)}
          {grid.map((date) => {
            const key = toKey(date);
            const log = logByDate.get(key);
            const minutes = log ? calculateWorkMinutes(log.startTime, log.endTime) : 0;
            return <button key={key} onClick={() => setSelectedDate(key)} className={cn('flex h-[70px] min-w-0 flex-col items-center justify-center rounded-lg border px-0.5 text-xs transition sm:h-[88px]', date.getMonth() !== month && 'opacity-35', selectedDate === key ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500 dark:bg-indigo-500/10' : 'border-slate-100 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700')}>
              <span className={cn('font-medium', key === today && 'text-indigo-600 dark:text-indigo-400')}>{date.getDate()}</span>
              {log ? <><span className="mt-1 max-w-full truncate text-[9px] text-slate-400 sm:text-[10px]">{log.startTime}–{log.endTime}</span><span className="mt-0.5 text-[9px] font-medium text-emerald-600 sm:text-[10px]">{formatCompact(minutes)}</span></> : <span className="mt-2 text-[10px] text-slate-300">未录入</span>}
            </button>;
          })}
        </div>
      </section>

      <section className="card flex flex-col p-4">
        <SectionTitle>录入工时</SectionTitle>
        <div className="mb-5 rounded-xl bg-slate-50 p-4 dark:bg-slate-800/60">
          <div className="text-sm font-medium">{selectedDate}</div>
          <div className="mt-1 text-xs text-slate-400">自动扣除 12:30–14:00 和 18:00–18:30 的重叠时间</div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <label className="text-sm"><span className="mb-1.5 block text-slate-500">上班时间</span><input type="time" className="input" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></label>
          <label className="text-sm"><span className="mb-1.5 block text-slate-500">下班时间</span><input type="time" className="input" value={endTime} onChange={(event) => setEndTime(event.target.value)} /></label>
        </div>
        <div className="my-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4 dark:border-indigo-500/20 dark:bg-indigo-500/10"><div className="text-xs text-indigo-600 dark:text-indigo-400">当日实际工时</div><div className="mt-1 text-xl font-semibold text-indigo-700 dark:text-indigo-300">{formatWorkHours(selectedActualMinutes)}</div><div className="mt-1 text-[10px] text-indigo-400">不扣除休息时间</div></div>
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 dark:border-emerald-500/20 dark:bg-emerald-500/10"><div className="text-xs text-emerald-600 dark:text-emerald-400">当日有效工时</div><div className="mt-1 text-xl font-semibold text-emerald-700 dark:text-emerald-300">{formatWorkHours(selectedMinutes)}</div><div className="mt-1 text-[10px] text-emerald-500">已扣除休息时间</div></div>
        </div>
        <div className="mt-auto flex gap-2">
          <button className="btn-primary flex-1" onClick={save}><Save size={15} />{selectedLog ? '更新' : '保存'}</button>
          {selectedLog && <button className="btn-danger border border-rose-200 px-3 dark:border-rose-900" onClick={() => deletable(`已删除 ${selectedDate} 的工时`, () => removeWorkLog(selectedDate))}><Trash2 size={15} />删除</button>}
        </div>
      </section>
    </div>

    <section className="card p-3 sm:p-4">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SectionTitle extra={<span className="text-xs font-normal text-slate-400">小时/工作日</span>}>日均工时趋势</SectionTitle>
        <TrendTabs value={trendRange} onChange={setTrendRange} />
      </div>
      <AverageBars rows={trend} />
    </section>

    <section className="card p-3 sm:p-4">
      <SectionTitle extra={<span className="text-xs font-normal text-slate-400">同一周/月内取平均时间</span>}>上下班时间趋势</SectionTitle>
      <ClockTrend rows={trend} />
    </section>
  </div>;
}

function average(values: number[]) { return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0; }
function formatCompact(minutes: number) { return `${Math.floor(minutes / 60)}h${minutes % 60 ? `${minutes % 60}m` : ''}`; }

function Metric({ icon: Icon, label, value, hint, tone }: { icon: typeof Clock3; label: string; value: string; hint: string; tone: 'indigo' | 'sky' | 'emerald' | 'amber' }) {
  const colors = { indigo: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15', sky: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15', emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15', amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15' };
  return <div className="card flex min-w-0 items-center gap-3 p-4"><span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', colors[tone])}><Icon size={20} /></span><span className="min-w-0"><span className="block text-xs text-slate-500">{label}</span><span className="block text-xl font-semibold">{value}</span><span className="block truncate text-xs text-slate-400">{hint}</span></span></div>;
}

function TrendTabs({ value, onChange }: { value: TrendRange; onChange: (value: TrendRange) => void }) {
  return <div className="grid w-full grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 sm:w-auto dark:bg-slate-800">{([['month', '本月'], ['quarter', '近3月'], ['year', '本年']] as Array<[TrendRange, string]>).map(([key, label]) => <button key={key} onClick={() => onChange(key)} className={cn('rounded-lg px-3 py-1.5 text-xs transition', value === key ? 'bg-white font-medium text-indigo-600 shadow-sm dark:bg-slate-950 dark:text-indigo-400' : 'text-slate-500')}>{label}</button>)}</div>;
}

function AverageBars({ rows }: { rows: Array<{ key: string; label: string; average: number; actualAverage: number }> }) {
  if (!rows.length) return <div className="py-12 text-center text-sm text-slate-400">所选范围内还没有工时记录</div>;
  const max = Math.max(60, ...rows.flatMap((row) => [row.average, row.actualAverage]));
  return <><div className="mb-2 flex gap-4 text-xs"><span className="flex items-center gap-1.5 text-indigo-600"><span className="h-2 w-2 rounded-sm bg-indigo-500" />实际日均</span><span className="flex items-center gap-1.5 text-emerald-600"><span className="h-2 w-2 rounded-sm bg-emerald-500" />有效日均</span></div><div className="overflow-x-auto pb-1"><div className="flex h-56 min-w-full items-end gap-2" style={{ width: `${Math.max(100, rows.length * 72)}px` }}>{rows.map((row) => <div key={row.key} className="flex h-full min-w-16 flex-1 flex-col items-center justify-end"><span className="mb-1 text-[9px] font-medium text-slate-500">{(row.actualAverage / 60).toFixed(1)}/{(row.average / 60).toFixed(1)}h</span><div className="flex w-full items-end justify-center gap-1"><div className="w-4 rounded-t bg-indigo-500/80" style={{ height: `${Math.max(3, row.actualAverage / max * 160)}px` }} /><div className="w-4 rounded-t bg-emerald-500/80" style={{ height: `${Math.max(3, row.average / max * 160)}px` }} /></div><span className="mt-2 whitespace-nowrap text-[10px] text-slate-400">{row.label}</span></div>)}</div></div></>;
}

function ClockTrend({ rows }: { rows: Array<{ key: string; label: string; start: number; end: number }> }) {
  const valid = rows.filter((row) => row.start > 0 && row.end > 0);
  if (!valid.length) return <div className="py-12 text-center text-sm text-slate-400">所选范围内还没有工时记录</div>;
  const width = Math.max(640, valid.length * 72);
  const min = Math.floor(Math.min(...valid.map((row) => row.start)) / 60) * 60;
  const max = Math.ceil(Math.max(...valid.map((row) => row.end)) / 60) * 60;
  const y = (minutes: number) => 18 + (minutes - min) / Math.max(60, max - min) * 150;
  const x = (index: number) => valid.length === 1 ? width / 2 : 48 + index * (width - 96) / (valid.length - 1);
  const points = (field: 'start' | 'end') => valid.map((row, index) => `${x(index)},${y(row[field])}`).join(' ');
  return <div className="overflow-x-auto"><div style={{ width: `${width}px` }}>
    <div className="mb-2 flex gap-4 text-xs"><span className="flex items-center gap-1.5 text-indigo-600"><span className="h-2 w-2 rounded-full bg-indigo-500" />上班</span><span className="flex items-center gap-1.5 text-amber-600"><span className="h-2 w-2 rounded-full bg-amber-500" />下班</span></div>
    <svg viewBox={`0 0 ${width} 210`} className="h-[210px] w-full" role="img" aria-label="上下班时间趋势图">
      <line x1="40" y1="18" x2="40" y2="168" stroke="currentColor" className="text-slate-200 dark:text-slate-700" />
      <text x="4" y="22" fontSize="10" className="fill-slate-400">{minuteClock(min)}</text><text x="4" y="168" fontSize="10" className="fill-slate-400">{minuteClock(max)}</text>
      <polyline fill="none" stroke="#6366f1" strokeWidth="2.5" points={points('start')} />
      <polyline fill="none" stroke="#f59e0b" strokeWidth="2.5" points={points('end')} />
      {valid.map((row, index) => <g key={row.key}><circle cx={x(index)} cy={y(row.start)} r="3.5" fill="#6366f1" /><circle cx={x(index)} cy={y(row.end)} r="3.5" fill="#f59e0b" /><text x={x(index)} y="195" textAnchor="middle" fontSize="10" className="fill-slate-400">{row.label}</text></g>)}
    </svg>
  </div></div>;
}
