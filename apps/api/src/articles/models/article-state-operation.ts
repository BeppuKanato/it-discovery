import type { ArticleState } from './article-state';

// kindで型を絞ると、その操作に必要な値だけを使える（判別可能なunion）。
export type StateChange =
  | { kind: 'interested' | 'pinned'; value: boolean }
  | { kind: 'opened'; openedAt: Date };

export type StateOperationResult = { operationId: string; articleId: number } & (
  | { status: 'saved'; state: ArticleState }
  | { status: 'missing'; state: null }
);

export interface StoredStateOperation {
  operationId: string;
  requestKey: string;
  result: StateOperationResult;
}

// HTTPのステータスはここでは知らない。入口側がcodeをHTTPエラーへ変換する。
export class StateOperationError extends Error {
  constructor(readonly code: 'INVALID_STATE_INPUT' | 'OPERATION_CONFLICT', message: string) {
    super(message);
  }
}

export function assertArticleId(articleId: number): void {
  if (!Number.isSafeInteger(articleId) || articleId <= 0) {
    throw new StateOperationError('INVALID_STATE_INPUT', '記事IDは正の安全な整数を指定してください。');
  }
}

// IDの大文字・小文字は同じUUIDとして扱い、保存と照会に同じ表記を使う。
export function normalizeOperationId(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new StateOperationError('INVALID_STATE_INPUT', 'operationIdにはUUID v4を指定してください。');
  }
  return value.toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

// 共通の入力検証。DB実装やHTTP入口ごとに同じ条件を重複させない。
export function parseStateOperation(input: unknown): { operationId: string; change: StateChange } {
  const invalid = () => new StateOperationError('INVALID_STATE_INPUT', '変更対象と値の形式が不正です。');
  if (!isRecord(input) || !hasOnlyKeys(input, ['operationId', 'change'])) throw invalid();
  const operationId = normalizeOperationId(input['operationId']);
  const change = input['change'];
  if (!isRecord(change)) throw invalid();
  if (change['kind'] === 'interested' || change['kind'] === 'pinned') {
    if (!hasOnlyKeys(change, ['kind', 'value']) || typeof change['value'] !== 'boolean') throw invalid();
    return { operationId, change: { kind: change['kind'], value: change['value'] } };
  }
  if (change['kind'] === 'opened' && hasOnlyKeys(change, ['kind', 'openedAt'])) {
    const value = change['openedAt'];
    // 正規のUTC表記に限定し、2月30日などDateが自動補正する日時も拒否する。
    if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)) throw invalid();
    const openedAt = new Date(value);
    if (!Number.isFinite(openedAt.getTime()) || openedAt.toISOString() !== value) throw invalid();
    return { operationId, change: { kind: 'opened', openedAt } };
  }
  throw invalid();
}
