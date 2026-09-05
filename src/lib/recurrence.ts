import { addDays, fromKey, toKey } from './date';
import type { CalEvent } from '@/store/useStore';

/** 对循环日程执行操作时的影响范围 */
export type RecurrenceScope = 'once' | 'future' | 'all';

export function eventOccursOn(event: CalEvent, key: string): boolean {
  if (key < event.date || (event.recurrenceUntil && key > event.recurrenceUntil)) return false;
  const recurrence = event.recurrence ?? 'none';
  if (recurrence === 'none') return key === event.date;
  const source = fromKey(event.date), date = fromKey(key);
  if (recurrence === 'weekly') return source.getDay() === date.getDay();
  if (recurrence === 'monthly') return source.getDate() === date.getDate();
  if (recurrence === 'yearly') return source.getMonth() === date.getMonth() && source.getDate() === date.getDate();
  // 兼容旧版本保存的“每月最后一个星期几”，按每月同一天处理。
  return source.getDate() === date.getDate();
}

/** 展开指定日期范围内的循环日程；返回副本的 date 是实际发生日期。 */
export function expandEventOccurrences(events: CalEvent[], startKey: string, endKey: string): CalEvent[] {
  const result: CalEvent[] = [];
  for (let date = fromKey(startKey); toKey(date) <= endKey; date = addDays(date, 1)) {
    const key = toKey(date);
    for (const event of events) if (eventOccursOn(event, key)) result.push({ ...event, date: key });
  }
  return result;
}

const prevDay = (key: string): string => toKey(addDays(fromKey(key), -1));

/** 找出指定日期之后的下一次出现日期；没有则返回 null。最多向后扫描 400 天防止死循环。 */
export function nextOccurrenceAfter(event: CalEvent, key: string): string | null {
  const limit = toKey(addDays(fromKey(key), 400));
  for (let d = addDays(fromKey(key), 1); ; d = addDays(d, 1)) {
    const k = toKey(d);
    if (event.recurrenceUntil && k > event.recurrenceUntil) return null;
    if (k > limit) return null;
    if (eventOccursOn(event, k)) return k;
  }
}

function seriesFields(
  event: CalEvent,
  patch: Partial<CalEvent> = {},
): Omit<CalEvent, 'id' | 'createdAt' | 'updatedAt'> {
  const merged = { ...event, ...patch };
  return {
    date: merged.date,
    title: merged.title,
    time: merged.time,
    endTime: merged.endTime,
    note: merged.note,
    color: merged.color,
    done: merged.done ?? false,
    recurrence: merged.recurrence ?? 'none',
    recurrenceUntil: merged.recurrenceUntil,
  };
}

export interface SeriesOperation {
  kind: 'update' | 'create' | 'delete';
  /** update / delete 作用的目标事件 */
  id?: string;
  patch?: Partial<CalEvent>;
  draft?: Omit<CalEvent, 'id' | 'createdAt' | 'updatedAt'>;
}

/**
 * 规划一次「修改循环日程」需要的操作。
 *
 * 采用切段策略而不是给事件加「例外日期」字段：
 * 选中某一次进行修改时，把原系列截断到前一天，插入一条单次事件，
 * 再新建一条从下一次出现继续的系列。好处是不需要改动数据库结构，
 * 服务端存储完整记录，因此不需要为该字段单独修改数据库结构。
 */
export function planSeriesUpdate(
  event: CalEvent,
  occurrenceKey: string,
  scope: RecurrenceScope,
  patch: Partial<CalEvent>,
): SeriesOperation[] {
  const recurring = (event.recurrence ?? 'none') !== 'none';
  if (!recurring || scope === 'all') return [{ kind: 'update', id: event.id, patch }];

  if (scope === 'future') {
    // 选中的就是第一次出现时，「本次及以后」等价于整个系列
    if (occurrenceKey <= event.date) return [{ kind: 'update', id: event.id, patch }];
    return [
      { kind: 'update', id: event.id, patch: { recurrenceUntil: prevDay(occurrenceKey) } },
      {
        kind: 'create',
        draft: { ...seriesFields(event, patch), date: occurrenceKey, recurrenceUntil: event.recurrenceUntil },
      },
    ];
  }

  const single: Omit<CalEvent, 'id' | 'createdAt' | 'updatedAt'> = {
    ...seriesFields(event, patch),
    date: occurrenceKey,
    recurrence: 'none',
    recurrenceUntil: undefined,
  };
  const next = nextOccurrenceAfter(event, occurrenceKey);

  // 中间某一次：前段保留，插入单条，后段继续循环
  if (occurrenceKey > event.date) {
    const ops: SeriesOperation[] = [
      { kind: 'create', draft: single },
      { kind: 'update', id: event.id, patch: { recurrenceUntil: prevDay(occurrenceKey) } },
    ];
    if (next) {
      ops.push({
        kind: 'create',
        draft: { ...seriesFields(event), date: next, recurrenceUntil: event.recurrenceUntil },
      });
    }
    return ops;
  }

  // 选中的是第一次出现：原系列从下一次继续，没有下一次就删除系列
  const ops: SeriesOperation[] = [{ kind: 'create', draft: single }];
  if (next) ops.push({ kind: 'update', id: event.id, patch: { date: next } });
  else ops.push({ kind: 'delete', id: event.id });
  return ops;
}

/** 规划一次「删除循环日程」需要的操作，切段策略同上。 */
export function planSeriesDelete(
  event: CalEvent,
  occurrenceKey: string,
  scope: RecurrenceScope,
): SeriesOperation[] {
  const recurring = (event.recurrence ?? 'none') !== 'none';
  if (!recurring || scope === 'all') return [{ kind: 'delete', id: event.id }];

  const next = nextOccurrenceAfter(event, occurrenceKey);

  if (occurrenceKey > event.date) {
    const ops: SeriesOperation[] = [
      { kind: 'update', id: event.id, patch: { recurrenceUntil: prevDay(occurrenceKey) } },
    ];
    // 「仅本次」需要让系列从下一次出现继续；「本次及以后」则直接结束
    if (scope === 'once' && next) {
      ops.push({ kind: 'create', draft: { ...seriesFields(event), date: next, recurrenceUntil: event.recurrenceUntil } });
    }
    return ops;
  }

  if (scope === 'future') return [{ kind: 'delete', id: event.id }];
  return next ? [{ kind: 'update', id: event.id, patch: { date: next } }] : [{ kind: 'delete', id: event.id }];
}
