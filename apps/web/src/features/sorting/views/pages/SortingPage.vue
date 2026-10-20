<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue';
import Button from 'primevue/button';
import Message from 'primevue/message';
import Skeleton from 'primevue/skeleton';
import ProgressBar from 'primevue/progressbar';
import type { ArticleListItem } from '@it-discovery/contracts';
import type { InterestBatchSyncModel } from '../../models/interest-batch-sync.model';
import type { PendingInterestModel } from '../../models/pending-interest.model';
import type { SortingModel } from '../../models/sorting.model';
import type { ArticleOpeningModel } from '../../../articles/models/article-opening.model';
import type { ArticleStateModel } from '../../../articles/models/article-state.model';
import { useSortingViewModel } from '../../view-models/useSortingViewModel';
import SortingLayout from '../templates/SortingLayout.vue';
import SortingCard from '../organisms/SortingCard.vue';

const props = defineProps<{ sortingModel: SortingModel; openingModel: ArticleOpeningModel; stateModel: ArticleStateModel; createPendingInterests: () => PendingInterestModel; batchSync: InterestBatchSyncModel; initialCandidates?: readonly ArticleListItem[] }>();
const emit = defineEmits<{ exit: [] }>();
const vm = useSortingViewModel(props.sortingModel, props.openingModel, props.stateModel, props.createPendingInterests(), props.batchSync);
const { finishing, finished, finishError, missingIds, storageError, pendingWrites, loading, error, openingError, currentArticle, currentReadStatus, total, processedCount, interestedIds,
  complete, canUndo, canJudge, canNext, canExit, swipeOffset } = vm;
onMounted(() => { void vm.initialize(props.initialCandidates); vm.setOnline(navigator.onLine); window.addEventListener('beforeunload', beforeUnload); window.addEventListener('online', online); window.addEventListener('offline', offline); });
onUnmounted(() => { window.removeEventListener('beforeunload', beforeUnload); window.removeEventListener('online',online); window.removeEventListener('offline',offline); vm.dispose(); });
watch(finished, value => { if (value) emit('exit'); });
function exit(): void { if (canExit.value) void vm.finishSorting(); }
function online(): void { vm.setOnline(true); }
function offline(): void { vm.setOnline(false); }
function beforeUnload(event: BeforeUnloadEvent): void {
  // 仮選択を保護する補助。ブラウザの強制終了やOSによる終了までは防げない。
  if (!finished.value && (pendingWrites.value || storageError.value || finishing.value)) { event.preventDefault(); event.returnValue = ''; }
}
</script>

<template>
  <SortingLayout>
    <template #header>
      <span class="brand">IT Discovery</span>
      <Button type="button" label="仕分けを終了する" text size="small" :disabled="!canExit" :loading="finishing" @click="exit" />
    </template>
    <template #intro>
      <p class="eyebrow">気になる発見を、ひとつずつ。</p>
      <h1>情報を仕分ける<span>。</span></h1>
      <p class="description">右で気になる、左で見送り。判断はいつでも戻せます。</p>
    </template>
    <section v-if="loading" aria-label="仕分け対象を読み込んでいます" aria-busy="true"><Skeleton height="340px" border-radius="22px" /></section>
    <section v-else-if="error" class="empty-state">
      <Message severity="error" :closable="false">{{ error }}</Message>
      <Button type="button" label="もう一度試す" outlined @click="vm.retryLoading" />
    </section>
    <section v-else-if="!total" class="empty-state" role="status">
      <h2>今は仕分ける記事がありません</h2>
      <p>未読で、気になる・ピン止めが付いていない記事が対象です。</p>
      <Button type="button" label="一覧へ戻る" outlined @click="exit" />
    </section>
    <template v-else>
      <Message v-if="storageError" severity="error" :closable="false" class="status">
        {{ storageError }}<Button type="button" label="端末保存を再試行" text :disabled="pendingWrites > 0" @click="vm.retryPending" />
      </Message>
      <div class="progress" role="status"><span>{{ processedCount }} / {{ total }} 件を判断</span><span>気になる {{ interestedIds.length }} 件を仮選択</span></div>
      <ProgressBar :value="processedCount / total * 100" :show-value="false" aria-label="仕分けの進行" class="progress-bar" />
      <template v-if="currentArticle">
        <SortingCard :article="currentArticle" :offset="swipeOffset" :swipe-enabled="canJudge" :move-pointer="vm.moveSwipe" :read-status="currentReadStatus?.phase"
          @open="vm.openCurrentArticle" @start="vm.beginSwipe" @finish="vm.finishSwipe" @cancel="vm.cancelSwipe" />
        <Message v-if="openingError" severity="error" :closable="false" class="status">{{ openingError }}</Message>
        <div v-if="currentReadStatus && currentReadStatus.phase !== 'saving'" class="status" role="status">
          <p>{{ currentReadStatus.message }}</p><Button type="button" label="既読を保存し直す" text size="small" @click="vm.retryReadSave" />
        </div>
        <p v-if="canNext" class="read-hint">開いた記事です。戻ってきたら「次へ」で進めます。</p>
        <div class="actions">
          <Button v-if="canNext" type="button" label="次へ" class="next" @click="vm.decide('read')" />
          <template v-else>
            <Button type="button" label="見送り" outlined :disabled="!canJudge" @click="vm.decide('skipped')" />
            <Button type="button" label="気になる" :disabled="!canJudge" @click="vm.decide('interested')" />
          </template>
        </div>
      </template>
      <section v-else-if="complete" class="complete-state" role="status">
        <span class="complete-mark" aria-hidden="true">✓</span><h2>{{ total }}件の仕分けが終わりました</h2>
        <p>気になる {{ interestedIds.length }} 件を仮選択しています。</p>
        <p>終了する前なら、判断を戻せます。</p>
        <Button type="button" label="仕分けを終了する" :disabled="!canExit" :loading="finishing" @click="exit" />
      </section>
      <div class="undo"><Button type="button" label="ひとつ戻す" text :disabled="!canUndo" @click="vm.undo" /></div>
      <Message v-if="finishing" severity="info" :closable="false" class="status">最終の気になるを保存しています…</Message>
      <Message v-if="finishError" severity="error" :closable="false" class="status">{{ finishError }}
        <Button v-if="!missingIds.length" type="button" label="登録を再試行" text :disabled="finishing" @click="vm.finishSorting" />
      </Message>
      <Message v-if="missingIds.length" severity="warn" :closable="false" class="status">
        {{ missingIds.length }}件の記事がサーバーに存在しないため登録できませんでした。他の記事の登録結果は確認できました。
        <Button type="button" label="確認して一覧へ" text :disabled="finishing" @click="vm.acknowledgeMissing" />
      </Message>
    </template>
    <template #footer><p class="footnote">{{ storageError ? '端末保存に失敗しています。閉じると最新の変更が失われる場合があります。' : pendingWrites ? '気になるを端末へ保存しています…' : '保存済みの気になるは端末に残ります。カード位置と履歴は再開しません。' }}</p></template>
  </SortingLayout>
</template>
<style scoped>
.brand { font-size: 15px; font-weight: 750; }
.eyebrow { color: var(--p-primary-color); font-size: 11px; letter-spacing: .06em; margin: 0 0 10px; }
h1 { margin: 0; font-size: clamp(26px, 7vw, 32px); letter-spacing: -.04em; } h1 span { color: var(--p-primary-color); }
.description, .footnote, .read-hint, .status p { color: var(--p-discovery-muted); font-size: 12px; line-height: 1.8; }
.progress { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 9px; color: var(--p-discovery-muted); font-size: 11px; }
.progress-bar { height: 5px; margin-bottom: 22px; }
.actions { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 22px; } .actions .p-button { min-height: 48px; } .next { grid-column: 1 / -1; }
.undo { text-align: center; margin-top: 8px; } .status { margin-top: 14px; }
.empty-state, .complete-state { text-align: center; padding: 35px 4px; } h2 { font-size: 19px; line-height: 1.7; }
.empty-state p, .complete-state p { color: var(--p-discovery-muted); font-size: 12px; line-height: 1.8; }
.empty-state .p-button, .complete-state .p-button { margin-top: 15px; }
.complete-mark { display: grid; place-items: center; margin: 0 auto 18px; width: 65px; height: 65px; border-radius: 50%; background: var(--p-primary-50); color: var(--p-primary-color); font-size: 30px; }
.footnote { text-align: center; font-size: 11px; }
</style>
