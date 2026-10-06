import { useEffect, useRef, useState } from 'react';
import { Excalidraw, MainMenu, serializeAsJSON } from '@excalidraw/excalidraw';
import { Plus, Pencil } from 'lucide-react';
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
    <section className="personal-whiteboard flex h-[calc(100dvh-3.5rem)] min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-white px-3 py-2 dark:bg-slate-900">
        <label className="sr-only" htmlFor="whiteboard-project">白板项目</label>
        <select id="whiteboard-project" className="input w-auto min-w-0 max-w-[55vw] py-1.5 sm:max-w-xs" value={selected.id}
          onChange={(event) => { if (flushRef.current()) setSelectedId(event.target.value); }}>
          {projects.map((board) => <option key={board.id} value={board.id}>{board.title || '默认项目'}</option>)}
        </select>
        <button className="btn-outline" onClick={() => { setTitle(''); setDialog('create'); }}><Plus size={15} />新建项目</button>
        <button className="btn-ghost" aria-label="重命名项目" title="重命名项目" onClick={() => { setTitle(selected.title || '默认项目'); setDialog('rename'); }}><Pencil size={15} /></button>
      </div>
      <Board key={selected.id} workspaceKey={workspaceKey} boardId={selected.id} flushRef={flushRef} />
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

function Board({ workspaceKey, boardId, flushRef }: { workspaceKey: string; boardId: string; flushRef: React.MutableRefObject<() => boolean> }) {
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
      <div className="flex shrink-0 items-center justify-between gap-2 border-b bg-white px-3 py-2 text-sm dark:bg-slate-900">
        <span className={error ? 'text-rose-600' : 'text-slate-500 dark:text-slate-400'} role="status">
          {error || (!userId ? '本地保存 · 登录后可同步到 VPS' : dirty ? '等待同步到 VPS' : status === 'syncing' ? '同步中…' : status === 'error' || status === 'offline' ? '同步暂不可用 · 本地内容保留' : '已保存 · VPS 同步')}
        </span>
        {userId && <button className="btn-ghost shrink-0" onClick={() => { if (flush()) void runSync(); }}>立即同步</button>}
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
