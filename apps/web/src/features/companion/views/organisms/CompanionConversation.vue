<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import Textarea from 'primevue/textarea';
import Message from 'primevue/message';
import type { CompanionViewModel } from '../../view-models/useCompanionViewModel';
const props = defineProps<{ vm: CompanionViewModel }>();
const { dialog, draft, messages, context, sending, saving, error, notice, canSend } = props.vm;
const feed = ref<HTMLElement | null>(null);
const canSave = computed(() => !sending.value && !saving.value && draft.value.length <= 800 && (!!draft.value.trim() || messages.value.some(message => message.role === 'user')));
// スクロールなどのDOM操作はViewの責務。送信処理や会話状態はVMへ任せる。
watch(() => [messages.value.length, sending.value], async () => { await nextTick(); feed.value?.scrollTo({ top: feed.value.scrollHeight, behavior: 'instant' }); });
</script>
<template>
  <Dialog v-model:visible="dialog" modal header="発見を話す" class="companion-conversation" :style="{ width: 'min(94vw, 620px)', maxHeight: '88dvh' }" :draggable="false">
    <div class="conversation-intro"><span>アオイ · 発見の相棒</span><Button label="新しい会話" text size="small" :disabled="sending || saving" @click="vm.clearConversation" /></div>
    <div v-if="context" class="article-context"><span>選択中の記事 · タイトルと概要を共有</span><strong>{{ context.title }}</strong></div>
    <div ref="feed" class="conversation-feed" role="log" aria-label="相棒との会話" aria-live="polite">
      <p v-if="!messages.length" class="invitation">気になったことを、ひとことでも。</p>
      <p v-for="(message, index) in messages" :key="index" class="bubble" :class="message.role"><span class="speaker">{{ message.role === 'user' ? 'あなた' : 'アオイ' }}</span>{{ message.text }}</p>
      <p v-if="sending" role="status" class="thinking">考え中…</p>
    </div>
    <Message v-if="error" severity="warn" :closable="false">{{ error }}</Message>
    <p v-if="notice" role="status" class="saved-notice">{{ notice }}</p>
    <div class="conversation-bottom">
      <img :src="sending ? '/characters/aoi-thinking.webp' : '/characters/aoi-normal.webp'" alt="" class="conversation-character" />
      <Button label="発見ノートに残す" outlined size="small" :disabled="!canSave" :loading="saving" @click="vm.saveDiscovery" />
      <p class="privacy">会話は自動保存しません。送信文と直近の会話をGeminiへ送ります。</p>
    </div>
    <form class="composer" @submit.prevent="vm.send">
      <label for="companion-message" class="sr-label">発見や疑問</label>
      <Textarea id="companion-message" v-model="draft" rows="2" maxlength="800" placeholder="どんな発見があった？" :disabled="sending || saving" />
      <Button type="submit" label="送る" :disabled="!canSend || saving" />
    </form>
  </Dialog>
</template>
<style scoped>
.conversation-intro { display: flex; align-items: center; justify-content: space-between; gap: 6px; font-size: 12px; color: var(--p-discovery-partner-muted); }
.article-context { display: grid; gap: 5px; padding: 12px; background: var(--p-discovery-soft); border: 1px solid #dcecff; border-radius: 12px; margin: 8px 0; overflow-wrap: anywhere; }
.article-context span { font-size: 10px; color: #5d7792; }.article-context strong { font-size: 12px; line-height: 1.7; }
.conversation-feed { max-height: 30dvh; min-height: 85px; overflow-y: auto; padding: 8px 0; }
.invitation, .thinking { color: var(--p-discovery-partner-muted); font-size: 13px; line-height: 1.8; }
.bubble { width: fit-content; max-width: 90%; padding: 10px 13px; margin: 9px 0; border-radius: 15px 15px 15px 3px; background: #f0f6fb; color: var(--p-discovery-ink); font-size: 13px; line-height: 1.8; white-space: pre-wrap; overflow-wrap: anywhere; }
.bubble.user { margin-left: auto; background: #e0efff; border-radius: 15px 15px 3px 15px; }.speaker { display: block; color: var(--p-discovery-partner-muted); font-size: 9px; margin-bottom: 2px; }
.conversation-bottom { position: relative; min-height: 210px; padding-top: 75px; padding-right: 135px; }
.conversation-character { position: absolute; right: 5px; bottom: 0; width: 125px; height: 220px; object-fit: contain; object-position: bottom; }
.privacy { color: var(--p-discovery-muted); font-size: 10px; line-height: 1.7; margin-top: 10px; }.composer { display: flex; align-items: stretch; gap: 8px; margin-top: 8px; }.composer textarea { flex: 1; min-width: 0; font-size: 16px; resize: vertical; }.composer .p-button { padding: 10px 15px; }.saved-notice { font-size: 12px; color: #287460; }.sr-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
@media (max-height: 600px) { .conversation-bottom { min-height: 65px; padding-top: 8px; padding-right: 0; }.conversation-character { display: none; }.conversation-feed { max-height: 22dvh; } }
</style>
