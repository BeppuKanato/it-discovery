<script setup lang="ts">
import { onUnmounted, ref } from 'vue';
import type { ArticleListItem } from '@it-discovery/contracts';
import ArticleCard from '../../../../components/organisms/ArticleCard.vue';

const props = defineProps<{ article: ArticleListItem; offset: number; departing?: 'interested' | 'skipped' | null; swipeEnabled: boolean; movePointer: (x: number, y: number) => boolean; readStatus?: 'saving' | 'failed' | 'uncertain' }>();
const emit = defineEmits<{ open: []; start: [x: number, y: number]; finish: []; cancel: []; decide: [kind: 'interested' | 'skipped'] }>();
const dragging = ref(false);
let pointerId: number | null = null;
let suppressClick = false;

function start(event: PointerEvent): void {
  if (!event.isPrimary) { cancel(); return; }
  if (event.button === 0 && pointerId === null) suppressClick = false;
  if (!props.swipeEnabled || event.button !== 0 || pointerId !== null
    || (event.target instanceof Element && event.target.closest('button,input,select,textarea'))) return;
  pointerId = event.pointerId; suppressClick = false;
  emit('start', event.clientX, event.clientY);
  // 子リンクの暗黙captureから、動かさない外枠へ最初に引き継ぐ。
  // 引き継ぎ元からbubblingするlostpointercaptureは下の専用関数で無視する。
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}
function move(event: PointerEvent): void {
  if (event.pointerId !== pointerId) return;
  // 横操作の判定はVM→Modelへ渡す。戻り値でDOMの捕捉と標準スクロール抑止だけを行う。
  if (props.movePointer(event.clientX, event.clientY)) {
    const surface = event.currentTarget as HTMLElement;
    if (!surface.hasPointerCapture(event.pointerId)) surface.setPointerCapture(event.pointerId);
    dragging.value = true;
    suppressClick = true;
    if (event.cancelable) event.preventDefault();
  }
}
function finish(event: PointerEvent): void {
  if (event.pointerId !== pointerId) return;
  pointerId = null; dragging.value = false; emit('finish');
}
function leave(event: PointerEvent): void {
  if (pointerId !== null && !(event.currentTarget as HTMLElement).hasPointerCapture(pointerId)) cancel();
}
function cancel(): void {
  if (pointerId === null) return;
  pointerId = null; dragging.value = false; suppressClick = false; emit('cancel');
}
function lostCapture(event: PointerEvent): void {
  // 子要素がcaptureを失っただけでは、外枠で継続中の操作を取り消さない。
  if (event.target === event.currentTarget && event.pointerId === pointerId) cancel();
}
function keyboard(event: KeyboardEvent): void {
  if (!props.swipeEnabled || event.target !== event.currentTarget) return;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    emit('decide', event.key === 'ArrowRight' ? 'interested' : 'skipped');
  }
}
function click(event: MouseEvent): void {
  // 横ドラッグの後のclickを元記事のタップとして扱わない。単なるタップはリンクへ渡す。
  if (suppressClick) { event.preventDefault(); event.stopPropagation(); suppressClick = false; }
}
onUnmounted(cancel);
</script>

<template>
  <div class="swipe-surface" :class="{ enabled: swipeEnabled }" tabindex="0"
    role="group" aria-label="仕分けカード。右スワイプで気になる、左で見送り。キーボードの左右キーでも操作できます。" @keydown="keyboard"
    @pointerdown="start" @pointermove="move" @pointerup="finish" @pointercancel="cancel" @pointerleave="leave" @lostpointercapture="lostCapture" @click.capture="click" @dragstart.prevent>
    <div :key="article.articleId" class="moving-card" :class="{ dragging, departing: !!departing }"
      :style="{ transform: departing ? `translateX(calc(${departing === 'interested' ? 1 : -1} * (100vw + 100%))) rotate(${departing === 'interested' ? 25 : -25}deg)` : `translateX(${offset}px) rotate(${offset / 20}deg)`, opacity: departing ? 0 : 1 }">
      <!-- 外側はカード交代でも残し、スワイプ直後のclickを次の記事へ渡さない。文章展開だけ記事ごとにリセットする。 -->
      <ArticleCard :key="article.articleId" :article="article" :read-status="readStatus" @open="emit('open')" />
      <span v-if="departing === 'interested' || offset > 12" class="decision-label interested" aria-hidden="true">気になる</span>
      <span v-else-if="departing === 'skipped' || offset < -12" class="decision-label skipped" aria-hidden="true">見送り</span>
    </div>
  </div>
</template>

<style scoped>
.swipe-surface { min-width: 0; position: relative; }
.swipe-surface:focus-visible { outline: 2px solid var(--p-primary-color); outline-offset: 5px; border-radius: 22px; }
.swipe-surface.enabled { touch-action: pan-y; }
.moving-card { position: relative; transform-origin: center 85%; transition: transform .18s ease-out, opacity .18s ease-out; will-change: transform; }
/* 指で動かす間は補間を外し、カードを遅れなく追従させる。 */
.moving-card.dragging { transition: none; user-select: none; -webkit-user-select: none; }
.moving-card.departing { pointer-events: none; }
.swipe-surface.enabled :deep(.article-link) { -webkit-touch-callout: none; -webkit-user-drag: none; }
.decision-label { position: absolute; top: 28px; padding: 8px 15px; border: 2px solid currentColor; border-radius: 10px; background: var(--p-discovery-paper); font-size: 19px; font-weight: 750; pointer-events: none; }
.interested { left: 20px; color: var(--p-primary-color); transform: rotate(-10deg); }
.skipped { right: 20px; color: var(--p-discovery-muted); transform: rotate(10deg); }
@media (prefers-reduced-motion: reduce) { .moving-card { transition: none; } }
</style>
