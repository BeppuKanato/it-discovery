import { BadRequestException } from '@nestjs/common';

// YYYY-MMとYYYY-MM-DDを実在する日付に絞る。配列・正規化で別日になる日付も拒否する。
function period(value: unknown, daily: boolean): string {
  const pattern = daily ? /^[1-9]\d{3}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/ : /^[1-9]\d{3}-(0[1-9]|1[0-2])$/;
  if (typeof value !== 'string' || !pattern.test(value)) throw new BadRequestException('日付の指定が不正です。');
  const date = new Date(`${value}${daily ? '' : '-01'}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, daily ? 10 : 7) !== value) throw new BadRequestException('日付が存在しません。');
  return value;
}
export function parseNotebookMonth(value: unknown): string { return period(value, false); }
export function parseNotebookDate(value: unknown): string { return period(value, true); }
export function parseNotebookOffset(value: unknown): number {
  if (value === undefined) return 0;
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value) || !Number.isSafeInteger(Number(value))) throw new BadRequestException('記録の位置が不正です。');
  return Number(value);
}
