<script setup lang="ts">
import Button from 'primevue/button';
import SelectButton from 'primevue/selectbutton';
import Select from 'primevue/select';
import { computed } from 'vue';
import type { ArticleListKind, ArticleSource } from '@it-discovery/contracts';

// Organism：一覧の選択と更新をまとめる。選択値は親が持ち、ここではコピーして保存しない。
const props = defineProps<{ sourceId: string | null; sources: readonly ArticleSource[]; sourcesLoading: boolean; kind: ArticleListKind; count: number; disabled: boolean; busy: boolean; refreshing: boolean }>();
const emit = defineEmits<{ select: [kind: ArticleListKind]; source: [sourceId: string | null]; refresh: [] }>();
const sourceOptions = computed(() => [{ sourceId: null, siteName: 'すべての取得先' }, ...props.sources]);
const options = [{ label: 'すべて', value: 'all' }, { label: '気になる', value: 'interested' }];
function selectSource(value: unknown): void {
  if (value === null || (typeof value === 'string' && props.sources.some(source => source.sourceId === value))) emit('source', value);
}
function select(value: unknown): void {
  // PrimeVueから受け取る値を絞り込み、親へは宣言した種類だけ通知する。
  if (value === 'all' || value === 'interested') emit('select', value);
}
</script>

<template>
  <div>
    <!-- :model-valueは値の受け取り、@update:model-valueは選択変更の受付。
         ViewModelの状態を子から直接書き換えず、selectイベントで要求を返す。 -->
    <SelectButton :model-value="kind" :options="options" :disabled="disabled" option-label="label" option-value="value"
      :allow-empty="false" fluid aria-label="記事一覧の種類" class="list-tabs" @update:model-value="select" />
    <div class="source-filter">
      <label for="article-source">取得先</label>
      <Select input-id="article-source" aria-label="取得先" :model-value="sourceId" :options="sourceOptions" option-label="siteName" option-value="sourceId"
        :loading="sourcesLoading" :disabled="disabled || sourcesLoading" fluid @update:model-value="selectSource" />
    </div>
    <div class="caption">
      <span>取得した日時が新しい順<span v-if="count"> · {{ count }}件</span></span>
      <!-- 一覧取得中もタブ切り替えは可能。更新ボタンの連打だけをbusyで止める。 -->
      <Button type="button" label="更新" text size="small" aria-label="一覧を更新" :disabled="disabled || busy" :loading="refreshing" @click="emit('refresh')">
        <template #icon><span aria-hidden="true" class="refresh-icon">↻</span></template>
      </Button>
    </div>
  </div>
</template>

<style scoped>
.source-filter { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 12px; margin-top: 12px; }
.source-filter label { font-size: 12px; color: var(--p-discovery-muted); }
.sorting-start { width: 100%; margin-top: 12px; min-height: 44px; }
.list-tabs { width: 100%; }
.list-tabs :deep(.p-togglebutton) { flex: 1; min-height: 44px; font-size: 13px; }
.caption { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 5px 1px; color: var(--p-discovery-muted); font-size: 10px; }
.refresh-icon { font-size: 21px; line-height: 1; }
@media (min-width: 800px) { .sorting-start { width: 100%; margin-top: 12px; min-height: 44px; }
.list-tabs { max-width: 420px; } }
</style>
