<script setup lang="ts">
import { onUnmounted } from 'vue';
import ArticleListPage from '../features/list/views/pages/ArticleListPage.vue';
import type { ApplicationServices } from './create-services';

// main.tsで組み立てた同じサービス群を画面へ渡す。App終了時だけ共有同期を終了する。
const props = defineProps<{ services: ApplicationServices }>();
onUnmounted(() => props.services.dispose());
</script>

<template>
  <ArticleListPage :services="services" />
</template>
