import { describe, expect, it, vi } from 'vitest';
import { ArticleStateModel } from './article-state.model';
import { ApiError } from '../../../infrastructure/api/api-error';
import { article } from '../../../test/article-fixture';

describe('記事状態Model', () => {
  it('ピン・気になる・既読を直接保存し、返された状態を返す', async () => {
    const response = { articleId: 1, state: article(1).state };
    const updateArticleState = vi.fn().mockResolvedValue(response); const getArticleState = vi.fn().mockResolvedValue(response);
    const model = new ArticleStateModel({ updateArticleState, getArticleState });
    const signal = new AbortController().signal;
    expect(await model.setField(1, 'pinned', true, signal)).toEqual(response.state);
    await model.setField(1, 'interested', false, signal); await model.recordOpened(1, '2026-10-20T00:00:00.000Z', signal);
    expect(updateArticleState.mock.calls.map(args => args[1])).toEqual([
      { change: { kind: 'pinned', value: true } }, { change: { kind: 'interested', value: false } },
      { change: { kind: 'opened', openedAt: '2026-10-20T00:00:00.000Z' } },
    ]);
    expect(await model.getState(1, signal)).toEqual(response.state);
    expect(getArticleState).toHaveBeenCalledWith(1, signal);
  });
  it.each([[400,'rejected'],[401,'rejected'],[403,'rejected'],[404,'missing'],[409,'rejected'],[422,'rejected'],[429,'uncertain'],[500,'uncertain'],[undefined,'uncertain']] as const)('%sを%sに分類し、勝手に再送しない', async (status, kind) => {
    const updateArticleState = vi.fn().mockRejectedValue(new ApiError(status));
    const model = new ArticleStateModel({ updateArticleState, getArticleState: vi.fn() });
    await expect(model.setField(1, 'pinned', true)).rejects.toMatchObject({ kind }); expect(updateArticleState).toHaveBeenCalledTimes(1);
  });
});
