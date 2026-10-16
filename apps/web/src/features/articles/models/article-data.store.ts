import { reactive, ref } from 'vue';
import { defineStore } from 'pinia';
import type { ArticleListItem, ArticleStateValue } from '@it-discovery/contracts';

export type EditableArticleField = 'interested' | 'pinned';
interface ConfirmedArticleRecord {
  article: ArticleListItem;
  lastFieldChangeVersion: Map<EditableArticleField, number>;
  removedFromServer: boolean;
}

// 記事データのModel。確定した記事情報・既読・ピン・気になるをID別に保持する。
// 同期準備中・オンライン・未完了操作など、同期処理の状態はここに置かない。
export const useArticleDataStore = defineStore('article-data', () => {
  const articlesById = reactive(new Map<number, ConfirmedArticleRecord>());
  const changeVersion = ref(0);

  // 初めて知る記事を登録する。端末に残った変更の復元にも使う。
  function rememberArticle(article: ArticleListItem): void {
    if (!articlesById.has(article.articleId)) articlesById.set(article.articleId, {
      article: { ...article, state: { ...article.state } }, lastFieldChangeVersion: new Map(), removedFromServer: false,
    });
  }

  // 一覧の取得結果を取り込む。取得開始後に変更された項目や未確定項目は上書きしない。
  // 未確定かどうかは同期側から関数で受け取るため、このStoreは同期Storeを参照しない。
  function importFetchedArticles(articles: ArticleListItem[], requestStartedAtVersion: number,
    hasUnfinishedChange: (articleId: number, field: EditableArticleField) => boolean): void {
    for (const article of articles) {
      rememberArticle(article);
      const record = articlesById.get(article.articleId)!;
      const confirmed = { ...record.article.state };
      for (const field of ['interested', 'pinned'] as const) {
        if (!hasUnfinishedChange(article.articleId, field)
          && requestStartedAtVersion >= (record.lastFieldChangeVersion.get(field) ?? 0)) confirmed[field] = article.state[field];
      }
      confirmed.lastOpenedAt = article.state.lastOpenedAt;
      record.article = { ...article, state: confirmed };
    }
  }

  // 未完了の希望値を重ねる前の、確認済み記事を返す。
  function getConfirmedArticle(articleId: number): ArticleListItem | null {
    const record = articlesById.get(articleId);
    return record && !record.removedFromServer ? { ...record.article, state: { ...record.article.state } } : null;
  }
  function markFieldChanged(articleId: number, field: EditableArticleField): void {
    articlesById.get(articleId)!.lastFieldChangeVersion.set(field, ++changeVersion.value);
  }
  // 応答内の他項目で別の操作を巻き戻さないよう、成功した項目だけを確定する。
  function confirmField(articleId: number, field: EditableArticleField, state: ArticleStateValue): void {
    articlesById.get(articleId)!.article.state[field] = state[field];
  }
  function markRemoved(articleId: number): void { articlesById.get(articleId)!.removedFromServer = true; }

  // 登録直後の補完・解除拒否後の復元に必要な記事ID。未完了操作だけには限定しない。
  function getLocallyChangedInterestIds(): number[] {
    return [...articlesById].filter(([, record]) => !record.removedFromServer && record.lastFieldChangeVersion.has('interested')).map(([id]) => id);
  }
  return { articlesById, changeVersion, rememberArticle, importFetchedArticles, getConfirmedArticle,
    markFieldChanged, confirmField, markRemoved, getLocallyChangedInterestIds };
});
export type ArticleDataStore = ReturnType<typeof useArticleDataStore>;
