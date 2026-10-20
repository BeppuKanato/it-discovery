<script setup lang="ts">
import ArticleListPage from '../features/list/views/pages/ArticleListPage.vue';
import type { ApplicationModels } from './create-application-models';

// アプリ共通の組み立て結果を渡す。ページの初回取得・終了はPageとVMが担当する。
defineProps<{ models: ApplicationModels }>();
</script>

<template>
  <ArticleListPage :list-model="models.articleList" :state-model="models.articleState" />
</template>
