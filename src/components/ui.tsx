import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn, uid } from '@/lib/utils';

/* --------------------------------- 弹窗 --------------------------------- */

interface ModalProps {
  open: boolean;
  title?: string;
  onClose: () => void;
  children?: ReactNode;
  footer?: ReactNode;
  width?: string;
}

export function Modal({ open, title, onClose, children, footer, width = 'max-w-lg' }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={title ?? '对话框'} className={cn('card relative z-10 max-h-[92dvh] w-full overflow-y-auto rounded-b-none animate-fade-in p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:rounded-xl sm:p-5', width)}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold">{title}</h3>
          <button className="btn-ghost -mr-1.5 px-1.5" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </div>
        {children}
        {footer && <div className="mt-5 flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/* --------------------------------- 统计卡 -------------------------------- */

const TONES = {
  indigo: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300',
  emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300',
  rose: 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300',
  sky: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300',
} as const;

export function Stat({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'indigo',
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: keyof typeof TONES;
}) {
  return (
    <div className="card flex items-center gap-3 p-4">
      <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', TONES[tone])}>
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
        <div className="truncate text-xl font-semibold">{value}</div>
        {hint && <div className="truncate text-xs text-slate-400">{hint}</div>}
      </div>
    </div>
  );
}

/* --------------------------------- 空状态 -------------------------------- */

export function Empty({ icon: Icon, text, action }: { icon: LucideIcon; text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <Icon size={30} className="text-slate-300 dark:text-slate-600" />
      <p className="text-sm text-slate-400">{text}</p>
      {action}
    </div>
  );
}

/* ---------------------------------- 标题 --------------------------------- */

export function SectionTitle({ children, extra }: { children: ReactNode; extra?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400">{children}</h2>
      {extra}
    </div>
  );
}

/* --------------------------------- 轻提示 -------------------------------- */

export interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastOptions {
  action?: ToastAction;
  /** 默认：带操作按钮 6 秒，纯提示 2.2 秒 */
  duration?: number;
}

interface ToastItem {
  id: string;
  text: string;
  action?: ToastAction;
}

const ToastCtx = createContext<(text: string, options?: ToastOptions) => void>(() => {});

export function useToast() {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((text: string, options?: ToastOptions) => {
    const id = uid();
    const duration = options?.duration ?? (options?.action ? 6000 : 2200);
    setItems((prev) => [...prev, { id, text, action: options?.action }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), duration);
  }, []);

  const value = useMemo(() => push, [push]);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2">
          {items.map((t) => (
            <div
              key={t.id}
              className="flex animate-fade-in items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-lg dark:bg-slate-100 dark:text-slate-900"
            >
              <Check size={15} />
              {t.text}
              {t.action && (
                <button
                  className="pointer-events-auto ml-1 rounded px-1.5 py-0.5 text-xs font-semibold text-indigo-300 underline-offset-2 hover:underline dark:text-indigo-700"
                  onClick={t.action.onClick}
                >
                  {t.action.label}
                </button>
              )}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastCtx.Provider>
  );
}
