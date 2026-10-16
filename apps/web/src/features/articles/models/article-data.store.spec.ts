import { createPinia } from 'pinia';
import { describe, expect, it } from 'vitest';
import { article } from '../../../test/article-fixture';
import { useArticleDataStore } from './article-data.store';

const noUnfinishedChange = () => false;
describe('確認済みの記事データ', () => {
  it('同じアプリで共有し、同期状況は持たない', () => {
    const pinia = createPinia(); const data = useArticleDataStore(pinia);
    expect(data).toBe(useArticleDataStore(pinia));
    expect(data).not.toBe(useArticleDataStore(createPinia()));
    expect('syncStatus' in data).toBe(false);
  });
  it('取得後の変更と未確定項目を古い一覧応答で戻さない', () => {
    const data = useArticleDataStore(createPinia());
    data.importFetchedArticles([article(1)], 0, noUnfinishedChange);
    data.confirmField(1, 'pinned', { ...article(1).state, pinned: true });
    data.markFieldChanged(1, 'pinned');
    data.importFetchedArticles([article(1)], 0, noUnfinishedChange);
    expect(data.getConfirmedArticle(1)?.state.pinned).toBe(true);
    data.importFetchedArticles([article(1)], data.changeVersion, () => true);
    expect(data.getConfirmedArticle(1)?.state.pinned).toBe(true);
    data.importFetchedArticles([article(1)], data.changeVersion, noUnfinishedChange);
    expect(data.getConfirmedArticle(1)?.state.pinned).toBe(false);
  });
  it('補完対象と削除済みを区別し、元のAPIデータを変更しない', () => {
    const data = useArticleDataStore(createPinia()); const item = article(1);
    data.rememberArticle(item); data.markFieldChanged(1, 'interested');
    data.confirmField(1, 'interested', { ...item.state, interested: true });
    expect(item.state.interested).toBe(false);
    expect(data.getLocallyChangedInterestIds()).toEqual([1]);
    data.markRemoved(1);
    expect(data.getConfirmedArticle(1)).toBeNull();
    expect(data.getLocallyChangedInterestIds()).toEqual([]);
  });
});
