<script setup lang="ts">
import Button from 'primevue/button';
import Message from 'primevue/message';
import type { StateSyncSnapshot } from '../../../article-state/models/state-sync';

// Organism：状態を文言と再試行ボタンで表現する。通信やStoreの操作は行わない。
defineProps<{ status: StateSyncSnapshot }>();
const emit = defineEmits<{ retry: []; discard: [] }>();
</script>

<template>
  <div class="sync-status" aria-live="polite">
    <Message v-if="status.startupError" severity="warn" :closable="false">{{ status.startupError }}</Message>
    <p v-else-if="!status.ready">{{ status.pendingCount ? '端末に残った変更を同期しています…' : '端末の保存状態を確認しています…' }}</p>
    <p v-else-if="status.pendingCount">{{ status.online ? `${status.pendingCount}件の変更を保存しています…` : `${status.pendingCount}件の変更が未送信です。オンライン復帰後に保存します。` }}</p>
    <Message v-if="status.notice" :severity="status.storageError || status.blockedCount ? 'warn' : 'info'" :closable="false">{{ status.notice }}</Message>
    <Button v-if="status.startupError || status.storageError || status.blockedCount" label="再試行" type="button" text size="small" @click="emit('retry')" />
    <Button v-if="status.blockedCount" label="要確認の変更を破棄" type="button" text severity="danger" size="small" @click="emit('discard')" />
  </div>
</template>

<style scoped>
.sync-status { color: var(--p-discovery-muted); font-size: 11px; line-height: 1.8; }
.sync-status :deep(.p-message) { margin-bottom: 12px; }
</style>
