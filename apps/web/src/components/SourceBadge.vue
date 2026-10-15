<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { ArticleListItem } from '@it-discovery/contracts';

const props = defineProps<{ source: ArticleListItem['source'] }>();
const failed = ref(false);
const initial = computed(() => [...props.source.siteName][0] ?? '?');
watch(() => props.source.iconUrl, () => { failed.value = false; });
</script>

<template>
  <span class="source-badge" :title="source.siteName">
    <span class="source-icon" aria-hidden="true">
      <img v-if="source.iconUrl && !failed" :src="source.iconUrl" alt="" loading="lazy" @error="failed = true" />
      <span v-else>{{ initial }}</span>
    </span>
    <span class="source-name">{{ source.siteName }}</span>
  </span>
</template>

<style scoped>
.source-badge { display: inline-flex; align-items: center; gap: 7px; min-width: 0; font-size: 12px; font-weight: 650; }
.source-icon { display: grid; place-items: center; flex: 0 0 23px; width: 23px; height: 23px; border-radius: 7px; color: var(--p-primary-color); background: var(--p-primary-50); font-size: 13px; font-weight: 800; overflow: hidden; }
.source-icon img { width: 100%; height: 100%; object-fit: contain; }
.source-name { max-width: 155px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
@media (max-width: 350px) { .source-name { max-width: 125px; } }
</style>
