const BREAKS: Array<[number, number]> = [
  [12 * 60 + 30, 14 * 60],
  [18 * 60, 18 * 60 + 30],
];

export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export function calculateWorkMinutes(startTime: string, endTime: string): number {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  const breakMinutes = BREAKS.reduce((total, [breakStart, breakEnd]) => (
    total + Math.max(0, Math.min(end, breakEnd) - Math.max(start, breakStart))
  ), 0);
  return Math.max(0, end - start - breakMinutes);
}

/** 上下班时间的直接差值，不扣除任何休息时间。 */
export function calculateActualMinutes(startTime: string, endTime: string): number {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return end - start;
}

export function formatWorkHours(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return rest ? `${hours}小时${rest}分` : `${hours}小时`;
}

export function minuteClock(minutes: number): string {
  const normalized = Math.round(minutes);
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}
