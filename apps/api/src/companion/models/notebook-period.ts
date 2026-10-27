// 入力検証後の日本時間の月・日を、DBのUTC ISO日時と比較する範囲へ変える。
export function notebookPeriod(value: string): { start: string; end: string } {
  const daily = value.length === 10;
  const local = new Date(`${value}${daily ? '' : '-01'}T00:00:00.000Z`);
  const next = new Date(local);
  if (daily) next.setUTCDate(next.getUTCDate() + 1);
  else next.setUTCMonth(next.getUTCMonth() + 1);
  const utc = (date: Date) => new Date(date.getTime() - 9 * 60 * 60 * 1000).toISOString();
  return { start: utc(local), end: utc(next) };
}
