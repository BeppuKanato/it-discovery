import { describe, expect, it } from 'vitest';
import { isNoteCalendar, isNoteDay } from './companion-response';
describe('発見ノートの月日と応答の一致', () => {
  it('別月・不正な日付・重複集計を拒否する', () => {
    const result = { month: '2026-02', days: [{ date: '2026-02-28', count: 1 }], totalCount: 1, firstMonth: '2026-02', lastMonth: '2026-02' };
    expect(isNoteCalendar(result, '2026-02')).toBe(true);
    expect(isNoteCalendar(result, '2026-03')).toBe(false);
    expect(isNoteCalendar({ ...result, days: [{ date: '2026-02-30', count: 1 }] }, '2026-02')).toBe(false);
    expect(isNoteCalendar({ ...result, days: [...result.days, ...result.days], totalCount: 2 }, '2026-02')).toBe(false);
  });
  it('別日の本文や範囲外の位置、空と本文の矛盾を拒否する', () => {
    const result = { date: '2026-10-27', offset: 0, totalCount: 1, note: { id: 1, text: '発見', articleId: null, articleTitle: null, articleUrl: null, createdAt: '2026-10-26T15:00:00.000Z' } };
    expect(isNoteDay(result, '2026-10-27')).toBe(true);
    expect(isNoteDay({ ...result, offset: 1 }, '2026-10-27')).toBe(false);
    expect(isNoteDay({ ...result, totalCount: 0 }, '2026-10-27')).toBe(false);
    expect(isNoteDay({ ...result, note: { ...result.note, createdAt: '2026-10-26T14:59:59.999Z' } }, '2026-10-27')).toBe(false);
  });
});
