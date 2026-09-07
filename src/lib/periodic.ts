import { addDays, fromKey, startOfWeek, toKey } from '@/lib/date';
import type { DailyTask, PeriodicFrequency } from '@/store/useStore';

export const PERIODIC_FREQUENCY_LABELS: Record<PeriodicFrequency, string> = {
  daily: '每日必做',
  weekly: '每周必做',
  monthly: '每月必做',
};

export function periodicFrequencyOf(task: DailyTask): PeriodicFrequency {
  return task.frequency;
}

export function periodicTaskDueOn(task: DailyTask, key: string): boolean {
  if (!task.enabled || task.frequency !== 'daily' || key < task.startDate) return false;
  return task.daysOfWeek.includes(fromKey(key).getDay());
}

/** 每日按日期、每周按周一、每月按年月生成唯一完成键。 */
export function periodicCompletionKey(task: DailyTask, dateKey: string): string {
  const frequency = periodicFrequencyOf(task);
  if (frequency === 'daily') return dateKey;
  if (frequency === 'weekly') return `week:${toKey(startOfWeek(fromKey(dateKey)))}`;
  return `month:${dateKey.slice(0, 7)}`;
}

export function periodicTaskCompleted(task: DailyTask, completionKey: string): boolean {
  return task.completedDates.includes(completionKey);
}

/** 返回区间内应完成的记录键；周任务每周一次，月任务每月一次。 */
export function periodicOccurrenceKeys(task: DailyTask, start: string, end: string): string[] {
  if (!task.enabled || start > end) return [];
  const taskStart = task.startDate;
  const frequency = periodicFrequencyOf(task);
  const keys = new Set<string>();
  for (let date = fromKey(start); toKey(date) <= end; date = addDays(date, 1)) {
    const key = toKey(date);
    if (key < taskStart) continue;
    if (frequency === 'daily' && !periodicTaskDueOn(task, key)) continue;
    keys.add(periodicCompletionKey(task, key));
  }
  return [...keys];
}

export function periodicScheduleText(task: DailyTask, dayLabels: string[]): string {
  const startDate = task.startDate;
  const frequency = periodicFrequencyOf(task);
  const daysOfWeek = task.daysOfWeek;
  const starts = `从 ${startDate} 开始`;
  if (frequency === 'daily') {
    const normalized = [...daysOfWeek].sort().join(',');
    const schedule = normalized === '0,1,2,3,4,5,6' ? '每天' : normalized === '1,2,3,4,5' ? '工作日' : normalized === '0,6' ? '周末' : daysOfWeek.map((day) => `周${dayLabels[day]}`).join('、');
    return `${starts} · ${schedule || '每天'}`;
  }
  if (frequency === 'weekly') return `${starts} · 每周内完成一次`;
  return `${starts} · 每月内完成一次`;
}

export function dateKeysBetween(start: string, end: string): string[] {
  const keys: string[] = [];
  const cursor = fromKey(start);
  const last = fromKey(end);
  while (cursor <= last) {
    keys.push(toKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}
