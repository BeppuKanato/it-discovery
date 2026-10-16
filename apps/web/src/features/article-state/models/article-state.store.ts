import { computed, reactive, ref } from 'vue';
import { defineStore } from 'pinia';
import type { ArticleListItem, ArticleStateOperationResponse, ArticleStateValue } from '@it-discovery/contracts';
import type { PendingStateOperation, StateField } from './state-sync';

// 操作データと、その操作がどこまで進んだかを保持する。タイマーや通信自体はServiceの担当。
export interface QueuedStateOperation {
  record: PendingStateOperation;
  persisted: boolean;
  lookup: boolean;
  settled: boolean;
  blocked: boolean;
  attempts: number;
}
interface ArticleEntry {
  article: ArticleListItem;
  confirmedState: ArticleStateValue;
  // キーのない項目は「まだ変更なし」。省略可能な対応表にはMapを使う。
  lastChangeVersion: Map<StateField, number>;
  missing: boolean;
}
export interface StateSyncStatus {
  ready: boolean;
  initialized: boolean;
  notice: string;
  storageError: boolean;
  startupError: string;
  online: boolean;
  stopped: boolean;
}

// Model：画面をまたいで共有する記事状態と未確定操作の、メモリ上の管理元。
// defineStoreはStoreを取得する関数を作る。同じPiniaへ渡せば同じ実体を共有する。
// 通信・IndexedDB・DOMを操作せず、Serviceから呼ばれる状態更新だけを担当する。
export const useArticleStateStore = defineStore('article-state', () => {
  const entries = reactive(new Map<number, ArticleEntry>());
  const operations = ref<QueuedStateOperation[]>([]);
  // versionは日時ではなく変更の管理番号。取得前後の新旧比較に使い、描画通知には使わない。
  const version = ref(0);
  const status = reactive<StateSyncStatus>({
    ready: false, initialized: false, notice: '', storageError: false,
    startupError: '', online: true, stopped: false,
  });
  const pendingCount = computed(() => operations.value.length);
  const blockedCount = computed(() => operations.value.filter((op) => op.blocked).length);
  const canChange = computed(() => status.ready && !status.storageError && !status.stopped);

  function remember(article: ArticleListItem): ArticleEntry {
    if (!entries.has(article.articleId)) {
      entries.set(article.articleId, { article, confirmedState: { ...article.state }, lastChangeVersion: new Map(), missing: false });
    }
    return entries.get(article.articleId)!;
  }

  // 操作を登録すると、その瞬間からprojectの表示結果に希望値が重なる。
  function enqueue(record: PendingStateOperation, persisted: boolean, lookup: boolean): QueuedStateOperation {
    remember(record.article).lastChangeVersion.set(record.request.change.kind, ++version.value);
    operations.value.push({ record, persisted, lookup, settled: false, blocked: false, attempts: 0 });
    return operations.value[operations.value.length - 1]!;
  }

  // 取得応答はここへ集約する。取得中に行われた変更と未確定操作を古い応答で戻さない。
  function accept(articles: ArticleListItem[], readVersion: number): void {
    for (const article of articles) {
      const entry = remember(article);
      entry.article = article;
      for (const field of ['interested', 'pinned'] as const) {
        const pending = operations.value.some((op) => !op.settled && op.record.article.articleId === article.articleId && op.record.request.change.kind === field);
        if (!pending && readVersion >= (entry.lastChangeVersion.get(field) ?? 0)) entry.confirmedState[field] = article.state[field];
      }
      entry.confirmedState.lastOpenedAt = article.state.lastOpenedAt;
    }
  }

  // 記事の確認済み状態へ、未確定の希望値を順番に重ねる。元データは変更しない。
  function project(article: ArticleListItem): ArticleListItem | null {
    const entry = entries.get(article.articleId);
    if (!entry) return article;
    if (entry.missing) return null;
    const state = { ...entry.confirmedState };
    for (const op of operations.value) {
      if (!op.settled && op.record.article.articleId === article.articleId) state[op.record.request.change.kind] = op.record.request.change.value;
    }
    return { ...article, state };
  }

  // IDから最新の表示状態を取得する。一覧・仕分けは同じ管理元を参照する。
  function getArticle(articleId: number): ArticleListItem | null {
    const entry = entries.get(articleId);
    return entry ? project(entry.article) : null;
  }

  // 解除で一覧から消えた記事も保持し、保存拒否時にはViewModelが正しい位置へ復元できる。
  function supplements(): ArticleListItem[] {
    return [...entries.values()].filter((entry) => !entry.missing && entry.lastChangeVersion.has('interested')).map((entry) => entry.article);
  }

  // 成功は対象項目だけ確定する。拒否の場合は確定値を保ち、その操作だけ表示から除く。
  function settle(op: QueuedStateOperation, result?: ArticleStateOperationResponse): PendingStateOperation[] {
    const entry = entries.get(op.record.article.articleId)!;
    const field = op.record.request.change.kind;
    if (result?.status === 'saved') entry.confirmedState[field] = result.state[field];
    if (result?.status === 'missing') {
      entry.missing = true;
      status.notice = '保持されていない記事があったため、その記事の変更は登録できませんでした。';
    }
    entry.lastChangeVersion.set(field, ++version.value);
    op.settled = true; op.blocked = false;
    // 後続操作の復元基準も更新する。要求のID・指定値は変えない。
    const laterRecords: PendingStateOperation[] = [];
    for (const later of operations.value) {
      if (later === op || later.record.article.articleId !== op.record.article.articleId) continue;
      later.record.article = { ...later.record.article, state: { ...entry.confirmedState } };
      laterRecords.push(later.record);
    }
    return laterRecords;
  }

  function remove(operationId: string): void {
    operations.value = operations.value.filter((op) => op.record.request.operationId !== operationId);
    updateReady();
  }
  function updateReady(): void {
    if (status.initialized && operations.value.length === 0) status.ready = true;
  }
  function updateStatus(patch: Partial<StateSyncStatus>): void { Object.assign(status, patch); }

  // 同期Serviceも直接代入せず、状態の遷移をこのStoreの操作として記録する。
  function markPersisted(op: QueuedStateOperation): void { op.persisted = true; }
  function markBlocked(op: QueuedStateOperation, message: string): void { op.blocked = true; status.notice = message; }
  function recordRetry(op: QueuedStateOperation): number {
    op.lookup = true;
    return op.attempts++; // 今回の再試行番号を返し、次の番号へ進める。待ち時間はServiceが決める。
  }
  function prepareRetry(): void {
    status.storageError = false; status.notice = '';
    for (const op of operations.value) { op.blocked = false; if (op.persisted) op.lookup = true; }
  }

  // Piniaは返したref/reactiveを追跡する。利用側は状態を読み、更新は上の操作を通す。
  return { entries, operations, version, status, pendingCount, blockedCount, canChange,
    enqueue, accept, project, getArticle, supplements, settle, remove, updateReady, updateStatus,
    markPersisted, markBlocked, recordRetry, prepareRetry };
});

// ReturnTypeは「この関数の戻り値の型」。Storeと同じ型を手で二重定義しないために使う。
export type ArticleStateStore = ReturnType<typeof useArticleStateStore>;
