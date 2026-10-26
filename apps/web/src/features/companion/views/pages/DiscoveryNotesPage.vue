<script setup lang="ts">
import { onMounted } from 'vue';
import Button from 'primevue/button';
import Message from 'primevue/message';
import type { CompanionViewModel } from '../../view-models/useCompanionViewModel';
const props = defineProps<{ vm: CompanionViewModel }>();
const { notes, loadingNotes, noteError, deleting } = props.vm;
onMounted(() => { void props.vm.loadNotes(); });
</script>
<template>
  <main class="notes-page"><p class="eyebrow">YOUR DISCOVERY NOTEBOOK</p><h1>発見ノート<span>。</span></h1><p class="intro">自分の言葉で残した、小さな発見。</p>
    <Button label="ノートを更新" text :disabled="loadingNotes" @click="vm.loadNotes" />
    <Message v-if="noteError" severity="warn" :closable="false">{{ noteError }}</Message>
    <p v-if="loadingNotes" role="status">読み込み中…</p>
    <div v-else-if="!notes.length" class="empty"><span aria-hidden="true">✧</span><h2>最初の発見を残そう</h2><p>相棒との会話で「発見ノートに残す」を選ぶと、ここに並びます。</p><Button label="発見を話す" outlined @click="vm.open" /></div>
    <article v-for="note in notes" :key="note.id" class="note"><time :datetime="note.createdAt">{{ new Date(note.createdAt).toLocaleDateString('ja-JP') }}</time><p>{{ note.text }}</p><small v-if="note.articleTitle">{{ note.articleTitle }}</small><Button label="削除" text severity="secondary" size="small" :disabled="deleting !== null" @click="vm.deleteNote(note.id)" /></article>
    <p v-if="notes.length" class="limit-note">新しい順に最大100件を表示しています。</p>
  </main>
</template>
<style scoped>
.notes-page { max-width: 760px; margin: auto; padding: 30px 20px; }.eyebrow { font-size: 10px; color: var(--p-discovery-partner-muted); letter-spacing: .12em; }h1 { margin: 12px 0; font-size: 29px; }h1 span { color: var(--p-primary-color); }.intro, .empty p, .limit-note { color: var(--p-discovery-muted); font-size: 12px; line-height: 1.8; }.note { margin: 15px 0; padding: 20px; border: 1px solid var(--p-discovery-line); background: white; border-radius: 18px; box-shadow: 0 5px 20px #4176a706; }.note time { color: #7f95ac; font-size: 10px; }.note p { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 14px; line-height: 1.9; }.note small { display: block; color: var(--p-discovery-muted); line-height: 1.7; overflow-wrap: anywhere; }.empty { padding: 35px 12px; text-align: center; }.empty span { font-size: 38px; color: #4691de; }.empty h2 { font-size: 18px; }
</style>
