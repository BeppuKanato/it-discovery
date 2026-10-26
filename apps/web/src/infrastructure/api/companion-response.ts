import type { DiscoveryNote } from '@it-discovery/contracts';
export function isDiscoveryNote(value: unknown): value is DiscoveryNote {
  if (!value || typeof value !== 'object') return false;
  const note = value as DiscoveryNote;
  return Number.isSafeInteger(note.id) && note.id > 0 && typeof note.text === 'string' && note.text.length <= 800
    && (note.articleId === null || (Number.isSafeInteger(note.articleId) && note.articleId > 0))
    && (note.articleTitle === null || typeof note.articleTitle === 'string')
    && typeof note.createdAt === 'string' && Number.isFinite(Date.parse(note.createdAt));
}
