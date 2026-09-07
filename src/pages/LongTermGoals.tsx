import { useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronRight, CornerDownRight, GripVertical, MoreVertical, Pencil, Plus, Target, Trash2, X } from 'lucide-react';
import { Empty, useToast } from '@/components/ui';
import { useDeletable } from '@/hooks/useDeletable';
import { cn } from '@/lib/utils';
import { useStore, type GoalTask, type LongTermGoal } from '@/store/useStore';

const HOVER_ACTIONS = 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100';

export default function LongTermGoals() {
  const goals = useStore((s) => s.goals);
  const addGoal = useStore((s) => s.addGoal);
  const moveGoal = useStore((s) => s.moveGoal);
  const [title, setTitle] = useState('');
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const orderedGoals = useMemo(() => [...goals].sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt)), [goals]);

  const submit = () => {
    if (!title.trim()) return;
    addGoal(title);
    setTitle('');
  };

  return (
    <div className="space-y-4">
      <section className="card flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:p-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">长期目标</h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">按领域建立目标，把长期计划拆成可以逐项完成的任务。</p>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <input
            ref={inputRef}
            className="input min-w-0 flex-1 sm:w-64"
            placeholder="例如：论文、语言学习"
            aria-label="长期目标名称"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
          <button className="btn-primary shrink-0" onClick={submit}><Plus size={16} />新建目标</button>
        </div>
      </section>

      {orderedGoals.length === 0 ? (
        <section className="card min-h-[420px]">
          <Empty icon={Target} text="还没有长期目标" action={<button className="btn-primary mt-2" onClick={() => inputRef.current?.focus()}><Plus size={16} />新建第一个目标</button>} />
        </section>
      ) : (
        <div className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
          {orderedGoals.map((goal, index) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              index={index}
              total={orderedGoals.length}
              dragging={draggingId === goal.id}
              onDragStart={() => setDraggingId(goal.id)}
              onDragEnd={() => setDraggingId(null)}
              onDrop={() => {
                if (draggingId && draggingId !== goal.id) moveGoal(draggingId, index);
                setDraggingId(null);
              }}
              onMove={(nextIndex) => moveGoal(goal.id, nextIndex)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface GoalCardProps {
  goal: LongTermGoal;
  index: number;
  total: number;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
  onMove: (index: number) => void;
}

function GoalCard({ goal, index, total, dragging, onDragStart, onDragEnd, onDrop, onMove }: GoalCardProps) {
  const store = useStore();
  const deletable = useDeletable();
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(goal.title);
  const [adding, setAdding] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [childFor, setChildFor] = useState<string | null>(null);
  const [childTitle, setChildTitle] = useState('');
  const [completedOpen, setCompletedOpen] = useState(false);

  const roots = useMemo(() => goal.tasks
    .filter((task) => !task.parentId || !goal.tasks.some((candidate) => candidate.id === task.parentId))
    .sort((a, b) => a.createdAt - b.createdAt), [goal.tasks]);
  const pending = roots.filter((task) => !task.done);
  const completed = roots.filter((task) => task.done).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));

  const addTask = () => {
    if (!taskTitle.trim()) return;
    store.addGoalTask(goal.id, taskTitle);
    setTaskTitle('');
    setAdding(false);
  };
  const addChild = (parentId: string) => {
    if (!childTitle.trim()) return;
    store.addGoalTask(goal.id, childTitle, parentId);
    setChildTitle('');
    setChildFor(null);
  };
  const finishRename = () => {
    store.renameGoal(goal.id, name);
    setName(name.trim() || goal.title);
    setRenaming(false);
  };

  return (
    <article
      className={cn('card flex h-[420px] min-w-0 flex-col overflow-hidden p-4 transition sm:p-5', dragging && 'opacity-50 ring-2 ring-indigo-400')}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
    >
      <header className="relative flex items-start gap-2">
        <button
          draggable
          onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; onDragStart(); }}
          onDragEnd={onDragEnd}
          className="-ml-2 mt-0.5 hidden cursor-grab touch-none rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 active:cursor-grabbing dark:hover:bg-slate-800 sm:block"
          title="拖动调整目标顺序"
          aria-label={`拖动「${goal.title}」调整顺序`}
        >
          <GripVertical size={18} />
        </button>
        {renaming ? (
          <input
            autoFocus
            className="input h-10 min-w-0 flex-1 text-lg font-medium"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={finishRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') finishRename();
              if (e.key === 'Escape') { setName(goal.title); setRenaming(false); }
            }}
          />
        ) : <h2 className="min-w-0 flex-1 truncate text-xl font-medium text-slate-800 dark:text-slate-100">{goal.title}</h2>}
        <div className="flex shrink-0 items-center rounded-lg border border-slate-200 p-0.5 dark:border-slate-700 sm:hidden" aria-label="调整目标顺序">
          <button
            disabled={index === 0}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-slate-800"
            onClick={() => onMove(index - 1)}
            title="向前移动"
            aria-label={`将「${goal.title}」向前移动`}
          >
            <ArrowLeft size={17} />
          </button>
          <button
            disabled={index === total - 1}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-slate-800"
            onClick={() => onMove(index + 1)}
            title="向后移动"
            aria-label={`将「${goal.title}」向后移动`}
          >
            <ArrowRight size={17} />
          </button>
        </div>
        <button className="btn-ghost -mr-2 px-2" aria-label={`${goal.title}菜单`} onClick={() => setMenuOpen((open) => !open)}><MoreVertical size={19} /></button>
        {menuOpen && (
          <div className="absolute right-0 top-9 z-10 w-32 rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
            <button disabled={index === 0} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-slate-800" onClick={() => { onMove(index - 1); setMenuOpen(false); }}><ArrowLeft size={14} />向前移动</button>
            <button disabled={index === total - 1} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-slate-800" onClick={() => { onMove(index + 1); setMenuOpen(false); }}><ArrowRight size={14} />向后移动</button>
            <button className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => { setMenuOpen(false); setRenaming(true); }}><Pencil size={14} />重命名</button>
            <button className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10" onClick={() => { setMenuOpen(false); deletable(`已删除长期目标「${goal.title}」`, () => store.removeGoal(goal.id), { confirm: `删除「${goal.title}」会同时删除其中所有任务，确定继续吗？` }); }}><Trash2 size={14} />删除目标</button>
          </div>
        )}
      </header>

      <div className="mt-5">
        {adding ? (
          <div className="flex gap-2">
            <input autoFocus className="input h-10 min-w-0 flex-1 text-sm" placeholder="任务名称" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addTask(); if (e.key === 'Escape') { setAdding(false); setTaskTitle(''); } }} />
            <button className="btn-primary h-10 px-3" onClick={addTask}>添加</button>
            <button className="btn-ghost h-10 px-2" aria-label="取消添加" onClick={() => { setAdding(false); setTaskTitle(''); }}><X size={16} /></button>
          </div>
        ) : (
          <button className="flex h-10 items-center gap-2 rounded-lg px-1 text-sm font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400" onClick={() => setAdding(true)}><CheckCircle2 size={20} /><Plus size={13} className="-ml-2 mt-2 rounded-full bg-white dark:bg-slate-900" />添加任务</button>
        )}
      </div>

      <div className="mt-2 min-h-0 flex-1 overflow-y-auto pr-1">
        {pending.length === 0 && completed.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">添加任务，开始推进这个目标</p> : (
          <>
            <ul className="space-y-1">
              {pending.map((task) => <GoalTaskRow key={task.id} goal={goal} task={task} childFor={childFor} childTitle={childTitle} setChildFor={setChildFor} setChildTitle={setChildTitle} addChild={addChild} />)}
            </ul>
            {completed.length > 0 && (
              <section className="mt-3 border-t border-slate-100 pt-2 dark:border-slate-800">
                <button className="flex w-full items-center gap-2 rounded-md py-1 text-left text-sm font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300" onClick={() => setCompletedOpen((open) => !open)} aria-expanded={completedOpen}>
                  <ChevronRight size={16} className={cn('transition-transform', completedOpen && 'rotate-90')} />已完成 ({completed.length})
                </button>
                {completedOpen && <ul className="mt-1 space-y-1">{completed.map((task) => <GoalTaskRow key={task.id} goal={goal} task={task} childFor={childFor} childTitle={childTitle} setChildFor={setChildFor} setChildTitle={setChildTitle} addChild={addChild} />)}</ul>}
              </section>
            )}
          </>
        )}
      </div>
    </article>
  );
}

interface GoalTaskRowProps {
  goal: LongTermGoal;
  task: GoalTask;
  childFor: string | null;
  childTitle: string;
  setChildFor: (id: string | null) => void;
  setChildTitle: (value: string) => void;
  addChild: (parentId: string) => void;
}

function GoalTaskRow({ goal, task, childFor, childTitle, setChildFor, setChildTitle, addChild }: GoalTaskRowProps) {
  const store = useStore();
  const toast = useToast();
  const children = goal.tasks.filter((child) => child.parentId === task.id).sort((a, b) => a.createdAt - b.createdAt);
  const removeTask = (taskId: string, title: string, child = false) => {
    store.removeGoalTask(goal.id, taskId);
    toast(child ? `已删除子任务「${title}」` : `已删除任务「${title}」`);
  };

  return (
    <li>
      <div className="group flex min-h-10 items-center gap-3 rounded-lg px-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/60">
        <TaskCheck done={task.done} label={task.title} onClick={() => store.toggleGoalTask(goal.id, task.id)} />
        <input className={cn('min-w-0 flex-1 bg-transparent text-sm outline-none', task.done && 'text-slate-400 line-through')} value={task.title} onChange={(e) => store.updateGoalTask(goal.id, task.id, e.target.value)} aria-label="长期目标任务名称" />
        {!task.done && <button className={cn('btn-ghost px-1.5', HOVER_ACTIONS)} title="添加二级子任务" aria-label={`为 ${task.title} 添加二级子任务`} onClick={() => { setChildFor(childFor === task.id ? null : task.id); setChildTitle(''); }}><Plus size={15} /></button>}
        <button className={cn('btn-danger px-1.5', HOVER_ACTIONS)} title="删除任务" aria-label={`删除 ${task.title}`} onClick={() => removeTask(task.id, task.title)}><Trash2 size={14} /></button>
      </div>
      {children.length > 0 && <ul className="ml-7 space-y-0.5">{children.map((child) => (
        <li key={child.id} className="group flex min-h-9 items-center gap-2 rounded-lg px-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/60">
          <CornerDownRight size={14} className="shrink-0 text-slate-300 dark:text-slate-600" />
          <TaskCheck done={child.done} label={child.title} small onClick={() => store.toggleGoalTask(goal.id, child.id)} />
          <input className={cn('min-w-0 flex-1 bg-transparent text-sm outline-none', child.done && 'text-slate-400 line-through')} value={child.title} onChange={(e) => store.updateGoalTask(goal.id, child.id, e.target.value)} aria-label="二级子任务名称" />
          <button className={cn('btn-danger px-1.5', HOVER_ACTIONS)} title="删除子任务" aria-label={`删除 ${child.title}`} onClick={() => removeTask(child.id, child.title, true)}><Trash2 size={13} /></button>
        </li>
      ))}</ul>}
      {childFor === task.id && (
        <div className="ml-8 mt-1 flex gap-2 rounded-lg bg-slate-50 p-2 dark:bg-slate-800/60">
          <CornerDownRight size={14} className="mt-2 shrink-0 text-slate-400" />
          <input autoFocus className="input h-9 min-w-0 flex-1 py-1 text-sm" placeholder="添加二级子任务" value={childTitle} onChange={(e) => setChildTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addChild(task.id); if (e.key === 'Escape') { setChildFor(null); setChildTitle(''); } }} />
          <button className="btn-outline h-9 px-2 text-xs" onClick={() => addChild(task.id)}>添加</button>
        </div>
      )}
    </li>
  );
}

function TaskCheck({ done, label, small = false, onClick }: { done: boolean; label: string; small?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={done ? `将 ${label} 标记为未完成` : `将 ${label} 标记为已完成`}
      className={cn('flex shrink-0 items-center justify-center rounded-full border transition-colors', small ? 'h-4 w-4' : 'h-5 w-5', done ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-400 hover:border-indigo-500')}
    >
      {done && <Check size={small ? 10 : 13} />}
    </button>
  );
}
