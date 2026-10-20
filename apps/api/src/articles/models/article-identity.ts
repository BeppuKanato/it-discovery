import type { ArticleIdentity, ArticleInput } from './article';

// どの取得元も同じ照合規則を使う。タイトル一致やURLの書き換えは行わない。
export function articleIdentity(input: ArticleInput): ArticleIdentity {
  return {
    sourceId: input.sourceId,
    kind: input.externalArticleId ? 'id' : 'url',
    value: input.externalArticleId || input.url,
  };
}
