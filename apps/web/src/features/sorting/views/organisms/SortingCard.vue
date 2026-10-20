<script setup lang="ts">
import { onUnmounted } from 'vue';
import type { ArticleListItem } from '@it-discovery/contracts';
import ArticleCard from '../../../../components/organisms/ArticleCard.vue';

const props = defineProps<{ article: ArticleListItem; offset: number; swipeEnabled: boolean; movePointer: (x: number, y: number) => boolean; readStatus?: 'saving' | 'failed' | 'uncertain' }>();
const emit = defineEmits<{ open: []; start: [x: number, y: number]; finish: []; cancel: [] }>();
let pointerId: number | null = null;
let suppressClick = false;

function start(event: PointerEvent): void {
  if (!event.isPrimary) { cancel(); return; }
  if (event.button === 0 && pointerId === null) suppressClick = false;
  if (!props.swipeEnabled || event.button !== 0 || pointerId !== null
    || (event.target instanceof Element && event.target.closest('button,input,select,textarea'))) return;
  pointerId = event.pointerId; suppressClick = false;
  emit('start', event.clientX, event.clientY);
}
function move(event: PointerEvent): void {
  if (event.pointerId !== pointerId) return;
  // 横操作の判定はVM→Modelへ渡す。戻り値でDOMの捕捉と標準スクロール抑止だけを行う。
  if (props.movePointer(event.clientX, event.clientY)) {
    const surface = event.currentTarget as HTMLElement;
    if (!surface.hasPointerCapture(event.pointerId)) surface.setPointerCapture(event.pointerId);
    suppressClick = true;
    if (event.cancelable) event.preventDefault();
  }
}
function finish(event: PointerEvent): void {
  if (event.pointerId !== pointerId) return;
  pointerId = null; emit('finish');
}
function leave(event: PointerEvent): void {
  if (pointerId !== null && !(event.currentTarget as HTMLElement).hasPointerCapture(pointerId)) cancel();
}
function cancel(): void {
  if (pointerId === null) return;
  pointerId = null; suppressClick = false; emit('cancel');
}
function click(event: MouseEvent): void {
  // 横ドラッグの後のclickを元記事のタップとして扱わない。単なるタップはリンクへ渡す。
  if (suppressClick) { event.preventDefault(); event.stopPropagation(); suppressClick = false; }
}
onUnmounted(cancel);
</script>

<template>
  <div class="swipe-surface" :class="{ enabled: swipeEnabled }"
    @pointerdown="start" @pointermove="move" @pointerup="finish" @pointercancel="cancel" @pointerleave="leave" @lostpointercapture="cancel" @click.capture="click" @dragstart.prevent>
    <div class="moving-card" :style="{ transform: `translateX(${offset}px) rotate(${offset / 16}deg)` }">
      <!-- 外側はカード交代でも残し、スワイプ直後のclickを次の記事へ渡さない。文章展開だけ記事ごとにリセットする。 -->
      <ArticleCard :key="article.articleId" :article="article" :read-status="readStatus" @open="emit('open')" />
      <span v-if="offset > 12" class="decision-label interested" aria-hidden="true">気になる</span>
      <span v-else-if="offset < -12" class="decision-label skipped" aria-hidden="true">見送り</span>
    </div>
  </div>
</template>

<style scoped>
.swipe-surface { min-width: 0; }
.swipe-surface.enabled { touch-action: pan-y; }
.moving-card { position: relative; transform-origin: center 85%; transition: transform .12s ease-out; }
.decision-label { position: absolute; top: 28px; padding: 8px 15px; border: 2px solid currentColor; border-radius: 10px; background: var(--p-discovery-paper); font-size: 19px; font-weight: 750; pointer-events: none; }
.interested { left: 20px; color: var(--p-primary-color); transform: rotate(-10deg); }
.skipped { right: 20px; color: var(--p-discovery-muted); transform: rotate(10deg); }
@media (prefers-reduced-motion: reduce) { .moving-card { transition: none; } }
</style>
