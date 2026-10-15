<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import Button from 'primevue/button';
import Message from 'primevue/message';
import SelectButton from 'primevue/selectbutton';
import Skeleton from 'primevue/skeleton';
import ArticleCard from '../../../components/ArticleCard.vue';
import type { ArticleListApi } from '../models/article-list-api';
import { useArticleList } from '../controllers/useArticleList';
import { usePullToRefresh } from '../controllers/usePullToRefresh';

// definePropsで親から通信部品を受け取る。取得方法を差し替えても画面の表示は共通にできる。
const props = defineProps<{ api: ArticleListApi }>();
// Composableが返すrefを取り出す。分割代入してもrefなのでVueの変更追跡は維持される。
const { kind, articles, hasMore, loading, error, refresh, changeKind, loadMore, retry, dispose } = useArticleList(props.api);
const options = [{ label: 'すべて', value: 'all' }, { label: '気になる', value: 'interested' }];
// templateのref="sentinel"で末尾のHTML要素を受け取る。空一覧ではnullになる。
const sentinel = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;
const pull = usePullToRefresh(refresh, () => loading.value !== 'initial' && loading.value !== 'refresh');
const { distance: pullDistance, ready: pullReady } = pull;

// 画面に近づいた末尾を監視して、続きを取得する。
onMounted(() => {
  if (typeof IntersectionObserver !== 'undefined') {
    // IntersectionObserverは要素が表示範囲に入ると通知するブラウザAPI。
    // rootMarginで末尾が見える240px手前から追加取得を始める。
    observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadMore();
    }, { rootMargin: '240px 0px' });
    if (sentinel.value) observer.observe(sentinel.value);
  }
  // voidはPromiseの完了をここで待たない指定。失敗の表示はComposable内で処理する。
  void refresh();
});
// v-ifで末尾が作り直されるたび、監視対象を新しいHTML要素へ付け替える。
watch(sentinel, (element) => { observer?.disconnect(); if (element) observer?.observe(element); });
// 画面を離れるときに監視・指の操作・通信を止め、古い応答による状態変更を防ぐ。
onUnmounted(() => { observer?.disconnect(); pull.cancel(); dispose(); });

function selectKind(value: unknown): void {
  // unknownを検査して、APIで扱える2種類だけに型を絞る。
  if (value !== 'all' && value !== 'interested') return;
  pull.cancel();
  if (value !== kind.value) window.scrollTo({ top: 0 });
  void changeKind(value);
}

function touchStart(event: TouchEvent): void {
  if (event.touches.length !== 1 || (event.target instanceof Element && event.target.closest('button,a,input'))) {
    pull.cancel(); return;
  }
  // 上で一本指に限定しているため、!で先頭が存在するとTypeScriptへ伝える。
  const touch = event.touches[0]!;
  pull.begin(touch.clientX, touch.clientY, window.scrollY <= 0);
}

function touchMove(event: TouchEvent): void {
  if (event.touches.length !== 1) { pull.cancel(); return; }
  const touch = event.touches[0]!;
  // 引いて更新として扱う間だけ通常スクロールを止める。ブラウザが許可するイベントに限る。
  if (pull.move(touch.clientX, touch.clientY, window.scrollY <= 0) && event.cancelable) event.preventDefault();
}
</script>

<template>
  <!-- @はイベント登録。.passiveはtouchstart内でpreventDefaultしないことをブラウザへ伝える。 -->
  <main class="list-page" @touchstart.passive="touchStart" @touchmove="touchMove" @touchend="pull.finish" @touchcancel="pull.cancel">
    <header class="page-header">
      <div class="brand"><span class="brand-mark" aria-hidden="true">i</span><span>IT Discovery</span></div>
      <Button
        type="button" label="更新" text size="small" :loading="loading === 'refresh'"
        :disabled="loading === 'initial' || loading === 'refresh'" aria-label="一覧を更新"
        @click="refresh"
      ><template #icon><span aria-hidden="true" class="refresh-icon">↻</span></template></Button>
    </header>

    <section class="intro">
      <p class="eyebrow">見つける、選ぶ、読む。</p>
      <h1>{{ kind === 'all' ? '集まった情報' : '気になる情報' }}<span class="heading-dot">。</span></h1>
      <p class="intro-description">{{ kind === 'all' ? 'ひとつの出会いが、次のアイデアに。' : 'あとで読みたい発見を、ひとつの場所に。' }}</p>
    </section>

    <!-- :model-valueで選択値を渡し、@update:model-valueで変更要求を受け取る。
         状態の更新はselectKindにまとめるため、ここではv-modelの自動代入を使わない。 -->
    <div class="list-toolbar">
      <SelectButton :model-value="kind" :options="options" option-label="label" option-value="value" :allow-empty="false" fluid aria-label="記事一覧の種類" class="list-tabs" @update:model-value="selectKind" />
      <div class="list-caption"><span>取得した日時が新しい順</span><span v-if="articles.length">{{ articles.length }}件を表示中</span></div>
    </div>

    <div class="pull-status" :style="{ height: `${loading === 'refresh' ? 40 : pullDistance}px` }" role="status">
      <span v-if="loading === 'refresh'">一覧を更新しています…</span>
      <span v-else-if="pullDistance > 0">{{ pullReady ? '離して更新' : '↓ 下に引いて更新' }}</span>
    </div>

    <!-- aria-busyは支援技術へ取得中を伝える属性。見た目の切り替えは下のv-ifが担当する。 -->
    <section :aria-busy="loading !== null" aria-label="記事一覧">
      <div v-if="loading === 'initial'" class="article-grid" aria-label="一覧を読み込んでいます">
        <div v-for="index in 3" :key="index" class="skeleton-card" aria-hidden="true">
          <Skeleton height="220px" border-radius="15px" />
          <Skeleton width="40%" height="12px" class="skeleton-date" />
        </div>
      </div>

      <!-- v-if/v-else-ifは最初に成立した分岐だけ描画する。
           v-forで記事を繰り返し、:keyにIDを渡してVueが各カードを識別できるようにする。 -->
      <ul v-else-if="articles.length" class="article-grid">
        <li v-for="article in articles" :key="article.articleId"><ArticleCard :article="article" /></li>
      </ul>

      <section v-else-if="!error" class="empty-state">
        <span class="empty-symbol" aria-hidden="true">{{ kind === 'all' ? '✧' : '♡' }}</span>
        <h2>{{ kind === 'all' ? 'まだ記事がありません' : '気になる記事はまだありません' }}</h2>
        <p>{{ kind === 'all' ? '収集された情報は、ここに並びます。' : '気になるに登録した記事を、ここで見られます。' }}</p>
      </section>

      <div v-if="error" class="error-state">
        <Message severity="error" :closable="false">{{ error.message }}</Message>
        <p>{{ articles.length ? '表示中の記事はそのまま残しています。' : '通信状況を確認して、もう一度お試しください。' }}</p>
        <Button type="button" label="もう一度試す" outlined @click="retry" />
      </div>

      <div v-if="articles.length" ref="sentinel" class="list-end">
        <Button v-if="hasMore && !error" type="button" label="続きを読み込む" text :loading="loading === 'append'" :disabled="loading !== null" @click="loadMore" />
        <p v-else-if="!hasMore && !error" class="end-note">ここまでの情報を表示しました</p>
      </div>
    </section>
    <p class="page-footnote">小さな発見を、毎日に。</p>
  </main>
</template>

<style scoped>
.list-page { max-width: 500px; min-height: 100svh; margin: auto; padding: 24px 20px 40px; }
.page-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.brand { display: flex; align-items: center; gap: 9px; font-size: 15px; font-weight: 750; letter-spacing: -.02em; }
.brand-mark { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 10px; color: var(--p-discovery-paper); background: var(--p-primary-color); font-family: Georgia, serif; font-size: 22px; }
.refresh-icon { font-size: 21px; line-height: 1; }
.intro { margin: 32px 0 25px; }
.eyebrow { margin: 0 0 10px; color: var(--p-primary-color); font-size: 11px; letter-spacing: .08em; }
h1 { margin: 0; font-size: clamp(27px, 7.5vw, 33px); line-height: 1.4; letter-spacing: -.045em; }
.heading-dot { color: var(--p-primary-color); }
.intro-description { margin: 10px 0 0; color: var(--p-discovery-muted); font-size: 12px; line-height: 1.8; }
.list-toolbar { position: sticky; top: 0; z-index: 5; padding-top: 10px; background: var(--p-discovery-background); }
.list-tabs { width: 100%; }
/* :deepは子のPrimeVue部品が作るHTMLにも、この配置用CSSを適用する指定。 */
.list-tabs :deep(.p-togglebutton) { flex: 1; min-height: 44px; font-size: 13px; }
.list-caption { display: flex; justify-content: space-between; gap: 10px; padding: 14px 1px 15px; color: var(--p-discovery-muted); font-size: 10px; }
.pull-status { display: flex; align-items: center; justify-content: center; overflow: hidden; color: var(--p-primary-color); font-size: 12px; }
.article-grid { display: grid; gap: 18px; margin: 0; padding: 0; list-style: none; }
.article-grid li { min-width: 0; }
.skeleton-card { padding: 8px; border: 1px solid var(--p-discovery-line); border-radius: 22px; background: var(--p-discovery-paper); }
.skeleton-date { margin: 17px 10px 9px; }
.empty-state { padding: 49px 12px 60px; text-align: center; }
.empty-symbol { display: grid; place-items: center; width: 74px; height: 74px; margin: 0 auto 22px; border-radius: 25px; background: var(--p-primary-50); color: var(--p-primary-color); font-size: 38px; }
.empty-state h2 { margin: 0; font-size: 17px; }
.empty-state p, .error-state p { color: var(--p-discovery-muted); font-size: 12px; line-height: 1.8; }
.error-state { padding: 20px 0; text-align: center; }
.error-state :deep(.p-message) { text-align: left; }
.error-state .p-button { margin-top: 8px; }
.list-end { display: grid; place-items: center; min-height: 90px; padding: 20px 0; }
.end-note, .page-footnote { color: var(--p-discovery-muted); font-size: 11px; text-align: center; }
.page-footnote { margin: 26px 0 0; letter-spacing: .05em; }
@media (min-width: 800px) { .list-page { max-width: 900px; padding: 32px 30px 50px; } .article-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 22px; } .intro { margin-top: 42px; } .list-tabs { max-width: 420px; } }
@media (max-width: 350px) { .list-page { padding-inline: 15px; } }
</style>
