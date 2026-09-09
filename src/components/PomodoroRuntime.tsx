import { useEffect } from 'react';
import { VolumeX } from 'lucide-react';
import { notify, playTimerAlarm, stopTimerAlarm } from '@/lib/utils';
import { useStore } from '@/store/useStore';

/** 在任何页面都能停止计时结束提示音。 */
export function stopGlobalTimerAlarm() {
  stopTimerAlarm();
  useStore.getState().updateTimer({ alarmAt: undefined });
}

/**
 * 常驻的番茄运行器。它不随页面导航卸载，因此离开番茄页面后仍会完成当前阶段，
 * 并在开启“自动开始下一段”时继续安排下一阶段。
 */
export default function PomodoroRuntime() {
  const endAt = useStore((state) => state.timer.endAt);
  const alarmAt = useStore((state) => state.timer.alarmAt);
  const completeTimer = useStore((state) => state.completeTimer);

  useEffect(() => {
    if (endAt === null) return;
    const finish = () => {
      const completed = completeTimer(endAt);
      if (!completed) return;
      if (completed.sound) playTimerAlarm();
      notify(
        completed.mode === 'focus' ? '专注结束，休息一下' : '休息结束，开始专注',
        completed.task || undefined,
      );
    };
    const timeout = window.setTimeout(finish, Math.max(0, endAt - Date.now()) + 50);
    return () => window.clearTimeout(timeout);
  }, [endAt, completeTimer]);

  if (!alarmAt) return null;
  return (
    <button
      className="btn-danger fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-50 border border-rose-200 bg-white px-4 py-2 font-semibold shadow-lg dark:border-rose-800 dark:bg-slate-900"
      onClick={stopGlobalTimerAlarm}
      title="关闭番茄时钟闹钟"
      aria-label="关闭番茄时钟闹钟"
    >
      <VolumeX size={17} />关闭闹钟
    </button>
  );
}
