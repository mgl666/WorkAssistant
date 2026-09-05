import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Copy, Download, ListChecks, NotebookPen, Sparkles, Timer } from 'lucide-react';
import { copyText, downloadFile } from '@/lib/utils';
import { addDays, formatMinutes, startOfWeek, toKey } from '@/lib/date';
import { chatCompletion } from '@/lib/ai';
import { useStore } from '@/store/useStore';
import { expandEventOccurrences } from '@/lib/recurrence';
import { Empty, SectionTitle, useToast } from '@/components/ui';
import { Link } from 'react-router-dom';

export default function Weekly() {
  const store = useStore(); const toast = useToast();
  const [offset, setOffset] = useState(0), [selected, setSelected] = useState<Set<string>>(new Set());
  const [text, setText] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const range = useMemo(() => { const start = addDays(startOfWeek(new Date()), offset * 7), end = addDays(start, 6); return { startKey: toKey(start), endKey: toKey(end), startTime: start.getTime(), endTime: end.getTime() + 86400000 }; }, [offset]);
  const data = useMemo(() => {
    const inKey = (k: string) => k >= range.startKey && k <= range.endKey, inTs = (t?: number) => !!t && t >= range.startTime && t < range.endTime;
    return {
      events: expandEventOccurrences(store.events, range.startKey, range.endKey).sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? ''))),
      todos: store.todos.filter((t) => (t.due && inKey(t.due)) || inTs(t.completedAt)).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999')),
      sessions: store.sessions.filter((s) => s.mode === 'focus' && inTs(s.endedAt)).sort((a, b) => a.endedAt - b.endedAt),
    };
  }, [store.events, store.todos, store.sessions, range]);
  useEffect(() => { setSelected(new Set([...data.events.map((x) => `e:${x.id}:${x.date}`), ...data.todos.map((x) => `t:${x.id}`), ...data.sessions.map((x) => `s:${x.id}`)])); setText(''); }, [data]);
  const toggle = (key: string) => setSelected((old) => { const next = new Set(old); next.has(key) ? next.delete(key) : next.add(key); return next; });
  const selectedCount = selected.size;

  const generate = async () => {
    if (!store.settings.aiApiKey.trim()) { setError('请先到“设置 → AI 设置”填写 API Key。'); return; }
    if (!store.settings.aiEndpoint.trim() || !store.settings.aiModel.trim()) { setError('请先在设置中填写 API 地址和模型名称。'); return; }
    if (!selectedCount) { setError('请至少选择一条记录。'); return; }
    setBusy(true); setError('');
    try {
      const events = data.events.filter((x) => selected.has(`e:${x.id}:${x.date}`)).map((e) => ({ date: e.date, time: e.time ?? '全天', title: e.title, done: e.done, note: e.note ?? '' }));
      const todos = data.todos.filter((x) => selected.has(`t:${x.id}`)).map((t) => ({ title: t.title, due: t.due || '无日期', time: t.dueTime ?? '', done: t.done, priority: t.priority, note: t.note }));
      const sessions = data.sessions.filter((x) => selected.has(`s:${x.id}`)).map((s) => ({ time: new Date(s.endedAt).toLocaleString(), minutes: s.minutes, task: s.task || '未命名专注' }));
      const content = await chatCompletion(store.settings, [
        { role: 'system', content: '你是一位简洁、务实的中文工作总结助手。只根据用户提供的记录写周报，不得虚构。输出 Markdown，包含本周成果、进行中事项、时间投入、风险与下周建议。' },
        { role: 'user', content: `请为 ${range.startKey} 至 ${range.endKey} 生成周报。\n日程：${JSON.stringify(events)}\n待办：${JSON.stringify(todos)}\n番茄专注记录：${JSON.stringify(sessions)}` },
      ]);
      setText(content); toast('AI 周报已生成，记得保存到备忘录');
    } catch (e) { setError(e instanceof Error ? e.message : 'AI 生成失败'); }
    finally { setBusy(false); }
  };

  // 生成结果落库为备忘录，离开页面或换设备都不会丢
  const saveAsNote = () => {
    if (!text.trim()) { setError('还没有可保存的内容。'); return; }
    const id = store.addNote();
    store.updateNote(id, { title: `周报 ${range.startKey} ~ ${range.endKey}`, content: text });
    toast('已保存到备忘录');
  };

  return <div className="space-y-4">
    <div className="card flex flex-wrap items-center gap-2 p-3 sm:p-4">
      <button className="btn-ghost px-1" onClick={() => setOffset(offset - 1)} aria-label="上一周"><ChevronLeft size={18} /></button>
      <span className="min-w-0 flex-1 text-center text-xs font-semibold sm:min-w-[210px] sm:flex-none sm:text-sm">{range.startKey} ~ {range.endKey}{offset === 0 && <span className="ml-2 text-xs font-normal text-indigo-600">本周</span>}</span>
      <button className="btn-ghost px-1" onClick={() => setOffset(offset + 1)} aria-label="下一周"><ChevronRight size={18} /></button>
      <span className="order-last w-full text-center text-xs text-slate-400 sm:order-none sm:ml-auto sm:w-auto">已选择 {selectedCount} 条记录</span>
      <button className="btn-primary w-full sm:w-auto" disabled={busy || !selectedCount} onClick={() => void generate()}><Sparkles size={16} className={busy ? 'animate-pulse' : ''} />{busy ? '生成中…' : 'AI 生成周报'}</button>
    </div>
    {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">{error}</div>}
    <div className="grid gap-4 lg:grid-cols-3">
      <Picker title={`日程 · ${data.events.length}`} icon={CalendarDays} emptyTo="/calendar" emptyLabel="添加日程" items={data.events.map((e) => ({ key: `e:${e.id}:${e.date}`, title: e.title, meta: `${e.date.slice(5)} ${e.time ?? '全天'}` }))} selected={selected} toggle={toggle} />
      <Picker title={`待办 · ${data.todos.length}`} icon={ListChecks} emptyTo="/todos" emptyLabel="添加待办" items={data.todos.map((t) => ({ key: `t:${t.id}`, title: t.title, meta: `${t.done ? '已完成' : '未完成'} · P${t.priority}${t.due ? ` · ${t.due.slice(5)}` : ''}` }))} selected={selected} toggle={toggle} />
      <Picker title={`番茄记录 · ${data.sessions.length}`} icon={Timer} emptyTo="/pomodoro" emptyLabel="开始专注" items={data.sessions.map((s) => ({ key: `s:${s.id}`, title: s.task || '未命名专注', meta: `${toKey(new Date(s.endedAt)).slice(5)} · ${formatMinutes(s.minutes)}` }))} selected={selected} toggle={toggle} />
    </div>
    <div className="card p-4">
      <SectionTitle extra={<div className="flex flex-wrap gap-2"><button className="btn-primary py-1 text-xs" disabled={!text} onClick={saveAsNote}><NotebookPen size={13} />保存为备忘录</button><button className="btn-outline py-1 text-xs" disabled={!text} onClick={async () => toast(await copyText(text) ? '已复制' : '复制失败')}><Copy size={13} />复制</button><button className="btn-outline py-1 text-xs" disabled={!text} onClick={() => downloadFile(`AI周报-${range.startKey}_${range.endKey}.md`, text, 'text/markdown;charset=utf-8')}><Download size={13} />导出</button></div>}>AI 周报内容（可编辑）</SectionTitle>
      <textarea className="input min-h-[300px] resize-y font-mono text-[13px] leading-6 sm:min-h-[380px]" placeholder="选择上方记录并点击“AI 生成周报”" aria-label="AI 周报内容" value={text} onChange={(e) => setText(e.target.value)} />
    </div>
  </div>;
}

function Picker({ title, icon: Icon, items, selected, toggle, emptyTo, emptyLabel }: { title: string; icon: typeof CalendarDays; items: Array<{ key: string; title: string; meta: string }>; selected: Set<string>; toggle: (key: string) => void; emptyTo: string; emptyLabel: string }) {
  return <div className="card p-4"><SectionTitle><span className="flex items-center gap-1.5"><Icon size={14} />{title}</span></SectionTitle>{items.length === 0 ? <Empty icon={Icon} text="本周没有记录" action={<Link className="btn-outline mt-2" to={emptyTo}>{emptyLabel}</Link>} /> : <ul className="max-h-72 space-y-1 overflow-y-auto">{items.map((item) => <li key={item.key}><label className="flex cursor-pointer items-start gap-2 rounded-lg p-2 hover:bg-slate-50 dark:hover:bg-slate-800/60"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-indigo-600" checked={selected.has(item.key)} onChange={() => toggle(item.key)} /><span className="min-w-0"><span className="block truncate text-sm">{item.title}</span><span className="block text-xs text-slate-400">{item.meta}</span></span></label></li>)}</ul>}</div>;
}
