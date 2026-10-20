<script setup lang="ts">
import { nextTick, ref } from 'vue';
import SortingPage from '../features/sorting/views/pages/SortingPage.vue';
import ArticleListPage from '../features/list/views/pages/ArticleListPage.vue';
import type { ApplicationModels } from './create-application-models';

// アプリ共通の組み立て結果を渡す。ページの初回取得・終了はPageとVMが担当する。
defineProps<{ models: ApplicationModels }>();
// Appは画面の切り替えだけを担当し、一覧・仕分けの取得や判断は各Pageへ任せる。
const screen = ref<'list' | 'sorting'>('list');
async function navigate(target: 'list' | 'sorting'): Promise<void> {
  screen.value = target;
  await nextTick(); window.scrollTo({ top: 0 });
}
</script>

<template>
  <ArticleListPage v-if="screen === 'list'" :list-model="models.articleList" :state-model="models.articleState" :opening-model="models.articleOpening" @start-sorting="navigate('sorting')" />
  <SortingPage v-else :batch-sync="models.interestBatchSync" :create-pending-interests="models.createPendingInterests" :sorting-model="models.sorting" :opening-model="models.articleOpening" :state-model="models.articleState" @exit="navigate('list')" />
</template>
