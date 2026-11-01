<script setup lang="ts">
import { computed } from 'vue';
import Button from 'primevue/button';
import { notebookDate } from '../../models/discovery-notebook.model';
const props = defineProps<{ month: string; cells: readonly (string | null)[]; counts: ReadonlyMap<string, number>;
  selected: string | null; monthCount: number | null; recordedDays: number | null; previous: boolean; next: boolean; disabled: boolean }>();
// Viewは日付を通知するだけ。取得・日付選択・ページングは親PageのVMが持つ。
const emit = defineEmits<{ month: [direction: number]; select: [date: string] }>();
const label = computed(() => `${props.month.slice(0, 4)}年 ${Number(props.month.slice(5))}月`);
const today = notebookDate();
</script>
<template>
  <section class="discovery-calendar" :aria-label="`${label}の発見カレンダー`">
    <div class="calendar-header">
      <Button aria-label="前の月" label="‹" text :disabled="!previous || disabled" @click="emit('month', -1)" />
      <h2>{{ label }}</h2>
      <Button aria-label="次の月" label="›" text :disabled="!next || disabled" @click="emit('month', 1)" />
    </div>
    <div class="calendar-grid">
      <span v-for="weekday in ['日','月','火','水','木','金','土']" :key="weekday" class="weekday">{{ weekday }}</span>
      <template v-for="(date, index) in cells" :key="date ?? `blank-${index}`">
        <Button v-if="date" type="button" class="calendar-day" text :class="{ recorded: counts.has(date), selected: selected === date }"
          :aria-label="`${Number(date.slice(5,7))}月${Number(date.slice(8))}日、${counts.get(date) ?? 0}件の発見`"
          :aria-pressed="selected === date" :aria-current="date === today ? 'date' : undefined" :disabled="disabled" @click="emit('select', date)">
          <span class="day-number">{{ Number(date.slice(8)) }}</span><span class="day-count">{{ counts.has(date) ? `${counts.get(date)}件` : '' }}</span>
        </Button>
        <span v-else aria-hidden="true" />
      </template>
    </div>
    <div class="calendar-summary" :aria-busy="disabled"><span>この月に {{ monthCount ?? '…' }} の発見</span><span>{{ recordedDays ?? '…' }}日分の足跡</span></div>
  </section>
</template>
<style scoped>
.discovery-calendar { margin-top: 18px; padding: 10px 10px 14px; border: 1px solid var(--p-discovery-line); border-radius: 20px; background: var(--p-discovery-paper); }
.calendar-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }.calendar-header h2 { font-size: 18px; margin: 0; }
.calendar-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); row-gap: 5px; }
.weekday { color: var(--p-discovery-muted); text-align: center; font-size: 11px; padding-bottom: 6px; }
.calendar-day { padding: 6px 0; min-width: 0; height: 56px; display: flex; flex-direction: column; gap: 1px; border: 0; border-radius: 10px; }
.day-number { font-size: 13px; }.day-count { min-height: 15px; font-size: 10px; }.recorded { background: var(--p-primary-50); }.selected { background: var(--p-discovery-ink); color: var(--p-discovery-paper); }
.calendar-day[aria-current='date'] .day-number { text-decoration: underline; text-underline-offset: 3px; }
.calendar-summary { display: flex; flex-wrap: wrap; gap: 6px; justify-content: space-between; border-top: 1px solid var(--p-discovery-line); padding: 12px 3px 0; margin-top: 12px; color: var(--p-discovery-muted); font-size: 11px; }
</style>
