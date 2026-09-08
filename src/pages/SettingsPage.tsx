import { useRef, useState } from 'react';
import {
  Cloud,
  CloudOff,
  Download,
  HardDriveDownload,
  LogIn,
  LogOut,
  Moon,
  Palette,
  RefreshCw,
  ShieldCheck,
  Sun,
  Trash2,
  Upload,
  UserPlus,
  Sparkles,
  PlugZap,
} from 'lucide-react';
import { cn, downloadFile } from '@/lib/utils';
import { formatDateTime } from '@/lib/date';
import { chatCompletion } from '@/lib/ai';
import { signIn, signOut, signUp, uploadLocalToRemote } from '@/lib/auth';
import { runSync } from '@/lib/sync';
import { useStore, type SyncStatus } from '@/store/useStore';
import { Modal, SectionTitle, useToast } from '@/components/ui';

const STATUS_META: Record<SyncStatus, { text: string; cls: string }> = {
  disabled: { text: '未启用同步', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  idle: { text: '已同步', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
  syncing: { text: '同步中', cls: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300' },
  error: { text: '同步失败', cls: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' },
  offline: { text: '离线，待重连', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
};

function StatusBadge({ status }: { status: SyncStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className={cn('chip', meta.cls)}>
      {status === 'offline' || status === 'error' ? <CloudOff size={12} /> : <Cloud size={12} />}
      {meta.text}
    </span>
  );
}

export default function SettingsPage() {
  const store = useStore();
  const updateSettings = useStore((s) => s.updateSettings);
  const importData = useStore((s) => s.importData);
  const resetAll = useStore((s) => s.resetAll);
  const toast = useToast();

  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const guard = async (fn: () => Promise<string | void>) => {
    if (busy) return;
    setBusy(true);
    setNotice('');
    try {
      const message = await fn();
      if (message) {
        setNotice(message);
        toast(message);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '操作失败';
      setNotice(`✗ ${message}`);
    } finally {
      setBusy(false);
    }
  };

  const [aiTesting, setAiTesting] = useState(false);
  const [aiResult, setAiResult] = useState<{ ok: boolean; message: string } | null>(null);

  // 用一条极短的请求验证配置，错误信息会区分网络、Key 无效、模型不存在、额度不足
  const testAi = async () => {
    if (aiTesting) return;
    setAiTesting(true);
    setAiResult(null);
    try {
      const reply = await chatCompletion(store.settings, [
        { role: 'user', content: '收到请只回复两个字：成功' },
      ]);
      setAiResult({ ok: true, message: `连接成功，模型返回「${reply.slice(0, 20)}」` });
    } catch (err) {
      setAiResult({ ok: false, message: err instanceof Error ? err.message : '连接失败' });
    } finally {
      setAiTesting(false);
    }
  };

  const exportBackup = () => {
    const { aiApiKey: _secret, ...safeSettings } = store.settings;
    const payload = {
      exportedAt: new Date().toISOString(),
      events: store.events,
      todos: store.todos,
      lists: store.lists,
      notes: store.notes,
      sessions: store.sessions,
      daily_tasks: store.daily_tasks,
      goals: store.goals,
      work_logs: store.work_logs,
      settings: safeSettings,
    };
    const stamp = new Date().toISOString().slice(0, 10);
    downloadFile(
      `work-assistant-backup-${stamp}.json`,
      JSON.stringify(payload, null, 2),
      'application/json;charset=utf-8',
    );
    toast('备份已导出');
  };

  // 导入前先解析并展示摘要，让用户明确选择「合并」还是「覆盖」
  const [pendingImport, setPendingImport] = useState<{ raw: string; counts: Array<[string, number]> } | null>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (fileRef.current) fileRef.current.value = '';
    try {
      const raw = await file.text();
      const data = JSON.parse(raw) as Record<string, unknown>;
      const counts: Array<[string, number]> = [
        ['日程', (data.events as unknown[] | undefined)?.length ?? 0],
        ['待办', (data.todos as unknown[] | undefined)?.length ?? 0],
        ['清单', (data.lists as unknown[] | undefined)?.length ?? 0],
        ['备忘录', (data.notes as unknown[] | undefined)?.length ?? 0],
        ['番茄记录', (data.sessions as unknown[] | undefined)?.length ?? 0],
        ['周期任务', (data.daily_tasks as unknown[] | undefined)?.length ?? 0],
        ['长期目标', (data.goals as unknown[] | undefined)?.length ?? 0],
        ['工时记录', (data.work_logs as unknown[] | undefined)?.length ?? 0],
      ];
      if (!counts.some(([, n]) => n > 0)) {
        toast('文件里没有可导入的数据');
        return;
      }
      setPendingImport({ raw, counts });
    } catch {
      toast('文件格式不正确，无法解析');
    }
  };

  const applyImport = (mode: 'replace' | 'merge') => {
    if (!pendingImport) return;
    const ok = importData(pendingImport.raw, mode);
    toast(ok ? (mode === 'merge' ? '已合并导入' : '已覆盖导入') : '导入失败');
    setPendingImport(null);
  };

  const storageSize = (() => {
    try {
      const raw = localStorage.getItem('work-assistant-v1') ?? '';
      return `${(new Blob([raw]).size / 1024).toFixed(1)} KB`;
    } catch {
      return '未知';
    }
  })();

  return (
    <div className="space-y-4">
      {/* 账号与同步 */}
      <div className="card p-4">
        <SectionTitle>
          <span className="flex items-center gap-1.5">
            <Cloud size={14} />
            账号与同步
          </span>
        </SectionTitle>

        {store.sync.email ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={store.sync.status} />
              <span className="truncate text-sm">{store.sync.email}</span>
            </div>
            <p className="text-xs text-slate-400">
              {store.sync.lastSyncAt
                ? `上次同步：${formatDateTime(store.sync.lastSyncAt)}`
                : '尚未同步过'}
            </p>
            {store.sync.lastError && (
              <p className="text-xs text-rose-600 dark:text-rose-400">✗ {store.sync.lastError}</p>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                className="btn-outline"
                disabled={busy || store.sync.status === 'syncing'}
                onClick={() => void guard(() => runSync())}
              >
                <RefreshCw
                  size={15}
                  className={cn(store.sync.status === 'syncing' && 'animate-spin')}
                />
                立即同步
              </button>
              <button
                className="btn-outline"
                disabled={busy}
                onClick={() => void guard(() => uploadLocalToRemote())}
              >
                <Upload size={15} />
                上传本地数据到 VPS
              </button>
              <button
                className="btn-danger ml-auto"
                disabled={busy}
                onClick={() => void guard(() => signOut())}
              >
                <LogOut size={15} />
                退出登录
              </button>
            </div>
            {notice && <p className="text-xs text-slate-500 dark:text-slate-400">{notice}</p>}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <input
                className="input min-w-[200px] flex-1"
                type="email"
                placeholder="邮箱"
                aria-label="邮箱"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <input
                className="input w-full sm:w-44"
                type="password"
                placeholder="密码（至少 6 位）"
                aria-label="密码"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="btn-primary"
                disabled={busy || !email.trim() || password.length < 6}
                onClick={() => void guard(() => signIn(email.trim(), password))}
              >
                <LogIn size={15} />
                登录
              </button>
              <button
                className="btn-outline"
                disabled={busy || !email.trim() || password.length < 6}
                onClick={() => void guard(() => signUp(email.trim(), password))}
              >
                <UserPlus size={15} />
                注册并上传本地数据
              </button>
            </div>
            {notice && <p className="text-xs text-slate-500 dark:text-slate-400">{notice}</p>}
            <p className="text-xs text-slate-400">
              注册新账号时可带入当前访客数据；登录已有账号时会切换到该账号的独立工作区并从 VPS 拉取。
            </p>
          </div>
        )}
      </div>

      {/* AI 周报 */}
      <div className="card p-4">
        <SectionTitle>
          <span className="flex items-center gap-1.5"><Sparkles size={14} />AI 周报</span>
        </SectionTitle>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block"><span className="mb-1 block text-xs text-slate-500">OpenAI 兼容 API 地址</span><input className="input" placeholder="https://api.openai.com/v1" value={store.settings.aiEndpoint} onChange={(e) => updateSettings({ aiEndpoint: e.target.value })} /></label>
          <label className="block"><span className="mb-1 block text-xs text-slate-500">模型</span><input className="input" placeholder="gpt-4.1-mini" value={store.settings.aiModel} onChange={(e) => updateSettings({ aiModel: e.target.value })} /></label>
          <label className="block md:col-span-2"><span className="mb-1 block text-xs text-slate-500">API Key</span><input className="input font-mono" type="password" autoComplete="off" placeholder="sk-…" value={store.settings.aiApiKey} onChange={(e) => updateSettings({ aiApiKey: e.target.value })} /></label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button className="btn-outline" disabled={aiTesting} onClick={() => void testAi()}>
            <PlugZap size={15} className={aiTesting ? 'animate-pulse' : ''} />
            {aiTesting ? '测试中…' : '测试连接'}
          </button>
          {aiResult && (
            <span className={cn('text-xs', aiResult.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
              {aiResult.ok ? '✓ ' : '✗ '}
              {aiResult.message}
            </span>
          )}
        </div>
        <p className="mt-2 text-xs leading-5 text-slate-400">API Key 仅保存在当前浏览器的当前账号工作区，不会上传到 VPS。生成周报时，只有你勾选的记录会发送给所配置的 AI 服务。</p>
      </div>

      {/* 外观 */}
      <div className="card p-4">
        <SectionTitle>
          <span className="flex items-center gap-1.5">
            <Palette size={14} />
            外观
          </span>
        </SectionTitle>
        <div className="flex gap-2">
          {(['light', 'dark'] as const).map((t) => (
            <button
              key={t}
              onClick={() => updateSettings({ theme: t })}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-lg border p-3 text-sm transition sm:flex-none sm:px-6',
                store.settings.theme === t
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300'
                  : 'border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800',
              )}
            >
              {t === 'light' ? <Sun size={16} /> : <Moon size={16} />}
              {t === 'light' ? '浅色' : '深色'}
            </button>
          ))}
        </div>
      </div>

      {/* 数据 */}
      <div className="card p-4">
        <SectionTitle>
          <span className="flex items-center gap-1.5">
            <HardDriveDownload size={14} />
            数据管理
          </span>
        </SectionTitle>
        <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
          当前账号数据会缓存在浏览器中（约 {storageSize}）；登录后会同步到 VPS PostgreSQL。
          API Key 等设备级信息只保留在本机，请定期导出业务数据备份。
        </p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={exportBackup}>
            <Download size={15} />
            导出备份
          </button>
          <button className="btn-outline" onClick={() => fileRef.current?.click()}>
            <Upload size={15} />
            导入备份
          </button>
          <button className="btn-danger ml-auto" onClick={() => setConfirmReset(true)}>
            <Trash2 size={15} />
            清空全部数据
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          aria-label="选择备份文件"
          className="hidden"
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />
      </div>

      <Modal
        open={pendingImport !== null}
        title="导入备份"
        onClose={() => setPendingImport(null)}
        footer={
          <>
            <button className="btn-outline" onClick={() => setPendingImport(null)}>取消</button>
            <button className="btn-outline" onClick={() => applyImport('merge')}>合并到现有数据</button>
            <button className="btn-primary" onClick={() => applyImport('replace')}>覆盖现有数据</button>
          </>
        }
      >
        {pendingImport && (
          <>
            <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">备份文件包含以下内容：</p>
            <ul className="mb-4 grid grid-cols-3 gap-2">
              {pendingImport.counts.map(([label, count]) => (
                <li key={label} className="rounded-lg bg-slate-50 px-2 py-1.5 text-center dark:bg-slate-800/60">
                  <div className="text-base font-semibold">{count}</div>
                  <div className="text-xs text-slate-400">{label}</div>
                </li>
              ))}
            </ul>
            <p className="text-xs leading-5 text-slate-400">
              <strong className="text-rose-600 dark:text-rose-400">覆盖</strong>会先清空当前数据再导入；
              <strong>合并</strong>则按记录更新时间取较新的一方，两边都有的不会丢。两种方式都会保留本机的 API Key。
            </p>
          </>
        )}
      </Modal>

      {/* 说明 */}
      <div className="card p-4">
        <SectionTitle>
          <span className="flex items-center gap-1.5">
            <ShieldCheck size={14} />
            关于
          </span>
        </SectionTitle>
        <ul className="space-y-1.5 text-sm text-slate-500 dark:text-slate-400">
          <li>· 数据按账号隔离；登录后通过 VPS 上的 PostgreSQL 与其他设备同步。</li>
          <li>· 番茄钟基于时间戳计时，切换到其他标签页或最小化也不会走偏。</li>
          <li>· 备忘录支持 Markdown/GFM 语法，渲染内容经过安全过滤。</li>
          <li>· AI 周报只使用你主动勾选的日程、待办和番茄记录。</li>
        </ul>
      </div>

      <Modal
        open={confirmReset}
        title="确认清空全部数据？"
        onClose={() => setConfirmReset(false)}
        footer={
          <>
            <button className="btn-outline" onClick={() => setConfirmReset(false)}>
              取消
            </button>
            <button
              className="btn-danger border border-rose-300"
              onClick={() => {
                resetAll();
                setConfirmReset(false);
                toast('已清空全部数据');
              }}
            >
              确认清空
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">
          当前账号的日程、待办、周期任务、长期目标、备忘录与番茄记录都会被删除。建议先导出备份。
        </p>
      </Modal>
    </div>
  );
}
