<script setup lang="ts">
import { ApiClient } from '../infrastructure/api/api-client';
import ArticleListPage from '../features/list/components/ArticleListPage.vue';

// import.meta.envはViteが渡す設定。未指定なら同じ配信元の/apiへ接続する。
// 通信部品はここで作り、画面へ渡す。画面自身はAxiosの生成方法を知らなくてよい。
const api = new ApiClient(import.meta.env.VITE_API_BASE_URL || '/api');
</script>

<template>
  <!-- :apiは文字列ではなく、scriptで作ったapiオブジェクトを子のpropsへ渡す。 -->
  <ArticleListPage :api="api" />
</template>
