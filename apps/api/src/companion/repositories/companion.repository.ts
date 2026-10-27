import type { DiscoveryNote, DiscoveryNoteCalendar, DiscoveryNoteDay } from '@it-discovery/contracts';
// Serviceは保存手段を知らず、この契約を通して利用回数・記事の文脈・ノートを扱う。
export abstract class CompanionRepository {
  abstract reserve(now?: Date): void;
  abstract article(id: number): { title: string; description: string | null } | undefined;
  abstract listNotes(): DiscoveryNote[];
  abstract noteCalendar(month: string): DiscoveryNoteCalendar;
  abstract noteDay(date: string, offset: number): DiscoveryNoteDay;
  abstract saveNote(text: string, articleId?: number): DiscoveryNote;
  abstract deleteNote(id: number): void;
}
