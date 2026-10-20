<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import Message from 'primevue/message';
import type { ArticleListKind } from '@it-discovery/contracts';
import { useArticleListViewModel } from '../../view-models/useArticleListViewModel';
import type { ArticleListModel } from '../../models/article-list.model';
import type { ArticleOpeningModel } from '../../../articles/models/article-opening.model';
import type { ArticleStateModel } from '../../../articles/models/article-state.model';
import type { PullGestureInput } from '../../models/pull-to-refresh-gesture';
import ArticleListLayout from '../templates/ArticleListLayout.vue';
import ArticleListToolbar from '../organisms/ArticleListToolbar.vue';
import ArticleListContent from '../organisms/ArticleListContent.vue';

// Pageは表示開始・終了とブラウザ入力をVMへ伝える。初回取得はAppでなくここから始める。
const props = defineProps<{ listModel: ArticleListModel; stateModel: ArticleStateModel; openingModel: ArticleOpeningModel }>();
const vm = useArticleListViewModel(props.listModel, props.stateModel, props.openingModel);
const { articles, selectedKind, hasMore, listLoading, listError, notice, savingByArticle, readStatus, openingErrors, saveErrors,
  refreshArticles, loadMoreArticles, retryArticleLoad, togglePin, toggleInterest, retryStateCheck, openArticle, retryReadSave,
  pullDistance, pullReady, finishPull, cancelPull } = vm;
onMounted(() => { void vm.initialize(); });
onUnmounted(() => { vm.dispose(); });

function selectKind(value: ArticleListKind): void {
  if (value !== selectedKind.value) window.scrollTo({ top: 0 });
  void vm.changeListKind(value);
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
      <h1>{{ selectedKind === 'all' ? '集まった情報' : '気になる情報' }}<span class="heading-dot">。</span></h1>
      <p class="intro-description">{{ selectedKind === 'all' ? 'ひとつの出会いが、次のアイデアに。' : 'あとで読みたい発見を、ひとつの場所に。' }}</p>
    </template>
    <template #toolbar>
      <ArticleListToolbar :kind="selectedKind" :count="articles.length" :refreshing="listLoading === 'refresh'"
        :disabled="false" :busy="listLoading === 'initial' || listLoading === 'refresh'" @select="selectKind" @refresh="refreshArticles" />
    </template>
    <template #status>
      <Message v-if="notice" severity="info" :closable="false" role="status">{{ notice }}</Message>
    </template>
    <!-- 名前なしの内容はLayoutの通常のslotへ入る。子のemitとVMの操作をここで接続する。 -->
    <div class="pull-status" :style="{ height: `${listLoading === 'refresh' ? 40 : pullDistance}px` }" role="status">
      <span v-if="listLoading === 'refresh'">一覧を更新しています…</span>
      <span v-else-if="pullDistance > 0">{{ pullReady ? '離して更新' : '↓ 下に引いて更新' }}</span>
    </div>
    <ArticleListContent :articles="articles" :kind="selectedKind" :initial-loading="listLoading === 'initial'"
      :loading="listLoading !== null" :has-more="hasMore" :error="listError?.message ?? null" :opening-errors="openingErrors" :read-status="readStatus" :saving-by-article="savingByArticle" :save-errors="saveErrors"
      @open="openArticle" @retry-read="retryReadSave" @pin="togglePin" @interest="toggleInterest" @more="loadMoreArticles" @retry="retryArticleLoad" @check-state="retryStateCheck" />
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
