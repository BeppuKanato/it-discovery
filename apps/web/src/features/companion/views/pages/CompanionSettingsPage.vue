<script setup lang="ts">
import Button from 'primevue/button';
import ToggleSwitch from 'primevue/toggleswitch';
import type { CompanionViewModel } from '../../view-models/useCompanionViewModel';
const props = defineProps<{ vm: CompanionViewModel }>();
const { visible } = props.vm;
</script>
<template>
  <main class="settings-page"><p class="eyebrow">MAKE YOURSELF AT HOME</p><h1>設定<span>。</span></h1>
    <section class="settings-card"><h2>キャラクター</h2><label class="setting-row" for="show-companion"><span>キャラクターを表示する</span><ToggleSwitch input-id="show-companion" v-model="visible" /></label>
      <p>話したいときにタップ。仕分け中は静かに見守ります。</p><Button label="発見を話す" outlined @click="vm.open" /></section>
    <section class="settings-card"><h2>会話と記録</h2><p>会話は基本ひとこと。自動保存せず、「発見ノートに残す」で自分の発見だけを保存します。</p><p>1日30回・月500回まで。会話内容と記事のタイトル・概要をGeminiへ送信します。</p></section>
  </main>
</template>
<style scoped>
.settings-page { max-width: 700px; margin: auto; padding: 30px 20px; }.eyebrow { color: var(--p-discovery-partner-muted); font-size: 10px; letter-spacing: .12em; }h1 { font-size: 29px; }h1 span { color: var(--p-primary-color); }.settings-card { margin-top: 20px; padding: 22px; border: 1px solid var(--p-discovery-line); background: white; border-radius: 20px; }.settings-card h2 { font-size: 16px; }.settings-card p { color: var(--p-discovery-muted); font-size: 12px; line-height: 1.9; }.setting-row { display: flex; align-items: center; justify-content: space-between; gap: 15px; font-size: 14px; }
</style>
