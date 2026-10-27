import { computed, readonly, ref, shallowRef } from 'vue';
import type { DiscoveryNoteCalendar, DiscoveryNoteDay } from '@it-discovery/contracts';
import { notebookCells, notebookDate, shiftNotebookMonth, type DiscoveryNotebookModel } from '../models/discovery-notebook.model';

export function useDiscoveryNotebookViewModel(model: DiscoveryNotebookModel, now = () => new Date()) {
  // 月・日・1件の本文はこのPageのVMが保持する。会話VMへノート全件を共有しない。
  const month = ref(notebookDate(now()).slice(0, 7));
  const selectedDate = ref<string | null>(null);
  const calendar = shallowRef<DiscoveryNoteCalendar | null>(null);
  const day = shallowRef<DiscoveryNoteDay | null>(null);
  const loadingMonth = ref(false); const loadingDay = ref(false); const deleting = ref(false);
  const monthError = ref<string | null>(null); const dayError = ref<string | null>(null); const deleteError = ref<string | null>(null);
  let disposed = false; let monthVersion = 0; let dayVersion = 0;
  let monthRequest: AbortController | undefined; let dayRequest: AbortController | undefined; let deleteRequest: AbortController | undefined;
  const cells = computed(() => notebookCells(month.value));
  const counts = computed(() => new Map(calendar.value?.days.map(value => [value.date, value.count]) ?? []));
  const monthCount = computed(() => calendar.value?.days.reduce((total, value) => total + value.count, 0) ?? 0);
  const canPreviousMonth = computed(() => !deleting.value && !!calendar.value?.firstMonth && month.value > calendar.value.firstMonth);
  const canNextMonth = computed(() => !deleting.value && month.value < (calendar.value?.lastMonth && calendar.value.lastMonth > notebookDate(now()).slice(0, 7) ? calendar.value.lastMonth : notebookDate(now()).slice(0, 7)));
  const articleUrl = computed(() => {
    const value = day.value?.note?.articleUrl;
    try { const url = new URL(value ?? ''); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; }
  });
  async function selectDate(date: string, offset = 0): Promise<void> {
    if (disposed || deleting.value || !date.startsWith(`${month.value}-`)) return;
    const version = ++dayVersion;
    dayRequest?.abort(); const request = new AbortController(); dayRequest = request;
    // 同じ日の前後操作ではページャーを残し、キーボードのフォーカスを失わせない。
    if (selectedDate.value !== date) day.value = null;
    selectedDate.value = date; loadingDay.value = true; dayError.value = null; deleteError.value = null;
    try {
      const result = await model.day(date, offset, request.signal);
      if (!disposed && version === dayVersion) day.value = result;
    } catch {
      if (!disposed && version === dayVersion) dayError.value = 'この日の発見を読み込めませんでした。再試行してください。';
    } finally { if (!disposed && version === dayVersion) loadingDay.value = false; }
  }
  async function loadMonth(target = month.value, preferredDate = selectedDate.value, offset = day.value?.offset ?? 0): Promise<void> {
    if (disposed || deleting.value) return;
    const version = ++monthVersion; ++dayVersion;
    monthRequest?.abort(); dayRequest?.abort(); const request = new AbortController(); monthRequest = request;
    month.value = target; calendar.value = null; day.value = null; selectedDate.value = null;
    loadingMonth.value = true; loadingDay.value = false; monthError.value = null; dayError.value = null;
    try {
      const result = await model.calendar(target, request.signal);
      if (disposed || version !== monthVersion) return;
      calendar.value = result;
      const today = notebookDate(now());
      // 同じ月の再読込では選んだ日を維持。それ以外は記録がある最新日を入口にする。
      const selected = preferredDate?.startsWith(`${target}-`) ? preferredDate
        : result.days.some(value => value.date === today) ? today : result.days.at(-1)?.date ?? `${target}-01`;
      await selectDate(selected, preferredDate === selected ? offset : 0);
    } catch {
      if (!disposed && version === monthVersion) monthError.value = 'カレンダーを読み込めませんでした。再試行してください。';
    } finally { if (!disposed && version === monthVersion) loadingMonth.value = false; }
  }
  async function removeSelected(): Promise<void> {
    const note = day.value?.note;
    if (disposed || deleting.value || !note || loadingDay.value || loadingMonth.value) return;
    const date = selectedDate.value; const offset = day.value!.offset;
    deleting.value = true; deleteError.value = null; const request = new AbortController(); deleteRequest = request;
    try {
      await model.remove(note.id, request.signal);
      if (disposed) return;
      deleting.value = false;
      // 削除成功後に月件数と当日の本文を再取得。末尾の位置はAPI側で補正される。
      await loadMonth(month.value, date, offset);
    } catch {
      if (!disposed) deleteError.value = '削除結果を確認できませんでした。更新して現在の記録を確認してください。';
    } finally { if (!disposed) deleting.value = false; }
  }
  function changeMonth(direction: number): Promise<void> {
    if ((direction < 0 && !canPreviousMonth.value) || (direction > 0 && !canNextMonth.value)) return Promise.resolve();
    return loadMonth(shiftNotebookMonth(month.value, direction), null, 0);
  }
  function dispose() { disposed = true; monthRequest?.abort(); dayRequest?.abort(); deleteRequest?.abort(); }
  return { month: readonly(month), selectedDate: readonly(selectedDate), calendar: readonly(calendar), day: readonly(day),
    loadingMonth: readonly(loadingMonth), loadingDay: readonly(loadingDay), deleting: readonly(deleting),
    monthError: readonly(monthError), dayError: readonly(dayError), deleteError: readonly(deleteError),
    cells, counts, monthCount, canPreviousMonth, canNextMonth, articleUrl, selectDate, loadMonth, removeSelected, changeMonth, dispose };
}
