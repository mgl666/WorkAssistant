import { useEffect, useState } from 'react';
import { VolumeX } from 'lucide-react';
import { notify, playTimerAlarm, stopTimerAlarm } from '@/lib/utils';
import { useStore } from '@/store/useStore';

const STOP_ALARM_EVENT = 'work-assistant:stop-timer-alarm';

/** 在任何页面都能停止计时结束提示音。 */
export function stopGlobalTimerAlarm() {
  stopTimerAlarm();
  window.dispatchEvent(new Event(STOP_ALARM_EVENT));
}

/**
 * 常驻的番茄运行器。它不随页面导航卸载，因此离开番茄页面后仍会完成当前阶段，
 * 并在开启“自动开始下一段”时继续安排下一阶段。
 */
export default function PomodoroRuntime() {
  const endAt = useStore((state) => state.timer.endAt);
  const completeTimer = useStore((state) => state.completeTimer);
  const [alarmPlaying, setAlarmPlaying] = useState(false);

  useEffect(() => {
    const stop = () => setAlarmPlaying(false);
    window.addEventListener(STOP_ALARM_EVENT, stop);
    return () => window.removeEventListener(STOP_ALARM_EVENT, stop);
  }, []);

  useEffect(() => {
    if (endAt === null) return;
    const finish = () => {
      const completed = completeTimer(endAt);
      if (!completed) return;
      if (completed.sound && playTimerAlarm()) setAlarmPlaying(true);
      notify(
        completed.mode === 'focus' ? '专注结束，休息一下' : '休息结束，开始专注',
        completed.task || undefined,
      );
    };
    const timeout = window.setTimeout(finish, Math.max(0, endAt - Date.now()) + 50);
    return () => window.clearTimeout(timeout);
  }, [endAt, completeTimer]);

  if (!alarmPlaying) return null;
  return (
    <button
      className="btn-primary fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-50 shadow-lg"
      onClick={stopGlobalTimerAlarm}
      title="停止番茄结束提示音"
    >
      <VolumeX size={17} />停止番茄铃声
    </button>
  );
}
