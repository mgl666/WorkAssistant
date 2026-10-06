import { useEffect, useRef, useState } from 'react';
import { Excalidraw, serializeAsJSON } from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI, ExcalidrawInitialDataState, ExcalidrawProps } from '@excalidraw/excalidraw/types';
import '@excalidraw/excalidraw/index.css';
import { useStore } from '@/store/useStore';
import { runSync } from '@/lib/sync';

window.EXCALIDRAW_ASSET_PATH = new URL(`${import.meta.env.BASE_URL}excalidraw/`, document.baseURI).href;

export default function Whiteboard() {
  const workspaceKey = useStore((s) => s.workspaceKey);
  return <Board key={workspaceKey} workspaceKey={workspaceKey} />;
}

function Board({ workspaceKey }: { workspaceKey: string }) {
  const record = useStore((s) => s.whiteboards.find((board) => board.id === 'main'));
  const theme = useStore((s) => s.settings.theme);
  const userId = useStore((s) => s.sync.userId);
  const dirty = useStore((s) => Boolean(s.dirty['whiteboards:main']));
  const status = useStore((s) => s.sync.status);
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [error, setError] = useState('');
  const lastScene = useRef(record?.scene ?? '');
  const pending = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const applying = useRef(false);
  const [initialData] = useState<ExcalidrawInitialDataState>(() => {
    try { return record ? JSON.parse(record.scene) : { elements: [] }; }
    catch { return { elements: [] }; }
  });

  const flush = () => {
    if (pending.current === null || useStore.getState().workspaceKey !== workspaceKey) return;
    const scene = pending.current;
    try {
      // Keep enough localStorage headroom for tasks, account snapshots and backups.
      if (scene.length > 750_000) throw new Error('白板内容过大，自动保存暂停。请减少图片或从菜单导出白板备份。');
      useStore.getState().saveWhiteboard(scene);
      pending.current = null;
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败，请从白板菜单导出备份。');
    }
  };

  useEffect(() => {
    const saveOnHidden = () => { if (document.visibilityState === 'hidden') flush(); };
    const saveOnExit = () => flush();
    document.addEventListener('visibilitychange', saveOnHidden);
    window.addEventListener('pagehide', saveOnExit);
    return () => {
      clearTimeout(timer.current);
      flush();
      document.removeEventListener('visibilitychange', saveOnHidden);
      window.removeEventListener('pagehide', saveOnExit);
    };
  }, [workspaceKey]);

  useEffect(() => {
    if (!api || record?.scene === lastScene.current || pending.current !== null) return;
    try {
      const scene = record ? JSON.parse(record.scene) as ExcalidrawInitialDataState : { elements: [] };
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
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 600);
  };

  return (
    <section className="flex h-[calc(100dvh-3.5rem)] min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b bg-white px-3 py-2 text-sm dark:bg-slate-900">
        <span className={error ? 'text-rose-600' : 'text-slate-500 dark:text-slate-400'} role="status">
          {error || (!userId ? '本地保存 · 登录后可同步到 VPS' : dirty ? '等待同步到 VPS' : status === 'syncing' ? '同步中…' : status === 'error' || status === 'offline' ? '同步暂不可用 · 本地内容保留' : '已保存 · VPS 同步')}
        </span>
        {userId && <button className="btn-ghost shrink-0" onClick={() => { flush(); void runSync(); }}>立即同步</button>}
      </div>
      <div className="min-h-0 flex-1">
        <Excalidraw excalidrawAPI={setApi} initialData={initialData} onChange={onChange} langCode="zh-CN" theme={theme} name="工作助手白板" />
      </div>
    </section>
  );
}
