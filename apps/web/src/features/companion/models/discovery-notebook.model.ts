import type { DiscoveryNoteCalendar, DiscoveryNoteDay } from '@it-discovery/contracts';

export interface DiscoveryNotebookApi {
  getNoteCalendar(month: string, signal?: AbortSignal): Promise<DiscoveryNoteCalendar>;
  getNoteDay(date: string, offset: number, signal?: AbortSignal): Promise<DiscoveryNoteDay>;
  deleteDiscoveryNote(id: number, signal?: AbortSignal): Promise<void>;
}
// ページングと表示状態はVMへ任せ、Modelは読み取り・削除を通信へ依頼する。
export class DiscoveryNotebookModel {
  constructor(private readonly api: DiscoveryNotebookApi) {}
  calendar(month: string, signal?: AbortSignal) { return this.api.getNoteCalendar(month, signal); }
  day(date: string, offset: number, signal?: AbortSignal) { return this.api.getNoteDay(date, offset, signal); }
  remove(id: number, signal?: AbortSignal) { return this.api.deleteDiscoveryNote(id, signal); }
}

export function notebookDate(now = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(now);
}
export function shiftNotebookMonth(month: string, change: number): string {
  const date = new Date(`${month}-01T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() + change);
  return date.toISOString().slice(0, 7);
}
// 表示に必要な空マスと日付だけを返す。Dateの端末時差をカレンダーへ混ぜない。
export function notebookCells(month: string): (string | null)[] {
  const first = new Date(`${month}-01T00:00:00Z`);
  const last = new Date(first); last.setUTCMonth(last.getUTCMonth() + 1, 0);
  const cells: (string | null)[] = Array.from({ length: first.getUTCDay() }, () => null);
  for (let day = 1; day <= last.getUTCDate(); day++) cells.push(`${month}-${String(day).padStart(2, '0')}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}
