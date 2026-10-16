import { createPinia } from 'pinia';
import { nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { useArticleChangeStore } from '../../article-changes/models/article-change.store';
import { useArticleDataStore } from '../../articles/models/article-data.store';
import { createArticleListModel } from '../../list/models/article-list.model';
import { page } from '../../../test/article-fixture';
import { createApplicationStartupModel } from './application-startup.model';

function setup() {
  const pinia = createPinia(); const changes = useArticleChangeStore(pinia);
  const getArticlePage = vi.fn().mockResolvedValue(page([1]));
  const list = createArticleListModel({ getArticlePage }, useArticleDataStore(pinia), changes);
  const restoreAndSyncUnfinishedChanges = vi.fn().mockResolvedValue(undefined);
  const startup = createApplicationStartupModel({ restoreAndSyncUnfinishedChanges }, changes);
  return { changes, list, getArticlePage, restoreAndSyncUnfinishedChanges, startup };
}
describe('端末同期から一覧取得への起動順', () => {
  it('同期解消まで一覧を取得せず、解消後に一度だけ取得する', async () => {
    const { changes, list, startup, getArticlePage, restoreAndSyncUnfinishedChanges } = setup();
    await startup.startArticleList(list); expect(getArticlePage).not.toHaveBeenCalled();
    expect(restoreAndSyncUnfinishedChanges).toHaveBeenCalledTimes(1);
    changes.updateSyncStatus({ startupSyncComplete: true }); await nextTick();
    expect(getArticlePage).toHaveBeenCalledTimes(1);
    changes.updateSyncStatus({ notice: '通常保存' }); await nextTick();
    await startup.startArticleList(list); expect(getArticlePage).toHaveBeenCalledTimes(1);
    startup.dispose(); list.dispose();
  });
  it('起動待機中にアプリを閉じたら、後から一覧を取得しない', async () => {
    const { changes, list, startup, getArticlePage } = setup();
    await startup.startArticleList(list); startup.dispose(); list.dispose();
    changes.updateSyncStatus({ startupSyncComplete: true }); await nextTick();
    expect(getArticlePage).not.toHaveBeenCalled();
  });
  it('復元処理を待つ間に閉じたら、完了後の取得も行わない', async () => {
    const { changes, list, getArticlePage } = setup();
    let resolve!: () => void;
    const startup = createApplicationStartupModel({ restoreAndSyncUnfinishedChanges: () => new Promise<void>((yes) => { resolve = yes; }) }, changes);
    const start = startup.startArticleList(list); startup.dispose(); list.dispose();
    changes.updateSyncStatus({ startupSyncComplete: true }); resolve(); await start;
    expect(getArticlePage).not.toHaveBeenCalled();
  });
});
