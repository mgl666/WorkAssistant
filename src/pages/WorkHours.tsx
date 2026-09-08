import { useEffect, useMemo, useState } from 'react';
import { BarChart3, BriefcaseBusiness, CalendarDays, ChevronLeft, ChevronRight, Clock3, Save, Trash2, TrendingUp } from 'lucide-react';
import { addDays, fromKey, monthGrid, startOfWeek, toKey, todayKey } from '@/lib/date';
import { calculateActualMinutes, calculateWorkMinutes, formatWorkHours, minuteClock, timeToMinutes } from '@/lib/workHours';
import { cn } from '@/lib/utils';
import { useStore, type WorkLog } from '@/store/useStore';
import { SectionTitle, useToast } from '@/components/ui';
import { useDeletable } from '@/hooks/useDeletable';

const WEEK_HEADS = ['一', '二', '三', '四', '五', '六', '日'];
type PageView = 'records' | 'analysis';
type AnalysisRange = 'week' | 'month' | 'year' | 'custom';
type GroupUnit = 'day' | 'week' | 'month';
const RANGE_LABELS: Record<AnalysisRange, string> = { week: '本周', month: '本月', year: '本年', custom: '自定义' };

export default function WorkHours() {
  const logs = useStore((state) => state.work_logs);
  const saveWorkLog = useStore((state) => state.saveWorkLog);
  const removeWorkLog = useStore((state) => state.removeWorkLog);
  const toast = useToast();
  const deletable = useDeletable();
  const today = todayKey();
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const weekStart = toKey(startOfWeek(now));
  const monthStart = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;
  const yearStart = `${currentYear}-01-01`;

  const [pageView, setPageView] = useState<PageView>('records');
  const [cursor, setCursor] = useState(() => new Date(currentYear, currentMonth, 1));
  const [selectedDate, setSelectedDate] = useState(today);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('18:00');
  const [range, setRange] = useState<AnalysisRange>('week');
  const [customStart, setCustomStart] = useState(monthStart);
  const [customEnd, setCustomEnd] = useState(today);

  const logByDate = useMemo(() => new Map(logs.map((log) => [log.date, log])), [logs]);
  const selectedLog = logByDate.get(selectedDate);
  useEffect(() => {
    setStartTime(selectedLog?.startTime ?? '09:00');
    setEndTime(selectedLog?.endTime ?? '18:00');
  }, [selectedDate, selectedLog]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const grid = useMemo(() => monthGrid(year, month), [year, month]);
  const selectedActual = calculateActualMinutes(startTime, endTime);
  const selectedEffective = calculateWorkMinutes(startTime, endTime);
  const period = useMemo(() => {
    if (range === 'week') return { start: weekStart, end: today };
    if (range === 'month') return { start: monthStart, end: today };
    if (range === 'year') return { start: yearStart, end: today };
    return customStart <= customEnd ? { start: customStart, end: customEnd } : { start: customEnd, end: customStart };
  }, [range, weekStart, monthStart, yearStart, today, customStart, customEnd]);
  const periodLogs = useMemo(() => logs.filter((log) => log.date >= period.start && log.date <= period.end && calculateActualMinutes(log.startTime, log.endTime) > 0).sort((a, b) => a.date.localeCompare(b.date)), [logs, period]);
  const summary = useMemo(() => summarize(periodLogs), [periodLogs]);
  const groupUnit = useMemo<GroupUnit>(() => {
    if (range === 'week') return 'day';
    if (range === 'month') return 'week';
    if (range === 'year') return 'month';
    const span = Math.round((fromKey(period.end).getTime() - fromKey(period.start).getTime()) / 86_400_000) + 1;
    return span <= 31 ? 'day' : span <= 180 ? 'week' : 'month';
  }, [range, period]);
  const trendRows = useMemo(() => groupLogs(periodLogs, groupUnit), [periodLogs, groupUnit]);

  const save = () => {
    if (!startTime || !endTime || timeToMinutes(endTime) <= timeToMinutes(startTime)) return toast('下班时间必须晚于上班时间');
    saveWorkLog(selectedDate, startTime, endTime);
    toast(`已保存 ${selectedDate} 的工时`);
  };

  return <div className="space-y-4">
    <section className="card flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
      <div><h2 className="flex items-center gap-2 font-semibold"><BriefcaseBusiness size={18} className="text-indigo-600" />工时统计</h2><p className="mt-0.5 text-xs text-slate-400">实际工时包含休息，有效工时自动扣除固定休息时段。</p></div>
      <div className="grid w-full grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 sm:w-auto dark:bg-slate-800">
        <ViewButton active={pageView === 'records'} onClick={() => setPageView('records')} icon={CalendarDays} label="工时记录" />
        <ViewButton active={pageView === 'analysis'} onClick={() => setPageView('analysis')} icon={BarChart3} label="工时分析" />
      </div>
    </section>

    {pageView === 'records' ? <RecordView grid={grid} year={year} month={month} today={today} selectedDate={selectedDate} setSelectedDate={setSelectedDate} logByDate={logByDate} moveMonth={(offset) => setCursor(new Date(year, month + offset, 1))} goToday={() => { setCursor(new Date(currentYear, currentMonth, 1)); setSelectedDate(today); }} startTime={startTime} endTime={endTime} setStartTime={setStartTime} setEndTime={setEndTime} selectedActual={selectedActual} selectedEffective={selectedEffective} selectedLog={selectedLog} save={save} remove={() => deletable(`已删除 ${selectedDate} 的工时`, () => removeWorkLog(selectedDate))} /> : <>
      <section className="card space-y-3 p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-sm font-semibold">统计时间</h2><p className="text-xs text-slate-400">{RANGE_LABELS[range]} · {period.start} 至 {period.end}</p></div><div className="grid w-full grid-cols-4 gap-1 rounded-xl bg-slate-100 p-1 sm:w-auto dark:bg-slate-800">{(Object.entries(RANGE_LABELS) as Array<[AnalysisRange, string]>).map(([value, label]) => <button key={value} onClick={() => setRange(value)} className={cn('rounded-lg px-1 py-1.5 text-xs transition sm:px-3 sm:text-sm', range === value ? 'bg-white font-medium text-indigo-600 shadow-sm dark:bg-slate-950 dark:text-indigo-400' : 'text-slate-500')}>{label}</button>)}</div></div>
        {range === 'custom' && <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2"><input type="date" className="input min-w-0" max={today} value={customStart} onChange={(event) => setCustomStart(event.target.value || today)} aria-label="开始日期" /><span className="text-sm text-slate-400">至</span><input type="date" className="input min-w-0" max={today} value={customEnd} onChange={(event) => setCustomEnd(event.target.value || today)} aria-label="结束日期" /></div>}
      </section>
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4"><Metric icon={Clock3} label="实际总工时" value={formatWorkHours(summary.actualTotal)} hint={`${summary.days} 个已录入工作日`} tone="indigo" /><Metric icon={BriefcaseBusiness} label="有效总工时" value={formatWorkHours(summary.effectiveTotal)} hint="已扣除固定休息" tone="emerald" /><Metric icon={TrendingUp} label="实际日均工时" value={formatWorkHours(summary.actualAverage)} hint="按已录入工作日计算" tone="sky" /><Metric icon={BarChart3} label="有效日均工时" value={formatWorkHours(summary.effectiveAverage)} hint="按已录入工作日计算" tone="amber" /></section>
      <section className="card p-3 sm:p-4"><SectionTitle extra={<span className="text-xs font-normal text-slate-400">{groupUnit === 'day' ? '按日' : groupUnit === 'week' ? '按周' : '按月'}取平均</span>}>日均工时趋势</SectionTitle><AverageBars rows={trendRows} /></section>
      <section className="card p-3 sm:p-4"><SectionTitle extra={<span className="text-xs font-normal text-slate-400">平均打卡时间</span>}>上下班时间趋势</SectionTitle><ClockTrend rows={trendRows} /></section>
      <section className="card p-3 sm:p-4"><SectionTitle extra={<span className="text-xs font-normal text-slate-400">{periodLogs.length} 天</span>}>工时明细</SectionTitle><LogDetails logs={[...periodLogs].reverse()} /></section>
    </>}
  </div>;
}

interface RecordProps { grid: Date[]; year: number; month: number; today: string; selectedDate: string; setSelectedDate: (key: string) => void; logByDate: Map<string, WorkLog>; moveMonth: (offset: number) => void; goToday: () => void; startTime: string; endTime: string; setStartTime: (value: string) => void; setEndTime: (value: string) => void; selectedActual: number; selectedEffective: number; selectedLog?: WorkLog; save: () => void; remove: () => void }
function RecordView(props: RecordProps) {
  return <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,.75fr)]"><section className="card p-3 sm:p-4"><div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400">{props.year} 年 {props.month + 1} 月</h2><div className="flex items-center gap-1"><button className="btn-ghost px-1.5" aria-label="上个月" onClick={() => props.moveMonth(-1)}><ChevronLeft size={18} /></button><button className="btn-outline px-2 py-1 text-xs" onClick={props.goToday}>本月</button><button className="btn-ghost px-1.5" aria-label="下个月" onClick={() => props.moveMonth(1)}><ChevronRight size={18} /></button></div></div><div className="grid grid-cols-7 gap-1 text-center">{WEEK_HEADS.map((label) => <div key={label} className="pb-1 text-[11px] font-medium text-slate-400">周{label}</div>)}{props.grid.map((date) => { const key = toKey(date); const log = props.logByDate.get(key); const effective = log ? calculateWorkMinutes(log.startTime, log.endTime) : 0; return <button key={key} onClick={() => props.setSelectedDate(key)} className={cn('flex h-[70px] min-w-0 flex-col items-center justify-center rounded-lg border px-0.5 text-xs transition sm:h-[88px]', date.getMonth() !== props.month && 'opacity-35', props.selectedDate === key ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500 dark:bg-indigo-500/10' : 'border-slate-100 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700')}><span className={cn('font-medium', key === props.today && 'text-indigo-600 dark:text-indigo-400')}>{date.getDate()}</span>{log ? <><span className="mt-1 max-w-full truncate text-[9px] text-slate-400 sm:text-[10px]">{log.startTime}–{log.endTime}</span><span className="mt-0.5 text-[9px] font-medium text-emerald-600 sm:text-[10px]">{formatCompact(effective)}</span></> : <span className="mt-2 text-[10px] text-slate-300">未录入</span>}</button>; })}</div></section><section className="card flex flex-col p-4"><SectionTitle>录入工时</SectionTitle><div className="mb-5 rounded-xl bg-slate-50 p-4 dark:bg-slate-800/60"><div className="text-sm font-medium">{props.selectedDate}</div><div className="mt-1 text-xs text-slate-400">有效工时扣除 12:30–14:00 和 18:00–18:30 的重叠时间</div></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1"><TimeInput label="上班时间" value={props.startTime} onChange={props.setStartTime} /><TimeInput label="下班时间" value={props.endTime} onChange={props.setEndTime} /></div><div className="my-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2"><TimeResult label="实际工时" value={props.selectedActual} hint="包含休息时间" tone="indigo" /><TimeResult label="有效工时" value={props.selectedEffective} hint="已扣除休息时间" tone="emerald" /></div><div className="mt-auto flex gap-2"><button className="btn-primary flex-1" onClick={props.save}><Save size={15} />{props.selectedLog ? '更新' : '保存'}</button>{props.selectedLog && <button className="btn-danger border border-rose-200 px-3 dark:border-rose-900" onClick={props.remove}><Trash2 size={15} />删除</button>}</div></section></div>;
}

function summarize(logs: WorkLog[]) { const actualTotal = logs.reduce((sum, log) => sum + calculateActualMinutes(log.startTime, log.endTime), 0); const effectiveTotal = logs.reduce((sum, log) => sum + calculateWorkMinutes(log.startTime, log.endTime), 0); return { actualTotal, effectiveTotal, actualAverage: logs.length ? Math.round(actualTotal / logs.length) : 0, effectiveAverage: logs.length ? Math.round(effectiveTotal / logs.length) : 0, days: logs.length }; }
function groupLogs(logs: WorkLog[], unit: GroupUnit) { const groups = new Map<string, { label: string; logs: WorkLog[] }>(); logs.forEach((log) => { const date = fromKey(log.date); const week = startOfWeek(date); const key = unit === 'day' ? log.date : unit === 'week' ? toKey(week) : log.date.slice(0, 7); const label = unit === 'day' ? `${date.getMonth() + 1}/${date.getDate()}` : unit === 'week' ? `${week.getMonth() + 1}/${week.getDate()}周` : `${date.getMonth() + 1}月`; const group = groups.get(key) ?? { label, logs: [] }; group.logs.push(log); groups.set(key, group); }); return [...groups.entries()].map(([key, group]) => { const value = summarize(group.logs); return { key, label: group.label, actualAverage: value.actualAverage, effectiveAverage: value.effectiveAverage, start: average(group.logs.map((log) => timeToMinutes(log.startTime))), end: average(group.logs.map((log) => timeToMinutes(log.endTime))) }; }); }
function average(values: number[]) { return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0; }
function formatCompact(minutes: number) { return `${Math.floor(minutes / 60)}h${minutes % 60 ? `${minutes % 60}m` : ''}`; }
function ViewButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof CalendarDays; label: string }) { return <button onClick={onClick} aria-pressed={active} className={cn('flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition', active ? 'bg-white font-medium text-indigo-600 shadow-sm dark:bg-slate-950 dark:text-indigo-400' : 'text-slate-500')}><Icon size={15} />{label}</button>; }
function TimeInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="text-sm"><span className="mb-1.5 block text-slate-500">{label}</span><input type="time" className="input" value={value} onChange={(event) => onChange(event.target.value)} /></label>; }
function TimeResult({ label, value, hint, tone }: { label: string; value: number; hint: string; tone: 'indigo' | 'emerald' }) { const style = tone === 'indigo' ? 'border-indigo-100 bg-indigo-50 text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300' : 'border-emerald-100 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300'; return <div className={cn('rounded-xl border p-4', style)}><div className="text-xs opacity-80">当日{label}</div><div className="mt-1 text-xl font-semibold">{formatWorkHours(value)}</div><div className="mt-1 text-[10px] opacity-60">{hint}</div></div>; }
function Metric({ icon: Icon, label, value, hint, tone }: { icon: typeof Clock3; label: string; value: string; hint: string; tone: 'indigo' | 'sky' | 'emerald' | 'amber' }) { const colors = { indigo: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15', sky: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15', emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15', amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15' }; return <div className="card flex min-w-0 flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-3 sm:p-4"><span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg sm:h-11 sm:w-11 sm:rounded-xl', colors[tone])}><Icon size={19} /></span><span className="min-w-0"><span className="block text-[11px] text-slate-500 sm:text-xs">{label}</span><span className="block text-base font-semibold sm:text-xl">{value}</span><span className="hidden truncate text-xs text-slate-400 sm:block">{hint}</span></span></div>; }

function AverageBars({ rows }: { rows: ReturnType<typeof groupLogs> }) { if (!rows.length) return <EmptyChart />; const max = Math.max(60, ...rows.flatMap((row) => [row.effectiveAverage, row.actualAverage])); return <><ChartLegend first="实际日均" second="有效日均" /><div className="overflow-x-auto pb-1"><div className="flex h-56 min-w-full items-end gap-2" style={{ width: `${Math.max(100, rows.length * 72)}px` }}>{rows.map((row) => <div key={row.key} className="flex h-full min-w-16 flex-1 flex-col items-center justify-end"><span className="mb-1 text-[10px] font-medium text-slate-500">{(row.actualAverage / 60).toFixed(1)}h</span><div className="flex w-full max-w-14 items-end justify-center gap-1"><div title={`实际 ${formatWorkHours(row.actualAverage)}`} className="w-5 rounded-t bg-indigo-500/85" style={{ height: `${Math.max(3, row.actualAverage / max * 165)}px` }} /><div title={`有效 ${formatWorkHours(row.effectiveAverage)}`} className="w-5 rounded-t bg-emerald-500/85" style={{ height: `${Math.max(3, row.effectiveAverage / max * 165)}px` }} /></div><span className="mt-2 whitespace-nowrap text-[10px] text-slate-400">{row.label}</span></div>)}</div></div></>; }
function ClockTrend({ rows }: { rows: ReturnType<typeof groupLogs> }) { const valid = rows.filter((row) => row.start > 0 && row.end > 0); if (!valid.length) return <EmptyChart />; const width = Math.max(640, valid.length * 72); const min = Math.floor(Math.min(...valid.map((row) => row.start)) / 60) * 60; const max = Math.ceil(Math.max(...valid.map((row) => row.end)) / 60) * 60; const y = (minutes: number) => 18 + (minutes - min) / Math.max(60, max - min) * 150; const x = (index: number) => valid.length === 1 ? width / 2 : 48 + index * (width - 96) / (valid.length - 1); const points = (field: 'start' | 'end') => valid.map((row, index) => `${x(index)},${y(row[field])}`).join(' '); return <div className="overflow-x-auto"><div style={{ width: `${width}px` }}><ChartLegend first="上班" second="下班" secondTone="amber" /><svg viewBox={`0 0 ${width} 210`} className="h-[210px] w-full" role="img" aria-label="上下班时间趋势图"><line x1="40" y1="18" x2="40" y2="168" stroke="currentColor" className="text-slate-200 dark:text-slate-700" /><text x="4" y="22" fontSize="10" className="fill-slate-400">{minuteClock(min)}</text><text x="4" y="168" fontSize="10" className="fill-slate-400">{minuteClock(max)}</text><polyline fill="none" stroke="#6366f1" strokeWidth="2.5" points={points('start')} /><polyline fill="none" stroke="#f59e0b" strokeWidth="2.5" points={points('end')} />{valid.map((row, index) => <g key={row.key}><circle cx={x(index)} cy={y(row.start)} r="3.5" fill="#6366f1" /><circle cx={x(index)} cy={y(row.end)} r="3.5" fill="#f59e0b" /><text x={x(index)} y="195" textAnchor="middle" fontSize="10" className="fill-slate-400">{row.label}</text></g>)}</svg></div></div>; }
function ChartLegend({ first, second, secondTone = 'emerald' }: { first: string; second: string; secondTone?: 'emerald' | 'amber' }) { return <div className="mb-2 flex gap-4 text-xs"><span className="flex items-center gap-1.5 text-indigo-600"><span className="h-2 w-2 rounded-sm bg-indigo-500" />{first}</span><span className={cn('flex items-center gap-1.5', secondTone === 'amber' ? 'text-amber-600' : 'text-emerald-600')}><span className={cn('h-2 w-2 rounded-sm', secondTone === 'amber' ? 'bg-amber-500' : 'bg-emerald-500')} />{second}</span></div>; }
function LogDetails({ logs }: { logs: WorkLog[] }) { if (!logs.length) return <EmptyChart />; return <><div className="max-h-[440px] space-y-2 overflow-y-auto sm:hidden">{logs.map((log) => <div key={log.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"><div className="flex items-center justify-between"><span className="font-medium">{log.date}</span><span className="text-xs text-slate-400">{log.startTime}–{log.endTime}</span></div><div className="mt-2 grid grid-cols-2 text-xs"><span>实际 <b>{formatWorkHours(calculateActualMinutes(log.startTime, log.endTime))}</b></span><span className="text-right">有效 <b>{formatWorkHours(calculateWorkMinutes(log.startTime, log.endTime))}</b></span></div></div>)}</div><div className="hidden max-h-[440px] overflow-y-auto sm:block"><table className="w-full text-sm"><thead className="sticky top-0 bg-white text-xs text-slate-400 dark:bg-slate-900"><tr><th className="py-2 text-left font-medium">日期</th><th className="text-left font-medium">上班</th><th className="text-left font-medium">下班</th><th className="text-right font-medium">实际工时</th><th className="py-2 text-right font-medium">有效工时</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{logs.map((log) => <tr key={log.id}><td className="py-2.5 font-medium">{log.date}</td><td>{log.startTime}</td><td>{log.endTime}</td><td className="text-right">{formatWorkHours(calculateActualMinutes(log.startTime, log.endTime))}</td><td className="py-2.5 text-right">{formatWorkHours(calculateWorkMinutes(log.startTime, log.endTime))}</td></tr>)}</tbody></table></div></>; }
function EmptyChart() { return <div className="py-12 text-center text-sm text-slate-400">所选时间内还没有工时记录</div>; }
