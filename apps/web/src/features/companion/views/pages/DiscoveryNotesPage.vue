<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue';
import Button from 'primevue/button';
import Message from 'primevue/message';
import type { CompanionViewModel } from '../../view-models/useCompanionViewModel';
import type { DiscoveryNotebookModel } from '../../models/discovery-notebook.model';
import { useDiscoveryNotebookViewModel } from '../../view-models/useDiscoveryNotebookViewModel';
import DiscoveryCalendar from '../organisms/DiscoveryCalendar.vue';
import DiscoveryNoteEntry from '../organisms/DiscoveryNoteEntry.vue';

const props = defineProps<{ vm: CompanionViewModel; model: DiscoveryNotebookModel }>();
// 共通の会話VMと分け、月・日・本文・取得状態はノートPageの寿命に合わせる。
const notebook = useDiscoveryNotebookViewModel(props.model);
const { month, selectedDate, calendar, day, loadingMonth, loadingDay, deleting, monthError, dayError, deleteError,
  cells, counts, monthCount, canPreviousMonth, canNextMonth, articleUrl } = notebook;
onMounted(() => { void notebook.loadMonth(); });
onUnmounted(() => notebook.dispose());
// ダイアログから保存した場合も、表示中の月・日を維持して件数を取り直す。
watch(() => props.vm.notesVersion.value, () => { void notebook.loadMonth(); });
</script>
<template>
  <main class="notes-page">
    <p class="eyebrow">YOUR DISCOVERY NOTEBOOK</p>
    <h1>発見ノート<span>。</span></h1>
    <div class="notebook-heading">
      <p class="intro">{{ calendar ? `${calendar.totalCount}の発見を残してきた` : '日々の発見を、振り返る。' }}</p>
      <Button label="ノートを更新" text size="small" :disabled="loadingMonth || loadingDay || deleting" @click="notebook.loadMonth()" />
    </div>
    <Message v-if="monthError" severity="warn" :closable="false">{{ monthError }}<Button label="カレンダーを再試行" text @click="notebook.loadMonth()" /></Message>
    <p v-if="loadingMonth && !calendar" role="status">カレンダーを読み込み中…</p>
    <DiscoveryCalendar :month="month" :cells="cells" :counts="counts" :selected="selectedDate" :month-count="calendar ? monthCount : null"
      :recorded-days="calendar?.days.length ?? null" :previous="canPreviousMonth" :next="canNextMonth"
      :disabled="!calendar || deleting" @month="notebook.changeMonth" @select="notebook.selectDate" />
    <div v-if="calendar?.totalCount === 0" class="empty">
      <h2>最初の発見を残そう</h2><p>「発見ノートに残す」で、自分の言葉がここに残ります。</p>
      <Button label="発見を話す" outlined @click="vm.open" />
    </div>
    <Button v-else-if="calendar && !monthCount && calendar.lastMonth && calendar.lastMonth !== month" :label="`最近の発見へ（${calendar.lastMonth}）`" text @click="notebook.loadMonth(calendar.lastMonth, null, 0)" />
    <section v-if="selectedDate && calendar?.totalCount !== 0" class="selected-day" aria-label="選んだ日の発見" :aria-busy="loadingDay">
      <div class="day-heading" aria-live="polite"><h2>{{ Number(selectedDate.slice(5, 7)) }}月{{ Number(selectedDate.slice(8)) }}日</h2><span v-if="day">{{ day.totalCount }}の発見</span></div>
      <p v-if="loadingDay" role="status">この日の発見を読み込み中…</p>
      <Message v-else-if="dayError" severity="warn" :closable="false">{{ dayError }}<Button label="この日を再試行" text @click="notebook.selectDate(selectedDate)" /></Message>
      <template v-else-if="day">
        <p v-if="!day.note" class="empty-day">この日の記録はありません。</p>
        <DiscoveryNoteEntry v-else :key="day.note.id" :note="day.note" :article-url="articleUrl" :deleting="deleting" @remove="notebook.removeSelected" />
      </template>
        <div v-if="day && day.totalCount > 1" class="note-pager" aria-label="この日の発見をめくる">
          <Button label="前の発見" text size="small" :disabled="day.offset === 0 || deleting" :aria-disabled="loadingMonth || loadingDay" @click="!loadingMonth && !loadingDay && notebook.selectDate(selectedDate, day.offset - 1)" />
          <span role="status">{{ day.offset + 1 }} / {{ day.totalCount }}</span>
          <Button label="次の発見" text size="small" :disabled="day.offset + 1 >= day.totalCount || deleting" :aria-disabled="loadingMonth || loadingDay" @click="!loadingMonth && !loadingDay && notebook.selectDate(selectedDate, day.offset + 1)" />
        </div>
      <Message v-if="deleteError" severity="warn" :closable="false">{{ deleteError }}</Message>
    </section>
  </main>
</template>
<style scoped>
.notes-page { max-width: 560px; margin: auto; padding: 26px 18px; }
.eyebrow { font-size: 10px; color: var(--p-discovery-partner-muted); letter-spacing: .12em; }
h1 { margin: 12px 0 6px; font-size: 29px; } h1 span { color: var(--p-primary-color); }
.notebook-heading, .day-heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }
.intro, .empty p { color: var(--p-discovery-muted); font-size: 12px; line-height: 1.8; margin: 0; }
.selected-day { margin-top: 24px; }.day-heading { margin-bottom: 14px; }.day-heading h2 { margin: 0; font-size: 17px; }
.day-heading span, .note-pager span { color: var(--p-discovery-muted); font-size: 12px; }
.empty { padding: 28px 12px; text-align: center; }.empty h2 { font-size: 18px; }.empty p { margin-bottom: 16px; }
.empty-day { text-align: center; padding: 32px 12px; color: var(--p-discovery-muted); font-size: 13px; }
/* 記録をめくる操作は重ねた立ち絵より手前に置き、右側の「次」も常に押せるようにする。 */
.note-pager { position: relative; z-index: 13; background: var(--p-discovery-background); border-radius: 12px; display: flex; justify-content: space-between; align-items: center; gap: 4px; margin-top: 16px; }
@media (max-width: 350px) { .notes-page { padding-inline: 12px; } }
</style>
