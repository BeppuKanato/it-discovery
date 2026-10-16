import { computed, reactive, ref } from 'vue';
import { defineStore } from 'pinia';
import type { ArticleListItem, ArticleStateValue } from '@it-discovery/contracts';
import type { UnfinishedArticleChange, ArticleChangeField } from './article-change-contracts';

// 未完了とは、送信前・送信中・結果不明・再試行待ち・端末記録の削除待ちを含む。
export interface TrackedArticleChange {
  record: UnfinishedArticleChange;
  // 端末への保存が完了し、送信してよいか。
  persisted: boolean;
  // 次の送信前に、同じ操作IDの処理結果を照会するか。
  lookup: boolean;
  // 結果は確定したか。trueでも端末記録の削除まではキューに残る。
  settled: boolean;
  // 自動再試行では解消できず、利用者の確認を待っているか。
  blocked: boolean;
  attempts: number;
}
export interface ArticleSyncStatus {
  startupSyncComplete: boolean;
  storageRestored: boolean;
  notice: string;
  storageError: boolean;
  startupError: string;
  online: boolean;
  stopped: boolean;
}

// 同期処理のModel。記事データは別Storeが持ち、ここは未完了操作と同期状況だけを持つ。
export const useArticleChangeStore = defineStore('article-changes', () => {
  const unfinishedChanges = ref<TrackedArticleChange[]>([]);
  const syncStatus = reactive<ArticleSyncStatus>({ startupSyncComplete: false, storageRestored: false,
    notice: '', storageError: false, startupError: '', online: true, stopped: false });
  const unfinishedCount = computed(() => unfinishedChanges.value.length);
  const blockedCount = computed(() => unfinishedChanges.value.filter((change) => change.blocked).length);
  const canChangeArticles = computed(() => syncStatus.startupSyncComplete && !syncStatus.storageError && !syncStatus.stopped);

  function trackChange(record: UnfinishedArticleChange, persisted: boolean, lookup: boolean): TrackedArticleChange {
    unfinishedChanges.value.push({ record, persisted, lookup, settled: false, blocked: false, attempts: 0 });
    return unfinishedChanges.value[unfinishedChanges.value.length - 1]!;
  }
  function hasUnfinishedFieldChange(articleId: number, field: ArticleChangeField): boolean {
    return unfinishedChanges.value.some((change) => !change.settled && change.record.article.articleId === articleId && change.record.request.change.kind === field);
  }
  // 記事データは変更せず、表示時だけ未確定の希望値を順番に重ねる。
  function applyUnfinishedChanges(article: ArticleListItem | null): ArticleListItem | null {
    if (!article) return null;
    const state = { ...article.state };
    for (const change of unfinishedChanges.value) {
      if (!change.settled && change.record.article.articleId === article.articleId) state[change.record.request.change.kind] = change.record.request.change.value;
    }
    return { ...article, state };
  }
  // 成功・拒否が確定した操作を表示から除き、後続操作の再起動用の基準もそろえる。
  function settleChange(change: TrackedArticleChange, confirmedState: ArticleStateValue): UnfinishedArticleChange[] {
    change.settled = true; change.blocked = false;
    const laterRecords: UnfinishedArticleChange[] = [];
    for (const later of unfinishedChanges.value) {
      if (later === change || later.record.article.articleId !== change.record.article.articleId) continue;
      later.record.article = { ...later.record.article, state: { ...confirmedState } };
      laterRecords.push(later.record);
    }
    return laterRecords;
  }
  function removeCompletedChange(operationId: string): void {
    unfinishedChanges.value = unfinishedChanges.value.filter((change) => change.record.request.operationId !== operationId);
    updateStartupSyncComplete();
  }
  function updateStartupSyncComplete(): void {
    // 起動時に一度開放したら、通常操作中の送信待ちでは一覧をロックし直さない。
    if (syncStatus.storageRestored && unfinishedChanges.value.length === 0) syncStatus.startupSyncComplete = true;
  }
  // Partialは「指定された同期状況の項目だけ変更する」という入力。Recordへの変換ではない。
  function updateSyncStatus(patch: Partial<ArticleSyncStatus>): void { Object.assign(syncStatus, patch); }
  function markPersisted(change: TrackedArticleChange): void { change.persisted = true; }
  function markBlocked(change: TrackedArticleChange, message: string): void { change.blocked = true; syncStatus.notice = message; }
  function recordRetry(change: TrackedArticleChange): number { change.lookup = true; return change.attempts++; }
  function prepareRetry(): void {
    syncStatus.storageError = false; syncStatus.notice = '';
    for (const change of unfinishedChanges.value) { change.blocked = false; if (change.persisted) change.lookup = true; }
  }
  return { unfinishedChanges, syncStatus, unfinishedCount, blockedCount, canChangeArticles,
    trackChange, hasUnfinishedFieldChange, applyUnfinishedChanges, settleChange, removeCompletedChange,
    updateStartupSyncComplete, updateSyncStatus, markPersisted, markBlocked, recordRetry, prepareRetry };
});
export type ArticleChangeStore = ReturnType<typeof useArticleChangeStore>;
