import { fromKey, toKey } from '@/lib/date';
import type { DailyTask, PeriodicFrequency } from '@/store/useStore';

export const PERIODIC_FREQUENCY_LABELS: Record<PeriodicFrequency, string> = {
  daily: '每日必做',
  weekly: '每周必做',
  monthly: '每月必做',
};

export function periodicFrequencyOf(task: DailyTask): PeriodicFrequency {
  const daysOfWeek = Array.isArray(task.daysOfWeek) ? task.daysOfWeek : [];
  return task.frequency ?? (daysOfWeek.length === 7 ? 'daily' : 'weekly');
}

export function periodicTaskDueOn(task: DailyTask, key: string): boolean {
  const startDate = task.startDate || toKey(new Date(task.createdAt));
  const frequency = periodicFrequencyOf(task);
  const daysOfWeek = Array.isArray(task.daysOfWeek) ? task.daysOfWeek : [];
  if (!task.enabled || key < startDate) return false;
  const date = fromKey(key);
  if (frequency === 'daily') return true;
  if (frequency === 'weekly') return daysOfWeek.includes(date.getDay());
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return date.getDate() === Math.min(task.dayOfMonth ?? 1, lastDay);
}

export function periodicScheduleText(task: DailyTask, dayLabels: string[]): string {
  const startDate = task.startDate || toKey(new Date(task.createdAt));
  const frequency = periodicFrequencyOf(task);
  const daysOfWeek = Array.isArray(task.daysOfWeek) ? task.daysOfWeek : [];
  const starts = `从 ${startDate} 开始`;
  if (frequency === 'daily') return `${starts} · 每天`;
  if (frequency === 'weekly') return `${starts} · ${daysOfWeek.map((day) => `周${dayLabels[day]}`).join('、') || '未选择星期'}`;
  return `${starts} · 每月 ${task.dayOfMonth ?? 1} 日`;
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
