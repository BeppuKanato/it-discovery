import { computed, readonly, ref, shallowRef } from 'vue';
import type { ArticleListItem, ArticleListKind } from '@it-discovery/contracts';
import type { ArticleListApi } from '../models/article-list-api';

type LoadMode = 'initial' | 'refresh' | 'append';

// 一覧取得・切り替え・追加・再試行と、古い応答の破棄を管理する。
export function useArticleList(api: ArticleListApi) {
// ComposableはVueの状態と操作をまとめる関数。呼び出しごとに独立した一覧状態を作る。
  // refは変更を追跡する。shallowRefは配列の差し替えだけを追跡し、記事内部まで監視しない。
  const kind = ref<ArticleListKind>('all');
  const articles = shallowRef<ArticleListItem[]>([]);
  const nextCursor = ref<string | null>(null);
  const hasMore = ref(false);
  const loading = ref<LoadMode | null>(null);
  const error = ref<{ mode: LoadMode; message: string } | null>(null);
  // 通信の中止だけでは届きかけの応答を防げないため、要求番号でも新旧を判定する。
  let generation = 0;
  let activeRequest: AbortController | null = null;
  let disposed = false;

  // 現在の要求だけを反映し、失敗時は表示済みデータを維持する。
  async function request(mode: LoadMode): Promise<void> {
    if (disposed) return;
    if (mode === 'append' && (loading.value !== null || !hasMore.value || !nextCursor.value)) return;
    const requestGeneration = ++generation;
    activeRequest?.abort();
    // signalをAxiosへ渡すと、種類の変更や画面終了時に前の通信を中止できる。
    const controller = new AbortController();
    activeRequest = controller;
    const cursor = mode === 'append' ? nextCursor.value ?? undefined : undefined;
    loading.value = mode;
    error.value = null;
    try {
      const page = await api.getArticlePage({ kind: kind.value, limit: 20, ...(cursor ? { cursor } : {}) }, controller.signal);
      if (disposed || generation !== requestGeneration) return;
      // Mapは同じIDの値を上書きする。追加時は既存の順番を保ち、重複したカードを増やさない。
      const unique = new Map<number, ArticleListItem>();
      if (mode === 'append') for (const article of articles.value) unique.set(article.articleId, article);
      for (const article of page.articles) unique.set(article.articleId, article);
      articles.value = [...unique.values()];
      nextCursor.value = page.nextCursor;
      hasMore.value = page.hasMore;
    } catch {
      // 通信失敗では記事やカーソルを変更しない。同じ続きを再取得できる状態を残す。
      if (disposed || generation !== requestGeneration) return;
      error.value = {
        mode,
        message: mode === 'append' ? '続きを取得できませんでした。'
          : mode === 'refresh' ? '一覧を更新できませんでした。' : '一覧を取得できませんでした。',
      };
    } finally {
      // finallyは成功・失敗のどちらでも実行する。古い通信が新しい取得中表示を消さないよう守る。
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

  // computedはここで使ったrefを追跡し、取得可否を常に現在の状態から求める。
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

  // readonlyで外からの直接代入を防ぐ。状態変更は上の操作関数を通して行う。
  return {
    kind: readonly(kind), articles: readonly(articles), nextCursor: readonly(nextCursor),
    hasMore: readonly(hasMore), loading: readonly(loading), error: readonly(error), canLoadMore,
    refresh, changeKind, loadMore, retry, dispose,
  };
}
