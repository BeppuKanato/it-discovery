import { readonly, ref, shallowRef } from 'vue';
import type { ArticleListItem } from '@it-discovery/contracts';
import type { ApplicationStartupModel } from '../models/application-startup.model';
import type { PendingInterestBatch } from '../../sorting/models/pending-interest';
import { InterestBatchError } from '../../sorting/models/interest-batch-sync.model';

type Phase = 'checking' | 'waiting' | 'blocked' | 'missing' | 'ready' | 'stopped';
export function useApplicationStartupViewModel(model: ApplicationStartupModel) {
  const phase = ref<Phase>('checking');
  const running = ref(false);
  const error = ref<string | null>(null);
  const remaining = ref(0);
  const missingIds = ref<number[]>([]);
  const automaticCandidates = shallowRef<ArticleListItem[]>([]);
  const notice = ref<string | null>(null);
  const canDiscard = ref(false);
  let queue: PendingInterestBatch[] | null = null;
  let leaseHeld = false;
  let disposed = false;
  let online = true;
  let attempts = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | null = null;
  function cancelTimer(): void { if (timer) clearTimeout(timer); timer = undefined; }
  function active(): boolean { return !disposed && phase.value !== 'stopped'; }
  async function initialize(): Promise<void> {
    if (!active() || running.value || phase.value === 'ready') return;
    if (missingIds.value.length) { phase.value = 'missing'; return; }
    cancelTimer(); running.value = true; phase.value = 'checking'; error.value = null; canDiscard.value = false;
    const current = new AbortController(); controller = current;
    try {
      if (!leaseHeld) {
        leaseHeld = await model.acquireLease();
        if (!active()) { model.release(); return; }
        if (!leaseHeld) throw new InterestBatchError('blocked','別のタブでアプリを使用しています。そのタブを閉じて再試行してください。');
      }
      queue ??= await model.restorePending();
      remaining.value = queue.length;
      while (queue.length) {
        const batch = queue[0]!;
        const result = await model.send(batch,current.signal);
        if (!active()) return;
        missingIds.value = result.results.filter(item=>item.status==='missing').map(item=>item.articleId);
        if (missingIds.value.length) { phase.value = 'missing'; return; }
        await model.acknowledge(batch);
        if (!active()) return;
        queue.shift(); remaining.value = queue.length;
      }
      const daily = await model.checkDaily(current.signal);
      if (!active()) return;
      automaticCandidates.value = daily.articles; notice.value = daily.notice; phase.value = 'ready';
    } catch (failure) {
      if (!active()) return;
      const temporary = failure instanceof InterestBatchError && failure.kind === 'temporary';
      phase.value = temporary ? 'waiting' : 'blocked';
      error.value = failure instanceof Error ? failure.message : '起動処理に失敗しました。端末記録は残しています。';
      canDiscard.value = !temporary && !!queue?.length;
      if (temporary && online) timer = setTimeout(() => { void initialize(); },Math.min(30,2 ** Math.min(attempts++,5))*1000);
    } finally { if (!disposed) running.value = false; controller = null; }
  }
  async function acknowledgeMissing(): Promise<void> {
    if (!active() || running.value || !queue?.length || !missingIds.value.length) return;
    running.value = true;
    try { await model.acknowledge(queue[0]!); if (!active()) return; queue.shift(); missingIds.value = []; remaining.value = queue.length; error.value = null; }
    catch { if (active()) error.value = '端末の完了記録を削除できません。もう一度確認してください。'; }
    finally { if (!disposed) running.value = false; }
    if (!missingIds.value.length) await initialize();
  }
  async function discardBlocked(): Promise<void> {
    if (!active() || running.value || !canDiscard.value || !queue?.length) return;
    running.value = true;
    try { await model.discard(queue[0]!); if (!active()) return; queue.shift(); remaining.value = queue.length; canDiscard.value = false; }
    catch { if (active()) error.value = '選択した端末記録を破棄できませんでした。'; }
    finally { if (!disposed) running.value = false; }
    if (!canDiscard.value) await initialize();
  }
  function setOnline(value: boolean): void {
    online = value; if (!online) cancelTimer();
    else if (phase.value === 'waiting' && !running.value) void initialize();
  }
  function stop(): void { cancelTimer(); controller?.abort(); phase.value = 'stopped'; model.release(); leaseHeld = false; }
  function dispose(): void { disposed = true; cancelTimer(); controller?.abort(); model.dispose(); }
  return { phase:readonly(phase), running:readonly(running), error:readonly(error), remaining:readonly(remaining), missingIds:readonly(missingIds),
    automaticCandidates:readonly(automaticCandidates), notice:readonly(notice), canDiscard:readonly(canDiscard),
    initialize, acknowledgeMissing, discardBlocked, setOnline, stop, dispose };
}
