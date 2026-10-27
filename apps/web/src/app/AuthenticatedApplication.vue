<script setup lang="ts">
import { nextTick, onUnmounted, ref, shallowRef } from 'vue';
import type { ArticleListItem } from '@it-discovery/contracts';
import ApplicationStartupGate from '../features/startup/views/organisms/ApplicationStartupGate.vue';
import SortingPage from '../features/sorting/views/pages/SortingPage.vue';
import ArticleListPage from '../features/list/views/pages/ArticleListPage.vue';
import CompanionDock from '../features/companion/views/organisms/CompanionDock.vue';
import CompanionConversation from '../features/companion/views/organisms/CompanionConversation.vue';
import CompanionSettingsPage from '../features/companion/views/pages/CompanionSettingsPage.vue';
import DiscoveryNotesPage from '../features/companion/views/pages/DiscoveryNotesPage.vue';
import { useCompanionViewModel } from '../features/companion/view-models/useCompanionViewModel';
import type { ApplicationModels } from './create-application-models';

// アプリ共通の組み立て結果を渡す。ページの初回取得・終了はPageとVMが担当する。
const props = defineProps<{ createModels: (subject: string) => ApplicationModels; subject: string }>();
// 認証済みアカウントごとに端末保存とModelを組み立て、ログアウト時に配下ごと終了する。
const models = props.createModels(props.subject);
// Appは画面の切り替えだけを担当し、一覧・仕分けの取得や判断は各Pageへ任せる。
type Screen = 'list' | 'sorting' | 'notes' | 'settings';
const screen = ref<Screen>('list');
// 常駐する相棒だけを共通で管理する。記事・仕分けの状態は各PageのVMに残す。
const companion = useCompanionViewModel(models.companion);
onUnmounted(() => companion.dispose());
const tabs: { screen: Screen; label: string; symbol: string }[] = [
  { screen: 'list', label: '探索', symbol: '⌕' }, { screen: 'sorting', label: '仕分け', symbol: '↔' },
  { screen: 'notes', label: '発見ノート', symbol: '▤' }, { screen: 'settings', label: '設定', symbol: '⚙' },
];
const automaticCandidates = shallowRef<readonly ArticleListItem[] | undefined>();
function ready(candidates: readonly ArticleListItem[]): void {
  automaticCandidates.value = candidates.length ? candidates : undefined;
  screen.value = candidates.length ? 'sorting' : 'list';
}
async function navigate(target: Screen): Promise<void> {
  automaticCandidates.value = undefined;
  screen.value = target;
  await nextTick(); window.scrollTo({ top: 0 });
}
</script>

<template>
  <ApplicationStartupGate :model="models.startup" @ready="ready">
  <div class="application-content" :class="{ 'with-companion': companion.visible.value }">
  <ArticleListPage @article-context="companion.selectArticle" v-if="screen === 'list'" :list-model="models.articleList" :state-model="models.articleState" :opening-model="models.articleOpening" />
  <SortingPage v-else-if="screen === 'sorting'" @article-context="companion.selectArticle" :initial-candidates="automaticCandidates" :batch-sync="models.interestBatchSync" :create-pending-interests="models.createPendingInterests" :sorting-model="models.sorting" :opening-model="models.articleOpening" :state-model="models.articleState" @exit="navigate('list')" />
  <DiscoveryNotesPage v-else-if="screen === 'notes'" :vm="companion" :model="models.notebook" />
  <CompanionSettingsPage v-else :vm="companion" />
  </div>
  <CompanionDock v-if="!companion.dialog.value" :visible="companion.visible.value" :quiet="screen === 'sorting'" :thinking="companion.sending.value" @open="companion.open" @hide="companion.visible.value = false" />
  <nav class="bottom-navigation" aria-label="メインメニュー"><button v-for="tab in tabs" :key="tab.screen" type="button" :aria-current="screen === tab.screen ? 'page' : undefined" :disabled="screen === 'sorting' && tab.screen !== 'sorting'" @click="navigate(tab.screen)"><span aria-hidden="true">{{ tab.symbol }}</span>{{ tab.label }}</button></nav>
  <CompanionConversation :vm="companion" />
  </ApplicationStartupGate>
</template>

<style scoped>
.application-content { padding-bottom: calc(84px + env(safe-area-inset-bottom, 0px)); }
.application-content.with-companion { padding-bottom: calc(clamp(145px, 23svh, 190px) + 84px + env(safe-area-inset-bottom, 0px)); }
.bottom-navigation { position: fixed; z-index: 14; bottom: 0; inset-inline: 0; display: grid; grid-template-columns: repeat(4, 1fr); padding: 5px max(10px, env(safe-area-inset-right, 0px)) calc(5px + env(safe-area-inset-bottom, 0px)) max(10px, env(safe-area-inset-left, 0px)); height: calc(64px + env(safe-area-inset-bottom, 0px)); background: #fffffff5; border-top: 1px solid var(--p-discovery-line); }
.bottom-navigation button { display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 3px; border: 0; background: transparent; color: #8697ac; font-size: 10px; cursor: pointer; border-radius: 12px; }
.bottom-navigation button span { font-size: 25px; line-height: 1; }.bottom-navigation button[aria-current] { color: var(--p-primary-color); background: #edf6ff; font-weight: 700; }.bottom-navigation button:disabled { opacity: .45; cursor: default; }.bottom-navigation button:focus-visible { outline: 2px solid var(--p-primary-color); }
@media (max-height: 500px) { .application-content.with-companion { padding-bottom: calc(190px + env(safe-area-inset-bottom, 0px)); } }
</style>
