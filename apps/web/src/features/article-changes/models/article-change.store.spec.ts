import { computed } from 'vue';
import { createPinia } from 'pinia';
import { describe, expect, it } from 'vitest';
import { article } from '../../../test/article-fixture';
import { useArticleChangeStore } from './article-change.store';

describe('未完了の記事変更と同期状況', () => {
  it('同じアプリで共有し、記事データの対応表は持たない', () => {
    const pinia = createPinia(); const changes = useArticleChangeStore(pinia);
    expect(changes).toBe(useArticleChangeStore(pinia));
    expect(changes).not.toBe(useArticleChangeStore(createPinia()));
    expect('articlesById' in changes).toBe(false);
  });
  it('確定データを変えずに希望値を反映し、拒否した操作だけを除く', () => {
    const changes = useArticleChangeStore(createPinia()); const item = article(1);
    const displayed = computed(() => changes.applyUnfinishedChanges(item)?.state.pinned);
    const operation = changes.trackChange({ order: 1, article: item, request: {
      operationId: crypto.randomUUID(), change: { kind: 'pinned', value: true },
    } }, false, false);
    expect(displayed.value).toBe(true); expect(item.state.pinned).toBe(false);
    changes.settleChange(operation, item.state);
    expect(displayed.value).toBe(false);
  });
  it('端末復元と起動時の同期解消後だけ開放し、通常の保存待ちでは再ロックしない', () => {
    const changes = useArticleChangeStore(createPinia());
    changes.updateSyncStatus({ storageRestored: true }); changes.updateStartupSyncComplete();
    expect(changes.syncStatus.startupSyncComplete).toBe(true);
    changes.trackChange({ order: 1, article: article(1), request: {
      operationId: crypto.randomUUID(), change: { kind: 'pinned', value: true },
    } }, false, false);
    expect(changes.canChangeArticles).toBe(true); expect(changes.unfinishedCount).toBe(1);
  });
});
