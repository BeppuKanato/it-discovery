import { useArticleStateStore } from '../../article-state/models/article-state.store';
import { createPinia } from 'pinia';
import { describe, expect, it, vi } from 'vitest';
import type { ArticlePageResponse, ArticleStateMutationRequest, ArticleStateOperationResponse } from '@it-discovery/contracts';
import { article, page } from '../../../test/article-fixture';
import { ArticleStateSyncService } from '../../article-state/models/article-state-sync.service';
import { StateRequestError } from '../../article-state/models/state-sync';
import { useArticleListViewModel } from './useArticleListViewModel';

function deferred<T>() {
  let resolve!: (value: T) => void; let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function flush() { for (let i = 0; i < 30; i++) await Promise.resolve(); }
function interestedPage(ids: number[]): ArticlePageResponse {
  const result = page(ids);
  for (const item of result.articles) item.state.interested = true;
  return result;
}

describe('一覧取得と未確定変更の合成', () => {
  async function setup() {
    const api = {
      getArticlePage: vi.fn().mockResolvedValue(interestedPage([3, 2, 1])),
      applyArticleState: vi.fn(async (id: number, request: ArticleStateMutationRequest): Promise<ArticleStateOperationResponse> => ({
        articleId: id, operationId: request.operationId, status: 'saved',
        state: { ...article(id).state, ...(request.change.kind !== 'opened' ? { [request.change.kind]: request.change.value } : {}) },
      })),
      getArticleStateOperation: vi.fn().mockResolvedValue(undefined),
    };
    const sync = new ArticleStateSyncService(api, { load: async () => [], put: async () => {}, remove: async () => {} }, async () => () => {}, useArticleStateStore(createPinia()));
    await sync.start();
    const list = useArticleListViewModel(api, sync.state, sync);
    await list.changeKind('interested');
    return { sync, list, api };
  }

  it('解除はすぐ非表示にし、拒否が確定した記事だけ元の順番へ復元する', async () => {
    const { sync, list, api } = await setup();
    const pending = deferred<ArticleStateOperationResponse>(); api.applyArticleState.mockReturnValueOnce(pending.promise);
    toggle(sync, list.articles.value[1]!, 'interested'); await flush();
    expect(list.articles.value.map((item) => item.articleId)).toEqual([3, 1]);
    toggle(sync, list.articles.value[0]!, 'pinned'); await flush();
    pending.reject(new StateRequestError('invalid', '拒否')); await flush();
    expect(list.articles.value.map((item) => item.articleId)).toEqual([3, 2, 1]);
    expect(list.articles.value[0]!.state.pinned).toBe(true);
    sync.dispose(); list.dispose();
  });

  it('解除後の再取得に記事が含まれなくても、拒否時の復元用カードを保持する', async () => {
    const { sync, list, api } = await setup();
    const pending = deferred<ArticleStateOperationResponse>(); api.applyArticleState.mockReturnValueOnce(pending.promise);
    toggle(sync, list.articles.value[1]!, 'interested'); await flush();
    api.getArticlePage.mockResolvedValueOnce(interestedPage([3, 1])); await list.refresh();
    pending.reject(new StateRequestError('invalid', '拒否')); await flush();
    expect(list.articles.value.map((item) => item.articleId)).toEqual([3, 2, 1]);
    sync.dispose(); list.dispose();
  });

  it('変更中に一覧を再取得しても希望状態を保ち、古い一覧応答で成功を戻さない', async () => {
    const { sync, list, api } = await setup();
    const oldPage = deferred<ArticlePageResponse>(); api.getArticlePage.mockReturnValueOnce(oldPage.promise);
    const request = list.refresh();
    toggle(sync, list.articles.value[0]!, 'pinned'); await flush();
    oldPage.resolve(interestedPage([3, 2, 1])); await request;
    expect(list.articles.value[0]!.state.pinned).toBe(true);
    sync.dispose(); list.dispose();
  });

  it('全記事で登録した記事は気になるに現れ、解除後の切り替えでも復活しない', async () => {
    const { sync, list, api } = await setup();
    api.getArticlePage.mockResolvedValueOnce(page([5])); await list.changeKind('all');
    toggle(sync, list.articles.value[0]!, 'interested'); await flush();
    api.getArticlePage.mockResolvedValueOnce(page([])); await list.changeKind('interested');
    expect(list.articles.value.map((item) => item.articleId)).toEqual([5]);
    toggle(sync, list.articles.value[0]!, 'interested'); await flush();
    expect(list.articles.value).toEqual([]);
    sync.dispose(); list.dispose();
  });
});

function toggle(sync: ArticleStateSyncService, item: ReturnType<typeof article>, field: 'pinned' | 'interested'): void {
  if (!sync.state.entries.has(item.articleId)) sync.state.accept([item], sync.state.version);
  const current = sync.state.getArticle(item.articleId);
  if (current) sync.setState(item.articleId, field, !current.state[field]);
}
