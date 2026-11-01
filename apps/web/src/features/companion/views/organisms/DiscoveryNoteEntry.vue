<script setup lang="ts">
import Button from 'primevue/button';
import type { DiscoveryNote } from '@it-discovery/contracts';
defineProps<{ note: DiscoveryNote; articleUrl: string | null; deleting: boolean }>();
const emit = defineEmits<{ remove: [] }>();
</script>
<template>
  <article class="note-page" aria-label="発見の記録">
    <p class="note-label">自分の言葉</p>
    <!-- 自動生成の見出しを作らず、本人が保存した文章をそのまま表示する。 -->
    <blockquote>{{ note.text }}</blockquote>
    <details v-if="note.articleTitle || note.articleId" class="note-source">
      <summary>きっかけになった記事</summary>
      <div class="article-thumbnail"><strong>{{ note.articleTitle ?? '元の記事' }}</strong>
        <a v-if="articleUrl" :href="articleUrl" target="_blank" rel="noopener noreferrer">元記事を読む（別タブ） ↗</a>
        <p v-else>元記事は現在保持されていません。記録時のタイトルと発見は残っています。</p>
      </div>
    </details>
    <div class="note-actions"><Button label="削除" aria-label="この発見を削除" text severity="secondary" size="small" :loading="deleting" :disabled="deleting" @click="emit('remove')" /></div>
  </article>
</template>
<style scoped>
.note-page { position: relative; padding: 20px 20px 12px 28px; border: 1px solid var(--p-discovery-line); border-radius: 7px 20px 20px 7px; background: var(--p-discovery-paper); box-shadow: 4px 5px 0 var(--p-discovery-soft); }
.note-page::before { content: ''; position: absolute; left: 8px; top: 0; bottom: 0; border-left: 1px solid var(--p-discovery-line); pointer-events: none; }
.note-label { color: var(--p-primary-color); font-size: 11px; margin: 0 0 14px; }
blockquote { margin: 0; min-height: 75px; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 15px; line-height: 1.95; }
.note-source { border-top: 1px solid var(--p-discovery-line); margin-top: 20px; padding-top: 12px; }.note-source summary { color: var(--p-primary-color); font-size: 12px; cursor: pointer; padding: 4px 0; }
.article-thumbnail { border: 2px solid var(--p-discovery-frame-start); padding: 20px 16px; border-radius: 18px; margin-top: 12px; }.article-thumbnail strong { display: block; font-size: 16px; line-height: 1.7; overflow-wrap: anywhere; }.article-thumbnail a { display: inline-block; margin-top: 16px; color: var(--p-primary-color); font-size: 12px; }.article-thumbnail p { color: var(--p-discovery-muted); font-size: 12px; line-height: 1.7; }
.note-actions { display: flex; justify-content: flex-start; margin-top: 12px; }
</style>
