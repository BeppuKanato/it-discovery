<script setup lang="ts">
import Button from 'primevue/button';
defineProps<{ visible: boolean; quiet: boolean; thinking: boolean }>();
const emit = defineEmits<{ open: []; hide: [] }>();
</script>
<template>
  <!-- 背景や専用の領域を作らず、立ち絵だけを記事やノートに重ねる。
       aside自体はタップを遮らず、話す・隠す操作だけが入力を受ける。 -->
  <aside v-if="visible" class="companion-dock" aria-label="キャラクター">
    <Button class="hide-companion" text rounded aria-label="キャラクターを隠す" @click="emit('hide')">×</Button>
    <button type="button" class="character" aria-label="発見を話す" @click="emit('open')">
      <img :src="thinking ? '/characters/aoi-thinking.webp' : '/characters/aoi-normal.webp'" alt="" width="850" height="1850" />
      <span v-if="!quiet" class="character-label">発見を話す</span>
    </button>
  </aside>
  <Button v-else class="reopen-companion" label="キャラクターを表示" size="small" outlined @click="emit('open')" />
</template>
<style scoped>
.companion-dock { position: fixed; z-index: 12; right: max(12px, env(safe-area-inset-right, 0px)); bottom: calc(72px + env(safe-area-inset-bottom, 0px)); height: clamp(145px, 23svh, 190px); width: clamp(82px, 24vw, 112px); pointer-events: none; }
.character { position: absolute; right: 0; bottom: 0; height: 100%; width: 100%; padding: 0; border: none; background: none; cursor: pointer; pointer-events: auto; }
.character img { display: block; width: 100%; height: 100%; object-fit: contain; object-position: bottom; filter: drop-shadow(0 5px 5px #4979b21c); }
.character:focus-visible { outline: 2px solid var(--p-primary-color); border-radius: 16px; }
.character-label { position: absolute; bottom: 0; right: 0; white-space: nowrap; padding: 4px 8px; font-size: 10px; color: var(--p-primary-color); background: var(--p-discovery-paper); border: 1px solid var(--p-discovery-line); border-radius: 20px; }
.hide-companion { position: absolute; right: -7px; top: -10px; z-index: 1; min-width: 36px; min-height: 36px; font-size: 19px; pointer-events: auto; background: var(--p-discovery-paper); }
.reopen-companion { position: fixed; z-index: 12; bottom: calc(76px + env(safe-area-inset-bottom, 0px)); right: 16px; background: white; }
@media (max-height: 500px) { .companion-dock { height: 105px; } }
</style>
