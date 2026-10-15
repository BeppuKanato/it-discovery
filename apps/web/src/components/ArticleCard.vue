<script setup lang="ts">
import { computed, ref, useId } from 'vue';
import Button from 'primevue/button';
import Card from 'primevue/card';
import Tag from 'primevue/tag';
import type { ArticleListItem } from '@it-discovery/contracts';
import { articleCardTokens } from '../app/ui-theme';
import SourceBadge from './SourceBadge.vue';

const props = defineProps<{ article: ArticleListItem }>();
const titleId = useId();
const expanded = ref(false);
const canExpand = computed(() => props.article.title.length > 44 || (props.article.description?.length ?? 0) > 60);
const date = new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric' });
const fullDate = new Intl.DateTimeFormat('ja-JP', { dateStyle: 'long', timeStyle: 'short' });
</script>

<template>
  <article :aria-labelledby="titleId" class="article-shell">
    <Card class="article-card" :dt="articleCardTokens">
      <template #content>
        <div class="thumbnail-frame">
          <div class="thumbnail" :class="{ expanded }">
            <Tag v-if="article.state.pinned" value="ピン止め" severity="secondary" rounded class="pin-state" />
            <div class="article-copy">
              <h2 :id="titleId">{{ article.title }}</h2>
              <p v-if="article.description" class="summary">{{ article.description }}</p>
            </div>
            <div class="thumbnail-bottom">
              <Button
                v-if="canExpand" type="button" text size="small" class="expand-button"
                :label="expanded ? '短く表示' : '続きを表示'" :aria-expanded="expanded"
                @click="expanded = !expanded"
              />
              <span v-else />
              <SourceBadge :source="article.source" />
            </div>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="article-meta">
          <div class="dates">
            <time :datetime="article.fetchedAt" :title="fullDate.format(new Date(article.fetchedAt))">取得 {{ date.format(new Date(article.fetchedAt)) }}</time>
            <time v-if="article.publishedAt" :datetime="article.publishedAt">公開 {{ date.format(new Date(article.publishedAt)) }}</time>
          </div>
          <div class="states">
            <span v-if="article.state.lastOpenedAt" class="read-state">既読</span>
            <Tag v-if="article.state.interested" value="気になる" severity="success" rounded />
          </div>
        </div>
      </template>
    </Card>
  </article>
</template>

<style scoped>
.article-shell { min-width: 0; }
.article-card { overflow: hidden; border: 1px solid var(--p-discovery-line); }
.thumbnail-frame { padding: 7px; background: linear-gradient(135deg, var(--p-discovery-frame-start), var(--p-discovery-frame-end)); }
.thumbnail { position: relative; display: flex; flex-direction: column; min-height: 244px; padding: 27px 18px 12px; border-radius: 15px; background: var(--p-discovery-paper); }
.pin-state { position: absolute; top: 10px; left: 12px; font-size: 10px; }
.article-copy { flex: 1; display: flex; flex-direction: column; justify-content: center; min-height: 161px; padding: 8px 3px 16px; text-align: center; }
h2 { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 4; overflow: hidden; margin: 0; color: var(--p-discovery-ink); font-size: clamp(18px, 4.7vw, 22px); line-height: 1.55; letter-spacing: -.025em; overflow-wrap: anywhere; }
.summary { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; margin: 13px 0 0; color: var(--p-discovery-muted); font-size: 12px; line-height: 1.8; overflow-wrap: anywhere; }
.expanded h2, .expanded .summary { display: block; -webkit-line-clamp: unset; overflow: visible; }
.thumbnail-bottom { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 30px; }
.expand-button { flex: 0 0 auto; font-size: 10px; padding: 4px 0; }
.article-meta { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; min-height: 49px; padding: 10px 15px; }
.dates, .states { display: flex; align-items: center; gap: 9px; }
.dates { color: var(--p-discovery-muted); font-size: 10px; }
.read-state { color: var(--p-discovery-muted); font-size: 10px; }
.states :deep(.p-tag) { font-size: 10px; }
@media (max-width: 350px) { .thumbnail { padding-inline: 13px; } h2 { font-size: 18px; } }
</style>
