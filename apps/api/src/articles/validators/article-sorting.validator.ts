import { SORTING_LIMIT, SortingError } from '../models/article-sorting';

// 仕分け回のIDを検証する。状態変更のoperationIdとは別の名前空間で扱う。
export function normalizeBatchId(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new SortingError('INVALID_SORTING_INPUT', 'batchIdにはUUID v4を指定してください。');
  }
  return value.toLowerCase();
}

// 端末で確定した最終ID集合だけを受け取る。見送り・履歴・カード位置は受け付けない。
export function parseInterestBatch(input: unknown): { revision: number; articleIds: number[] } {
  const invalid = () => new SortingError('INVALID_SORTING_INPUT', 'revisionと最大10件の重複しない記事IDを指定してください。');
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalid();
  const body = input as Record<string, unknown>;
  if (Object.keys(body).length !== 2 || !Object.hasOwn(body, 'revision') || !Object.hasOwn(body, 'articleIds')) throw invalid();
  const revision = body['revision'];
  const ids = body['articleIds'];
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision <= 0
    || !Array.isArray(ids) || ids.length > SORTING_LIMIT) throw invalid();
  // Array.fromは配列の空要素も検査対象にする。Setのsizeとの比較で重複IDも拒否する。
  if (Array.from(ids).some((id: unknown) => typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0)
    || new Set(ids).size !== ids.length) throw invalid();
  // ID集合なので列挙順は意味を持たない。元の配列を変更せず、比較と応答の順序を統一する。
  return { revision, articleIds: [...ids].sort((a: number, b: number) => a - b) };
}
