import { describe,expect,it,vi } from 'vitest';
import { ApplicationStartupModel } from '../models/application-startup.model';
import { InterestBatchError,InterestBatchSyncModel } from '../../sorting/models/interest-batch-sync.model';
import { SortingModel } from '../../sorting/models/sorting.model';
import { memoryPendingStore } from '../../../test/pending-interest-fixture';
import { interestBatchApiFixture } from '../../../test/interest-batch-fixture';
import { article } from '../../../test/article-fixture';
import { useApplicationStartupViewModel } from './useApplicationStartupViewModel';
const batch={batchId:'00000000-0000-4000-8000-000000000001',revision:1,articleIds:[1]};
function setup(){
  const store={...memoryPendingStore(),readDay:vi.fn().mockResolvedValue(null),writeDay:vi.fn().mockResolvedValue(undefined),close:vi.fn().mockResolvedValue(undefined)};
  const lease={acquire:vi.fn().mockResolvedValue(true),release:vi.fn()};const api=interestBatchApiFixture();const getSortingCandidates=vi.fn().mockResolvedValue({articles:[]});
  const model=new ApplicationStartupModel(lease,store,new InterestBatchSyncModel(store,api),new SortingModel({getSortingCandidates}),()=>new Date('2026-10-20T15:00:00.000Z'));
  return {vm:useApplicationStartupViewModel(model),model,store,lease,api,getSortingCandidates};
}
describe('起動前の仕分け復旧',()=>{
  it('未送信がない場合は通常起動し、日本時間の日付を記録する。日次0件でも記録する',async()=>{
    const f=setup();await f.vm.initialize();expect(f.vm.phase.value).toBe('ready');expect(f.api.saveInterestBatch).not.toHaveBeenCalled();expect(f.store.writeDay).toHaveBeenCalledWith('2026-10-21');
  });
  it('復旧が成功するまで通常操作と日次判定へ進めず、同じ回・版を解消してから進む',async()=>{
    const f=setup();await f.store.put(batch);let release!:(value:unknown)=>void;f.api.saveInterestBatch.mockImplementationOnce(()=>new Promise(yes=>{release=yes;}));
    const starting=f.vm.initialize();await vi.waitFor(()=>expect(f.api.saveInterestBatch).toHaveBeenCalledOnce());expect(f.vm.phase.value).toBe('checking');expect(f.getSortingCandidates).not.toHaveBeenCalled();
    release({batchId:batch.batchId,revision:1,results:[{articleId:1,status:'saved'}]});await starting;expect(f.vm.phase.value).toBe('ready');expect(await f.store.loadAll()).toEqual([]);expect(f.getSortingCandidates).toHaveBeenCalledOnce();
  });
  it('一時失敗は間隔を空けて再試行し、停止・再起動後も記録を残す',async()=>{
    vi.useFakeTimers();try{const f=setup();await f.store.put(batch);f.api.saveInterestBatch.mockRejectedValue(new InterestBatchError('temporary','offline'));
      await f.vm.initialize();expect(f.vm.phase.value).toBe('waiting');await vi.advanceTimersByTimeAsync(1000);expect(f.api.saveInterestBatch).toHaveBeenCalledTimes(2);
      f.vm.stop();await vi.advanceTimersByTimeAsync(60000);expect(f.api.saveInterestBatch).toHaveBeenCalledTimes(2);expect(await f.store.loadAll()).toEqual([batch]);expect(f.vm.phase.value).toBe('stopped');expect(f.lease.release).toHaveBeenCalled();
    }finally{vi.useRealTimers();}
  });
  it('削除済みを通知し、確認前は記録を残す。確認後に日次判定へ進む',async()=>{
    const f=setup();await f.store.put(batch);f.api.saveInterestBatch.mockImplementationOnce(async b=>({batchId:b.batchId,revision:b.revision,results:[{articleId:1,status:'missing' as const}]}));
    await f.vm.initialize();expect(f.vm.phase.value).toBe('missing');expect((await f.store.loadAll()).length).toBe(1);expect(f.getSortingCandidates).not.toHaveBeenCalled();
    await f.vm.acknowledgeMissing();expect(f.vm.phase.value).toBe('ready');expect(await f.store.loadAll()).toEqual([]);
  });
  it('永久エラーは自動で消さず、利用者が明示した破棄だけを条件付きで解消する',async()=>{
    const f=setup();await f.store.put(batch);f.api.saveInterestBatch.mockRejectedValue(new InterestBatchError('blocked','auth'));await f.vm.initialize();
    expect(f.vm.phase.value).toBe('blocked');expect(f.vm.canDiscard.value).toBe(true);expect(await f.store.loadAll()).toEqual([batch]);
    await f.vm.discardBlocked();expect(f.vm.phase.value).toBe('ready');expect(await f.store.loadAll()).toEqual([]);
  });
  it('別タブが所有中なら端末記録とAPIに触れず、未対応・読み出し失敗でも通常画面を出さない',async()=>{
    const f=setup();f.lease.acquire.mockResolvedValueOnce(false);const read=vi.spyOn(f.store,'loadAll');await f.vm.initialize();expect(f.vm.phase.value).toBe('blocked');expect(read).not.toHaveBeenCalled();expect(f.getSortingCandidates).not.toHaveBeenCalled();
    read.mockRejectedValueOnce(new Error('corrupt'));await f.vm.initialize();expect(f.vm.phase.value).toBe('blocked');expect(f.vm.canDiscard.value).toBe(false);
  });
  it('当日の判定済みは再取得せず、初回は受け取った候補だけで自動開始する',async()=>{
    const f=setup();f.store.readDay.mockResolvedValueOnce('2026-10-21');await f.vm.initialize();expect(f.getSortingCandidates).not.toHaveBeenCalled();
    const first=setup();first.getSortingCandidates.mockResolvedValueOnce({articles:[article(1)]});await first.vm.initialize();expect(first.vm.automaticCandidates.value.map(a=>a.articleId)).toEqual([1]);
  });
  it('日次取得・日次記録の失敗は記録せず、手動開始の案内を残して一覧へ進む',async()=>{
    const f=setup();f.getSortingCandidates.mockRejectedValueOnce(new Error('network'));await f.vm.initialize();expect(f.vm.phase.value).toBe('ready');expect(f.vm.notice.value).toBeTruthy();expect(f.store.writeDay).not.toHaveBeenCalled();
    const disk=setup();disk.store.writeDay.mockRejectedValueOnce(new Error('quota'));disk.getSortingCandidates.mockResolvedValueOnce({articles:[article(1)]});await disk.vm.initialize();expect(disk.vm.automaticCandidates.value).toEqual([]);expect(disk.vm.notice.value).toBeTruthy();
  });
  it('停止・終了後に届いた結果で通常画面を開かない',async()=>{
    const f=setup();let release!:(value:boolean)=>void;f.lease.acquire.mockImplementationOnce(()=>new Promise(yes=>{release=yes;}));const pending=f.vm.initialize();f.vm.stop();release(true);await pending;expect(f.vm.phase.value).toBe('stopped');expect(f.getSortingCandidates).not.toHaveBeenCalled();
  });
});
