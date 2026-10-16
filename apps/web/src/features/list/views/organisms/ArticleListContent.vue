<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import Button from 'primevue/button';
import Message from 'primevue/message';
import Skeleton from 'primevue/skeleton';
import type { ArticleListItem, ArticleListKind } from '@it-discovery/contracts';
import ArticleCard from '../../../../components/organisms/ArticleCard.vue';

// Organism：カード群・空表示・取得失敗・末尾の監視を一つの一覧領域として組み立てる。
// 記事やカーソルを保持しない。取得したいタイミングと記事操作を親へ通知するだけ。
const props = defineProps<{
  articles: readonly ArticleListItem[]; kind: ArticleListKind; initialLoading: boolean;
  loading: boolean; hasMore: boolean; error: string | null; actionsDisabled: boolean;
}>();
const emit = defineEmits<{ pin: [articleId: number]; interest: [articleId: number]; more: []; retry: [] }>();
const sentinel = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;
onMounted(() => {
  if (typeof IntersectionObserver === 'undefined') return;
  observer = new IntersectionObserver((entries) => {
    if (!props.initialLoading && !props.loading && !props.error && props.hasMore && entries.some((entry) => entry.isIntersecting)) emit('more');
  }, { rootMargin: '240px 0px' });
  if (sentinel.value) observer.observe(sentinel.value);
});
// 条件付き描画で末尾のDOMが入れ替わるため、新しい要素へ監視を付け直す。
watch(sentinel, (element) => { observer?.disconnect(); if (element) observer?.observe(element); });
onUnmounted(() => observer?.disconnect());
</script>

<template>
  <section :aria-busy="loading || initialLoading" aria-label="記事一覧">
    <div v-if="initialLoading" class="article-grid" aria-label="一覧を読み込んでいます">
      <div v-for="index in 3" :key="index" class="skeleton-card" aria-hidden="true">
        <Skeleton height="220px" border-radius="15px" /><Skeleton width="40%" height="12px" class="skeleton-date" />
      </div>
    </div>
    <ul v-else-if="articles.length" class="article-grid">
      <!-- v-forの繰り返し範囲は、このliの開始から終了まで。articleは各回の記事1件。
           子カードの通知にIDを付けることで、Pageは対象の記事を指定してVMを呼べる。 -->
      <li v-for="article in articles" :key="article.articleId">
        <ArticleCard :article="article" editable :actions-disabled="actionsDisabled"
          @pin="emit('pin', article.articleId)" @interest="emit('interest', article.articleId)" />
      </li>
    </ul>
    <section v-else-if="!error && !hasMore" class="empty-state">
      <span class="empty-symbol" aria-hidden="true">{{ kind === 'all' ? '✧' : '♡' }}</span>
      <h2>{{ kind === 'all' ? 'まだ記事がありません' : '気になる記事はまだありません' }}</h2>
      <p>{{ kind === 'all' ? '収集された情報は、ここに並びます。' : '気になるに登録した記事を、ここで見られます。' }}</p>
    </section>
    <div v-if="error" class="error-state">
      <Message severity="error" :closable="false">{{ error }}</Message>
      <p>{{ articles.length ? '表示中の記事はそのまま残しています。' : '通信状況を確認して、もう一度お試しください。' }}</p>
      <Button type="button" label="もう一度試す" outlined @click="emit('retry')" />
    </div>
    <!-- 全て解除して表示件数が0になっても、続きがある場合は取得手段を残す。 -->
    <div v-if="!initialLoading && (articles.length || hasMore)" ref="sentinel" class="list-end">
      <Button v-if="hasMore && !error" type="button" label="続きを読み込む" text :loading="loading" :disabled="loading" @click="emit('more')" />
      <p v-else-if="!hasMore && !error" class="end-note">ここまでの情報を表示しました</p>
    </div>
  </section>
</template>

<style scoped>
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
.end-note { color: var(--p-discovery-muted); font-size: 11px; text-align: center; }
@media (min-width: 800px) { .article-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 22px; } }
</style>
