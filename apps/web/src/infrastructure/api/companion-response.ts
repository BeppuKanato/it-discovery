import type { DiscoveryNote, DiscoveryNoteCalendar, DiscoveryNoteDay } from '@it-discovery/contracts';
export function isDiscoveryNote(value: unknown): value is DiscoveryNote {
  if (!value || typeof value !== 'object') return false;
  const note = value as DiscoveryNote;
  return Number.isSafeInteger(note.id) && note.id > 0 && typeof note.text === 'string' && note.text.length <= 800
    && (note.articleId === null || (Number.isSafeInteger(note.articleId) && note.articleId > 0))
    && (note.articleTitle === null || typeof note.articleTitle === 'string')
    && typeof note.createdAt === 'string' && Number.isFinite(Date.parse(note.createdAt));
}
const count = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
export function isNoteCalendar(value: unknown, month: string): value is DiscoveryNoteCalendar {
  if (!value || typeof value !== 'object') return false;
  const result = value as DiscoveryNoteCalendar;
  const monthPattern = /^[1-9]\d{3}-(0[1-9]|1[0-2])$/;
  const lastDay = new Date(`${month}-01T00:00:00Z`); lastDay.setUTCMonth(lastDay.getUTCMonth() + 1, 0);
  if (result.month !== month || !count(result.totalCount) || !Array.isArray(result.days) || result.days.length > 31) return false;
  const dates = new Set<string>();
  for (const day of result.days) {
    if (!day || typeof day.date !== 'string' || !day.date.startsWith(`${month}-`) || !/^\d{4}-\d{2}-\d{2}$/.test(day.date)
      || Number(day.date.slice(8)) < 1 || Number(day.date.slice(8)) > lastDay.getUTCDate() || !count(day.count) || day.count === 0 || dates.has(day.date)) return false;
    dates.add(day.date);
  }
  if (result.days.reduce((sum, day) => sum + day.count, 0) > result.totalCount) return false;
  return result.totalCount === 0 ? result.firstMonth === null && result.lastMonth === null && result.days.length === 0
    : typeof result.firstMonth === 'string' && typeof result.lastMonth === 'string'
      && monthPattern.test(result.firstMonth) && monthPattern.test(result.lastMonth) && result.firstMonth <= result.lastMonth;
}
export function isNoteDay(value: unknown, date: string): value is DiscoveryNoteDay {
  if (!value || typeof value !== 'object') return false;
  const result = value as DiscoveryNoteDay;
  if (result.date !== date || !count(result.offset) || !count(result.totalCount)) return false;
  if (result.totalCount === 0) return result.note === null && result.offset === 0;
  return result.offset < result.totalCount && isDiscoveryNote(result.note)
    && (result.note.articleUrl === null || typeof result.note.articleUrl === 'string')
    && new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date(result.note.createdAt)) === date;
}
