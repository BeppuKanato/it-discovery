import 'reflect-metadata';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { SqliteCompanionRepository } from './sqlite-companion.repository';
import { parseNotebookDate, parseNotebookMonth, parseNotebookOffset } from '../validators/notebook-query';

describe('発見カレンダーの全件集計と日別ページング', () => {
  let database: DatabaseService; let repository: SqliteCompanionRepository;
  const previous = process.env['DATABASE_PATH'];
  beforeEach(() => { process.env['DATABASE_PATH'] = ':memory:'; database = new DatabaseService(); repository = new SqliteCompanionRepository(database); });
  afterEach(() => { database.onApplicationShutdown(); if (previous === undefined) delete process.env['DATABASE_PATH']; else process.env['DATABASE_PATH'] = previous; });
  function insert(date: string, text = '発見') { return Number(database.client.prepare('INSERT INTO discovery_notes(text, created_at) VALUES (?, ?)').run(text, date).lastInsertRowid); }
  it('最新100件より古い月も全件数を集計し、日本時間の月日境界を守る', () => {
    insert('2026-09-30T14:59:59.999Z');
    insert('2026-09-30T15:00:00.000Z');
    for (let index = 0; index < 110; index++) insert('2026-10-14T16:00:00.000Z');
    insert('2026-10-31T14:59:59.999Z');
    insert('2026-10-31T15:00:00.000Z');
    expect(repository.listNotes()).toHaveLength(100);
    expect(repository.noteCalendar('2026-09').days).toEqual([{ date: '2026-09-30', count: 1 }]);
    expect(repository.noteCalendar('2026-10')).toEqual({ month: '2026-10', totalCount: 114, firstMonth: '2026-09', lastMonth: '2026-11', days: [
      { date: '2026-10-01', count: 1 }, { date: '2026-10-15', count: 110 }, { date: '2026-10-31', count: 1 },
    ] });
    expect(repository.noteDay('2026-10-15', 109)).toMatchObject({ totalCount: 110, offset: 109, note: { text: '発見' } });
  });
  it('日時とIDで安定してめくり、末尾削除で位置を補正し、空の日も返す', () => {
    const first = insert('2026-10-26T16:00:00.000Z', '最初');
    const second = insert('2026-10-26T16:00:00.000Z', '次');
    expect(repository.noteDay('2026-10-27', 0).note?.id).toBe(second);
    expect(repository.noteDay('2026-10-27', 1).note?.id).toBe(first);
    repository.deleteNote(first);
    expect(repository.noteDay('2026-10-27', 1)).toMatchObject({ offset: 0, totalCount: 1, note: { id: second } });
    repository.deleteNote(second);
    expect(repository.noteDay('2026-10-27', 9)).toEqual({ date: '2026-10-27', offset: 0, totalCount: 0, note: null });
    expect(repository.noteCalendar('2026-10')).toEqual({ month: '2026-10', totalCount: 0, firstMonth: null, lastMonth: null, days: [] });
  });
  it('元記事が削除されても、保存したタイトルと本人の文章を維持する', () => {
    const id = insert('2026-10-26T16:00:00.000Z', '気になった');
    database.client.prepare('UPDATE discovery_notes SET article_id = 999, article_title = ? WHERE id = ?').run('かつての記事', id);
    expect(repository.noteDay('2026-10-27', 0).note).toMatchObject({ id, text: '気になった', articleTitle: 'かつての記事', articleUrl: null });
  });
  it.each(['2026-02-29', '2026-04-31', '2026-10-00', '2026-1-01', ['2026-10-01'], undefined])('不正な日を拒否する: %j', value => {
    expect(() => parseNotebookDate(value)).toThrow();
  });
  it('うるう日・年越し・位置0を受理し、配列・負数・小数を拒否する', () => {
    expect(parseNotebookDate('2028-02-29')).toBe('2028-02-29');
    insert('2026-12-31T15:00:00.000Z');
    expect(repository.noteCalendar('2027-01').days).toEqual([{ date: '2027-01-01', count: 1 }]);
    expect(parseNotebookOffset(undefined)).toBe(0);
    for (const value of ['-1', '1.5', '1e2', [], '9007199254740992']) expect(() => parseNotebookOffset(value)).toThrow();
    for (const value of ['2026-13', '2026-00', ['2026-10'], undefined]) expect(() => parseNotebookMonth(value)).toThrow();
  });
});
