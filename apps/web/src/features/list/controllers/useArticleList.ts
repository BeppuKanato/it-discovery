import { computed, readonly, ref, shallowRef } from 'vue';
import type { ArticleListItem, ArticleListKind } from '@it-discovery/contracts';
import type { ArticleListApi } from '../models/article-list-api';

type LoadMode = 'initial' | 'refresh' | 'append';

// 一覧取得・切り替え・追加・再試行と、古い応答の破棄を管理する。
export function useArticleList(api: ArticleListApi) {
  const kind = ref<ArticleListKind>('all');
  const articles = shallowRef<ArticleListItem[]>([]);
  const nextCursor = ref<string | null>(null);
  const hasMore = ref(false);
  const loading = ref<LoadMode | null>(null);
  const error = ref<{ mode: LoadMode; message: string } | null>(null);
  let generation = 0;
  let activeRequest: AbortController | null = null;
  let disposed = false;

  // 現在の要求だけを反映し、失敗時は表示済みデータを維持する。
  async function request(mode: LoadMode): Promise<void> {
    if (disposed) return;
    if (mode === 'append' && (loading.value !== null || !hasMore.value || !nextCursor.value)) return;
    const requestGeneration = ++generation;
    activeRequest?.abort();
    const controller = new AbortController();
    activeRequest = controller;
    const cursor = mode === 'append' ? nextCursor.value ?? undefined : undefined;
    loading.value = mode;
    error.value = null;
    try {
      const page = await api.getArticlePage({ kind: kind.value, limit: 20, ...(cursor ? { cursor } : {}) }, controller.signal);
      if (disposed || generation !== requestGeneration) return;
      const unique = new Map<number, ArticleListItem>();
      if (mode === 'append') for (const article of articles.value) unique.set(article.articleId, article);
      for (const article of page.articles) unique.set(article.articleId, article);
      articles.value = [...unique.values()];
      nextCursor.value = page.nextCursor;
      hasMore.value = page.hasMore;
    } catch {
      if (disposed || generation !== requestGeneration) return;
      error.value = {
        mode,
        message: mode === 'append' ? '続きを取得できませんでした。'
          : mode === 'refresh' ? '一覧を更新できませんでした。' : '一覧を取得できませんでした。',
      };
    } finally {
      if (!disposed && generation === requestGeneration) {
        loading.value = null;
        activeRequest = null;
      }
    }
  }

  // 先頭から読み直し、成功したときだけ一覧を置き換える。
  function refresh(): Promise<void> {
    if (loading.value === 'initial' || loading.value === 'refresh') return Promise.resolve();
    return request(articles.value.length ? 'refresh' : 'initial');
  }

  // 一覧の種類を変え、前の要求を無効にして先頭を取得する。
  function changeKind(value: ArticleListKind): Promise<void> {
    if (value === kind.value || disposed) return Promise.resolve();
    kind.value = value;
    articles.value = [];
    nextCursor.value = null;
    hasMore.value = false;
    return request('initial');
  }

  const canLoadMore = computed(() => hasMore.value && nextCursor.value !== null && loading.value === null && error.value === null);

  // 続きがあり、取得中でも失敗中でもない場合だけ追加取得する。
  function loadMore(): Promise<void> {
    return canLoadMore.value ? request('append') : Promise.resolve();
  }

  // 失敗した取得を同じ続き位置からやり直す。
  function retry(): Promise<void> {
    return error.value ? request(error.value.mode) : Promise.resolve();
  }

  // 画面を閉じた後の通信と状態反映を止める。
  function dispose(): void {
    disposed = true;
    generation++;
    activeRequest?.abort();
  }

  return {
    kind: readonly(kind), articles: readonly(articles), nextCursor: readonly(nextCursor),
    hasMore: readonly(hasMore), loading: readonly(loading), error: readonly(error), canLoadMore,
    refresh, changeKind, loadMore, retry, dispose,
  };
}
