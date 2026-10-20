<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import Button from 'primevue/button';
import Message from 'primevue/message';
import ProgressSpinner from 'primevue/progressspinner';
import type { ArticleListItem } from '@it-discovery/contracts';
import type { ApplicationStartupModel } from '../../models/application-startup.model';
import { useApplicationStartupViewModel } from '../../view-models/useApplicationStartupViewModel';
const props=defineProps<{model:ApplicationStartupModel}>();
const emit=defineEmits<{ready:[candidates:readonly ArticleListItem[]]}>();
const vm=useApplicationStartupViewModel(props.model);
const {phase,running,error,remaining,missingIds,notice,canDiscard}=vm;
const confirmDiscard=ref(false);
// 同期的に親へ通知し、自動仕分けがある場合に一覧を一瞬起動しない。
watch(phase,value=>{if(value==='ready') emit('ready',vm.automaticCandidates.value);},{flush:'sync'});
function online():void{vm.setOnline(true);} function offline():void{vm.setOnline(false);}
onMounted(()=>{vm.setOnline(navigator.onLine);void vm.initialize();window.addEventListener('online',online);window.addEventListener('offline',offline);});
onUnmounted(()=>{window.removeEventListener('online',online);window.removeEventListener('offline',offline);vm.dispose();});
</script>
<template>
  <template v-if="phase==='ready'">
    <Message v-if="notice" severity="warn" :closable="false">{{ notice }}</Message><slot />
  </template>
  <main v-else class="startup" aria-label="アプリの起動確認">
    <h1>IT Discovery</h1>
    <template v-if="phase==='stopped'"><h2>アプリを終了しました</h2><p>未送信の記録は残しています。このタブを閉じてください。</p></template>
    <template v-else>
      <ProgressSpinner v-if="running" style="width:40px;height:40px" aria-label="起動を確認しています" />
      <p role="status">{{ remaining ? `端末に残った仕分け ${remaining}件を確認しています。` : '起動前の確認をしています。' }}</p>
      <Message v-if="error" severity="error" :closable="false">{{error}}</Message>
      <Message v-if="phase==='missing'" severity="warn" :closable="false">{{missingIds.length}}件の記事がサーバーに存在しないため登録できませんでした。他の記事の登録結果は確認できました。</Message>
      <div class="actions">
        <Button v-if="phase==='missing'" type="button" label="確認して続ける" :disabled="running" @click="vm.acknowledgeMissing" />
        <Button v-else type="button" label="再試行" :disabled="running" @click="vm.initialize" />
        <Button type="button" label="アプリを終了する" outlined @click="vm.stop" />
      </div>
      <Button v-if="canDiscard&&!confirmDiscard" type="button" label="未送信結果を破棄する" text severity="danger" @click="confirmDiscard=true" />
      <Message v-if="canDiscard&&confirmDiscard" severity="warn" :closable="false">
        この回の未送信の気になる登録が失われます。サーバーの保存結果は変更しません。
        <Button type="button" label="破棄して続ける" severity="danger" :disabled="running" @click="confirmDiscard=false;vm.discardBlocked()" />
        <Button type="button" label="破棄しない" text @click="confirmDiscard=false" />
      </Message>
    </template>
  </main>
</template>
<style scoped>
.startup{max-width:500px;margin:0 auto;padding:60px 24px;text-align:center;min-height:100svh;}
h1{font-size:24px;}h2{font-size:19px;}p{font-size:13px;line-height:1.9;color:var(--p-discovery-muted);}.actions{display:flex;flex-wrap:wrap;justify-content:center;gap:12px;margin:22px 0;}
</style>
