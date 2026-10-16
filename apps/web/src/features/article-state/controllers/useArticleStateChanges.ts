import { computed, ref } from 'vue';
import type { ArticleStateApi, StateOperationStore } from '../models/state-sync';
import { ArticleStateSync } from '../services/article-state-sync';

// Composableは送信管理の通知をVueのrefへつなぎ、画面が状態変更を追跡できるようにする。
export function useArticleStateChanges(api: ArticleStateApi, store: StateOperationStore, acquire: () => Promise<(() => void) | null>) {
  const revision = ref(0);
  const sync = new ArticleStateSync(api, store, acquire, () => { revision.value++; });
  // class自体をreactiveにせず、通知番号を読むことでcomputedの再計算を依頼する。
  // Promise・AbortController・保存用データをVueのProxyで包まないため、この形にする。
  const status = computed(() => {
    void revision.value;
    return {
      ready: sync.ready, canChange: sync.canChange, pendingCount: sync.pendingCount,
      notice: sync.notice, storageError: sync.storageError, startupError: sync.startupError,
      blockedCount: sync.blockedCount, online: sync.online,
    };
  });
  return { sync, status, revision };
}
