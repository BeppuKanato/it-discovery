import { interestBatchApiFixture } from '../../../test/interest-batch-fixture';
import { InterestBatchSyncModel, InterestBatchError } from '../models/interest-batch-sync.model';
import { memoryPendingStore } from '../../../test/pending-interest-fixture';
import { PendingInterestModel } from '../models/pending-interest.model';
import { describe, expect, it, vi } from 'vitest';
import type { ArticleStateResponse, SortingCandidatesResponse } from '@it-discovery/contracts';
import { article } from '../../../test/article-fixture';
import { ArticleOpeningModel } from '../../articles/models/article-opening.model';
import { ArticleStateModel } from '../../articles/models/article-state.model';
import { ApiError } from '../../../infrastructure/api/api-error';
import { SortingModel } from '../models/sorting.model';
import { useSortingViewModel } from './useSortingViewModel';

function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function setupSorting(ids = [3, 2, 1], store = memoryPendingStore()) {
  const getSortingCandidates = vi.fn().mockResolvedValue({ articles: ids.map(article) }); const open = vi.fn();
  const updateArticleState = vi.fn(); const getArticleState = vi.fn();
  const models = { sorting: new SortingModel({ getSortingCandidates }), opening: new ArticleOpeningModel({ open }), state: new ArticleStateModel({ updateArticleState, getArticleState }) };
  const batchApi = interestBatchApiFixture();
  const vm = useSortingViewModel(models.sorting, models.opening, models.state, new PendingInterestModel(store), new InterestBatchSyncModel(store,batchApi));
  return { vm, batchApi, store, models, getSortingCandidates, open, updateArticleState, getArticleState };
}
function saved(openedAt: string): ArticleStateResponse { return { articleId: 3, state: { ...article(3).state, lastOpenedAt: openedAt } }; }

describe('仕分けVM', () => {
  it('Page開始まで取得せず、取得中の重複要求を防ぎ、一回だけ開始する', async () => {
    const { vm, getSortingCandidates } = setupSorting(); expect(getSortingCandidates).not.toHaveBeenCalled();
    const first = vm.initialize(); expect(vm.loading.value).toBe(true); await vm.retryLoading(); await first; await vm.initialize();
    expect(getSortingCandidates).toHaveBeenCalledOnce(); expect(vm.currentArticle.value?.articleId).toBe(3); expect(vm.canUndo.value).toBe(false);
  });
  it('A仮登録・B見送りと2回戻すは全て手元だけで進み、GETもPUTも増えない', async () => {
    const { vm, getSortingCandidates, updateArticleState, getArticleState } = setupSorting(); await vm.initialize();
    vm.decide('interested'); expect(vm.currentArticle.value?.articleId).toBe(2); expect(vm.canExit.value).toBe(true);
    vm.decide('skipped'); expect(vm.currentArticle.value?.articleId).toBe(1); expect(vm.interestedIds.value).toEqual([3]);
    vm.undo(); expect(vm.currentArticle.value?.articleId).toBe(2); expect(vm.interestedIds.value).toEqual([3]);
    vm.undo(); expect(vm.currentArticle.value?.articleId).toBe(3); expect(vm.interestedIds.value).toEqual([]); expect(vm.canExit.value).toBe(true);
    expect(vm.canUndo.value).toBe(false); expect(getSortingCandidates).toHaveBeenCalledOnce(); expect(updateArticleState).not.toHaveBeenCalled(); expect(getArticleState).not.toHaveBeenCalled();
  });
  it('10件全てを判断しても自動送信せず、完了画面から戻せる', async () => {
    const { vm, updateArticleState } = setupSorting(Array.from({ length: 10 }, (_, i) => 10 - i)); await vm.initialize();
    for (let i = 0; i < 10; i++) vm.decide('interested');
    expect(vm.complete.value).toBe(true); expect(vm.processedCount.value).toBe(10); expect(vm.canUndo.value).toBe(true); expect(vm.canExit.value).toBe(true);
    vm.undo(); expect(vm.currentArticle.value?.articleId).toBe(1); expect(vm.interestedIds.value.length).toBe(9); expect(updateArticleState).not.toHaveBeenCalled();
  });
  it('0件では判断を開始せず、少数ならその件数で完了する', async () => {
    const empty = setupSorting([]); await empty.vm.initialize(); empty.vm.decide('interested'); expect(empty.vm.total.value).toBe(0); expect(empty.vm.canJudge.value).toBe(false); expect(empty.vm.canUndo.value).toBe(false);
    const one = setupSorting([1]); await one.vm.initialize(); one.vm.decide('skipped'); expect(one.vm.complete.value).toBe(true); expect(one.vm.canExit.value).toBe(true);
  });
  it('取得失敗は再試行でき、開始済みのカードを後から取り直さない', async () => {
    const { vm, getSortingCandidates } = setupSorting(); getSortingCandidates.mockRejectedValueOnce(new Error('offline'));
    await vm.initialize(); expect(vm.error.value).toContain('取得できません'); expect(vm.total.value).toBe(0);
    await vm.retryLoading(); expect(vm.currentArticle.value?.articleId).toBe(3); expect(vm.error.value).toBeNull();
    await vm.retryLoading(); expect(getSortingCandidates).toHaveBeenCalledTimes(2);
  });
  it('右左スワイプは閾値で一度だけ判断し、短い移動・縦スクロールは進めない', async () => {
    const { vm, updateArticleState } = setupSorting(); await vm.initialize();
    vm.beginSwipe(0,0); vm.moveSwipe(79,0); vm.finishSwipe(); expect(vm.processedCount.value).toBe(0);
    vm.beginSwipe(0,0); vm.moveSwipe(5,80); vm.finishSwipe(); expect(vm.processedCount.value).toBe(0);
    vm.beginSwipe(0,0); vm.moveSwipe(90,0); vm.finishSwipe(); vm.finishSwipe(); expect(vm.currentArticle.value?.articleId).toBe(2);
    vm.beginSwipe(0,0); vm.moveSwipe(-90,0); vm.finishSwipe(); expect(vm.currentArticle.value?.articleId).toBe(1); expect(vm.interestedIds.value).toEqual([3]); expect(updateArticleState).not.toHaveBeenCalled();
  });
  it('元記事は同期的に開き、既読保存を待たず同じカードに残る。次へ・戻すでも既読は残る', async () => {
    const { vm, open, updateArticleState } = setupSorting(); await vm.initialize();
    const wait = deferred<ArticleStateResponse>(); updateArticleState.mockReturnValueOnce(wait.promise); const saving = vm.openCurrentArticle();
    expect(open).toHaveBeenCalledExactlyOnceWith('https://example.com/3'); expect(vm.currentArticle.value?.articleId).toBe(3);
    expect(vm.canJudge.value).toBe(false); expect(vm.canNext.value).toBe(true); const openedAt = vm.currentReadStatus.value!.openedAt;
    vm.decide('interested'); expect(vm.processedCount.value).toBe(0); vm.decide('read'); expect(vm.currentArticle.value?.articleId).toBe(2); vm.undo();
    expect(vm.currentArticle.value?.articleId).toBe(3); expect(vm.canNext.value).toBe(true); expect(vm.interestedIds.value).toEqual([]);
    wait.resolve(saved(openedAt)); await saving; expect(vm.currentReadStatus.value).toBeUndefined(); expect(vm.currentArticle.value?.state.interested).toBe(false);
  });
  it('開く操作の拒否は判断にも既読にもせず、そのカードで通知する', async () => {
    const { vm, open, updateArticleState } = setupSorting(); await vm.initialize(); open.mockImplementationOnce(() => { throw new Error('blocked'); });
    await vm.openCurrentArticle(); expect(vm.openingError.value).toContain('開けません'); expect(vm.canJudge.value).toBe(true); expect(updateArticleState).not.toHaveBeenCalled();
  });
  it('既読保存失敗でも次へ進め、戻ったカードで同じ日時を手動保存できる', async () => {
    const { vm, updateArticleState, open } = setupSorting(); await vm.initialize(); updateArticleState.mockRejectedValueOnce(new ApiError(500)); await vm.openCurrentArticle();
    expect(vm.currentReadStatus.value?.phase).toBe('uncertain'); const openedAt = vm.currentReadStatus.value!.openedAt;
    vm.decide('read'); vm.undo(); expect(vm.currentReadStatus.value?.phase).toBe('uncertain'); expect(vm.canNext.value).toBe(true);
    updateArticleState.mockResolvedValueOnce(saved(openedAt)); await vm.retryReadSave(); expect(open).toHaveBeenCalledOnce(); expect(vm.currentReadStatus.value).toBeUndefined();
    expect(updateArticleState.mock.calls[1]?.[1]).toEqual({ change: { kind: 'opened', openedAt } });
  });
  it('別カードへ進んだ後の既読保存応答が位置・判断履歴・次カードの登録値を変えない', async () => {
    const { vm, updateArticleState } = setupSorting(); await vm.initialize(); const wait = deferred<ArticleStateResponse>(); updateArticleState.mockReturnValueOnce(wait.promise);
    const saving = vm.openCurrentArticle(); const openedAt = vm.currentReadStatus.value!.openedAt; vm.decide('read'); vm.decide('interested');
    wait.resolve({ ...saved(openedAt), state: { ...saved(openedAt).state, pinned: true, interested: true } }); await saving;
    expect(vm.currentArticle.value?.articleId).toBe(1); expect(vm.interestedIds.value).toEqual([2]); vm.undo(); vm.undo();
    expect(vm.currentArticle.value?.state.pinned).toBe(false); expect(vm.currentArticle.value?.state.interested).toBe(false); expect(vm.canNext.value).toBe(true);
  });
  it('終了時は取得・既読通信を中止し、遅い応答とその後の操作を無視する', async () => {
    const pending = setupSorting(); const response = deferred<SortingCandidatesResponse>(); pending.getSortingCandidates.mockReturnValueOnce(response.promise);
    const fetching = pending.vm.initialize(); pending.vm.dispose(); expect((pending.getSortingCandidates.mock.calls[0]?.[0] as AbortSignal).aborted).toBe(true);
    response.resolve({ articles: [article(3)] }); await fetching; expect(pending.vm.total.value).toBe(0);
    const active = setupSorting(); await active.vm.initialize(); const save = deferred<ArticleStateResponse>(); active.updateArticleState.mockReturnValueOnce(save.promise);
    const saving = active.vm.openCurrentArticle(); const openedAt = active.vm.currentReadStatus.value!.openedAt; active.vm.dispose();
    expect((active.updateArticleState.mock.calls[0]?.[2] as AbortSignal).aborted).toBe(true); save.resolve(saved(openedAt)); await saving;
    active.vm.decide('read'); active.vm.undo(); expect(active.vm.processedCount.value).toBe(0);
  });
  it('端末保存を待たず次のカードへ進め、失敗時は最新の選択を保って判断・戻すを止める', async () => {
    const store = memoryPendingStore(); const put = vi.spyOn(store,'put').mockRejectedValueOnce(new Error('quota'));
    const { vm } = setupSorting([3,2,1],store); await vm.initialize(); vm.decide('interested');
    expect(vm.currentArticle.value?.articleId).toBe(2); expect(await vm.prepareExit()).toBe(false);
    expect(vm.storageError.value).toBeTruthy(); expect(vm.canUndo.value).toBe(false); expect(vm.canJudge.value).toBe(false);
    vm.decide('skipped'); vm.undo(); expect(vm.interestedIds.value).toEqual([3]); expect(vm.currentArticle.value?.articleId).toBe(2);
    await vm.retryPending(); expect(vm.storageError.value).toBeNull(); expect(vm.canUndo.value).toBe(true); expect(put).toHaveBeenCalledTimes(2);
    vm.undo(); expect(await vm.prepareExit()).toBe(true); expect((await store.loadAll())[0]?.articleIds).toEqual([]);
  });

  it('完了画面だけでは送信せず、終了で取り消し後の集合だけ送り、空集合は通信しない', async () => {
    const {vm,batchApi,store}=setupSorting([3,2]);await vm.initialize();vm.decide('interested');vm.decide('interested');vm.undo();vm.decide('skipped');
    expect(batchApi.saveInterestBatch).not.toHaveBeenCalled();await vm.finishSorting();expect(vm.finished.value).toBe(true);
    expect(batchApi.saveInterestBatch.mock.calls[0]?.[0].articleIds).toEqual([3]);expect(await store.loadAll()).toEqual([]);
    const empty=setupSorting([1]);await empty.vm.initialize();empty.vm.decide('skipped');await empty.vm.finishSorting();expect(empty.batchApi.saveInterestBatch).not.toHaveBeenCalled();expect(empty.batchApi.getInterestBatchResult).not.toHaveBeenCalled();
  });
  it('一時失敗は固定した集合を再試行し、送信開始後は戻す・判断を止める',async()=>{
    vi.useFakeTimers();try{
      const {vm,batchApi,store}=setupSorting([3,2]);await vm.initialize();vm.decide('interested');batchApi.saveInterestBatch.mockRejectedValueOnce(new InterestBatchError('temporary','network'));
      await vm.finishSorting();expect(vm.finished.value).toBe(false);expect((await store.loadAll()).length).toBe(1);vm.undo();vm.decide('skipped');expect(vm.interestedIds.value).toEqual([3]);
      await vi.advanceTimersByTimeAsync(1000);expect(vm.finished.value).toBe(true);expect(batchApi.saveInterestBatch.mock.calls[0]?.[0]).toEqual(batchApi.saveInterestBatch.mock.calls[1]?.[0]);vm.dispose();
    }finally{vi.useRealTimers();}
  });
  it('削除済み記事は確認前に消さず、明示的に確認してから端末記録を解消する',async()=>{
    const {vm,batchApi,store}=setupSorting([3]);await vm.initialize();vm.decide('interested');
    batchApi.saveInterestBatch.mockImplementationOnce(async batch=>({batchId:batch.batchId,revision:batch.revision,results:[{articleId:3,status:'missing' as const}]}));
    await vm.finishSorting();expect(vm.missingIds.value).toEqual([3]);expect((await store.loadAll()).length).toBe(1);expect(vm.finished.value).toBe(false);
    await vm.acknowledgeMissing();expect(vm.finished.value).toBe(true);expect(await store.loadAll()).toEqual([]);
  });
  it('恒久エラーは自動再送せず、終了しても端末記録を残す',async()=>{
    vi.useFakeTimers();try{const {vm,batchApi,store}=setupSorting([3]);await vm.initialize();vm.decide('interested');batchApi.saveInterestBatch.mockRejectedValue(new InterestBatchError('blocked','auth'));
      await vm.finishSorting();await vi.advanceTimersByTimeAsync(60000);expect(batchApi.saveInterestBatch).toHaveBeenCalledOnce();expect(vm.finishBlocked.value).toBe(true);vm.dispose();expect((await store.loadAll()).length).toBe(1);
    }finally{vi.useRealTimers();}
  });

  it('起動時に取得済みの候補をそのまま開始し、二重取得しない',async()=>{
    const {vm,getSortingCandidates}=setupSorting();await vm.initialize([article(7)]);expect(vm.currentArticle.value?.articleId).toBe(7);expect(getSortingCandidates).not.toHaveBeenCalled();
  });

});
