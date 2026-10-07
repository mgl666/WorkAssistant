import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Excalidraw, MainMenu, serializeAsJSON } from '@excalidraw/excalidraw';
import { ArrowLeft, Check, ChevronDown, Folder, Plus, Pencil, RefreshCw } from 'lucide-react';
import type { ExcalidrawImperativeAPI, ExcalidrawInitialDataState, ExcalidrawProps } from '@excalidraw/excalidraw/types';
import '@excalidraw/excalidraw/index.css';
import { useStore } from '@/store/useStore';
import { runSync } from '@/lib/sync';
import { Modal } from '@/components/ui';
import { downloadFile } from '@/lib/utils';
import '@/styles/whiteboard.css';

window.EXCALIDRAW_ASSET_PATH = new URL(`${import.meta.env.BASE_URL}excalidraw/`, document.baseURI).href;

export default function Whiteboard() {
  const workspaceKey = useStore((s) => s.workspaceKey);
  return <Projects key={workspaceKey} workspaceKey={workspaceKey} />;
}

function Projects({ workspaceKey }: { workspaceKey: string }) {
  const navigate = useNavigate();
  const boards = useStore((s) => s.whiteboards);
  const [selectedId, setSelectedId] = useState('main');
  const [dialog, setDialog] = useState<'create' | 'rename' | null>(null);
  const [title, setTitle] = useState('');
  const flushRef = useRef<() => boolean>(() => true);
  const projects = boards.some((board) => board.id === 'main') ? boards : [{ id: 'main', title: '默认项目' }, ...boards];
  const selected = projects.find((board) => board.id === selectedId) ?? projects[0];

  const submit = () => {
    if (!title.trim() || !flushRef.current()) return;
    if (dialog === 'create') setSelectedId(useStore.getState().addWhiteboard(title));
    else useStore.getState().renameWhiteboard(selected.id, title);
    setDialog(null);
  };

  return (
    <section className="personal-whiteboard flex h-dvh min-h-0 flex-col overflow-hidden">
      <Board key={selected.id} workspaceKey={workspaceKey} boardId={selected.id} flushRef={flushRef} toolbar={<>
        <button className="btn-ghost shrink-0 px-2" aria-label="返回工作助手" title="返回工作助手" onClick={() => { if (flushRef.current()) navigate('/'); }}><ArrowLeft size={18} /><span className="hidden sm:inline">返回</span></button>
        <ProjectPicker projects={projects} selectedId={selected.id} onSelect={(id) => {
          if (!flushRef.current()) return false;
          setSelectedId(id);
          return true;
        }} />
        <button className="btn-outline shrink-0 px-2" aria-label="新建项目" title="新建项目" onClick={() => { setTitle(''); setDialog('create'); }}><Plus size={15} /><span className="hidden sm:inline">新建项目</span></button>
        <button className="btn-ghost" aria-label="重命名项目" title="重命名项目" onClick={() => { setTitle(selected.title || '默认项目'); setDialog('rename'); }}><Pencil size={15} /></button>
      </>} />
      <Modal open={dialog !== null} title={dialog === 'create' ? '新建白板项目' : '重命名项目'} onClose={() => setDialog(null)}
        footer={<><button className="btn-ghost" onClick={() => setDialog(null)}>取消</button><button className="btn-primary" disabled={!title.trim()} onClick={submit}>保存</button></>}>
        <form onSubmit={(event) => { event.preventDefault(); submit(); }}>
          <label htmlFor="whiteboard-project-title" className="mb-2 block text-sm">项目名称</label>
          <input id="whiteboard-project-title" className="input" autoFocus maxLength={100} value={title} onChange={(event) => setTitle(event.target.value)} />
        </form>
      </Modal>
    </section>
  );
}

function ProjectPicker({ projects, selectedId, onSelect }: {
  projects: Array<{ id: string; title?: string }>;
  selectedId: string;
  onSelect: (id: string) => boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const selected = projects.find((project) => project.id === selectedId);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    root.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);

  return (
    <div ref={root} className="relative z-40 w-24 shrink-0 sm:w-44" onKeyDown={(event) => {
      if (event.key === 'Escape' && open) {
        event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus();
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      if (!open) { setOpen(true); return; }
      const options = Array.from(root.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? []);
      const current = options.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
        : (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
      options[next]?.focus();
    }}>
      <button ref={trigger} type="button" aria-label={`选择白板项目：${selected?.title || '默认项目'}`} aria-haspopup="menu" aria-expanded={open}
        aria-controls="whiteboard-project-menu" onClick={() => setOpen(!open)}
        className={`flex h-9 w-full items-center gap-2 rounded-lg border px-2.5 text-sm font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-indigo-400/40 ${open
          ? 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-500/40 dark:bg-indigo-500/15 dark:text-indigo-200'
          : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'}`}>
        <Folder size={15} className="hidden shrink-0 opacity-60 sm:block" />
        <span className="min-w-0 flex-1 truncate text-left">{selected?.title || '默认项目'}</span>
        <ChevronDown size={14} className={`shrink-0 opacity-60 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div id="whiteboard-project-menu" role="menu" aria-label="白板项目" className="absolute left-0 top-full mt-2 w-56 max-w-[calc(100vw-4rem)] overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-900/10 dark:border-slate-700 dark:bg-slate-900">
        <div className="px-2.5 py-2 text-xs font-medium text-slate-400">切换项目</div>
        <div className="max-h-64 overflow-y-auto">
          {projects.map((project) => <button key={project.id} role="menuitemradio" aria-checked={project.id === selectedId} type="button"
            onClick={() => { if (onSelect(project.id)) { setOpen(false); trigger.current?.focus(); } }}
            className={`flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400 ${project.id === selectedId
              ? 'bg-indigo-50 font-medium text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200'
              : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
            <span className="min-w-0 flex-1 break-words">{project.title || '默认项目'}</span>
            {project.id === selectedId && <Check size={15} className="shrink-0" />}
          </button>)}
        </div>
      </div>}
    </div>
  );
}

function Board({ workspaceKey, boardId, flushRef, toolbar }: { workspaceKey: string; boardId: string; flushRef: React.MutableRefObject<() => boolean>; toolbar: ReactNode }) {
  const record = useStore((s) => s.whiteboards.find((board) => board.id === boardId));
  const theme = useStore((s) => s.settings.theme);
  const userId = useStore((s) => s.sync.userId);
  const dirty = useStore((s) => Boolean(s.dirty[`whiteboards:${boardId}`]));
  const status = useStore((s) => s.sync.status);
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [error, setError] = useState('');
  const lastScene = useRef(record?.scene ?? '');
  const pending = useRef<string | null>(null);
  const applying = useRef(false);
  const [initialData] = useState<ExcalidrawInitialDataState>(() => {
    try { return record?.scene ? JSON.parse(record.scene) : { elements: [] }; }
    catch { return { elements: [] }; }
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  const flush = () => {
    if (pending.current === null) return true;
    if (useStore.getState().workspaceKey !== workspaceKey) return false;
    const scene = pending.current;
    try {
      // Keep enough localStorage headroom for tasks, account snapshots and backups.
      if (scene.length > 750_000) throw new Error('白板内容过大，自动保存暂停。请减少图片或从菜单导出白板备份。');
      useStore.getState().saveWhiteboard(scene, boardId);
      pending.current = null;
      setError('');
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败，请从白板菜单导出备份。');
      return false;
    }
  };

  flushRef.current = flush;

  useEffect(() => {
    const saveOnHidden = () => { if (document.visibilityState === 'hidden') flush(); };
    const saveOnExit = () => flush();
    document.addEventListener('visibilitychange', saveOnHidden);
    window.addEventListener('pagehide', saveOnExit);
    return () => {
      flush();
      document.removeEventListener('visibilitychange', saveOnHidden);
      window.removeEventListener('pagehide', saveOnExit);
    };
  }, [workspaceKey, boardId]);

  useEffect(() => {
    if (!api || record?.scene === lastScene.current || pending.current !== null) return;
    try {
      const scene = record?.scene ? JSON.parse(record.scene) as ExcalidrawInitialDataState : { elements: [] };
      applying.current = true;
      lastScene.current = record?.scene ?? '';
      if (scene.files) api.addFiles(Object.values(scene.files));
      api.updateScene({ elements: scene.elements ?? [], appState: { ...api.getAppState(), ...scene.appState } });
      queueMicrotask(() => { applying.current = false; });
    } catch { setError('白板数据无法读取，请尝试导入有效的 .excalidraw 文件。'); }
  }, [api, record]);

  const onChange: NonNullable<ExcalidrawProps['onChange']> = (elements, appState, files) => {
    if (applying.current || appState.isLoading) return;
    // The "database" serializer deliberately omits image files; keep them for sync.
    const scene = JSON.stringify(JSON.parse(serializeAsJSON(elements, appState, files, 'local')));
    if (scene === lastScene.current) return;
    if (!lastScene.current && elements.length === 0) return;
    lastScene.current = scene;
    pending.current = scene;
    // Save locally like the other collections; the shared sync queue waits 2.5s.
    flush();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b bg-white px-2 py-2 text-sm sm:gap-2 sm:px-3 dark:bg-slate-900">
        {toolbar}
        <span className={`ml-auto min-w-0 truncate ${error ? 'text-rose-600' : 'text-slate-500 dark:text-slate-400'}`} role="status" title={error || (!userId ? '已保存到本地，登录后可跨设备同步' : status === 'error' || status === 'offline' ? '同步暂不可用，本地内容保留' : undefined)}>
          {error || (!userId ? '已保存' : dirty ? '待同步' : status === 'syncing' ? '同步中…' : status === 'error' || status === 'offline' ? '同步失败' : '已同步')}
        </span>
        {userId && <button className="btn-ghost shrink-0 px-2" aria-label="立即同步" title="立即同步" onClick={() => { if (flush()) void runSync(); }}><RefreshCw size={16} /><span className="hidden sm:inline">立即同步</span></button>}
      </div>
      <div className="min-h-0 flex-1">
        <Excalidraw excalidrawAPI={setApi} initialData={initialData} onChange={onChange} langCode="zh-CN" theme={theme} name={record?.title || '默认项目'}>
          <MainMenu>
            <MainMenu.DefaultItems.LoadScene />
            <MainMenu.Item onSelect={() => {
              if (!api) return;
              downloadFile(`${record?.title || '默认项目'}.excalidraw`, serializeAsJSON(api.getSceneElements(), api.getAppState(), api.getFiles(), 'local'), 'application/json');
            }}>导出白板文件</MainMenu.Item>
            <MainMenu.DefaultItems.SaveAsImage />
            <MainMenu.DefaultItems.SearchMenu />
            <MainMenu.DefaultItems.ClearCanvas />
            <MainMenu.Separator />
            <MainMenu.DefaultItems.ChangeCanvasBackground />
          </MainMenu>
        </Excalidraw>
      </div>
    </div>
  );
}
