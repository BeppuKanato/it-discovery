import { createPinia } from 'pinia';
import { describe, expect, it, vi } from 'vitest';
import type { ArticlePageResponse } from '@it-discovery/contracts';
import type { ArticleListApi } from '../models/article-list-api';
import { useArticleDataStore } from '../../articles/models/article-data.store';
import { useArticleChangeStore } from '../../article-changes/models/article-change.store';
import { page } from '../../../test/article-fixture';
import { createArticleListModel } from '../models/article-list.model';
function deferred<T>() {
  let resolve!: (value: T) => void; let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
import { useArticleListViewModel } from './useArticleListViewModel';
describe('ViewModelの入力とModelへの接続', () => {
  it('座標をModelへ渡し、成立時だけ更新して表示用の距離を戻す', async () => {
    const getArticlePage = vi.fn().mockResolvedValue(page([1]));
    const list = createList({ getArticlePage });
    const touch = { x: 20, y: 20, atTop: true, touchCount: 1, onControl: false };
    list.beginPull(touch);
    list.movePull({ ...touch, y: 100 });
    expect(list.pullDistance.value).toBe(36);
    expect(list.pullReady.value).toBe(false);
    await list.finishPull();
    expect(getArticlePage).not.toHaveBeenCalled();
    list.beginPull(touch);
    expect(list.movePull({ ...touch, y: 200 })).toBe(true);
    expect(list.pullReady.value).toBe(true);
    await list.finishPull();
    await list.finishPull();
    expect(getArticlePage).toHaveBeenCalledTimes(1);
    expect(list.pullDistance.value).toBe(0);
  });

  it('取得中・起動待機・画面終了後はジェスチャーから更新しない', async () => {
    const pending = deferred<ArticlePageResponse>();
    const getArticlePage = vi.fn().mockReturnValue(pending.promise);
    const list = createList({ getArticlePage });
    const touch = { x: 0, y: 0, atTop: true, touchCount: 1, onControl: false };
    const first = list.refreshArticles();
    list.beginPull(touch);
    list.movePull({ ...touch, y: 200 });
    await list.finishPull();
    expect(getArticlePage).toHaveBeenCalledTimes(1);
    pending.resolve(page([1])); await first;
    list.beginPull(touch); list.movePull({ ...touch, y: 200 });
    list.dispose();
    expect(list.pullDistance.value).toBe(0);
    list.beginPull(touch); list.movePull({ ...touch, y: 200 });
    expect(list.pullDistance.value).toBe(0);
    await list.finishPull();
    expect(getArticlePage).toHaveBeenCalledTimes(1);
    const waitingApi = { getArticlePage: vi.fn() };
    const waiting = createList(waitingApi, false);
    waiting.beginPull(touch); waiting.movePull({ ...touch, y: 200 }); await waiting.finishPull();
    expect(waitingApi.getArticlePage).not.toHaveBeenCalled();
  });

  it('タブ切り替えとタッチ中止では途中の操作を破棄する', async () => {
    const getArticlePage = vi.fn().mockResolvedValue(page([]));
    const list = createList({ getArticlePage });
    const touch = { x: 0, y: 0, atTop: true, touchCount: 1, onControl: false };
    list.beginPull(touch); list.movePull({ ...touch, y: 200 }); list.cancelPull();
    await list.finishPull(); expect(getArticlePage).not.toHaveBeenCalled();
    list.beginPull(touch); list.movePull({ ...touch, y: 200 });
    await list.changeListKind('interested');
    expect(list.pullDistance.value).toBe(0);
    await list.finishPull(); expect(getArticlePage).toHaveBeenCalledTimes(1);
  });
});
function createList(api: ArticleListApi, startupComplete = true) {
  const pinia = createPinia(); const changes = useArticleChangeStore(pinia);
  changes.updateSyncStatus({ startupSyncComplete: startupComplete, storageRestored: startupComplete });
  const model = createArticleListModel(api, useArticleDataStore(pinia), changes);
  return useArticleListViewModel(model, {
    getSyncDisplay: () => ({ ...changes.syncStatus, canChangeArticles: changes.canChangeArticles,
      unfinishedCount: changes.unfinishedCount, blockedCount: changes.blockedCount }),
    toggleArticleField: vi.fn(), retryUnfinishedChanges: vi.fn(), discardBlockedChanges: vi.fn(),
  });
}
