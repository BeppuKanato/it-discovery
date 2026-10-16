<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import ArticleListPage from '../features/list/views/pages/ArticleListPage.vue';
import type { ApplicationModels } from './create-application-models';

// Appはアプリ起動の入口。一覧の初回取得は「端末同期の解消後」という順番で起動Modelへ頼む。
const props = defineProps<{ models: ApplicationModels }>();
const articleList = props.models.createArticleList();
onMounted(() => { void props.models.startup.startArticleList(articleList); });
onUnmounted(() => { articleList.dispose(); props.models.dispose(); });
</script>

<template>
  <ArticleListPage :list-model="articleList" :article-changes="models.articleChanges" />
</template>
