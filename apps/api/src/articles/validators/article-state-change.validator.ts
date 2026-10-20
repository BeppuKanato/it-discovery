import { InvalidStateInputError, type StateChange } from '../models/article-state-change';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

// 共通の入力検証。DB実装やHTTP入口ごとに同じ条件を重複させない。
export function parseStateChange(input: unknown): StateChange {
  const invalid = () => new InvalidStateInputError('変更対象と値の形式が不正です。');
  if (!isRecord(input) || !hasOnlyKeys(input, ['change'])) throw invalid();
  const change = input['change'];
  if (!isRecord(change)) throw invalid();
  if (change['kind'] === 'interested' || change['kind'] === 'pinned') {
    if (!hasOnlyKeys(change, ['kind', 'value']) || typeof change['value'] !== 'boolean') throw invalid();
    return { kind: change['kind'], value: change['value'] };
  }
  if (change['kind'] === 'opened' && hasOnlyKeys(change, ['kind', 'openedAt'])) {
    const value = change['openedAt'];
    // 正規のUTC表記に限定し、2月30日などDateが自動補正する日時も拒否する。
    if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)) throw invalid();
    const openedAt = new Date(value);
    if (!Number.isFinite(openedAt.getTime()) || openedAt.toISOString() !== value) throw invalid();
    return { kind: 'opened', openedAt };
  }
  throw invalid();
}
