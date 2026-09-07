import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  CalendarDays,
  FileText,
  LayoutDashboard,
  ListChecks,
  Menu,
  Moon,
  NotebookPen,
  Repeat2,
  Settings as SettingsIcon,
  Sun,
  Target,
  Timer,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStore, type SyncStatus } from '@/store/useStore';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const NAV: NavItem[] = [
  { to: '/', label: '概览', icon: LayoutDashboard },
  { to: '/calendar', label: '日历', icon: CalendarDays },
  { to: '/todos', label: '待办事项', icon: ListChecks },
  { to: '/daily', label: '每日必做', icon: Repeat2 },
  { to: '/goals', label: '长期目标', icon: Target },
  { to: '/notes', label: '备忘录', icon: NotebookPen },
  { to: '/pomodoro', label: '番茄时钟', icon: Timer },
  { to: '/weekly', label: 'AI 周报', icon: FileText },
  // 「小工具」功能保留但暂时不在主导航露出，避免新用户觉得是个半成品页面
  // { to: '/tools', label: '小工具', icon: Wrench },
  { to: '/settings', label: '设置', icon: SettingsIcon },
];

const SYNC_META: Record<SyncStatus, { text: string; dot: string; textCls: string }> = {
  disabled: { text: '未启用同步', dot: 'bg-slate-400', textCls: 'text-slate-400' },
  idle: { text: '已同步', dot: 'bg-emerald-500', textCls: 'text-emerald-600 dark:text-emerald-400' },
  syncing: { text: '同步中', dot: 'bg-indigo-500 animate-pulse', textCls: 'text-indigo-600 dark:text-indigo-400' },
  error: { text: '同步失败', dot: 'bg-rose-500', textCls: 'text-rose-600 dark:text-rose-400' },
  offline: { text: '离线', dot: 'bg-amber-500', textCls: 'text-amber-600 dark:text-amber-400' },
};

/** 顶部常驻的同步状态，点一下跳到设置页 */
function SyncBadge() {
  const sync = useStore((s) => s.sync);
  if (!sync.email) return null;
  const meta = SYNC_META[sync.status];
  const title = sync.lastError
    ? `同步失败：${sync.lastError}`
    : sync.lastSyncAt
      ? `上次同步：${new Date(sync.lastSyncAt).toLocaleString()}`
      : '尚未同步过';
  return (
    <NavLink
      to="/settings"
      title={title}
      className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs outline-none transition hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:bg-slate-800"
    >
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', meta.dot)} />
      <span className={cn('hidden sm:inline', meta.textCls)}>{meta.text}</span>
    </NavLink>
  );
}

function ThemeToggle() {
  const theme = useStore((s) => s.settings.theme);
  const updateSettings = useStore((s) => s.updateSettings);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.style.colorScheme = theme;
  }, [theme]);

  return (
    <button
      className="btn-ghost px-2"
      onClick={() => updateSettings({ theme: theme === 'dark' ? 'light' : 'dark' })}
      title={theme === 'dark' ? '切换到浅色' : '切换到深色'}
      aria-label="切换主题"
    >
      {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center gap-2 px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
          W
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">工作助手</div>
          <div className="truncate text-[11px] text-slate-400">本地优先 · VPS 同步</div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-2">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-indigo-50 font-medium text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
              )
            }
          >
            <Icon size={17} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-slate-200 px-4 py-3 text-[11px] leading-4 text-slate-400 dark:border-slate-800">
        本地缓存 · 登录后 VPS 同步
        <br />
        建议定期在「设置」中导出备份
      </div>
    </div>
  );
}

export default function Layout() {
  const [drawer, setDrawer] = useState(false);
  const { pathname } = useLocation();
  const current = NAV.find((n) => n.to === pathname);

  useEffect(() => {
    setDrawer(false);
  }, [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawer(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 border-r border-slate-200 bg-white lg:block dark:border-slate-800 dark:bg-slate-900">
        <Sidebar />
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setDrawer(false)} />
          <aside className="absolute left-0 top-0 h-full w-[min(17rem,85vw)] border-r border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] dark:border-slate-800 dark:bg-slate-900">
            <button
              className="btn-ghost absolute right-1 top-2 px-1.5"
              onClick={() => setDrawer(false)}
              aria-label="关闭菜单"
            >
              <X size={18} />
            </button>
            <Sidebar onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-slate-200 bg-white/85 px-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/85 md:px-6">
          <button className="btn-ghost px-1.5 lg:hidden" onClick={() => setDrawer(true)} aria-label="打开菜单">
            <Menu size={20} />
          </button>
          <h1 className="truncate text-base font-semibold">{current?.label ?? '工作助手'}</h1>
          <div className="ml-auto flex items-center gap-1">
            <SyncBadge />
            <ThemeToggle />
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 overflow-x-hidden p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
