import { computed } from 'vue';
import { createPinia } from 'pinia';
import { describe, expect, it } from 'vitest';
import { article } from '../../../test/article-fixture';
import { useArticleStateStore } from './article-state.store';

describe('共有する記事状態の管理元', () => {
  it('同じPiniaの画面は同じStoreを共有し、別アプリのStoreとは混ざらない', () => {
    const pinia = createPinia();
    expect(useArticleStateStore(pinia)).toBe(useArticleStateStore(pinia));
    expect(useArticleStateStore(pinia)).not.toBe(useArticleStateStore(createPinia()));
  });

  it('独自の通知番号なしで、未確定の希望状態をcomputedへ反映する', () => {
    const store = useArticleStateStore(createPinia());
    const item = article(1);
    store.accept([item], store.version);
    const displayed = computed(() => store.project(item)?.state.pinned);
    expect(displayed.value).toBe(false);
    const operation = store.enqueue({ order: 1, article: item, request: {
      operationId: crypto.randomUUID(), change: { kind: 'pinned', value: true },
    } }, false, false);
    expect(displayed.value).toBe(true);
    store.settle(operation); // 拒否。確認済みのfalseへ戻す。
    expect(displayed.value).toBe(false);
  });

  it('取得したDTOのstateを表示元にせず、Storeの確認済み状態から求める', () => {
    const store = useArticleStateStore(createPinia());
    const first = article(1); const updated = article(1); updated.state.pinned = true;
    store.accept([first], 0); store.accept([updated], 0);
    expect(store.project(first)?.state.pinned).toBe(true);
    expect(first.state.pinned).toBe(false);
  });
});
