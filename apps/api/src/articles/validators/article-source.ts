// HTTP入口とServiceで同じ検索条件を検証する。未指定は全取得先を意味する。
export function isArticleSourceId(value: unknown): value is string | undefined {
  return value === undefined || (typeof value === 'string' && value.length > 0
    && value.length <= 100 && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value));
}
