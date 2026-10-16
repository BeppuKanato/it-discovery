<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import type { ArticleListKind } from '@it-discovery/contracts';
import { useArticleListViewModel, type ArticleListServices } from '../../view-models/useArticleListViewModel';
import type { PullGestureInput } from '../../models/pull-to-refresh-gesture';
import ArticleListLayout from '../templates/ArticleListLayout.vue';
import ArticleListToolbar from '../organisms/ArticleListToolbar.vue';
import ArticleListContent from '../organisms/ArticleListContent.vue';
import ArticleSyncStatus from '../organisms/ArticleSyncStatus.vue';

// Page：ViewModelと表示部品の接続場所。Store・同期サービスの内部を直接変更しない。
const props = defineProps<{ services: ArticleListServices }>();
const vm = useArticleListViewModel(props.services.api, props.services.articleState, props.services.sync);
const { kind, articles, hasMore, loading, error, syncStatus, refresh, loadMore, retry,
  togglePin, toggleInterest, retrySync, discardBlocked,
  pullDistance, pullReady, finishPull, cancelPull } = vm;
onMounted(() => { void vm.initialize(); });
onUnmounted(() => { vm.dispose(); });

function selectKind(value: ArticleListKind): void {
  if (value !== kind.value) window.scrollTo({ top: 0 });
  void vm.changeKind(value);
}
// Viewはブラウザのイベントを値へ変換する。一本指・方向・距離などの判定はModelへ任せる。
// DOMに関する事実（先頭にいるか、操作部品を触れたか）だけを取り出す。
function touchInput(event: TouchEvent): PullGestureInput {
  const touch = event.touches[0];
  return { x: touch?.clientX ?? 0, y: touch?.clientY ?? 0, touchCount: event.touches.length,
    atTop: window.scrollY <= 0,
    onControl: event.target instanceof Element && event.target.closest('button,a,input') !== null };
}
function touchStart(event: TouchEvent): void { vm.beginPull(touchInput(event)); }
function touchMove(event: TouchEvent): void {
  const preventScroll = vm.movePull(touchInput(event));
  // preventDefaultはブラウザの制御なのでViewに残す。止める必要があるかはVMの結果を使う。
  if (preventScroll && event.cancelable) event.preventDefault();
}
</script>

<template>
  <!-- Templateへ領域を渡す。#toolbarなどの名前は、Layout側のslot nameと対応する。 -->
  <ArticleListLayout @touchstart.passive="touchStart" @touchmove="touchMove" @touchend="finishPull" @touchcancel="cancelPull">
    <template #header>
      <div class="brand"><span class="brand-mark" aria-hidden="true">i</span><span>IT Discovery</span></div>
    </template>
    <template #intro>
      <p class="eyebrow">見つける、選ぶ、読む。</p>
      <h1>{{ kind === 'all' ? '集まった情報' : '気になる情報' }}<span class="heading-dot">。</span></h1>
      <p class="intro-description">{{ kind === 'all' ? 'ひとつの出会いが、次のアイデアに。' : 'あとで読みたい発見を、ひとつの場所に。' }}</p>
    </template>
    <template #toolbar>
      <ArticleListToolbar :kind="kind" :count="articles.length" :refreshing="loading === 'refresh'"
        :disabled="!syncStatus.ready" :busy="loading === 'initial' || loading === 'refresh'" @select="selectKind" @refresh="refresh" />
    </template>
    <template #status>
      <ArticleSyncStatus :status="syncStatus" @retry="retrySync" @discard="discardBlocked" />
    </template>
    <!-- 名前なしの内容はLayoutの通常のslotへ入る。子のemitとVMの操作をここで接続する。 -->
    <div class="pull-status" :style="{ height: `${loading === 'refresh' ? 40 : pullDistance}px` }" role="status">
      <span v-if="loading === 'refresh'">一覧を更新しています…</span>
      <span v-else-if="pullDistance > 0">{{ pullReady ? '離して更新' : '↓ 下に引いて更新' }}</span>
    </div>
    <ArticleListContent :articles="articles" :kind="kind" :initial-loading="!syncStatus.ready || loading === 'initial'"
      :loading="loading !== null" :has-more="hasMore" :error="error?.message ?? null" :actions-disabled="!syncStatus.canChange"
      @pin="togglePin" @interest="toggleInterest" @more="loadMore" @retry="retry" />
    <template #footer><p class="page-footnote">小さな発見を、毎日に。</p></template>
  </ArticleListLayout>
</template>

<style scoped>
.brand { display: flex; align-items: center; gap: 9px; font-size: 15px; font-weight: 750; letter-spacing: -.02em; }
.brand-mark { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 10px; color: var(--p-discovery-paper); background: var(--p-primary-color); font-family: Georgia, serif; font-size: 22px; }
.eyebrow { margin: 0 0 10px; color: var(--p-primary-color); font-size: 11px; letter-spacing: .08em; }
h1 { margin: 0; font-size: clamp(27px, 7.5vw, 33px); line-height: 1.4; letter-spacing: -.045em; }
.heading-dot { color: var(--p-primary-color); }
.intro-description { margin: 10px 0 0; color: var(--p-discovery-muted); font-size: 12px; line-height: 1.8; }
.pull-status { display: flex; align-items: center; justify-content: center; overflow: hidden; color: var(--p-primary-color); font-size: 12px; }
.page-footnote { margin: 0; color: var(--p-discovery-muted); font-size: 11px; text-align: center; letter-spacing: .05em; }
</style>
