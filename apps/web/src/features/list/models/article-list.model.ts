import type { ArticleDataStore } from '../../articles/models/article-data.store';
import { computed, readonly, ref, shallowRef } from 'vue';
import type { ArticleListItem, ArticleListKind } from '@it-discovery/contracts';
import type { ArticleListApi } from './article-list-api';
import type { ArticleChangeStore } from '../../article-changes/models/article-change.store';

type LoadMode = 'initial' | 'refresh' | 'append';
interface ListLoadError { mode: LoadMode; message: string }

// 一覧Model：記事の取得・ページ管理・表示対象と並び順を担当する。
// APIの約束へ取得を依頼し、記事データと未完了変更を合成する。同期の起動や再送は行わない。
export function createArticleListModel(api: ArticleListApi, articleData: ArticleDataStore, articleChanges: ArticleChangeStore) {
  const selectedKind = ref<ArticleListKind>('all');
  // 一覧が保持するのは記事IDと続き位置。記事内容と確定状態の管理元は共有Storeに一本化する。
  const pageArticleIds = shallowRef<number[]>([]);
  const nextCursor = ref<string | null>(null);
  const hasMore = ref(false);
  const listLoading = ref<LoadMode | null>(null);
  const listError = ref<ListLoadError | null>(null);
  let generation = 0;
  let activeRequest: AbortController | null = null;
  let disposed = false;

  // computedはStoreも追跡する。独自の通知番号を増やして描画を促す必要はない。
  // 表示用の配列を二重保存せず、ページID列＋登録変更したIDから求める。
  // 後者は、登録直後の追加と解除拒否後の復元に使う。旧supplementsの意味をここへ閉じ込める。
  const displayedArticles = computed(() => {
    const ids = new Set(pageArticleIds.value);
    if (selectedKind.value === 'interested') {
      for (const id of articleData.getLocallyChangedInterestIds()) ids.add(id);
    }
    return [...ids].map((id) => articleChanges.applyUnfinishedChanges(articleData.getConfirmedArticle(id)))
      .filter((article): article is ArticleListItem => article !== null && (selectedKind.value === 'all' || article.state.interested))
      .sort((a, b) => Date.parse(b.fetchedAt) - Date.parse(a.fetchedAt) || b.articleId - a.articleId);
  });
  const canLoadMore = computed(() => articleChanges.syncStatus.startupSyncComplete && hasMore.value && nextCursor.value !== null && listLoading.value === null && listError.value === null);

  // 世代番号は一覧要求の新旧、記事データのchangeVersionは記事変更の新旧を判定する別の番号。
  async function loadPage(mode: LoadMode): Promise<void> {
    if (disposed || !articleChanges.syncStatus.startupSyncComplete) return;
    if (mode === 'append' && (listLoading.value !== null || !hasMore.value || !nextCursor.value)) return;
    const requestGeneration = ++generation;
    const readVersion = articleData.changeVersion;
    activeRequest?.abort();
    const controller = new AbortController();
    activeRequest = controller;
    const cursor = mode === 'append' ? nextCursor.value ?? undefined : undefined;
    listLoading.value = mode; listError.value = null;
    try {
      const page = await api.getArticlePage({ kind: selectedKind.value, limit: 20, ...(cursor ? { cursor } : {}) }, controller.signal);
      if (disposed || generation !== requestGeneration) return;
      // 応答のstateを別コピーとして表示せず、Storeの整合ルールを通して取り込む。
      articleData.importFetchedArticles(page.articles, readVersion, articleChanges.hasUnfinishedFieldChange);
      const ids = new Set(mode === 'append' ? pageArticleIds.value : []);
      for (const article of page.articles) ids.add(article.articleId);
      pageArticleIds.value = [...ids];
      nextCursor.value = page.nextCursor; hasMore.value = page.hasMore;
    } catch {
      if (disposed || generation !== requestGeneration) return;
      listError.value = { mode, message: mode === 'append' ? '続きを取得できませんでした。'
        : mode === 'refresh' ? '一覧を更新できませんでした。' : '一覧を取得できませんでした。' };
    } finally {
      if (!disposed && generation === requestGeneration) { listLoading.value = null; activeRequest = null; }
    }
  }

  function refreshArticles(): Promise<void> {
    if (listLoading.value === 'initial' || listLoading.value === 'refresh') return Promise.resolve();
    return loadPage(pageArticleIds.value.length ? 'refresh' : 'initial');
  }
  function changeListKind(value: ArticleListKind): Promise<void> {
    if (!articleChanges.syncStatus.startupSyncComplete || value === selectedKind.value || disposed) return Promise.resolve();
    selectedKind.value = value; pageArticleIds.value = []; nextCursor.value = null; hasMore.value = false;
    return loadPage('initial');
  }
  function loadMoreArticles(): Promise<void> { return canLoadMore.value ? loadPage('append') : Promise.resolve(); }
  function retryArticleLoad(): Promise<void> { return listError.value ? loadPage(listError.value.mode) : Promise.resolve(); }

  // 画面終了では一覧の取得だけ止める。アプリ共通の変更同期は止めない。
  function dispose(): void { disposed = true; generation++; activeRequest?.abort(); }
  return { selectedKind: readonly(selectedKind), displayedArticles, nextCursor: readonly(nextCursor), hasMore: readonly(hasMore),
    listLoading: readonly(listLoading), listError: readonly(listError), canLoadMore,
    refreshArticles, changeListKind, loadMoreArticles, retryArticleLoad, dispose };
}
export type ArticleListModel = ReturnType<typeof createArticleListModel>;
