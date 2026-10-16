<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, useId, watch } from 'vue';
import Button from 'primevue/button';
import Card from 'primevue/card';
import Tag from 'primevue/tag';
import type { ArticleListItem } from '@it-discovery/contracts';
import { articleCardTokens } from '../../app/ui-theme';
import SourceBadge from '../molecules/SourceBadge.vue';

// definePropsは親から受け取る値の型を宣言するVueの機能。article自体はこの部品で変更しない。
const props = defineProps<{ article: ArticleListItem; editable?: boolean; actionsDisabled?: boolean }>();
// defineEmitsは親へ通知するイベントの型を宣言する。DB保存は親へ任せ、この部品は表示を担当する。
const emit = defineEmits<{ interest: []; pin: [] }>();
// useIdは部品ごとに異なるIDを作る。同じカードを複数並べても見出しのIDが衝突しない。
const titleId = useId();
// refは値の変化を画面へ反映する状態。scriptでは.value、templateでは値をそのまま参照できる。
const expanded = ref(false);
// templateのref="copy"が付いた実際のHTML要素を受け取る。描画前は存在しないのでnull。
const copy = ref<HTMLElement | null>(null);
const canExpand = ref(false);
let observer: ResizeObserver | null = null;
// 省略されている文面がある場合に、全文表示を可能にする。
function measureOverflow(): void {
  // 全文表示中に測ると省略なしになり、閉じるボタンまで消えるため測定しない。
  if (expanded.value) return;
  // scrollHeightは内容全体、clientHeightは表示領域の高さ。CSSで隠れた行があるか比べる。
  canExpand.value = [...(copy.value?.querySelectorAll('h2,p') ?? [])]
    .some((element) => element.scrollHeight > element.clientHeight + 1);
}
// onMountedはHTMLが画面に配置された後に実行する。幅が変わったときも省略を測り直す。
onMounted(() => {
  observer = new ResizeObserver(measureOverflow);
  if (copy.value) observer.observe(copy.value);
  measureOverflow();
});
// watchは指定した値の変化を監視する。nextTickでVueのHTML更新完了を待ってから測る。
watch(() => [props.article.title, props.article.description, expanded.value], async () => {
  await nextTick(); measureOverflow();
});
// 画面から部品が外れたら監視を解除し、不要な処理と参照を残さない。
onUnmounted(() => observer?.disconnect());
const date = new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric' });
const fullDate = new Intl.DateTimeFormat('ja-JP', { dateStyle: 'long', timeStyle: 'short' });
</script>

<template>
  <article :aria-labelledby="titleId" class="article-shell">
    <!-- :dtはPrimeVueの外観設定。#content/#footerはCardが用意する表示領域（名前付きslot）。 -->
    <Card class="article-card" :dt="articleCardTokens">
      <template #content>
        <div class="thumbnail-frame">
          <!-- :classの{ expanded }は、expandedがtrueのときだけ同名のCSSクラスを付ける。 -->
          <div class="thumbnail" :class="{ expanded }">
            <!-- .stopはクリックが親へ伝わるのを止め、元記事を開く操作と分離する。
                 aria-pressedは押し込み状態を示す。送信中も押せるため最後の希望まで操作できる。 -->
            <Button v-if="editable" type="button" text rounded class="pin-action" :class="{ selected: article.state.pinned }"
              :aria-label="article.state.pinned ? 'ピン止めを解除' : 'ピン止めする'" :aria-pressed="article.state.pinned"
              :disabled="actionsDisabled" @click.stop="emit('pin')">
              <template #icon><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m15 3 6 6-4 1-3 5-2-2-6 6-1-1 6-6-2-2 5-3z" /></svg></template>
            </Button>
            <Tag v-else-if="article.state.pinned" value="ピン止め" severity="secondary" rounded class="pin-state" />
            <div ref="copy" class="article-copy">
              <h2 :id="titleId">{{ article.title }}</h2>
              <!-- v-ifは条件付き描画。概要がなければ段落そのものを作らない。 -->
              <p v-if="article.description" class="summary">{{ article.description }}</p>
            </div>
            <div class="thumbnail-bottom">
              <!-- :labelはJS式で文言を選ぶ。@clickはイベント処理、aria-expandedは展開状態の通知。 -->
              <Button
                v-if="canExpand" type="button" text size="small" class="expand-button"
                :label="expanded ? '短く表示' : '続きを表示'" :aria-expanded="expanded"
                @click="expanded = !expanded"
              />
              <span v-else />
              <SourceBadge :source="article.source" />
            </div>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="article-meta">
          <div class="dates">
            <time :datetime="article.fetchedAt" :title="fullDate.format(new Date(article.fetchedAt))">取得 {{ date.format(new Date(article.fetchedAt)) }}</time>
            <time v-if="article.publishedAt" :datetime="article.publishedAt">公開 {{ date.format(new Date(article.publishedAt)) }}</time>
          </div>
          <div class="states">
            <span v-if="article.state.lastOpenedAt" class="read-state">既読</span>
            <Button v-if="editable" type="button" size="small" rounded :text="!article.state.interested"
              :label="article.state.interested ? '気になる登録済み' : '気になる'"
              :aria-label="article.state.interested ? '気になるを解除' : '気になるに登録'" :aria-pressed="article.state.interested"
              :disabled="actionsDisabled" class="interest-action" @click.stop="emit('interest')">
              <template #icon><svg viewBox="0 0 24 24" width="15" height="15" :fill="article.state.interested ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M6 4h12v17l-6-4-6 4z" /></svg></template>
            </Button>
            <Tag v-else-if="article.state.interested" value="気になる" severity="success" rounded />
          </div>
        </div>
      </template>
    </Card>
  </article>
</template>

<!-- scopedはこの部品のHTMLにだけ適用するCSS。子部品の内部は通常その対象にしない。 -->
<style scoped>
.article-shell { min-width: 0; }
.article-card { overflow: hidden; border: 1px solid var(--p-discovery-line); }
.thumbnail-frame { padding: 7px; background: linear-gradient(135deg, var(--p-discovery-frame-start), var(--p-discovery-frame-end)); }
.thumbnail { position: relative; display: flex; flex-direction: column; min-height: 244px; padding: 27px 18px 12px; border-radius: 15px; background: var(--p-discovery-paper); }
.pin-state { position: absolute; top: 10px; left: 12px; font-size: 10px; }
.pin-action { position: absolute; top: 5px; left: 7px; width: 44px; height: 44px; color: var(--p-discovery-muted); }
.pin-action.selected { color: var(--p-primary-color); background: var(--p-primary-50); }
.interest-action { min-height: 38px; font-size: 10px; padding: 7px 10px; }
.article-copy { flex: 1; display: flex; flex-direction: column; justify-content: center; min-height: 161px; padding: 8px 3px 16px; text-align: center; }
h2 { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 4; overflow: hidden; margin: 0; color: var(--p-discovery-ink); font-size: clamp(18px, 4.7vw, 22px); line-height: 1.55; letter-spacing: -.025em; overflow-wrap: anywhere; }
.summary { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; margin: 13px 0 0; color: var(--p-discovery-muted); font-size: 12px; line-height: 1.8; overflow-wrap: anywhere; }
.expanded h2, .expanded .summary { display: block; -webkit-line-clamp: unset; overflow: visible; }
.thumbnail-bottom { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 30px; }
.expand-button { flex: 0 0 auto; font-size: 10px; padding: 4px 0; }
.article-meta { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; min-height: 49px; padding: 10px 15px; }
.dates, .states { display: flex; align-items: center; gap: 9px; }
.dates { color: var(--p-discovery-muted); font-size: 10px; }
.read-state { color: var(--p-discovery-muted); font-size: 10px; }
.states :deep(.p-tag) { font-size: 10px; }
@media (max-width: 350px) { .thumbnail { padding-inline: 13px; } h2 { font-size: 18px; } }
</style>
