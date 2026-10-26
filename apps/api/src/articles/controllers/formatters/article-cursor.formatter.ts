import { BadRequestException } from '@nestjs/common';
import type { ArticleListKind, ArticlePagePosition } from '../../models/article-page';

// 一覧の種類と続き位置をURLで扱える文字列へ変換する。
export function encodeArticleCursor(position: ArticlePagePosition, kind: ArticleListKind, sourceId?: string): string {
  return Buffer.from(JSON.stringify({
    kind, fetchedAt: position.fetchedAt.getTime(), articleId: position.articleId,
    ...(sourceId !== undefined ? { sourceId } : {}),
  })).toString('base64url');
}

// カーソルの形式と一覧の種類を検証し、続き位置へ戻す。
export function decodeArticleCursor(token: string, kind: ArticleListKind, sourceId?: string): ArticlePagePosition {
  const invalid = () => new BadRequestException('cursorが不正です。一覧を先頭から取得してください。');
  if (token.length === 0 || token.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(token)) throw invalid();
  const bytes = Buffer.from(token, 'base64url');
  if (bytes.toString('base64url') !== token) throw invalid();
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw invalid();
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  const data = value as Record<string, unknown>;
  const keys = sourceId === undefined ? ['kind', 'fetchedAt', 'articleId'] : ['kind', 'fetchedAt', 'articleId', 'sourceId'];
  if (Object.keys(data).length !== keys.length || !keys.every((key) => Object.hasOwn(data, key))
    || data['sourceId'] !== sourceId
    || data['kind'] !== kind
    || typeof data['fetchedAt'] !== 'number' || !Number.isSafeInteger(data['fetchedAt'])
    || !Number.isFinite(new Date(data['fetchedAt']).getTime())
    || typeof data['articleId'] !== 'number' || !Number.isSafeInteger(data['articleId']) || data['articleId'] <= 0) {
    throw invalid();
  }
  return { fetchedAt: new Date(data['fetchedAt']), articleId: data['articleId'] };
}
