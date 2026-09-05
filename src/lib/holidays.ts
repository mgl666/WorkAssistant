export interface ChinaHoliday {
  name: string;
  date: string;
  isOffDay: boolean;
}

interface HolidayFeed { year: number; days: ChinaHoliday[] }
interface HolidayCache { days: ChinaHoliday[]; fetchedAt: number }

const CACHE_PREFIX = 'work-assistant-holiday-';
/** 缓存 7 天，过期后仍会尝试联网刷新 */
const CACHE_TTL = 7 * 86400000;

function readCache(year: number): HolidayCache | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + year);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HolidayCache;
    return Array.isArray(parsed?.days) ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(year: number, days: ChinaHoliday[]): void {
  try {
    localStorage.setItem(CACHE_PREFIX + year, JSON.stringify({ days, fetchedAt: Date.now() } satisfies HolidayCache));
  } catch {
    /* 隐私模式或空间不足时静默失败，不影响功能 */
  }
}

function toMap(days: ChinaHoliday[], year: number): Map<string, ChinaHoliday> {
  const map = new Map<string, ChinaHoliday>();
  for (const day of days) if (day.date.startsWith(`${year}-`)) map.set(day.date, day);
  return map;
}

async function fetchRemote(year: number): Promise<ChinaHoliday[]> {
  const stamp = `${new Date().getFullYear()}-${new Date().getMonth() + 1}`;
  const urls = [year, year + 1].map((y) =>
    `https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/${y}.json?v=${stamp}`,
  );
  const results = await Promise.allSettled(urls.map(async (url) => {
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`节假日数据请求失败：${response.status}`);
    return response.json() as Promise<HolidayFeed>;
  }));

  const days: ChinaHoliday[] = [];
  let loaded = false;
  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    loaded = true;
    for (const day of result.value.days ?? []) {
      if (day.date.startsWith(`${year}-`)) days.push(day);
    }
  }
  if (!loaded) throw new Error('暂时无法获取中国节假日数据');
  return days;
}

/**
 * 获取指定年份的中国节假日。
 * 策略：缓存未过期直接用；否则联网刷新并写缓存；联网失败时回退到本地缓存，
 * 哪怕是稍旧的数据，也比节假日标记突然消失要好。
 */
export async function fetchChinaHolidays(year: number): Promise<Map<string, ChinaHoliday>> {
  const cached = readCache(year);

  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) return toMap(cached.days, year);

  try {
    const days = await fetchRemote(year);
    writeCache(year, days);
    return toMap(days, year);
  } catch (err) {
    if (cached) return toMap(cached.days, year);
    throw err;
  }
}
