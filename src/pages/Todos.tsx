import { useMemo, useRef, useState } from 'react';
import { CalendarClock, Check, ChevronDown, CornerDownRight, Inbox, Layers3, ListChecks, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatShort, relativeDay, todayKey } from '@/lib/date';
import { DEFAULT_LIST_ID, useStore, type Todo, type TodoPriority } from '@/store/useStore';
import { useDeletable } from '@/hooks/useDeletable';
import { Empty, SectionTitle } from '@/components/ui';

/** 触屏设备没有 hover，删除类按钮在小屏上常显，大屏才用悬停浮现 */
const HOVER_ACTIONS = 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100';

type TodoFilter = 'all' | 'today' | 'overdue' | 'starred' | 'nodate';

const FILTERS: Array<{ key: TodoFilter; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'today', label: '今天' },
  { key: 'overdue', label: '逾期' },
  { key: 'starred', label: '重要' },
  { key: 'nodate', label: '无日期' },
];

const PRIORITY: Record<TodoPriority, { label: string; cls: string }> = {
  1: { label: '1 · 很低', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800' },
  2: { label: '2 · 较低', cls: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15' },
  3: { label: '3 · 普通', cls: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15' },
  4: { label: '4 · 重要', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15' },
  5: { label: '5 · 紧急', cls: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15' },
};

export default function Todos() {
  const store = useStore();
  const deletable = useDeletable();
  const [activeList, setActiveList] = useState<string>('all');
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [priority, setPriority] = useState<TodoPriority>(3);
  const [sortBy, setSortBy] = useState<'time' | 'priority'>('time');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [newListName, setNewListName] = useState('');
  const [editingList, setEditingList] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<TodoFilter>('all');
  const titleRef = useRef<HTMLInputElement>(null);
  const today = todayKey();
  const visible = activeList === 'all' ? store.todos : store.todos.filter((t) => t.listId === activeList);
  // 主任务与子任务的统计口径统一：所有计数都只算主任务，避免侧栏数字比列表多
  const isRoot = (t: Todo) => !t.parentId || !store.todos.some((parent) => parent.id === t.parentId);
  const allRoots = store.todos.filter(isRoot);
  const keyword = query.trim().toLowerCase();
  const inFilter = (t: Todo) => {
    if (filter === 'today') return t.due === today;
    if (filter === 'overdue') return !!t.due && t.due < today && !t.done;
    if (filter === 'starred') return t.starred;
    if (filter === 'nodate') return !t.due;
    return true;
  };
  const visibleRoots = visible
    .filter(isRoot)
    .filter(inFilter)
    .filter((t) => !keyword || t.title.toLowerCase().includes(keyword) || t.note.toLowerCase().includes(keyword));
  const sorter = (a: Todo, b: Todo) => sortBy === 'priority'
    ? b.priority - a.priority || (a.due || '9999').localeCompare(b.due || '9999')
    : (a.due || '9999').localeCompare(b.due || '9999') || b.priority - a.priority;
  const pending = useMemo(() => visibleRoots.filter((t) => !t.done).sort(sorter), [visibleRoots, sortBy]);
  const completed = useMemo(() => visibleRoots.filter((t) => t.done).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)), [visibleRoots]);
  const submit = () => {
    if (!title.trim()) return;
    store.addTodo({ title: title.trim(), due, dueTime: dueTime || undefined, priority, listId: activeList === 'all' ? DEFAULT_LIST_ID : activeList });
    setTitle(''); setDue(''); setDueTime(''); setPriority(3);
  };

  return <div className="grid items-stretch gap-3 sm:gap-4 lg:grid-cols-[230px_1fr]">
    <aside className="card flex max-h-[320px] min-h-[180px] flex-col overflow-hidden p-2 lg:h-[calc(100vh-7rem)] lg:max-h-none lg:min-h-[620px]">
      <button onClick={() => setActiveList('all')} className={cn('flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm', activeList === 'all' ? 'bg-indigo-50 font-medium text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300' : 'hover:bg-slate-100 dark:hover:bg-slate-800')}>
        <Layers3 size={16} /><span className="flex-1 text-left">全部任务</span><span className="text-xs text-slate-400">{allRoots.length}</span>
      </button>
      <div className="mt-2 flex gap-1 px-1"><input className="input h-10 py-1 text-sm sm:h-8" placeholder="新清单名称" aria-label="新清单名称" value={newListName} onChange={(e) => setNewListName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && newListName.trim()) { setActiveList(store.addList(newListName)); setNewListName(''); } }} /><button className="btn-outline h-10 px-3 sm:h-8 sm:px-2" onClick={() => { if (newListName.trim()) { setActiveList(store.addList(newListName)); setNewListName(''); } }} aria-label="新建清单"><Plus size={15} /></button></div>
      <div className="my-2 border-t border-slate-200 dark:border-slate-800" />
      <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">{store.lists.map((list) => <li key={list.id} className={cn('group flex items-center gap-1 rounded-lg px-2 py-1.5', activeList === list.id ? 'bg-indigo-50 dark:bg-indigo-500/15' : 'hover:bg-slate-100 dark:hover:bg-slate-800')}>
        {editingList === list.id ? <input autoFocus className="input h-10 py-0.5 text-sm sm:h-7" aria-label={`重命名清单 ${list.name}`} defaultValue={list.name} onBlur={(e) => { store.renameList(list.id, e.target.value.trim() || list.name); setEditingList(null); }} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} /> : <>
          <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setActiveList(list.id)}><ListChecks size={15} className="text-slate-400" /><span className="truncate text-sm">{list.name}</span><span className="ml-auto text-xs text-slate-400">{allRoots.filter((t) => t.listId === list.id).length}</span></button>
          <button className="btn-ghost inline-flex px-2 sm:px-1 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100" title="重命名" aria-label={`重命名清单 ${list.name}`} onClick={() => setEditingList(list.id)}><Pencil size={13} /></button>
          {list.id !== DEFAULT_LIST_ID && <button className="btn-danger inline-flex px-2 sm:px-1 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100" title="删除清单" aria-label={`删除清单 ${list.name}`} onClick={() => deletable(`已删除清单「${list.name}」及其中任务`, () => { store.removeList(list.id); if (activeList === list.id) setActiveList('all'); }, { confirm: `删除清单「${list.name}」会连同其中所有任务一起删除，确定继续吗？` })}><X size={13} /></button>}
        </>}
      </li>)}</ul>
    </aside>

    <main className="card flex min-h-[70dvh] flex-col overflow-hidden p-3 sm:p-4 lg:h-[calc(100vh-7rem)] lg:min-h-[620px]">
      <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_145px_110px_125px_auto]">
        <input ref={titleRef} className="input" placeholder="添加任务，回车保存" aria-label="任务标题" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        <input type="date" className="input" aria-label="到期日期" value={due} onChange={(e) => setDue(e.target.value)} />
        <input type="time" className="input" aria-label="到期时间" value={dueTime} onChange={(e) => setDueTime(e.target.value)} disabled={!due} />
        <select className="input" aria-label="优先级" value={priority} onChange={(e) => setPriority(Number(e.target.value) as TodoPriority)}>{Object.entries(PRIORITY).map(([v, p]) => <option key={v} value={v}>{p.label}</option>)}</select>
        <button className="btn-primary" onClick={submit}><Plus size={16} />添加</button>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
          <input className="input h-9 py-1 pl-8 text-sm" placeholder="搜索任务标题或备注" aria-label="搜索任务" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="任务筛选">
          {FILTERS.map((f) => <button key={f.key} onClick={() => setFilter(f.key)} aria-pressed={filter === f.key} className={cn('chip border px-2 py-1', filter === f.key ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300' : 'border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800')}>{f.label}</button>)}
        </div>
      </div>
      <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
        <span className="text-sm font-medium">{activeList === 'all' ? '全部任务' : store.lists.find((l) => l.id === activeList)?.name}</span>
        <label className="flex items-center gap-2 text-xs text-slate-500">排序<select className="input h-8 w-32 py-1 text-xs" value={sortBy} onChange={(e) => setSortBy(e.target.value as 'time' | 'priority')}><option value="time">按时间</option><option value="priority">按重要程度</option></select></label>
      </div>
      {visibleRoots.length === 0 ? <div className="min-h-0 flex-1"><Empty icon={Inbox} text={query || filter !== 'all' ? '没有符合条件的任务' : '这里还没有任务'} action={query || filter !== 'all' ? <button className="btn-outline mt-2" onClick={() => { setQuery(''); setFilter('all'); }}>清除筛选条件</button> : <button className="btn-primary mt-2" onClick={() => titleRef.current?.focus()}><Plus size={16} />添加第一个任务</button>} /></div> : <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
        <TaskSection title={`未完成 · ${pending.length}`} items={pending} expanded={expanded} setExpanded={setExpanded} />
        <TaskSection title={`已完成 · ${completed.length}`} items={completed} expanded={expanded} setExpanded={setExpanded} />
        {completed.length > 0 && <button className="btn-danger text-xs" title="只清除主任务与其子任务都已完成的整组；主任务已完成但还有未完成子任务时会保留整组，不会留下孤立子任务" onClick={() => deletable(`已清除 ${completed.length} 组已完成任务`, () => store.clearCompletedTodos(activeList === 'all' ? undefined : activeList))}><Trash2 size={14} />清除已完成</button>}
      </div>}
    </main>
  </div>;
}

function TaskSection({ title, items, expanded, setExpanded }: { title: string; items: Todo[]; expanded: string | null; setExpanded: (id: string | null) => void }) {
  const store = useStore(); const today = todayKey(); const deletable = useDeletable();
  return <section><SectionTitle>{title}</SectionTitle>{items.length === 0 ? <p className="py-2 text-sm text-slate-400">暂无</p> : <ul className="space-y-1">{items.map((todo) => { const children = store.todos.filter((child) => child.parentId === todo.id).sort((a, b) => a.createdAt - b.createdAt); return <li key={todo.id} className="rounded-lg border border-slate-100 dark:border-slate-800">
    <div className="flex flex-wrap items-center gap-2 px-2 py-2 sm:flex-nowrap">
      <button onClick={() => store.toggleTodo(todo.id)} aria-label={todo.done ? '标记未完成' : '标记已完成'} className={cn('flex h-5 w-5 items-center justify-center rounded-full border', todo.done ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300')}>
        {todo.done && <Check size={13} />}
      </button>
      <button className="min-w-0 flex-1 text-left" onClick={() => setExpanded(expanded === todo.id ? null : todo.id)}><span className={cn('block truncate text-sm', todo.done && 'text-slate-400 line-through')}>{todo.title}</span></button>
      <span className={cn('chip shrink-0 text-[11px]', PRIORITY[todo.priority].cls)}>{PRIORITY[todo.priority].label.split(' · ')[1]}</span>
      {todo.due && <span className={cn('order-last ml-7 flex w-full items-center gap-1 text-xs sm:order-none sm:ml-0 sm:w-auto', !todo.done && todo.due < today ? 'text-rose-600' : 'text-slate-400')}><CalendarClock size={12} />{relativeDay(todo.due) || formatShort(todo.due)}{todo.dueTime ? ` ${todo.dueTime}` : ''}</span>}
      <button className="btn-ghost px-2 sm:px-1" onClick={() => setExpanded(expanded === todo.id ? null : todo.id)} aria-label={expanded === todo.id ? `收起任务 ${todo.title}` : `展开任务 ${todo.title}`}><ChevronDown size={14} className={cn('transition', expanded === todo.id && 'rotate-180')} /></button>
    </div>
    {children.length > 0 && <ul className="space-y-0.5 border-t border-slate-100 bg-slate-50/50 py-1 pl-9 pr-2 dark:border-slate-800 dark:bg-slate-950/20">{children.map((child) => <li key={child.id} className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white dark:hover:bg-slate-900">
      <CornerDownRight size={13} className="shrink-0 text-slate-300" />
      <button onClick={() => store.toggleTodo(child.id)} aria-label={child.done ? '标记子任务未完成' : '标记子任务已完成'} className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded-full border', child.done ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300')}>{child.done && <Check size={11} />}</button>
      <input className={cn('min-w-0 flex-1 bg-transparent text-sm outline-none', child.done && 'text-slate-400 line-through')} value={child.title} onChange={(e) => store.updateTodo(child.id, { title: e.target.value })} aria-label="子任务标题" />
      <button className={cn('btn-danger px-1', HOVER_ACTIONS)} onClick={() => deletable('已删除子任务', () => store.removeTodo(child.id))} title="删除子任务"><Trash2 size={12} /></button>
    </li>)}</ul>}
    {expanded === todo.id && <div className="grid gap-2 border-t border-slate-100 p-3 sm:grid-cols-4 dark:border-slate-800">
      <input className="input text-sm" aria-label="任务标题" value={todo.title} onChange={(e) => store.updateTodo(todo.id, { title: e.target.value })} />
      <input type="date" className="input text-sm" aria-label="到期日期" value={todo.due} onChange={(e) => store.updateTodo(todo.id, { due: e.target.value })} />
      <input type="time" className="input text-sm" aria-label="到期时间" value={todo.dueTime ?? ''} onChange={(e) => store.updateTodo(todo.id, { dueTime: e.target.value || undefined })} disabled={!todo.due} />
      <select className="input text-sm" aria-label="优先级" value={todo.priority} onChange={(e) => store.updateTodo(todo.id, { priority: Number(e.target.value) as TodoPriority })}>{Object.entries(PRIORITY).map(([v, p]) => <option key={v} value={v}>{p.label}</option>)}</select>
      <textarea className="input min-h-20 sm:col-span-3" placeholder="备注" aria-label="任务备注" value={todo.note} onChange={(e) => store.updateTodo(todo.id, { note: e.target.value })} />
      <div className="flex items-end justify-end"><button className="btn-danger" onClick={() => deletable(`已删除「${todo.title || '任务'}」及其子任务`, () => store.removeTodo(todo.id))}><Trash2 size={14} />删除</button></div>
      <div className="sm:col-span-4"><SubtaskAdder parent={todo} /></div>
    </div>}
  </li>; })}</ul>}</section>;
}

function SubtaskAdder({ parent }: { parent: Todo }) {
  const addTodo = useStore((s) => s.addTodo);
  const [title, setTitle] = useState('');
  const submit = () => {
    if (!title.trim()) return;
    addTodo({ title: title.trim(), parentId: parent.id, listId: parent.listId, priority: parent.priority });
    setTitle('');
  };
  return <div className="flex gap-2 rounded-lg bg-slate-50 p-2 dark:bg-slate-900/60"><div className="flex min-w-0 flex-1 items-center gap-2"><CornerDownRight size={14} className="shrink-0 text-slate-400" /><input className="input h-10 py-1 text-sm sm:h-8" placeholder="添加二级子任务" aria-label={`为 ${parent.title} 添加二级子任务`} value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} /></div><button className="btn-outline h-10 px-3 text-xs sm:h-8 sm:px-2" onClick={submit}><Plus size={13} />添加</button></div>;
}
