<script setup lang="ts">
import Button from 'primevue/button';
defineProps<{ visible: boolean; quiet: boolean; thinking: boolean }>();
const emit = defineEmits<{ open: []; hide: [] }>();
</script>
<template>
  <aside v-if="visible" class="companion-dock" aria-label="相棒">
    <div class="dock-copy"><span class="dock-label">YOUR DISCOVERY PARTNER</span>
      <p>{{ quiet ? '発見を、ひとつずつ。' : '気になる発見、あった？' }}</p>
      <Button label="発見を話す" text size="small" @click="emit('open')" />
    </div>
    <Button class="hide-companion" text rounded aria-label="相棒を隠す" @click="emit('hide')">×</Button>
    <button type="button" class="character" aria-label="相棒と話す" @click="emit('open')">
      <img :src="thinking ? '/characters/aoi-thinking.webp' : '/characters/aoi-normal.webp'" alt="" width="850" height="1850" />
    </button>
  </aside>
  <Button v-else class="reopen-companion" label="相棒を表示" size="small" outlined @click="emit('open')" />
</template>
<style scoped>
.companion-dock { position: fixed; z-index: 12; inset-inline: 0; bottom: calc(64px + env(safe-area-inset-bottom, 0px)); height: clamp(145px, 23svh, 190px); max-width: 900px; margin-inline: auto; background: linear-gradient(180deg, #edf7ffed, #e1f0fffa); border-top: 1px solid #d8eaff; border-radius: 28px 28px 0 0; }
.dock-copy { position: absolute; left: 22px; top: 28px; right: 145px; }
.dock-label { color: var(--p-discovery-partner-muted); font-size: 9px; letter-spacing: .12em; }
p { font-size: 14px; font-weight: 650; color: var(--p-discovery-partner-ink); line-height: 1.7; margin: 10px 0 2px; }
.character { position: absolute; right: 24px; bottom: 8px; height: calc(100% - 8px); width: 112px; padding: 0; border: none; background: none; cursor: pointer; }
.character img { display: block; width: 100%; height: 100%; object-fit: contain; object-position: bottom; filter: drop-shadow(0 5px 5px #4979b21c); }
.character:focus-visible { outline: 2px solid var(--p-primary-color); border-radius: 16px; }
.hide-companion { position: absolute; right: 4px; top: 0; z-index: 1; width: 32px; height: 32px; font-size: 19px; }
.reopen-companion { position: fixed; z-index: 12; bottom: calc(76px + env(safe-area-inset-bottom, 0px)); right: 16px; background: white; }
@media (max-height: 500px) { .companion-dock { height: 105px; } .dock-copy { top: 12px; } .dock-label { display: none; } }
</style>
