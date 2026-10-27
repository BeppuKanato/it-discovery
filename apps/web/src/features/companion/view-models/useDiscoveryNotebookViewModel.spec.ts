import { describe, expect, it, vi } from 'vitest';
import type { DiscoveryNoteCalendar, DiscoveryNoteDay } from '@it-discovery/contracts';
import { DiscoveryNotebookModel, notebookCells, notebookDate, shiftNotebookMonth } from '../models/discovery-notebook.model';
import { useDiscoveryNotebookViewModel } from './useDiscoveryNotebookViewModel';
const calendar = (month = '2026-10'): DiscoveryNoteCalendar => ({ month, totalCount: 130, firstMonth: '2026-08', lastMonth: '2026-10', days: [{ date: `${month}-27`, count: 110 }] });
const entry = (date = '2026-10-27', offset = 0): DiscoveryNoteDay => ({ date, offset, totalCount: 110, note: {
  id: 130 - offset, text: '本人の発見', articleId: 1, articleTitle: '元記事', articleUrl: 'https://example.com/article', createdAt: `${date}T01:00:00.000Z`,
} });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
function setup() {
  const api = { getNoteCalendar: vi.fn(async (month: string, _signal?: AbortSignal) => calendar(month)),
    getNoteDay: vi.fn(async (date: string, offset: number, _signal?: AbortSignal) => entry(date, offset)), deleteDiscoveryNote: vi.fn(async (_id: number, _signal?: AbortSignal) => {}) };
  const vm = useDiscoveryNotebookViewModel(new DiscoveryNotebookModel(api), () => new Date('2026-10-27T01:00:00Z'));
  return { api, vm };
}
describe('発見ノートの月・日・1件の表示状態', () => {
  it('月の全件数を使い、本文は1件だけ取得して100件より後もめくれる', async () => {
    const { api, vm } = setup(); await vm.loadMonth();
    expect(vm.monthCount.value).toBe(110); expect(vm.selectedDate.value).toBe('2026-10-27');
    await vm.selectDate('2026-10-27', 109);
    expect(api.getNoteDay).toHaveBeenLastCalledWith('2026-10-27', 109, expect.any(AbortSignal));
    expect(vm.day.value?.offset).toBe(109); expect(vm.day.value?.note?.text).toBe('本人の発見');
  });
  it('月切替と日付変更の古い応答を捨てる', async () => {
    const { api, vm } = setup();
    const oldMonth = deferred<DiscoveryNoteCalendar>(); api.getNoteCalendar.mockImplementationOnce(() => oldMonth.promise);
    const first = vm.loadMonth(); await vm.loadMonth('2026-09', null);
    oldMonth.resolve(calendar()); await first;
    expect(vm.calendar.value?.month).toBe('2026-09');
    const oldDay = deferred<DiscoveryNoteDay>(); api.getNoteDay.mockImplementationOnce(() => oldDay.promise);
    const second = vm.selectDate('2026-09-26'); await vm.selectDate('2026-09-25');
    oldDay.resolve(entry('2026-09-26')); await second;
    expect(vm.selectedDate.value).toBe('2026-09-25'); expect(vm.day.value?.date).toBe('2026-09-25');
  });
  it('削除失敗時は本文を残し、成功時に日付と位置を維持して再取得する', async () => {
    const { api, vm } = setup(); await vm.loadMonth(); await vm.selectDate('2026-10-27', 1);
    api.deleteDiscoveryNote.mockRejectedValueOnce(new Error('offline')); await vm.removeSelected();
    expect(vm.deleteError.value).toBeTruthy(); expect(vm.day.value?.note?.id).toBe(129);
    await vm.removeSelected();
    expect(api.getNoteCalendar).toHaveBeenCalledTimes(2);
    expect(api.getNoteDay).toHaveBeenLastCalledWith('2026-10-27', 1, expect.any(AbortSignal));
  });
  it('読込失敗を空の日と混同せず再試行でき、終了後の応答を捨てる', async () => {
    const { api, vm } = setup(); api.getNoteCalendar.mockRejectedValueOnce(Error('offline')); await vm.loadMonth();
    expect(vm.monthError.value).toBeTruthy(); expect(vm.calendar.value).toBeNull();
    await vm.loadMonth(); api.getNoteDay.mockRejectedValueOnce(Error('offline')); await vm.selectDate('2026-10-26');
    expect(vm.dayError.value).toBeTruthy(); expect(vm.day.value).toBeNull();
    const waiting = deferred<DiscoveryNoteDay>(); api.getNoteDay.mockImplementationOnce(() => waiting.promise);
    const pending = vm.selectDate('2026-10-25'); vm.dispose(); waiting.resolve(entry('2026-10-25')); await pending;
    expect(vm.day.value).toBeNull(); expect(api.getNoteDay.mock.calls.at(-1)?.[2]?.aborted).toBe(true);
  });
  it('危険なURLは元記事リンクにしない', async () => {
    const { api, vm } = setup(); const response = entry(); response.note!.articleUrl = 'javascript:alert(1)';
    api.getNoteDay.mockResolvedValue(response); await vm.loadMonth(); expect(vm.articleUrl.value).toBeNull();
  });
  it('端末時差に依存しない日付・曜日・うるう日・年越しを扱う', () => {
    expect(notebookDate(new Date('2026-10-31T15:00:00Z'))).toBe('2026-11-01');
    expect(notebookCells('2026-10').slice(0, 5)).toEqual([null, null, null, null, '2026-10-01']);
    expect(notebookCells('2028-02')).toContain('2028-02-29');
    expect(shiftNotebookMonth('2026-12', 1)).toBe('2027-01');
  });
});
