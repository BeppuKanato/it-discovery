import { BadRequestException } from '@nestjs/common';
import type { CompanionChatRequest, CompanionMessage, DiscoveryNoteRequest } from '@it-discovery/contracts';
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('入力形式が不正です。');
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new BadRequestException(`文章は1〜${max}文字で入力してください。`);
  return value.trim();
}
function articleId(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new BadRequestException('記事IDが不正です。');
  return value as number;
}
function keys(input: Record<string, unknown>, allowed: string[]): void {
  if (Object.keys(input).some(key => !allowed.includes(key))) throw new BadRequestException('未対応の入力項目があります。');
}
export function parseChat(value: unknown): CompanionChatRequest {
  const input = object(value); keys(input, ['message', 'history', 'articleId']);
  if (!Array.isArray(input.history) || input.history.length > 4) throw new BadRequestException('会話履歴が長すぎます。');
  const history: CompanionMessage[] = input.history.map(value => {
    const item = object(value); keys(item, ['role', 'text']);
    if (item.role !== 'user' && item.role !== 'model') throw new BadRequestException('発言者が不正です。');
    return { role: item.role, text: text(item.text, 500) };
  });
  const id = articleId(input.articleId);
  return { message: text(input.message, 800), history, ...(id === undefined ? {} : { articleId: id }) };
}
export function parseNote(value: unknown): DiscoveryNoteRequest {
  const input = object(value); keys(input, ['text', 'articleId']); const id = articleId(input.articleId);
  return { text: text(input.text, 800), ...(id === undefined ? {} : { articleId: id }) };
}
